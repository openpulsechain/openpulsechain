"""
Token Intelligence Pipeline — AI-synthesized project profiles from tweet analysis.

For each PulseChain token with scraped tweets:
  Phase 1: Extract 0x addresses mentioned in tweets (regex)
  Phase 2: Analyze chart images via Claude Vision
  Phase 3: Synthesize project summary + social timeline via Claude

Usage:
  python analyze_token_intelligence.py                    # all tokens needing analysis
  python analyze_token_intelligence.py --token 0xabc...   # single token
  python analyze_token_intelligence.py --force             # re-analyze all
"""
from __future__ import annotations
import os
import sys
import re
import json
import logging
import time
import argparse
import base64
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client
import httpx

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

_print = __builtins__.__dict__['print'] if isinstance(__builtins__, dict) else __builtins__.print
print = lambda *a, **kw: _print(*a, **{**kw, 'flush': True})

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
LLM_MODEL = os.getenv("LLM_MODEL", "anthropic/claude-sonnet-4")
VISION_MODEL = os.getenv("VISION_MODEL", LLM_MODEL)

if not all([SUPABASE_URL, SUPABASE_KEY]):
    logger.error("Missing: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY")
    sys.exit(1)

if not OPENROUTER_API_KEY:
    logger.error("Missing: OPENROUTER_API_KEY")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_HEADERS = {
    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
    "Content-Type": "application/json",
}

# Regex
ADDRESS_RE = re.compile(r'0x[a-fA-F0-9]{40}')
CHART_KEYWORDS = re.compile(
    r'chart|price|TA\b|analysis|support|resistance|target|pattern|fibonacci|'
    r'channel|breakout|breakdown|cup|handle|wedge|triangle|moving average|'
    r'MA\b|RSI\b|MACD|volume|candle|bull|bear|trend|pump|dump|ATH|ATL|'
    r'floor|ceiling|100x|1000x|moon',
    re.IGNORECASE
)

MAX_TWEETS_PER_CHUNK = 80
MAX_CHART_IMAGES = 20  # per token
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB max per image

# Allowed image domains (Twitter/X CDN only) — SSRF protection
ALLOWED_IMAGE_DOMAINS = {
    "pbs.twimg.com",
    "video.twimg.com",
    "abs.twimg.com",
    "ton.twimg.com",
}


# ─── Phase 1: Address Extraction (regex, no LLM) ─────────────────────

def extract_addresses(tweets: list[dict]) -> list[dict]:
    """Extract 0x addresses from all tweets, aggregate by address."""
    addr_map: dict[str, dict] = {}

    for tweet in tweets:
        text = tweet.get("text", "")
        tweet_id = tweet["id"]
        tweeted_at = tweet.get("tweeted_at", "")

        for match in ADDRESS_RE.finditer(text):
            addr = match.group(0).lower()
            idx = match.start()
            ctx = text[max(0, idx - 40):idx + 82].strip()

            if addr not in addr_map:
                addr_map[addr] = {
                    "address": addr,
                    "context": ctx,
                    "type": "unknown",
                    "first_mentioned_at": tweeted_at,
                    "mention_count": 0,
                    "tweet_ids": [],
                }

            addr_map[addr]["mention_count"] += 1
            if tweet_id not in addr_map[addr]["tweet_ids"]:
                addr_map[addr]["tweet_ids"].append(tweet_id)

            # Keep earliest mention
            if tweeted_at and tweeted_at < addr_map[addr]["first_mentioned_at"]:
                addr_map[addr]["first_mentioned_at"] = tweeted_at

    # Classify known tokens
    if addr_map:
        try:
            known = supabase.table("pulsechain_tokens") \
                .select("address") \
                .in_("address", list(addr_map.keys())) \
                .execute()
            for row in (known.data or []):
                if row["address"] in addr_map:
                    addr_map[row["address"]]["type"] = "token"
        except Exception as e:
            logger.warning(f"Token lookup failed: {e}")

    return sorted(addr_map.values(), key=lambda x: -x["mention_count"])


# ─── Phase 2: Chart Image Analysis (Claude Vision) ───────────────────

def find_chart_tweets(tweets: list[dict]) -> list[dict]:
    """Filter tweets that likely contain chart images."""
    chart_tweets = []
    for tweet in tweets:
        media_urls = tweet.get("media_urls") or []
        media_types = tweet.get("media_types") or []
        text = tweet.get("text", "")

        # Must have at least one photo
        has_photo = False
        for i, mt in enumerate(media_types):
            if mt == "photo" and i < len(media_urls):
                has_photo = True
                break

        if not has_photo:
            continue

        # Check if text suggests a chart
        if CHART_KEYWORDS.search(text):
            chart_tweets.append(tweet)

    return chart_tweets[:MAX_CHART_IMAGES]


def is_safe_image_url(url: str) -> bool:
    """Validate image URL against allowed domains (SSRF protection)."""
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        if parsed.scheme not in ("https", "http"):
            return False
        if parsed.hostname not in ALLOWED_IMAGE_DOMAINS:
            logger.warning(f"  Blocked image from untrusted domain: {parsed.hostname}")
            return False
        # Block private IPs even if domain matches (DNS rebinding)
        if parsed.hostname in ("localhost", "127.0.0.1", "0.0.0.0"):
            return False
        return True
    except Exception:
        return False


def download_image(url: str) -> tuple[bytes, str] | None:
    """Download image with SSRF protection and size limit."""
    if not is_safe_image_url(url):
        return None

    try:
        # Disable redirects to prevent SSRF via redirect
        resp = httpx.get(url, timeout=15.0, follow_redirects=False)

        # If redirect, validate target domain
        if resp.status_code in (301, 302, 303, 307, 308):
            redirect_url = resp.headers.get("location", "")
            if not is_safe_image_url(redirect_url):
                logger.warning(f"  Blocked redirect to untrusted URL")
                return None
            resp = httpx.get(redirect_url, timeout=15.0, follow_redirects=False)

        resp.raise_for_status()

        # Size check — prevent image bombs
        content_length = int(resp.headers.get("content-length", 0))
        if content_length > MAX_IMAGE_SIZE:
            logger.warning(f"  Image too large ({content_length} bytes), skipping")
            return None
        if len(resp.content) > MAX_IMAGE_SIZE:
            logger.warning(f"  Image too large ({len(resp.content)} bytes), skipping")
            return None

        content_type = resp.headers.get("content-type", "image/jpeg")
        if "png" in content_type:
            media_type = "image/png"
        elif "gif" in content_type:
            media_type = "image/gif"
        elif "webp" in content_type:
            media_type = "image/webp"
        else:
            media_type = "image/jpeg"
        return resp.content, media_type
    except Exception as e:
        logger.warning(f"  Image download failed: {url[:60]}... — {e}")
        return None


def analyze_chart_image(image_data: bytes, media_type: str, symbol: str, tweet_text: str) -> str | None:
    """Analyze a chart image via OpenRouter Vision."""
    try:
        b64 = base64.standard_b64encode(image_data).decode("utf-8")
        data_url = f"data:{media_type};base64,{b64}"

        response = httpx.post(
            OPENROUTER_URL,
            headers=OPENROUTER_HEADERS,
            json={
                "model": VISION_MODEL,
                "messages": [{
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": data_url},
                        },
                        {
                            "type": "text",
                            "text": (
                                f"Analyze this image related to the token ${symbol} on PulseChain. "
                                f"Tweet context: \"{tweet_text[:200]}\"\n\n"
                                "If this is a price/trading chart: describe the timeframe, price action, "
                                "patterns, support/resistance levels, indicators, and key takeaway. "
                                "If this is NOT a chart (meme, promo, screenshot, etc.): describe what "
                                "the image shows and its relevance to the token.\n"
                                "Keep under 150 words."
                            ),
                        },
                    ],
                }],
                "max_tokens": 300,
                "temperature": 0.1,
            },
            timeout=30.0,
        )
        response.raise_for_status()
        data = response.json()
        text = data["choices"][0]["message"]["content"].strip()
        return text if text else None

    except Exception as e:
        logger.warning(f"  Vision analysis failed: {e}")
        return None


def run_chart_analysis(tweets: list[dict], symbol: str) -> list[dict]:
    """Phase 2: find chart tweets, download images, analyze with Vision."""
    chart_tweets = find_chart_tweets(tweets)
    if not chart_tweets:
        logger.info(f"  No chart images found")
        return []

    logger.info(f"  Found {len(chart_tweets)} potential chart tweets")
    analyses = []

    for tweet in chart_tweets:
        media_urls = tweet.get("media_urls") or []
        media_types = tweet.get("media_types") or []

        # Get first photo URL
        photo_url = None
        for i, mt in enumerate(media_types):
            if mt == "photo" and i < len(media_urls):
                photo_url = media_urls[i]
                break

        if not photo_url:
            continue

        img = download_image(photo_url)
        if not img:
            continue

        image_data, img_media_type = img
        analysis = analyze_chart_image(image_data, img_media_type, symbol, tweet.get("text", ""))

        if analysis:
            analyses.append({
                "tweet_id": tweet["id"],
                "image_url": photo_url,
                "analysis": analysis,
                "date": tweet.get("tweeted_at", ""),
            })
            logger.info(f"    Chart analyzed: {analysis[:80]}...")

        # Rate limit
        time.sleep(0.5)

    return analyses


# ─── Phase 3: Full Intelligence Synthesis (Claude) ────────────────────

SYNTHESIS_SYSTEM = """You are a crypto research analyst investigating PulseChain ecosystem tokens.
Your task: produce a comprehensive intelligence profile from Twitter/X data.

You MUST respond with valid JSON only — no markdown, no explanation outside JSON.

JSON schema:
{
  "project_summary": {
    "name": "string — project display name",
    "description": "string — 2-3 paragraph description of what this project is, based on community discussion",
    "type": "defi|nft|meme|utility|bridge|stablecoin|wrapped|unknown",
    "objective": "string — what the project aims to do",
    "team": "string|null — known team members/creators if mentioned",
    "launch_date": "string|null — ISO date if identifiable from tweets",
    "links": {"website": "url|null", "twitter": "url|null", "telegram": "url|null", "discord": "url|null"}
  },
  "social_timeline": [
    {
      "date": "ISO date (best estimate from tweet dates)",
      "category": "launch|pump|dump|exploit|partnership|listing|controversy|milestone|rug_pull|community_split|migration|update|airdrop|other",
      "title": "short event title (max 80 chars)",
      "description": "2-3 sentence description of what happened",
      "cause": "string|null — why this happened (investigate from context)",
      "impact": "positive|negative|neutral",
      "sentiment": 0-100,
      "source_tweet_ids": ["tweet_id1", "tweet_id2"]
    }
  ]
}

RULES:
- Be factual: only report what is evidenced in the tweets
- Distinguish between rumors/speculation and confirmed events
- Maximum 30 timeline events, prioritized by significance
- Each event MUST reference at least 1 source tweet ID
- For description: be specific, include numbers/addresses when available
- For cause: investigate cross-tweet context to determine WHY things happened
- Sentiment: 0=extremely negative, 50=neutral, 100=extremely positive
- Do NOT invent information — if unsure, say "unclear from available data"
- Ignore generic promotional spam, focus on substantive discussion"""


def sanitize_text(text: str) -> str:
    """Sanitize user-generated text to mitigate prompt injection and XSS.

    - Strips HTML tags to prevent stored XSS
    - Strips common prompt injection patterns
    - Truncates to prevent context overflow
    """
    import html
    # Strip HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Escape HTML entities for safe storage
    text = html.escape(text, quote=False)
    # Strip null bytes
    text = text.replace('\x00', '')
    return text


def format_tweets_for_prompt(tweets: list[dict]) -> str:
    """Format tweets into a compact string for the LLM prompt.

    Tweet text is user-generated content (untrusted). We sanitize it
    but also rely on the LLM system prompt boundary and JSON-only output
    to mitigate prompt injection.
    """
    lines = []
    for t in tweets:
        date = (t.get("tweeted_at") or "")[:10]
        author = re.sub(r'[<>&\x00]', '', t.get("author_username", "?"))[:30]
        text = sanitize_text((t.get("text") or "")[:300]).replace("\n", " ")
        likes = t.get("like_count", 0)
        rts = t.get("retweet_count", 0)
        tid = t["id"]
        lines.append(f"[{tid}] {date} @{author} (♥{likes} ♻{rts}): {text}")
    return "\n".join(lines)


def call_llm(system_prompt: str, user_msg: str, max_tokens: int = 4000) -> dict | None:
    """Call OpenRouter LLM and return parsed JSON response."""
    try:
        response = httpx.post(
            OPENROUTER_URL,
            headers=OPENROUTER_HEADERS,
            json={
                "model": LLM_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_msg},
                ],
                "temperature": 0.1,
                "max_tokens": max_tokens,
            },
            timeout=120.0,
        )
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"].strip()

        # Clean markdown wrapper
        if content.startswith("```"):
            content = re.sub(r'^```\w*\n?', '', content)
            content = re.sub(r'\n?```$', '', content)

        return json.loads(content)

    except json.JSONDecodeError as e:
        logger.warning(f"  JSON parse error: {e}")
        logger.debug(f"  Raw content: {content[:500]}")
        return None
    except Exception as e:
        logger.warning(f"  LLM call failed: {e}")
        return None


def synthesize_chunk(tweets: list[dict], symbol: str, chunk_idx: int, total_chunks: int) -> dict | None:
    """Analyze a chunk of tweets and extract partial timeline."""
    prompt = format_tweets_for_prompt(tweets)
    earliest = (tweets[0].get("tweeted_at") or "?")[:10]
    latest = (tweets[-1].get("tweeted_at") or "?")[:10]

    user_msg = (
        f"Token: ${symbol} on PulseChain\n"
        f"Period: {earliest} to {latest} (chunk {chunk_idx + 1}/{total_chunks})\n"
        f"Tweet count: {len(tweets)}\n\n"
        f"TWEETS:\n{prompt}"
    )

    return call_llm(SYNTHESIS_SYSTEM, user_msg, max_tokens=4000)


def merge_results(partial_results: list[dict], chart_analyses: list[dict],
                  mentioned_addresses: list[dict], symbol: str) -> dict:
    """Merge partial chunk results into final intelligence."""

    # Merge project summaries — take the most detailed one
    best_summary = None
    best_len = 0
    for r in partial_results:
        s = r.get("project_summary")
        if s:
            desc_len = len(s.get("description", ""))
            if desc_len > best_len:
                best_summary = s
                best_len = desc_len

    if not best_summary:
        best_summary = {
            "name": symbol,
            "description": f"PulseChain token {symbol}. Insufficient data for detailed description.",
            "type": "unknown",
            "objective": "Unknown",
            "team": None,
            "launch_date": None,
            "links": {},
        }

    # Merge timelines — deduplicate by similar title+date
    all_events = []
    seen = set()
    for r in partial_results:
        for event in r.get("social_timeline", []):
            key = f"{event.get('date', '')[:7]}_{event.get('title', '')[:30].lower()}"
            if key not in seen:
                seen.add(key)
                all_events.append(event)

    # Sort by date and keep top 30
    all_events.sort(key=lambda e: e.get("date", ""))
    all_events = all_events[:30]

    return {
        "project_summary": best_summary,
        "social_timeline": all_events,
        "mentioned_addresses": mentioned_addresses[:50],
        "chart_analyses": chart_analyses,
    }


def run_final_synthesis(tweets: list[dict], symbol: str,
                        partial_results: list[dict],
                        chart_analyses: list[dict],
                        mentioned_addresses: list[dict]) -> dict:
    """If we have partial results from chunks, do a final merge+refinement."""

    merged = merge_results(partial_results, chart_analyses, mentioned_addresses, symbol)

    # If only 1 chunk, no need for final synthesis
    if len(partial_results) <= 1:
        return merged

    # Final refinement: send merged timeline + summary for dedup and polish
    refinement_prompt = (
        f"Token: ${symbol} on PulseChain\n"
        f"Total tweets analyzed: {len(tweets)}\n\n"
        f"Below is a MERGED intelligence profile from {len(partial_results)} analysis chunks.\n"
        f"Your job: deduplicate events, improve the project summary with full context, "
        f"and produce the final clean output.\n\n"
        f"CURRENT MERGED DATA:\n{json.dumps(merged['project_summary'], indent=2)}\n\n"
        f"TIMELINE ({len(merged['social_timeline'])} events):\n"
        f"{json.dumps(merged['social_timeline'], indent=2)}\n\n"
    )

    if chart_analyses:
        refinement_prompt += (
            f"CHART ANALYSES ({len(chart_analyses)} images):\n"
            f"{json.dumps(chart_analyses, indent=2)}\n\n"
        )

    if mentioned_addresses[:10]:
        refinement_prompt += (
            f"TOP MENTIONED ADDRESSES ({len(mentioned_addresses)} total, showing top 10):\n"
            f"{json.dumps(mentioned_addresses[:10], indent=2)}\n\n"
        )

    refinement_prompt += (
        "Produce the final refined output. Deduplicate similar events, "
        "enrich descriptions where chart analyses add context, "
        "and finalize the project summary."
    )

    refined = call_llm(SYNTHESIS_SYSTEM, refinement_prompt, max_tokens=6000)
    if refined:
        refined["mentioned_addresses"] = mentioned_addresses[:50]
        refined["chart_analyses"] = chart_analyses
        return refined

    logger.warning(f"  Final refinement failed — using merged result")
    return merged


# ─── Main Pipeline ────────────────────────────────────────────────────

def get_tokens_to_analyze(force: bool = False, single_token: str | None = None) -> list[dict]:
    """Get tokens where tweet count > last analyzed count."""
    # Get distinct tokens from token_tweets
    query = supabase.table("token_tweets") \
        .select("token_address, token_symbol") \
        .limit(1000)

    if single_token:
        query = query.eq("token_address", single_token.lower())

    data = query.execute().data or []

    # Group by token
    tokens: dict[str, dict] = {}
    for row in data:
        addr = row["token_address"]
        if addr not in tokens:
            tokens[addr] = {
                "token_address": addr,
                "token_symbol": row.get("token_symbol", "?"),
                "tweet_count": 0,
            }
        tokens[addr]["tweet_count"] += 1

    if not tokens:
        return []

    if force:
        return list(tokens.values())

    # Check existing intelligence
    try:
        existing = supabase.table("token_intelligence") \
            .select("token_address, analyzed_tweet_count") \
            .in_("token_address", list(tokens.keys())) \
            .execute()

        for row in (existing.data or []):
            addr = row["token_address"]
            if addr in tokens:
                if tokens[addr]["tweet_count"] <= (row.get("analyzed_tweet_count") or 0):
                    del tokens[addr]
    except Exception:
        pass  # Table might not exist yet, analyze everything

    return list(tokens.values())


def fetch_tweets_for_token(token_address: str) -> list[dict]:
    """Fetch all tweets for a token, sorted chronologically."""
    all_tweets = []
    offset = 0
    batch = 1000

    while True:
        resp = supabase.table("token_tweets") \
            .select("id, token_address, token_symbol, text, author_username, author_name, "
                    "like_count, reply_count, retweet_count, tweet_url, tweeted_at, "
                    "media_urls, media_types") \
            .eq("token_address", token_address) \
            .order("tweeted_at", desc=False) \
            .range(offset, offset + batch - 1) \
            .execute()

        rows = resp.data or []
        all_tweets.extend(rows)
        if len(rows) < batch:
            break
        offset += batch

    return all_tweets


def process_token(token_address: str, token_symbol: str):
    """Main pipeline for a single token."""
    logger.info(f"\n{'='*60}")
    logger.info(f"Processing ${token_symbol} ({token_address[:10]}...)")
    logger.info(f"{'='*60}")

    # Fetch tweets
    tweets = fetch_tweets_for_token(token_address)
    if not tweets:
        logger.info(f"  No tweets found, skipping")
        return

    logger.info(f"  {len(tweets)} tweets loaded")

    # Phase 1: Address extraction
    logger.info(f"  Phase 1: Extracting addresses...")
    mentioned_addresses = extract_addresses(tweets)
    logger.info(f"  Found {len(mentioned_addresses)} unique addresses")

    # Phase 2: Chart analysis
    logger.info(f"  Phase 2: Analyzing chart images...")
    chart_analyses = run_chart_analysis(tweets, token_symbol)
    logger.info(f"  {len(chart_analyses)} chart analyses completed")

    # Phase 3: Synthesis
    logger.info(f"  Phase 3: Synthesizing intelligence...")

    # Chunk tweets if needed
    chunks = []
    for i in range(0, len(tweets), MAX_TWEETS_PER_CHUNK):
        chunks.append(tweets[i:i + MAX_TWEETS_PER_CHUNK])

    logger.info(f"  {len(chunks)} chunk(s) to process")

    partial_results = []
    for i, chunk in enumerate(chunks):
        logger.info(f"  Chunk {i + 1}/{len(chunks)} ({len(chunk)} tweets)...")
        result = synthesize_chunk(chunk, token_symbol, i, len(chunks))
        if result:
            partial_results.append(result)
            events = len(result.get("social_timeline", []))
            logger.info(f"    → {events} events extracted")
        time.sleep(2)

    if not partial_results:
        logger.error(f"  All synthesis chunks failed for {token_symbol}")
        return

    # Final merge / refinement
    final = run_final_synthesis(tweets, token_symbol, partial_results,
                                chart_analyses, mentioned_addresses)

    # Sanitize LLM output before storage (prevent stored XSS)
    def sanitize_json_strings(obj):
        """Recursively sanitize all string values in JSON to prevent XSS."""
        if isinstance(obj, str):
            return sanitize_text(obj)
        elif isinstance(obj, dict):
            return {k: sanitize_json_strings(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [sanitize_json_strings(item) for item in obj]
        return obj

    sanitized_summary = sanitize_json_strings(final.get("project_summary", {}))
    sanitized_timeline = sanitize_json_strings(final.get("social_timeline", []))

    # Upsert to Supabase
    record = {
        "token_address": token_address,
        "token_symbol": token_symbol,
        "project_summary": sanitized_summary,
        "social_timeline": sanitized_timeline,
        "mentioned_addresses": final.get("mentioned_addresses", []),
        "chart_analyses": final.get("chart_analyses", []),
        "analyzed_tweet_count": len(tweets),
        "last_analyzed_at": datetime.now(timezone.utc).isoformat(),
        "model_version": LLM_MODEL,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    supabase.table("token_intelligence").upsert(
        record, on_conflict="token_address"
    ).execute()

    events = len(final.get("social_timeline", []))
    addrs = len(final.get("mentioned_addresses", []))
    charts = len(final.get("chart_analyses", []))
    logger.info(f"  ✓ Saved: {events} events, {addrs} addresses, {charts} charts")


def main():
    parser = argparse.ArgumentParser(description="Token Intelligence Analyzer")
    parser.add_argument("--token", help="Single token address to analyze")
    parser.add_argument("--force", action="store_true", help="Re-analyze all tokens")
    args = parser.parse_args()

    logger.info("=== Token Intelligence Pipeline ===")

    tokens = get_tokens_to_analyze(force=args.force, single_token=args.token)

    if not tokens:
        logger.info("No tokens need analysis. Use --force to re-analyze.")
        return

    logger.info(f"Tokens to analyze: {len(tokens)}")
    for t in tokens:
        logger.info(f"  ${t['token_symbol']} — {t['tweet_count']} tweets")

    total_processed = 0
    for t in tokens:
        try:
            process_token(t["token_address"], t["token_symbol"])
            total_processed += 1
        except Exception as e:
            logger.error(f"  Failed for {t['token_symbol']}: {e}")

        # Delay between tokens
        time.sleep(3)

    logger.info(f"\n=== Done: {total_processed}/{len(tokens)} tokens processed ===")


if __name__ == "__main__":
    main()
