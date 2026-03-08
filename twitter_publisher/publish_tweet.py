"""
Twitter Auto-Publisher for OpenPulsechain.
Generates and publishes on-chain intelligence tweets via X API v2.
Uses OAuth 1.0a (User Context) for posting.
"""
from __future__ import annotations
import os
import sys
import json
import logging
import hashlib
import hmac
import time
import base64
import urllib.parse
import secrets
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client
import httpx

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env.local"), override=True)

import builtins
_orig_print = builtins.print
print = lambda *a, **kw: _orig_print(*a, **{**kw, 'flush': True})

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Twitter OAuth 1.0a
TWITTER_API_KEY = os.getenv("TWITTER_API_KEY")
TWITTER_API_SECRET = os.getenv("TWITTER_API_SECRET")
TWITTER_ACCESS_TOKEN = os.getenv("TWITTER_ACCESS_TOKEN")
TWITTER_ACCESS_SECRET = os.getenv("TWITTER_ACCESS_SECRET")

# LLM for tweet generation
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
LLM_MODEL = os.getenv("LLM_MODEL", "anthropic/claude-3.5-haiku")

if not all([SUPABASE_URL, SUPABASE_KEY]):
    logger.error("Missing: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY")
    sys.exit(1)

if not all([TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET]):
    logger.error("Missing Twitter credentials: TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET")
    sys.exit(1)

if not OPENROUTER_API_KEY:
    logger.error("Missing: OPENROUTER_API_KEY")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


# ─── OAuth 1.0a Signature ───

def _percent_encode(s: str) -> str:
    return urllib.parse.quote(str(s), safe="")


def _generate_oauth_signature(method: str, url: str, params: dict, consumer_secret: str, token_secret: str) -> str:
    """Generate OAuth 1.0a signature."""
    sorted_params = "&".join(f"{_percent_encode(k)}={_percent_encode(v)}" for k, v in sorted(params.items()))
    base_string = f"{method.upper()}&{_percent_encode(url)}&{_percent_encode(sorted_params)}"
    signing_key = f"{_percent_encode(consumer_secret)}&{_percent_encode(token_secret)}"
    signature = hmac.new(signing_key.encode(), base_string.encode(), hashlib.sha1)
    return base64.b64encode(signature.digest()).decode()


def _build_oauth_header(method: str, url: str, body_params: dict = None) -> str:
    """Build OAuth 1.0a Authorization header."""
    oauth_params = {
        "oauth_consumer_key": TWITTER_API_KEY,
        "oauth_nonce": secrets.token_hex(16),
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": str(int(time.time())),
        "oauth_token": TWITTER_ACCESS_TOKEN,
        "oauth_version": "1.0",
    }

    # For signature, combine oauth params (body params NOT included for JSON body)
    all_params = {**oauth_params}

    signature = _generate_oauth_signature(method, url, all_params, TWITTER_API_SECRET, TWITTER_ACCESS_SECRET)
    oauth_params["oauth_signature"] = signature

    header = "OAuth " + ", ".join(f'{_percent_encode(k)}="{_percent_encode(v)}"' for k, v in sorted(oauth_params.items()))
    return header


# ─── Twitter API ───

TWEET_URL = "https://api.twitter.com/2/tweets"


def post_tweet(text: str) -> dict | None:
    """Post a tweet via X API v2."""
    if len(text) > 280:
        logger.warning(f"Tweet too long ({len(text)} chars), truncating...")
        text = text[:277] + "..."

    auth_header = _build_oauth_header("POST", TWEET_URL)

    try:
        response = httpx.post(
            TWEET_URL,
            headers={
                "Authorization": auth_header,
                "Content-Type": "application/json",
            },
            json={"text": text},
            timeout=15.0,
        )

        if response.status_code == 201:
            data = response.json()
            tweet_id = data.get("data", {}).get("id")
            logger.info(f"Tweet posted: https://x.com/openpulsechain/status/{tweet_id}")
            return data
        else:
            logger.error(f"Twitter API error {response.status_code}: {response.text}")
            return None

    except Exception as e:
        logger.error(f"Failed to post tweet: {e}")
        return None


def post_thread(tweets: list[str]) -> list[dict]:
    """Post a thread (multiple tweets chained via reply_to)."""
    results = []
    reply_to_id = None

    for i, text in enumerate(tweets):
        if len(text) > 280:
            text = text[:277] + "..."

        auth_header = _build_oauth_header("POST", TWEET_URL)
        body = {"text": text}
        if reply_to_id:
            body["reply"] = {"in_reply_to_tweet_id": reply_to_id}

        try:
            response = httpx.post(
                TWEET_URL,
                headers={
                    "Authorization": auth_header,
                    "Content-Type": "application/json",
                },
                json=body,
                timeout=15.0,
            )

            if response.status_code == 201:
                data = response.json()
                tweet_id = data.get("data", {}).get("id")
                reply_to_id = tweet_id
                results.append(data)
                logger.info(f"Thread [{i+1}/{len(tweets)}] posted: {tweet_id}")
            else:
                logger.error(f"Thread [{i+1}] error {response.status_code}: {response.text}")
                break

        except Exception as e:
            logger.error(f"Thread [{i+1}] failed: {e}")
            break

        # Small delay between thread tweets
        time.sleep(2)

    return results


# ─── Content Generation ───

TWEET_SYSTEM_PROMPT = """You are the social media manager for OpenPulsechain, an open-source PulseChain analytics platform.

Generate a tweet or short thread (max 3 tweets) based on the on-chain intelligence provided.

Rules:
- Each tweet MUST be under 280 characters
- Use data and numbers, be factual
- Never give financial advice — only share data and observations
- Tone: professional, data-driven, slightly edgy
- Use relevant hashtags sparingly (max 2): #PulseChain #PLS #HEX etc.
- Include the OpenPulsechain website when relevant: openpulsechain.com
- NEVER mention any source of intelligence or research accounts
- NEVER tag or mention any Twitter accounts
- Use emojis sparingly (max 1-2 per tweet)
- Format numbers clearly ($580K not $580000)

Respond with JSON:
{
  "tweets": ["tweet text 1", "optional tweet 2", "optional tweet 3"],
  "type": "single|thread"
}"""


def generate_tweet_content(intel_data: dict) -> dict | None:
    """Use LLM to generate tweet content from intelligence data."""
    try:
        prompt = f"""Generate a tweet based on this on-chain intelligence:

Title: {intel_data.get('title', '')}
Summary: {intel_data.get('summary', '')}
Risk Level: {intel_data.get('risk_level', '')}
Tokens: {', '.join(intel_data.get('tokens_involved', []))}
Addresses: {len(intel_data.get('addresses_involved', []))} addresses involved
Type: {intel_data.get('conclusion_type', '')}
Tweet count (evidence): {intel_data.get('tweet_count', 0)}"""

        response = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": LLM_MODEL,
                "messages": [
                    {"role": "system", "content": TWEET_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.7,
                "max_tokens": 500,
            },
            timeout=30.0,
        )
        response.raise_for_status()
        data = response.json()

        content = data["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            import re
            content = re.sub(r'^```\w*\n?', '', content)
            content = re.sub(r'\n?```$', '', content)

        return json.loads(content)

    except Exception as e:
        logger.error(f"LLM generation error: {e}")
        return None


# ─── Main Pipeline ───

def get_unpublished_conclusions() -> list[dict]:
    """Get high-priority conclusions not yet published."""
    # Get conclusions sorted by risk (critical first), that haven't been tweeted
    result = supabase.table("research_intel_conclusions") \
        .select("*") \
        .eq("is_active", True) \
        .order("risk_level", desc=True) \
        .limit(5) \
        .execute()

    return result.data or []


def main():
    logger.info("=== OpenPulsechain Twitter Publisher ===")
    logger.info(f"Time: {datetime.now(timezone.utc).isoformat()}")

    # Get intelligence data
    conclusions = get_unpublished_conclusions()
    logger.info(f"Available conclusions: {len(conclusions)}")

    if not conclusions:
        logger.info("Nothing to publish. Done.")
        return

    # Pick the highest-priority unpublished conclusion
    # For now, pick the first HIGH or CRITICAL one
    target = None
    for c in conclusions:
        if c.get("risk_level") in ("critical", "high"):
            target = c
            break

    if not target:
        target = conclusions[0]

    logger.info(f"Selected: [{target['risk_level'].upper()}] {target['title']}")

    # Generate tweet content
    content = generate_tweet_content(target)
    if not content:
        logger.error("Failed to generate content. Aborting.")
        return

    tweets = content.get("tweets", [])
    tweet_type = content.get("type", "single")

    logger.info(f"Generated {len(tweets)} tweet(s) ({tweet_type}):")
    for i, t in enumerate(tweets):
        logger.info(f"  [{i+1}] ({len(t)} chars) {t}")

    # Validate lengths
    for i, t in enumerate(tweets):
        if len(t) > 280:
            logger.warning(f"Tweet {i+1} exceeds 280 chars ({len(t)}), will be truncated")

    # Post
    if tweet_type == "thread" and len(tweets) > 1:
        results = post_thread(tweets)
        logger.info(f"Thread posted: {len(results)}/{len(tweets)} tweets")
    else:
        result = post_tweet(tweets[0])
        if result:
            logger.info("Single tweet posted successfully")

    # Mark conclusion as published (deactivate to avoid re-posting)
    supabase.table("research_intel_conclusions") \
        .update({"is_active": False}) \
        .eq("id", target["id"]) \
        .execute()

    logger.info("=== Done ===")


if __name__ == "__main__":
    main()
