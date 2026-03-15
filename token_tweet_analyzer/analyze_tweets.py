"""
Token Tweet Analyzer — Clusters token tweets by subject and generates
AI-synthesized stories with sentiment analysis.

Architecture: Same as EvaInvest story_builder
  Stage 1: Clustering via Gemini 2.0 Flash
  Stage 2: Article generation + sentiment via Claude Haiku (OpenRouter)

Cron Railway: 30 */6 * * * (30 min after scraper)
"""
from __future__ import annotations
import os
import sys
import json
import re
import math
import time
import logging
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env.local"), override=True)

# Force unbuffered output
import builtins
_orig_print = builtins.print
print = lambda *a, **kw: _orig_print(*a, **{**kw, 'flush': True})

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
CLUSTERING_MODEL = "google/gemini-2.0-flash-001"
ARTICLE_MODEL = "anthropic/claude-3.5-haiku"  # Cheaper than Sonnet for per-token analysis

MAX_STORIES_PER_TOKEN = 4
HOURS_BACK = 48
MIN_TWEETS_PER_CLUSTER = 2
MIN_AUTHORS_PER_CLUSTER = 1
MAX_BATCH_SIZE = 60
CLUSTERING_MAX_TOKENS = 12000

if not all([SUPABASE_URL, SUPABASE_KEY, OPENROUTER_API_KEY]):
    logger.error("Missing: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


# ─── HELPERS ───

def _repair_json(raw: str) -> dict:
    """Attempt to repair truncated JSON."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    lines = raw.rstrip().rsplit("\n", 1)
    truncated = lines[0] if len(lines) > 1 else raw
    truncated = truncated.rstrip().rstrip(",")

    in_string = False
    escape_next = False
    open_brackets = 0
    open_braces = 0
    for ch in truncated:
        if escape_next:
            escape_next = False
            continue
        if ch == "\\":
            escape_next = True
            continue
        if ch == '"' and not escape_next:
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "[":
            open_brackets += 1
        elif ch == "]":
            open_brackets -= 1
        elif ch == "{":
            open_braces += 1
        elif ch == "}":
            open_braces -= 1

    if in_string:
        truncated += '"'
    truncated += "]" * max(0, open_brackets)
    truncated += "}" * max(0, open_braces)

    return json.loads(truncated)


def call_openrouter(model: str, prompt: str, temperature: float = 0.3, max_tokens: int = 4096) -> dict:
    """Call OpenRouter and return parsed JSON."""
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://openpulsechain.com",
        "X-Title": "OpenPulsechain Token Intelligence",
    }
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if not model.startswith("anthropic/"):
        payload["response_format"] = {"type": "json_object"}

    response = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=120)
    if response.status_code != 200:
        logger.error(f"  OpenRouter {response.status_code}: {response.text[:500]}")
    response.raise_for_status()

    data = response.json()
    choice = data["choices"][0]
    finish_reason = choice.get("finish_reason", "")
    content = choice["message"]["content"]

    content = re.sub(r"^```json\s*", "", content.strip())
    content = re.sub(r"\s*```$", "", content.strip())

    if finish_reason == "length":
        logger.warning(f"  Truncated response (max_tokens={max_tokens}). Repairing...")
        return _repair_json(content)

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        logger.warning(f"  Invalid JSON (finish_reason={finish_reason}). Repairing...")
        return _repair_json(content)


def generate_slug(title: str) -> str:
    """Generate URL-friendly slug."""
    slug = title.lower().strip()
    replacements = {
        "a": "àâä", "e": "éèêë", "i": "ïî", "o": "ôö", "u": "ùûü", "c": "ç",
    }
    for replacement, chars in replacements.items():
        for char in chars:
            slug = slug.replace(char, replacement)
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")[:60]
    date_suffix = datetime.utcnow().strftime("%Y%m%d-%H%M")
    return f"{slug}-{date_suffix}"


def compute_importance(tweets: list[dict]) -> float:
    """Importance score 0-100 based on engagement."""
    total = sum(
        t.get("like_count", 0)
        + t.get("retweet_count", 0) * 2
        + t.get("quote_count", 0) * 3
        for t in tweets
    )
    return min(100.0, max(0.0, math.log1p(total) * 10))


# ─── STAGE 1: CLUSTERING ───

def get_unprocessed_tweets_for_token(token_address: str) -> list[dict]:
    """Get unprocessed tweets for a specific token."""
    cutoff = (datetime.utcnow() - timedelta(hours=HOURS_BACK)).isoformat() + "Z"
    result = supabase.table("token_tweets") \
        .select("*") \
        .eq("token_address", token_address.lower()) \
        .eq("cluster_processed", False) \
        .is_("story_id", "null") \
        .gte("tweeted_at", cutoff) \
        .order("tweeted_at", desc=True) \
        .limit(200) \
        .execute()
    return result.data or []


def get_tokens_with_unprocessed() -> list[dict]:
    """Get distinct tokens that have unprocessed tweets."""
    cutoff = (datetime.utcnow() - timedelta(hours=HOURS_BACK)).isoformat() + "Z"
    # Get distinct token_address values with count
    try:
        result = supabase.rpc("get_tokens_with_unprocessed_tweets", {
            "cutoff_time": cutoff
        }).execute()
        if result.data:
            return result.data
    except Exception:
        pass  # RPC doesn't exist, use fallback

    # Fallback: simple query
    result = supabase.table("token_tweets") \
        .select("token_address, token_symbol") \
        .eq("cluster_processed", False) \
        .is_("story_id", "null") \
        .gte("tweeted_at", cutoff) \
        .limit(500) \
        .execute()

    # Deduplicate by token_address
    seen = {}
    for row in (result.data or []):
        addr = row["token_address"]
        if addr not in seen:
            seen[addr] = {
                "token_address": addr,
                "token_symbol": row.get("token_symbol"),
                "count": 1,
            }
        else:
            seen[addr]["count"] += 1

    return sorted(seen.values(), key=lambda x: -x["count"])


def _build_clustering_prompt(tweets_for_llm: list[dict], symbol: str) -> str:
    """Build clustering prompt for token-specific tweets."""
    return f"""You receive {len(tweets_for_llm)} tweets about the token ${symbol} on PulseChain.

OBJECTIVE: Identify SPECIFIC TOPICS and group ONLY tweets that discuss the SAME event, news, or fact.

A topic = a specific event, concrete news, verifiable fact about ${symbol}.

Good topics (specific):
- "${symbol} liquidity pool drained" = tweets about this specific event
- "{symbol} new exchange listing announced" = tweets about THIS listing
- "${symbol} contract upgrade deployed" = tweets about THIS upgrade

Bad topics (too broad — DO NOT):
- "${symbol}" or "Trading" = too vague
- "PulseChain" = catch-all

RULES:
- No limit on number of topics. If 10 tweets cover 8 topics, output 8 topics.
- NEVER group tweets just because they mention the same TOKEN. They must discuss the SAME EVENT.
- Language doesn't matter: English + French on same event = SAME topic.
- Generic/motivational tweet without specific event → topic = "SKIP"
- Pure promo (giveaway, ref link) → topic = "SKIP"
- Tweets about OTHER tokens/presales that merely tag ${symbol} for visibility → topic = "SKIP"
- When in doubt, prefer "SKIP".

Tweets:
{json.dumps(tweets_for_llm, ensure_ascii=False, indent=2)}

Respond in COMPACT JSON:
{{"themes":["Topic 1","Topic 2"],"classifications":[{{"id":"tweet_id","topic":"Exact topic"}}]}}"""


def _run_clustering(tweets_for_llm: list[dict], all_tweets: list[dict], symbol: str) -> list[list[dict]]:
    """Run LLM clustering and return valid clusters."""
    prompt = _build_clustering_prompt(tweets_for_llm, symbol)
    result = call_openrouter(CLUSTERING_MODEL, prompt, temperature=0.1, max_tokens=CLUSTERING_MAX_TOKENS)

    topic_map: dict[str, list[dict]] = {}
    for c in result.get("classifications", []):
        topic = c.get("topic", "SKIP")
        if topic == "SKIP":
            continue
        normalized = topic.strip().lower()
        if normalized not in topic_map:
            topic_map[normalized] = []
        original = next((t for t in all_tweets if t["id"] == c["id"]), None)
        if original:
            topic_map[normalized].append(original)

    for topic, tweet_list in sorted(topic_map.items(), key=lambda x: -len(x[1])):
        authors = set(t["author_username"] for t in tweet_list)
        logger.info(f"    Topic: \"{topic}\" — {len(tweet_list)} tweets, {len(authors)} authors")

    clusters = []
    for tweet_list in topic_map.values():
        authors = set(t["author_username"] for t in tweet_list)
        if len(tweet_list) >= MIN_TWEETS_PER_CLUSTER and len(authors) >= MIN_AUTHORS_PER_CLUSTER:
            clusters.append(tweet_list)

    return clusters


def cluster_tweets(tweets: list[dict], symbol: str) -> list[list[dict]]:
    """Cluster tweets by topic via LLM."""
    if len(tweets) < MIN_TWEETS_PER_CLUSTER:
        return []

    batch = tweets[:MAX_BATCH_SIZE]
    tweets_for_llm = [
        {"id": t["id"], "text": t["text"][:300], "author": t["author_username"]}
        for t in batch
    ]

    # Attempt 1: full batch
    try:
        logger.info(f"    Clustering: {len(tweets_for_llm)} tweets...")
        clusters = _run_clustering(tweets_for_llm, tweets, symbol)
        if clusters:
            clusters.sort(
                key=lambda c: sum(t.get("like_count", 0) + t.get("retweet_count", 0) for t in c),
                reverse=True,
            )
            return clusters
        logger.info("    No valid clusters, trying split batch...")
    except Exception as e:
        logger.warning(f"    Clustering failed: {e}")

    # Attempt 2: split in half
    half = len(tweets_for_llm) // 2
    if half < MIN_TWEETS_PER_CLUSTER:
        return []

    all_clusters = []
    for i, label in enumerate(["A", "B"]):
        chunk = tweets_for_llm[i * half:(i + 1) * half] if i == 0 else tweets_for_llm[half:]
        try:
            logger.info(f"    Clustering batch {label}: {len(chunk)} tweets...")
            chunk_clusters = _run_clustering(chunk, tweets, symbol)
            all_clusters.extend(chunk_clusters)
        except Exception as e:
            logger.warning(f"    Batch {label} failed: {e}")

    all_clusters.sort(
        key=lambda c: sum(t.get("like_count", 0) + t.get("retweet_count", 0) for t in c),
        reverse=True,
    )
    return all_clusters


# ─── STAGE 2: ARTICLE GENERATION ───

def generate_story(cluster: list[dict], token_symbol: str, token_address: str) -> dict | None:
    """Generate a synthesized story from a tweet cluster."""
    sources_text = ""
    all_authors = set()

    for t in cluster:
        sources_text += f"\n--- @{t['author_username']} ({t.get('author_name', '')}) ---\n"
        sources_text += f"Date: {t['tweeted_at']}\n"
        sources_text += f"Text: {t['text']}\n"
        sources_text += f"Likes: {t.get('like_count', 0)} | RT: {t.get('retweet_count', 0)}\n"
        sources_text += f"URL: {t.get('tweet_url', '')}\n"
        all_authors.add(t["author_username"])

    prompt = f"""You are a professional crypto analyst covering PulseChain tokens.
From the following tweets about ${token_symbol}, write a concise analysis in English.

STRICT RULES:
1. Title: factual, catchy, max 80 characters
2. Summary: 2-3 sentence preview
3. Content: structured sections with source citations ("according to @handle")
4. FACTUAL: never invent information not in the tweets
5. NEVER say "tweets" or "on Twitter" — use "according to analysts", "observers note"
6. Evaluate market sentiment: sentiment_score 0-100 (0=very bearish, 50=neutral, 100=very bullish)
7. Sentiment label: "Very bearish", "Bearish", "Slightly bearish", "Neutral", "Slightly bullish", "Bullish", "Very bullish"
8. Market impact: "bullish", "bearish" or "neutral"

SOURCE TWEETS:
{sources_text}

RESPOND IN STRICT JSON:
{{
  "title": "Title (max 80 chars)",
  "subtitle": "Explanatory subtitle",
  "summary": "Short summary (2-3 sentences)",
  "tags": ["TAG1", "TAG2", "TAG3"],
  "sentiment_score": 65,
  "sentiment_label": "Slightly bullish",
  "market_impact": "bullish",
  "content": [
    {{"type": "section", "title": "Section title", "body": "Paragraph..."}},
    {{"type": "quote", "text": "Exact quote", "author": "@handle", "tweet_url": "https://..."}},
    {{"type": "key_takeaway", "text": "Key takeaway"}}
  ]
}}"""

    result = call_openrouter(ARTICLE_MODEL, prompt, temperature=0.4, max_tokens=2048)

    tweet_dates = [t.get("tweeted_at") for t in cluster if t.get("tweeted_at")]
    slug = generate_slug(f"{token_symbol}-{result.get('title', 'analysis')}")
    importance = compute_importance(cluster)

    raw_score = result.get("sentiment_score")
    sentiment_score = max(0, min(100, int(raw_score))) if raw_score is not None else 50
    sentiment_label = result.get("sentiment_label", "Neutral")
    market_impact = result.get("market_impact", "neutral")
    if market_impact not in ("bullish", "bearish", "neutral", "haussier", "baissier", "neutre"):
        market_impact = "neutral"

    # ── Relevance check: story must actually be about the target token ──
    title_lower = result.get("title", "").lower()
    summary_lower = result.get("summary", "").lower()
    sym_lower = token_symbol.lower()
    sym_dollar = f"${sym_lower}"
    check_text = f"{title_lower} {summary_lower}"
    if sym_lower not in check_text and sym_dollar not in check_text:
        logger.info(f"    Off-topic story skipped: \"{result.get('title', '')[:60]}\" (no mention of {token_symbol})")
        return None

    return {
        "token_address": token_address.lower(),
        "token_symbol": token_symbol,
        "slug": slug,
        "title": result["title"],
        "subtitle": result.get("subtitle", ""),
        "summary": result.get("summary", ""),
        "content": result.get("content", []),
        "sentiment_score": sentiment_score,
        "sentiment_label": sentiment_label,
        "market_impact": market_impact,
        "source_tweet_ids": [t["id"] for t in cluster],
        "source_count": len(cluster),
        "author_handles": list(all_authors),
        "importance_score": importance,
        "is_featured": importance >= 70,
        "published_at": datetime.utcnow().isoformat() + "Z",
        "period_start": min(tweet_dates) if tweet_dates else datetime.utcnow().isoformat() + "Z",
        "period_end": max(tweet_dates) if tweet_dates else datetime.utcnow().isoformat() + "Z",
        "model_used": ARTICLE_MODEL,
    }


# ─── SAVE ───

def save_story(story: dict) -> str | None:
    """Save story and link source tweets."""
    # Anti-duplicate: exact title
    existing = supabase.table("token_tweet_stories") \
        .select("id") \
        .eq("title", story["title"]) \
        .eq("token_address", story["token_address"]) \
        .limit(1) \
        .execute()
    if existing.data:
        logger.info(f"    Duplicate (title): \"{story['title'][:50]}\" — skip")
        return None

    # Anti-duplicate: source overlap >= 50%
    tweet_ids = story.get("source_tweet_ids", [])
    if tweet_ids:
        recent = supabase.table("token_tweet_stories") \
            .select("id, source_tweet_ids") \
            .eq("token_address", story["token_address"]) \
            .order("published_at", desc=True) \
            .limit(20) \
            .execute()
        for s in (recent.data or []):
            existing_ids = set(s.get("source_tweet_ids") or [])
            overlap = len(existing_ids & set(tweet_ids))
            if overlap >= max(1, len(tweet_ids) // 2):
                logger.info(f"    Duplicate (sources): {overlap} tweets overlap — skip")
                return None

    result = supabase.table("token_tweet_stories") \
        .upsert(story, on_conflict="slug") \
        .execute()

    story_id = result.data[0]["id"] if result.data else None
    if not story_id:
        return None

    # Link tweets to story
    for tweet_id in story["source_tweet_ids"]:
        supabase.table("token_tweets") \
            .update({"story_id": story_id, "cluster_processed": True}) \
            .eq("id", tweet_id) \
            .execute()

    return story_id


def mark_orphans_processed(tweets: list[dict], clustered_ids: set[str]):
    """Mark unclustered tweets as processed."""
    orphan_ids = [t["id"] for t in tweets if t["id"] not in clustered_ids]
    for oid in orphan_ids:
        supabase.table("token_tweets") \
            .update({"cluster_processed": True}) \
            .eq("id", oid) \
            .eq("cluster_processed", False) \
            .execute()
    return len(orphan_ids)


# ─── MAIN ───

def main():
    logger.info("=== Token Tweet Analyzer ===")
    logger.info(f"Time: {datetime.utcnow().isoformat()}Z")
    logger.info(f"Models: clustering={CLUSTERING_MODEL}, article={ARTICLE_MODEL}")

    # Get tokens with unprocessed tweets
    tokens = get_tokens_with_unprocessed()
    logger.info(f"Tokens with unprocessed tweets: {len(tokens)}")

    if not tokens:
        logger.info("No tokens to process. Done.")
        return

    total_stories = 0

    for token_info in tokens:
        token_address = token_info["token_address"]
        token_symbol = token_info.get("token_symbol") or "UNKNOWN"
        tweet_count = token_info.get("count", 0)

        logger.info(f"\n${token_symbol} ({token_address[:10]}...) — {tweet_count} unprocessed tweets")

        tweets = get_unprocessed_tweets_for_token(token_address)
        if len(tweets) < MIN_TWEETS_PER_CLUSTER + 1:
            logger.info(f"  Not enough tweets ({len(tweets)}). Skip.")
            # Mark them as processed to avoid reprocessing
            for t in tweets:
                supabase.table("token_tweets") \
                    .update({"cluster_processed": True}) \
                    .eq("id", t["id"]) \
                    .execute()
            continue

        # Stage 1: Clustering
        logger.info(f"  Clustering {len(tweets)} tweets...")
        try:
            clusters = cluster_tweets(tweets, token_symbol)
        except Exception as e:
            logger.error(f"  Clustering error: {e}")
            continue

        logger.info(f"  Clusters found: {len(clusters)}")

        # Stage 2: Generate stories
        stories_created = 0
        clustered_ids: set[str] = set()

        for i, cluster in enumerate(clusters[:MAX_STORIES_PER_TOKEN]):
            logger.info(f"  Generating story {i + 1}/{min(len(clusters), MAX_STORIES_PER_TOKEN)}...")
            try:
                story = generate_story(cluster, token_symbol, token_address)
                if story:
                    story_id = save_story(story)
                    if story_id:
                        logger.info(f"    OK: \"{story['title'][:60]}\" (score={story['sentiment_score']})")
                        stories_created += 1
                        for t in cluster:
                            clustered_ids.add(t["id"])
            except Exception as e:
                logger.error(f"    Generation error: {e}")

            time.sleep(1)

        # Mark orphans
        orphan_count = mark_orphans_processed(tweets, clustered_ids)
        logger.info(f"  Stories: {stories_created}, Orphans: {orphan_count}")
        total_stories += stories_created

    logger.info(f"\nTotal stories created: {total_stories}")
    logger.info("=== Done ===")


if __name__ == "__main__":
    main()
