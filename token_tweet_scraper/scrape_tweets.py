"""
Token Tweet Scraper — Scrapes Twitter/X for PulseChain token mentions.
Uses Playwright + SearchTimeline GraphQL interception.
Searches for "$SYMBOL pulsechain" for each top token.

Cron Railway: 0 */6 * * * (every 6 hours)
"""
from __future__ import annotations
import os
import sys
import asyncio
import logging
import json
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client

# Load env
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env.local"), override=True)

# Force unbuffered output for Railway logs
import builtins
_orig_print = builtins.print
print = lambda *a, **kw: _orig_print(*a, **{**kw, 'flush': True})

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not all([SUPABASE_URL, SUPABASE_KEY]):
    logger.error("Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Stealth anti-detection scripts (same as research scraper)
STEALTH_JS = """
Object.defineProperty(navigator, 'webdriver', { get: () => false });
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
window.chrome = { runtime: {} };
const origQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (params) =>
  params.name === 'notifications'
    ? Promise.resolve({ state: Notification.permission })
    : origQuery(params);
"""

MAX_TWEETS_PER_TOKEN = 50
MAX_TOKENS_PER_RUN = 50
MAX_SCROLLS = 5


def get_top_tokens() -> list[dict]:
    """Fetch top tokens by liquidity from token_safety_scores."""
    try:
        result = supabase.table("token_safety_scores") \
            .select("token_address, analysis_details") \
            .order("total_liquidity_usd", desc=True) \
            .limit(MAX_TOKENS_PER_RUN) \
            .execute()

        tokens = []
        for row in (result.data or []):
            addr = row["token_address"]
            # Extract symbol from analysis_details if available
            details = row.get("analysis_details")
            symbol = None
            if details:
                if isinstance(details, str):
                    try:
                        details = json.loads(details)
                    except Exception:
                        details = {}
                # Try to find symbol in various places
                symbol = details.get("symbol")

            tokens.append({
                "address": addr,
                "symbol": symbol,
            })

        return tokens
    except Exception as e:
        logger.error(f"Failed to fetch tokens: {e}")
        return []


def get_token_symbols() -> dict[str, str]:
    """Fetch token symbols from pulsechain_tokens table."""
    try:
        result = supabase.table("pulsechain_tokens") \
            .select("address, symbol") \
            .execute()
        return {r["address"].lower(): r["symbol"] for r in (result.data or []) if r.get("symbol")}
    except Exception as e:
        logger.warning(f"Failed to fetch token symbols: {e}")
        return {}


def get_last_tweet_id(token_address: str) -> str | None:
    """Get the most recent tweet_id for incremental scraping."""
    try:
        result = supabase.table("token_tweets") \
            .select("id") \
            .eq("token_address", token_address.lower()) \
            .order("tweeted_at", desc=True) \
            .limit(1) \
            .execute()
        return result.data[0]["id"] if result.data else None
    except Exception:
        return None


def extract_tweets_from_search(data: dict, token_address: str, token_symbol: str | None) -> list[dict]:
    """Extract tweets from GraphQL SearchTimeline response.
    Reuses the same recursive walk pattern as the research scraper."""
    tweets = []

    def _extract_user(obj: dict) -> tuple[dict, dict]:
        """Try multiple paths to extract user info."""
        core = obj.get("core", {})

        # Path 1: core.user_results.result.legacy
        ur = core.get("user_results", {}).get("result", {})
        ul = ur.get("legacy", {})
        if ul.get("screen_name"):
            return ul, ur

        # Path 2: core.user_results.result direct
        if ur.get("screen_name"):
            return ur, ur

        # Path 3: core.user_result (singular)
        ur = core.get("user_result", {}).get("result", {})
        ul = ur.get("legacy", {})
        if ul.get("screen_name"):
            return ul, ur
        if ur.get("screen_name"):
            return ur, ur

        # Path 4: obj.author
        author = obj.get("author", {})
        al = author.get("legacy", {})
        if al.get("screen_name"):
            return al, author
        if author.get("screen_name"):
            return author, author

        return {}, {}

    def walk(obj):
        """Recursive walk to find tweet_results/legacy objects."""
        if isinstance(obj, dict):
            if obj.get("__typename") == "TweetWithVisibilityResults" and "tweet" in obj:
                walk(obj["tweet"])
                return

            if "rest_id" in obj and "legacy" in obj:
                legacy = obj["legacy"]
                user_legacy, user_results = _extract_user(obj)

                tweet_id = obj.get("rest_id")
                text = legacy.get("full_text", "")

                if not tweet_id or not text:
                    return

                # Skip retweets (keep quote tweets)
                if text.startswith("RT @"):
                    return
                if legacy.get("retweeted_status_result"):
                    return

                # Media
                media_urls = []
                media_types = []
                extended = legacy.get("extended_entities", {})
                for m in extended.get("media", []):
                    mtype = m.get("type", "")
                    if mtype == "photo":
                        url = m.get("media_url_https", "")
                        if url:
                            media_urls.append(url)
                            media_types.append("photo")
                    elif mtype in ("video", "animated_gif"):
                        variants = m.get("video_info", {}).get("variants", [])
                        mp4s = [v for v in variants if v.get("content_type") == "video/mp4"]
                        if mp4s:
                            mp4s.sort(key=lambda v: v.get("bitrate", 0), reverse=True)
                            media_urls.append(mp4s[0].get("url", ""))
                        elif variants:
                            media_urls.append(variants[0].get("url", ""))
                        media_types.append(mtype)

                # Parse date
                tweeted_at = legacy.get("created_at", "")
                if tweeted_at:
                    try:
                        dt = datetime.strptime(tweeted_at, "%a %b %d %H:%M:%S %z %Y")
                        tweeted_at = dt.isoformat()
                    except (ValueError, TypeError):
                        pass

                username = user_legacy.get("screen_name") or "unknown"

                tweet = {
                    "id": str(tweet_id),
                    "token_address": token_address.lower(),
                    "token_symbol": token_symbol,
                    "text": text,
                    "author_username": username,
                    "author_name": user_legacy.get("name", ""),
                    "author_profile_pic": user_legacy.get("profile_image_url_https", ""),
                    "author_followers": user_legacy.get("followers_count", 0),
                    "author_is_verified": user_results.get("is_blue_verified", False),
                    "tweet_url": f"https://x.com/{username}/status/{tweet_id}",
                    "lang": legacy.get("lang", ""),
                    "like_count": legacy.get("favorite_count", 0),
                    "retweet_count": legacy.get("retweet_count", 0),
                    "reply_count": legacy.get("reply_count", 0),
                    "quote_count": legacy.get("quote_count", 0),
                    "media_urls": media_urls,
                    "media_types": media_types,
                    "tweeted_at": tweeted_at,
                    "processed": False,
                    "cluster_processed": False,
                }
                tweets.append(tweet)

            for v in obj.values():
                walk(v)
        elif isinstance(obj, list):
            for item in obj:
                walk(item)

    walk(data)

    # Dedup
    seen = set()
    unique = []
    for t in tweets:
        if t["id"] not in seen:
            seen.add(t["id"])
            unique.append(t)

    return unique


def upsert_tweets(tweets: list[dict]) -> int:
    """Upsert tweets into token_tweets table."""
    if not tweets:
        return 0

    batch_size = 50
    total = 0
    for i in range(0, len(tweets), batch_size):
        batch = tweets[i:i + batch_size]
        supabase.table("token_tweets").upsert(batch, on_conflict="id").execute()
        total += len(batch)

    return total


async def search_token(page, symbol: str, token_address: str) -> list[dict]:
    """Search Twitter for token mentions via SearchTimeline GraphQL."""
    collected_tweets = []

    async def handle_response(response):
        url = response.url
        if "/graphql/" not in url:
            return
        # SearchTimeline is the GraphQL endpoint for Twitter search
        if "SearchTimeline" in url or "SearchAdaptive" in url:
            try:
                body = await response.json()
                tweets = extract_tweets_from_search(body, token_address, symbol)
                collected_tweets.extend(tweets)
            except Exception:
                pass

    page.on("response", handle_response)

    try:
        # Build search query — search for token symbol + pulsechain context
        # Use quotes for exact symbol match, add PulseChain context
        query = f'"{symbol}" pulsechain'
        encoded_query = query.replace('"', '%22').replace(' ', '%20')
        search_url = f"https://x.com/search?q={encoded_query}&src=typed_query&f=live"

        logger.info(f"  Searching: {query}")
        await page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(4000)

        # Scroll to trigger more tweet loading
        for scroll_num in range(MAX_SCROLLS):
            await page.evaluate("window.scrollBy(0, 1200)")
            await page.wait_for_timeout(2500)

            # Stop if we have enough tweets
            if len(collected_tweets) >= MAX_TWEETS_PER_TOKEN:
                break

    except Exception as e:
        logger.warning(f"  Error searching ${symbol}: {e}")
    finally:
        page.remove_listener("response", handle_response)

    # Dedup and limit
    unique = []
    seen = set()
    for t in collected_tweets:
        if t["id"] not in seen and len(unique) < MAX_TWEETS_PER_TOKEN:
            seen.add(t["id"])
            unique.append(t)

    return unique


async def run():
    logger.info("=== Token Tweet Scraper (SearchTimeline) ===")
    logger.info(f"Time: {datetime.now(timezone.utc).isoformat()}")

    # Get top tokens
    tokens = get_top_tokens()
    if not tokens:
        logger.warning("No tokens found. Done.")
        return

    # Get symbol mapping
    symbol_map = get_token_symbols()

    # Resolve symbols for tokens that don't have one
    for t in tokens:
        if not t["symbol"]:
            t["symbol"] = symbol_map.get(t["address"].lower())

    # Filter tokens that have a symbol (can't search without one)
    tokens_with_symbol = [t for t in tokens if t["symbol"]]
    logger.info(f"Tokens with symbol: {len(tokens_with_symbol)}/{len(tokens)}")

    if not tokens_with_symbol:
        logger.warning("No tokens with symbols. Done.")
        return

    from playwright.async_api import async_playwright

    total_collected = 0
    total_skipped = 0

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ]
        )

        context = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            locale="en-US",
        )

        await context.add_init_script(STEALTH_JS)
        page = await context.new_page()

        # Block heavy resources
        await page.route("**/*.{png,jpg,jpeg,gif,webp,svg,mp4,woff,woff2,ttf}", lambda route: route.abort())

        for token in tokens_with_symbol:
            symbol = token["symbol"]
            address = token["address"]
            logger.info(f"${symbol} ({address[:10]}...)...")

            tweets = await search_token(page, symbol, address)

            if tweets:
                count = upsert_tweets(tweets)
                logger.info(f"  {count} tweets upserted")
                total_collected += count
            else:
                logger.info(f"  0 tweets (empty search or login required)")
                total_skipped += 1

            # Pause between searches to avoid rate limiting
            await page.wait_for_timeout(5000)

        await browser.close()

    logger.info(f"\nTotal: {total_collected} tweets collected, {total_skipped} tokens skipped")
    logger.info("=== Done ===")


def main():
    asyncio.run(run())


if __name__ == "__main__":
    main()
