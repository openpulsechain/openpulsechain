"""
Research Tweet Scraper — Playwright-based Twitter/X scraper.
Intercepts GraphQL API responses to extract tweets from followed accounts.
Designed for on-chain research intelligence gathering.
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

# Stealth anti-detection scripts
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

MAX_TWEETS_PER_ACCOUNT = 20  # More tweets for research depth


def get_active_accounts() -> list[dict]:
    """Fetch active accounts from research_followed_accounts."""
    result = supabase.table("research_followed_accounts") \
        .select("username, display_name, priority, category") \
        .eq("is_active", True) \
        .order("priority", desc=True) \
        .execute()
    return result.data or []


def extract_tweets_from_timeline(data: dict, fallback_username: str = "unknown", fallback_display_name: str = "") -> list[dict]:
    """Extract tweets from GraphQL UserTweets/UserByScreenName response."""
    tweets = []

    def _extract_user(obj: dict) -> tuple[dict, dict]:
        """Try multiple paths to extract user info (Twitter changes structure often)."""
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

                # Card / URL
                card_url = None
                card_title = None
                card_data = obj.get("card", {}).get("legacy", {})
                if card_data:
                    for pair in card_data.get("binding_values", []):
                        key = pair.get("key", "")
                        val = pair.get("value", {}).get("string_value", "")
                        if key == "card_url":
                            card_url = val
                        elif key == "title":
                            card_title = val

                # Parse date
                tweeted_at = legacy.get("created_at", "")
                if tweeted_at:
                    try:
                        dt = datetime.strptime(tweeted_at, "%a %b %d %H:%M:%S %z %Y")
                        tweeted_at = dt.isoformat()
                    except (ValueError, TypeError):
                        pass

                username = user_legacy.get("screen_name") or fallback_username

                tweet = {
                    "id": str(tweet_id),
                    "text": text,
                    "author_username": username,
                    "author_name": user_legacy.get("name") or fallback_display_name,
                    "author_profile_pic": user_legacy.get("profile_image_url_https", ""),
                    "author_followers": user_legacy.get("followers_count", 0),
                    "author_is_verified": user_results.get("is_blue_verified", False),
                    "tweet_url": f"https://x.com/{username}/status/{tweet_id}",
                    "lang": legacy.get("lang", ""),
                    "like_count": legacy.get("favorite_count", 0),
                    "retweet_count": legacy.get("retweet_count", 0),
                    "reply_count": legacy.get("reply_count", 0),
                    "quote_count": legacy.get("quote_count", 0),
                    "bookmark_count": legacy.get("bookmark_count", 0),
                    "is_reply": legacy.get("in_reply_to_status_id_str") is not None,
                    "is_retweet": False,
                    "media_urls": media_urls,
                    "media_types": media_types,
                    "card_url": card_url,
                    "card_title": card_title,
                    "tweeted_at": tweeted_at,
                    "processed": False,
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
    """Upsert tweets into research_tweets."""
    if not tweets:
        return 0

    batch_size = 50
    total = 0
    for i in range(0, len(tweets), batch_size):
        batch = tweets[i:i + batch_size]
        supabase.table("research_tweets").upsert(batch, on_conflict="id").execute()
        total += len(batch)

    return total


async def scrape_account(page, username: str, display_name: str = "") -> list[dict]:
    """Load Twitter profile and intercept GraphQL responses."""
    collected_tweets = []

    async def handle_response(response):
        url = response.url
        if "/graphql/" not in url:
            return
        if "UserTweets" in url or "UserByScreenName" in url or "UserMedia" in url:
            try:
                body = await response.json()
                tweets = extract_tweets_from_timeline(body, fallback_username=username, fallback_display_name=display_name)
                collected_tweets.extend(tweets)
            except Exception:
                pass

    page.on("response", handle_response)

    try:
        url = f"https://x.com/{username}"
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(4000)

        # Scroll to trigger more tweet loading
        for _ in range(3):
            await page.evaluate("window.scrollBy(0, 1000)")
            await page.wait_for_timeout(2000)

    except Exception as e:
        logger.warning(f"  Error loading @{username}: {e}")
    finally:
        page.remove_listener("response", handle_response)

    # Dedup and limit
    unique = []
    seen = set()
    for t in collected_tweets:
        if t["id"] not in seen and len(unique) < MAX_TWEETS_PER_ACCOUNT:
            seen.add(t["id"])
            unique.append(t)

    return unique


async def run():
    logger.info("=== Research Tweet Scraper (Playwright) ===")
    logger.info(f"Time: {datetime.now(timezone.utc).isoformat()}")

    accounts = get_active_accounts()
    logger.info(f"Active accounts: {len(accounts)}")

    if not accounts:
        logger.warning("No active accounts. Done.")
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

        for acc in accounts:
            username = acc["username"]
            category = acc.get("category", "")
            logger.info(f"@{username} (priority {acc['priority']}, {category})...")

            tweets = await scrape_account(page, username, acc.get("display_name", ""))

            if tweets:
                count = upsert_tweets(tweets)
                logger.info(f"  {count} tweets upserted")
                total_collected += count
            else:
                logger.info(f"  0 tweets (empty page or login required)")
                total_skipped += 1

            # Pause between accounts
            await page.wait_for_timeout(3000)

        await browser.close()

    logger.info(f"\nTotal: {total_collected} tweets collected, {total_skipped} accounts skipped")
    logger.info("=== Done ===")


def main():
    asyncio.run(run())


if __name__ == "__main__":
    main()
