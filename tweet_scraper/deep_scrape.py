"""
Deep Scrape — One-time full history extraction for a single account.
Scrolls aggressively to load entire tweet timeline.
"""
from __future__ import annotations
import os
import sys
import asyncio
import logging
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env.local"), override=True)

# Reuse extraction logic from main scraper
from scrape_tweets import extract_tweets_from_timeline, upsert_tweets, STEALTH_JS

import builtins
_orig_print = builtins.print
print = lambda *a, **kw: _orig_print(*a, **{**kw, 'flush': True})

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not all([SUPABASE_URL, SUPABASE_KEY]):
    logger.error("Missing: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

TARGET_USERNAME = sys.argv[1] if len(sys.argv) > 1 else "cryptosolv"
MAX_SCROLLS = int(sys.argv[2]) if len(sys.argv) > 2 else 150
SCROLL_PAUSE = 2500  # ms between scrolls


async def deep_scrape(username: str):
    logger.info(f"=== Deep Scrape: @{username} (max {MAX_SCROLLS} scrolls) ===")

    from playwright.async_api import async_playwright

    all_tweets = {}  # id -> tweet dict (dedup)

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
        )

        context = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            locale="en-US",
        )
        await context.add_init_script(STEALTH_JS)

        page = await context.new_page()
        await page.route("**/*.{png,jpg,jpeg,gif,webp,svg,mp4,woff,woff2,ttf}", lambda route: route.abort())

        async def handle_response(response):
            url = response.url
            if "/graphql/" not in url:
                return
            if "UserTweets" in url or "UserByScreenName" in url or "UserMedia" in url:
                try:
                    body = await response.json()
                    tweets = extract_tweets_from_timeline(body, fallback_username=username)
                    for t in tweets:
                        if t["id"] not in all_tweets:
                            all_tweets[t["id"]] = t
                except Exception:
                    pass

        page.on("response", handle_response)

        try:
            await page.goto(f"https://x.com/{username}", wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(5000)
            logger.info(f"  Page loaded. Tweets so far: {len(all_tweets)}")

            stale_count = 0
            prev_count = 0

            for i in range(MAX_SCROLLS):
                await page.evaluate("window.scrollBy(0, 1200)")
                await page.wait_for_timeout(SCROLL_PAUSE)

                current = len(all_tweets)
                if current > prev_count:
                    stale_count = 0
                    prev_count = current
                else:
                    stale_count += 1

                # Log progress every 10 scrolls
                if (i + 1) % 10 == 0:
                    logger.info(f"  Scroll {i+1}/{MAX_SCROLLS} — {current} tweets collected")

                # If no new tweets for 15 consecutive scrolls, we've hit the bottom
                if stale_count >= 15:
                    logger.info(f"  No new tweets for 15 scrolls — reached end of timeline")
                    break

        except Exception as e:
            logger.warning(f"  Error: {e}")
        finally:
            page.remove_listener("response", handle_response)

        await browser.close()

    logger.info(f"\nTotal unique tweets collected: {len(all_tweets)}")

    # Upsert all
    tweets_list = list(all_tweets.values())
    if tweets_list:
        count = upsert_tweets(tweets_list)
        logger.info(f"Upserted {count} tweets to Supabase")

        # Mark all as unprocessed so analyzer picks them up
        logger.info("All tweets marked processed=false for analyzer pipeline")
    else:
        logger.warning("No tweets collected")

    return len(tweets_list)


def main():
    asyncio.run(deep_scrape(TARGET_USERNAME))


if __name__ == "__main__":
    main()
