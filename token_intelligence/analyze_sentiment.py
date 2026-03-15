"""
Token Sentiment Pipeline — Dual-perspective sentiment analysis.

For each PulseChain token with scraped tweets:
  Phase A: Classify tweets as Community (insiders) vs External (outsiders)
  Phase B: Extract arguments (positive & negative) per group
  Phase C: AI factual evaluation of each argument
  Phase D: Meta-analysis verdict — neutral assessment of all arguments

Usage:
  python analyze_sentiment.py                     # all tokens with tweets
  python analyze_sentiment.py --token 0xabc...    # single token
  python analyze_sentiment.py --force             # re-analyze all
"""
from __future__ import annotations
import os
import sys
import re
import json
import logging
import time
import argparse
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

MAX_TWEETS_PER_CHUNK = 60
MIN_TWEETS = 5  # minimum tweets to run sentiment analysis


# ─── Security ─────────────────────────────────────────────────────────

def sanitize_text(text: str) -> str:
    """Strip HTML tags, null bytes, and escape entities to prevent XSS."""
    text = text.replace('\x00', '')
    text = re.sub(r'<[^>]+>', '', text)
    text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    return text


def sanitize_json_strings(obj):
    """Recursively sanitize all string values in JSON."""
    if isinstance(obj, str):
        return sanitize_text(obj)
    elif isinstance(obj, dict):
        return {k: sanitize_json_strings(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_json_strings(item) for item in obj]
    return obj


# ─── LLM ──────────────────────────────────────────────────────────────

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
            timeout=180.0,
        )
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"].strip()

        if content.startswith("```"):
            content = re.sub(r'^```\w*\n?', '', content)
            content = re.sub(r'\n?```$', '', content)

        return json.loads(content)

    except json.JSONDecodeError as e:
        logger.warning(f"  JSON parse error: {e}")
        return None
    except Exception as e:
        logger.warning(f"  LLM call failed: {e}")
        return None


def format_tweets_for_prompt(tweets: list[dict]) -> str:
    """Format tweets for LLM consumption."""
    lines = []
    for t in tweets:
        date = (t.get("tweeted_at") or "?")[:10]
        author = t.get("author_username", "?")
        followers = t.get("author_followers", 0)
        text = (t.get("text") or "")[:400]
        likes = t.get("like_count", 0)
        rt = t.get("retweet_count", 0)
        lines.append(
            f"[{date}] @{author} (followers:{followers}) | "
            f"♥{likes} RT{rt} | {text}"
        )
    return "\n".join(lines)


# ─── Phase A: Classification (Community vs External) ─────────────────

CLASSIFY_SYSTEM = """You are a crypto social media analyst. Your task is to classify tweets about a specific token into two groups:

1. COMMUNITY: The author is likely a holder, supporter, or community member of this token. Indicators:
   - Uses "we", "our", "us" when talking about the token
   - Expresses personal investment ("I hold", "I bought", "my bag", "staking")
   - Uses community hashtags or insider terminology
   - Consistently positive/promotional tone about THIS specific token
   - Defends the token against criticism
   - Is a known community figure or influencer for this token

2. EXTERNAL: The author is an outsider, analyst, critic, or casual observer. Indicators:
   - Neutral/analytical language ("this token", "the project")
   - Critical or questioning tone
   - Comparing with other tokens objectively
   - Warning other users
   - One-time or rare mention of this token
   - General crypto news account covering multiple tokens

For each tweet, also classify the STANCE:
- POSITIVE: Favorable view, bullish, supportive
- NEGATIVE: Unfavorable view, bearish, critical, warning
- NEUTRAL: Factual, informational, no clear opinion

Respond in STRICT JSON only."""

def classify_tweets_chunk(tweets: list[dict], symbol: str) -> list[dict]:
    """Classify a chunk of tweets as community/external + positive/negative/neutral."""
    prompt_tweets = format_tweets_for_prompt(tweets)
    tweet_ids = [t["id"] for t in tweets]

    user_msg = f"""Token: ${symbol}
Tweet IDs and content below. For EACH tweet, classify:
- group: "community" or "external"
- stance: "positive", "negative", or "neutral"

Tweets:
{prompt_tweets}

Tweet IDs (same order): {json.dumps(tweet_ids)}

Respond in JSON:
{{"classifications": [{{"id": "tweet_id", "group": "community|external", "stance": "positive|negative|neutral"}}]}}"""

    result = call_llm(CLASSIFY_SYSTEM, user_msg, max_tokens=3000)
    if not result:
        return []
    return result.get("classifications", [])


# ─── Phase B: Argument Extraction ────────────────────────────────────

EXTRACT_SYSTEM = """You are a crypto analyst extracting key arguments from tweets about a token.

From the provided tweets, identify the main ARGUMENTS (not individual tweets) — recurring themes, claims, and positions.

For each argument:
- Determine if it is POSITIVE (favorable to the token) or NEGATIVE (unfavorable)
- Count how many tweets express this argument
- Select the most representative tweet IDs as sources
- Keep the argument concise (1-2 sentences max)

RULES:
- Merge similar arguments (e.g., "great staking yields" and "38% APY staking" = one argument)
- Ignore pure spam, bots, or meaningless noise
- Maximum 10 arguments per group (prioritize by frequency)
- Arguments must be SPECIFIC and SUBSTANTIVE (not "token is good" or "token is bad")

Respond in STRICT JSON only."""

def extract_arguments(tweets: list[dict], symbol: str, group_name: str) -> list[dict]:
    """Extract key arguments from a group of tweets."""
    if len(tweets) < 2:
        return []

    # Chunk if needed
    all_args = []
    for i in range(0, len(tweets), MAX_TWEETS_PER_CHUNK):
        chunk = tweets[i:i + MAX_TWEETS_PER_CHUNK]
        prompt_tweets = format_tweets_for_prompt(chunk)
        tweet_ids = [t["id"] for t in chunk]

        user_msg = f"""Token: ${symbol}
Perspective: {group_name} ({"token holders/supporters" if group_name == "community" else "outside observers/critics"})

Tweets ({len(chunk)}):
{prompt_tweets}

Available tweet IDs: {json.dumps(tweet_ids)}

Extract the key arguments expressed in these tweets.

Respond in JSON:
{{"arguments": [{{"stance": "positive|negative", "argument": "Concise argument statement", "frequency": 3, "source_tweet_ids": ["id1", "id2"]}}]}}"""

        result = call_llm(EXTRACT_SYSTEM, user_msg, max_tokens=3000)
        if result:
            all_args.extend(result.get("arguments", []))
        time.sleep(1)

    # Deduplicate/merge similar arguments
    if len(all_args) > 10:
        return _merge_arguments(all_args, symbol, group_name)
    return all_args


def _merge_arguments(args: list[dict], symbol: str, group_name: str) -> list[dict]:
    """Merge duplicate arguments across chunks."""
    args_text = json.dumps(args, ensure_ascii=False)

    user_msg = f"""Token: ${symbol} — {group_name} perspective

Below are arguments extracted from multiple batches. Many are duplicates or very similar.
Merge them into a maximum of 10 unique arguments, combining frequencies and source tweet IDs.

Raw arguments:
{args_text}

Respond in JSON:
{{"arguments": [{{"stance": "positive|negative", "argument": "Merged argument", "frequency": 8, "source_tweet_ids": ["id1", "id2", "id3"]}}]}}"""

    result = call_llm(EXTRACT_SYSTEM, user_msg, max_tokens=3000)
    if result:
        return result.get("arguments", args[:10])
    return args[:10]


# ─── Phase C: Factual Evaluation of Each Argument ────────────────────

EVALUATE_SYSTEM = """You are an independent financial analyst. You must evaluate crypto-related arguments with complete neutrality and factual rigor.

For each argument, you must determine:
1. FACTUAL STATUS: Is this claim factually verifiable?
   - "confirmed" = verifiable and true based on on-chain data, public records, or widely documented facts
   - "partial" = contains some truth but is misleading, exaggerated, or missing context
   - "unverifiable" = cannot be confirmed or denied with available evidence
   - "debunked" = demonstrably false or contradicted by evidence

2. EVIDENCE: What specific evidence supports or contradicts this claim?
   - Cite on-chain facts, public events, documented history
   - Do NOT invent data — if you don't know, say "insufficient data"

3. PERTINENCE SCORE (0-100): How relevant and important is this argument for evaluating the token?
   - 90-100: Critical, game-changing fact
   - 70-89: Important consideration
   - 40-69: Moderate relevance
   - 0-39: Low relevance or noise

4. CONCLUSION: A neutral, one-sentence factual assessment

RULES:
- NEVER take sides — evaluate BOTH positive and negative arguments with equal rigor
- Base conclusions on FACTS, not sentiment
- If community claims seem too good to be true, say so
- If criticism lacks evidence, say so
- Be specific: "the contract is audited by X" is better than "the contract is audited"

Respond in STRICT JSON only."""

def evaluate_arguments(arguments: list[dict], symbol: str) -> list[dict]:
    """Evaluate each argument factually using LLM."""
    if not arguments:
        return []

    args_text = json.dumps(arguments, ensure_ascii=False)

    user_msg = f"""Token: ${symbol} on PulseChain

Evaluate each of the following arguments factually:

{args_text}

For each argument, provide an evaluation.

Respond in JSON:
{{"evaluations": [
  {{
    "argument": "Original argument text",
    "stance": "positive|negative",
    "factual": "confirmed|partial|unverifiable|debunked",
    "evidence": "Specific evidence or 'insufficient data'",
    "pertinence_score": 75,
    "conclusion": "One-sentence neutral assessment"
  }}
]}}"""

    result = call_llm(EVALUATE_SYSTEM, user_msg, max_tokens=4000)
    if not result:
        return arguments

    evaluations = result.get("evaluations", [])

    # Merge evaluations back into arguments
    eval_map = {}
    for ev in evaluations:
        key = ev.get("argument", "")[:50].lower()
        eval_map[key] = {
            "factual": ev.get("factual", "unverifiable"),
            "evidence": ev.get("evidence", ""),
            "pertinence_score": max(0, min(100, int(ev.get("pertinence_score", 50)))),
            "conclusion": ev.get("conclusion", ""),
        }

    for arg in arguments:
        key = arg.get("argument", "")[:50].lower()
        if key in eval_map:
            arg["ai_evaluation"] = eval_map[key]
        else:
            # Try fuzzy match
            matched = False
            for ek, ev in eval_map.items():
                if ek[:30] in key or key[:30] in ek:
                    arg["ai_evaluation"] = ev
                    matched = True
                    break
            if not matched:
                arg["ai_evaluation"] = {
                    "factual": "unverifiable",
                    "evidence": "Not evaluated",
                    "pertinence_score": 50,
                    "conclusion": "Evaluation unavailable",
                }

    return arguments


# ─── Phase D: Meta-Analysis Verdict ──────────────────────────────────

VERDICT_SYSTEM = """You are a senior independent crypto analyst writing a factual assessment report.

You are given ALL arguments from BOTH sides (community insiders and external observers) about a token, each with individual factual evaluations.

Your task is to write a NEUTRAL, EVIDENCE-BASED meta-analysis that:
1. Weighs confirmed facts vs unverifiable claims from BOTH sides
2. Identifies what is genuinely proven vs what is marketing/FUD
3. Highlights contradictions between the two camps
4. Draws pragmatic conclusions for an investor trying to make an informed decision

RULES:
- ABSOLUTE NEUTRALITY — you are not for or against the token
- Facts over feelings — cite specific evidence
- Acknowledge uncertainty honestly
- If the community overhypes, say so. If critics lack evidence, say so.
- Write for a sophisticated investor who wants truth, not confirmation bias
- Overall assessment: 3-5 paragraphs, clear and direct
- Conclusion: 2-3 sentences max, actionable insight

This is NOT investment advice. This is factual analysis.

Respond in STRICT JSON only."""

def generate_verdict(
    community_args: list[dict],
    external_args: list[dict],
    symbol: str,
    community_count: int,
    external_count: int,
) -> dict:
    """Generate the meta-analysis verdict from all evaluated arguments."""

    user_msg = f"""Token: ${symbol} on PulseChain

COMMUNITY PERSPECTIVE ({community_count} tweets analyzed):
Arguments from holders/supporters:
{json.dumps(community_args, ensure_ascii=False, indent=2)}

EXTERNAL PERSPECTIVE ({external_count} tweets analyzed):
Arguments from outside observers/critics:
{json.dumps(external_args, ensure_ascii=False, indent=2)}

Produce a meta-analysis verdict.

Respond in JSON:
{{
  "overall_assessment": "3-5 paragraphs of neutral factual analysis...",
  "positive_validity": 65,
  "negative_validity": 45,
  "key_facts_confirmed": ["Fact 1", "Fact 2"],
  "key_facts_debunked": ["Myth 1"],
  "unverifiable_claims": ["Claim 1"],
  "risk_factors": ["Risk 1", "Risk 2"],
  "conclusion": "2-3 sentence pragmatic conclusion"
}}"""

    result = call_llm(VERDICT_SYSTEM, user_msg, max_tokens=4000)
    if not result:
        return {
            "overall_assessment": "Analysis could not be completed.",
            "positive_validity": None,
            "negative_validity": None,
            "key_facts_confirmed": [],
            "key_facts_debunked": [],
            "unverifiable_claims": [],
            "risk_factors": [],
            "conclusion": "Insufficient data for verdict.",
        }

    # Clamp validity scores
    for key in ("positive_validity", "negative_validity"):
        v = result.get(key)
        if v is not None:
            result[key] = max(0, min(100, int(v)))

    return result


# ─── Main Pipeline ───────────────────────────────────────────────────

def fetch_tweets_for_token(token_address: str) -> list[dict]:
    """Fetch all tweets for a token from Supabase."""
    all_tweets = []
    offset = 0
    batch_size = 1000

    while True:
        resp = supabase.table("token_tweets") \
            .select("id,text,author_username,author_name,author_followers,"
                    "like_count,retweet_count,tweeted_at,tweet_url") \
            .eq("token_address", token_address) \
            .order("tweeted_at", desc=False) \
            .range(offset, offset + batch_size - 1) \
            .execute()

        if not resp.data:
            break
        all_tweets.extend(resp.data)
        if len(resp.data) < batch_size:
            break
        offset += batch_size

    return all_tweets


def get_tokens_to_analyze(force: bool = False, single_token: str | None = None) -> list[dict]:
    """Get list of tokens to analyze."""
    if single_token:
        addr = single_token.lower()
        resp = supabase.table("token_tweets") \
            .select("token_address,token_symbol") \
            .eq("token_address", addr) \
            .limit(1) \
            .execute()
        if resp.data:
            return [{"token_address": addr, "token_symbol": resp.data[0].get("token_symbol", "?")}]
        return []

    # Get all tokens with tweets
    resp = supabase.rpc("get_token_tweet_counts", {}).execute() if False else None

    # Fallback: get distinct tokens from token_tweets
    resp = supabase.table("token_tweets") \
        .select("token_address,token_symbol") \
        .limit(1000) \
        .execute()

    if not resp.data:
        return []

    # Deduplicate
    seen = {}
    for row in resp.data:
        addr = row["token_address"]
        if addr not in seen:
            seen[addr] = row.get("token_symbol", "?")

    tokens = [{"token_address": a, "token_symbol": s} for a, s in seen.items()]

    if not force:
        # Skip tokens already analyzed in the last 24h
        existing = supabase.table("token_sentiment") \
            .select("token_address,last_analyzed_at") \
            .execute()
        recent = set()
        now = datetime.now(timezone.utc)
        for row in (existing.data or []):
            if row.get("last_analyzed_at"):
                analyzed_at = datetime.fromisoformat(row["last_analyzed_at"].replace("Z", "+00:00"))
                if (now - analyzed_at).total_seconds() < 86400:
                    recent.add(row["token_address"])
        tokens = [t for t in tokens if t["token_address"] not in recent]

    return tokens


def process_token(token_address: str, token_symbol: str):
    """Full sentiment pipeline for a single token."""
    logger.info(f"\n{'='*60}")
    logger.info(f"Sentiment analysis: ${token_symbol} ({token_address[:10]}...)")
    logger.info(f"{'='*60}")

    tweets = fetch_tweets_for_token(token_address)
    if len(tweets) < MIN_TWEETS:
        logger.info(f"  Only {len(tweets)} tweets — minimum {MIN_TWEETS} required, skipping")
        return

    logger.info(f"  {len(tweets)} tweets loaded")

    # ── Phase A: Classification ──
    logger.info(f"  Phase A: Classifying tweets (community vs external)...")
    all_classifications = []
    for i in range(0, len(tweets), MAX_TWEETS_PER_CHUNK):
        chunk = tweets[i:i + MAX_TWEETS_PER_CHUNK]
        logger.info(f"    Chunk {i // MAX_TWEETS_PER_CHUNK + 1} ({len(chunk)} tweets)...")
        classifications = classify_tweets_chunk(chunk, token_symbol)
        all_classifications.extend(classifications)
        time.sleep(1)

    # Build classification map
    class_map = {}
    for c in all_classifications:
        class_map[c.get("id")] = {
            "group": c.get("group", "external"),
            "stance": c.get("stance", "neutral"),
        }

    # Split tweets into groups
    community_tweets = []
    external_tweets = []
    community_pos = 0
    community_neg = 0
    external_pos = 0
    external_neg = 0

    for tweet in tweets:
        info = class_map.get(tweet["id"], {"group": "external", "stance": "neutral"})
        tweet["_group"] = info["group"]
        tweet["_stance"] = info["stance"]

        if info["group"] == "community":
            community_tweets.append(tweet)
            if info["stance"] == "positive":
                community_pos += 1
            elif info["stance"] == "negative":
                community_neg += 1
        else:
            external_tweets.append(tweet)
            if info["stance"] == "positive":
                external_pos += 1
            elif info["stance"] == "negative":
                external_neg += 1

    logger.info(f"  Community: {len(community_tweets)} tweets ({community_pos} pos, {community_neg} neg)")
    logger.info(f"  External:  {len(external_tweets)} tweets ({external_pos} pos, {external_neg} neg)")

    # ── Phase B: Argument Extraction ──
    logger.info(f"  Phase B: Extracting arguments...")
    community_args = extract_arguments(community_tweets, token_symbol, "community")
    logger.info(f"    Community: {len(community_args)} arguments")
    time.sleep(1)

    external_args = extract_arguments(external_tweets, token_symbol, "external")
    logger.info(f"    External: {len(external_args)} arguments")
    time.sleep(1)

    # ── Enrich arguments with date ranges from source tweets ──
    tweet_date_map = {}
    for t in tweets:
        tid = t.get("id")
        tweeted_at = t.get("tweeted_at")
        if tid and tweeted_at:
            tweet_date_map[str(tid)] = tweeted_at[:10]  # YYYY-MM-DD

    def enrich_date_range(args: list[dict]) -> list[dict]:
        for arg in args:
            source_ids = arg.get("source_tweet_ids", [])
            dates = [tweet_date_map[str(sid)] for sid in source_ids if str(sid) in tweet_date_map]
            if dates:
                dates.sort()
                arg["earliest_date"] = dates[0]
                arg["latest_date"] = dates[-1]
        return args

    community_args = enrich_date_range(community_args)
    external_args = enrich_date_range(external_args)
    logger.info(f"  Date ranges enriched from source tweet IDs")

    # ── Phase C: Factual Evaluation ──
    logger.info(f"  Phase C: Evaluating arguments factually...")
    if community_args:
        community_args = evaluate_arguments(community_args, token_symbol)
        logger.info(f"    Community arguments evaluated")
        time.sleep(1)

    if external_args:
        external_args = evaluate_arguments(external_args, token_symbol)
        logger.info(f"    External arguments evaluated")
        time.sleep(1)

    # ── Phase D: Meta-Analysis Verdict ──
    logger.info(f"  Phase D: Generating meta-analysis verdict...")
    verdict = generate_verdict(
        community_args, external_args, token_symbol,
        len(community_tweets), len(external_tweets)
    )
    logger.info(f"  Verdict generated (positive validity: {verdict.get('positive_validity')}%, "
                f"negative validity: {verdict.get('negative_validity')}%)")

    # ── Compute scores ──
    community_total = len(community_tweets) or 1
    community_score = round((community_pos / community_total) * 100)

    external_total = len(external_tweets) or 1
    external_score = round((external_pos / external_total) * 100)

    # ── Load existing history ──
    try:
        existing = supabase.table("token_sentiment") \
            .select("sentiment_history") \
            .eq("token_address", token_address) \
            .maybe_single() \
            .execute()
        history = (existing.data or {}).get("sentiment_history", []) if existing and existing.data else []
    except Exception:
        history = []

    # Append today's snapshot
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    # Don't duplicate same day
    if not history or history[-1].get("date") != today:
        history.append({
            "date": today,
            "community_score": community_score,
            "external_score": external_score,
            "community_tweets": len(community_tweets),
            "external_tweets": len(external_tweets),
        })
        # Keep last 90 days max
        history = history[-90:]

    # ── Sanitize all LLM output ──
    sanitized_community = sanitize_json_strings(community_args)
    sanitized_external = sanitize_json_strings(external_args)
    sanitized_verdict = sanitize_json_strings(verdict)

    # ── Upsert to Supabase ──
    record = {
        "token_address": token_address,
        "token_symbol": token_symbol,
        "community_score": community_score,
        "community_tweet_count": len(community_tweets),
        "community_positive_count": community_pos,
        "community_negative_count": community_neg,
        "community_arguments": sanitized_community,
        "external_score": external_score,
        "external_tweet_count": len(external_tweets),
        "external_positive_count": external_pos,
        "external_negative_count": external_neg,
        "external_arguments": sanitized_external,
        "verdict": sanitized_verdict,
        "sentiment_history": history,
        "analyzed_tweet_count": len(tweets),
        "last_analyzed_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    supabase.table("token_sentiment").upsert(
        record, on_conflict="token_address"
    ).execute()

    logger.info(f"  ✓ Saved: community={community_score}/100 ({len(community_tweets)} tweets), "
                f"external={external_score}/100 ({len(external_tweets)} tweets), "
                f"{len(community_args)}+{len(external_args)} arguments")


def main():
    parser = argparse.ArgumentParser(description="Token Sentiment Analyzer")
    parser.add_argument("--token", help="Single token address to analyze")
    parser.add_argument("--force", action="store_true", help="Re-analyze all tokens")
    args = parser.parse_args()

    logger.info("=== Token Sentiment Pipeline ===")

    tokens = get_tokens_to_analyze(force=args.force, single_token=args.token)

    if not tokens:
        logger.info("No tokens to analyze")
        return

    logger.info(f"Tokens to analyze: {len(tokens)}")

    for token in tokens:
        try:
            process_token(token["token_address"], token["token_symbol"])
        except Exception as e:
            logger.error(f"Error processing {token['token_symbol']}: {e}")
            import traceback
            traceback.print_exc()
        time.sleep(2)

    logger.info("=== Sentiment Pipeline Complete ===")


if __name__ == "__main__":
    main()
