"""
Token Tweet Scraper — Deep historical + incremental Twitter/X scraper.
Uses Playwright + SearchTimeline GraphQL interception with authenticated session.

Strategy:
  - Break each token's history into quarterly periods
  - Start from (token_creation_date - 6 months) up to now
  - Search by symbol AND by address for each period
  - Deep scroll each period until exhausted
  - Track progress in token_tweet_scrape_progress table
  - Anti-detection: random delays, limited searches per run

Cron Railway: 0 */6 * * * (every 6 hours)
"""
from __future__ import annotations
import os
import sys
import asyncio
import logging
import json
import random
from datetime import datetime, timezone, timedelta, date
from dateutil.relativedelta import relativedelta
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
TWITTER_AUTH_TOKEN = os.getenv("TWITTER_AUTH_TOKEN")
TWITTER_CT0 = os.getenv("TWITTER_CT0")

if not all([SUPABASE_URL, SUPABASE_KEY]):
    logger.error("Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY")
    sys.exit(1)

if not all([TWITTER_AUTH_TOKEN, TWITTER_CT0]):
    logger.error("Missing env vars: TWITTER_AUTH_TOKEN, TWITTER_CT0 (required for search)")
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

# ─── Configuration ───────────────────────────────────────────────────────────

MAX_SCROLLS_PER_SEARCH = 30       # Deep scroll per quarterly search
SCROLL_PAUSE_MS = 2500            # ms between scrolls
STALE_THRESHOLD = 10              # Stop after N scrolls without new tweets
DELAY_BETWEEN_SEARCHES = (15, 30) # Random delay range (seconds) between searches
DELAY_BETWEEN_TOKENS = (30, 60)   # Random delay range between tokens
MAX_SEARCHES_PER_RUN = int(os.getenv("MAX_SEARCHES", "20"))  # Override via env for full backfill
MONTHS_BEFORE_CREATION = 6        # Start searching 6 months before token creation


# ─── Token info ──────────────────────────────────────────────────────────────

def get_tokens_with_age() -> list[dict]:
    """Fetch tokens with their creation age from token_safety_scores."""
    try:
        result = supabase.table("token_safety_scores") \
            .select("token_address, age_days, analyzed_at, total_liquidity_usd") \
            .order("total_liquidity_usd", desc=True) \
            .limit(50) \
            .execute()

        tokens = []
        for row in (result.data or []):
            addr = row["token_address"]
            age_days = row.get("age_days") or 0
            analyzed_at = row.get("analyzed_at")

            # Calculate creation date
            if analyzed_at and age_days:
                # Handle various ISO formats (with/without microseconds, Z suffix)
                clean = analyzed_at.replace("Z", "+00:00")
                try:
                    analysis_date = datetime.fromisoformat(clean)
                except ValueError:
                    # Fallback: parse without timezone
                    analysis_date = datetime.strptime(clean[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
                creation_date = (analysis_date - timedelta(days=age_days)).date()
            else:
                # Fallback: PulseChain launch (May 2023)
                creation_date = date(2023, 5, 10)

            tokens.append({
                "address": addr,
                "creation_date": creation_date,
                "liquidity": row.get("total_liquidity_usd") or 0,
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


def get_intel_accounts() -> set[str]:
    """Get usernames from research_followed_accounts (INTEL section)."""
    try:
        result = supabase.table("research_followed_accounts") \
            .select("username") \
            .eq("is_active", True) \
            .execute()
        return {r["username"].lower() for r in (result.data or [])}
    except Exception:
        return set()


# ─── Quarterly period generation ─────────────────────────────────────────────

def generate_quarters(creation_date: date) -> list[tuple[date, date]]:
    """Generate quarterly periods from (creation - 6 months) to today."""
    start = creation_date - relativedelta(months=MONTHS_BEFORE_CREATION)
    # Align to quarter start (Jan, Apr, Jul, Oct)
    quarter_month = ((start.month - 1) // 3) * 3 + 1
    start = start.replace(month=quarter_month, day=1)

    today = date.today()
    quarters = []

    current = start
    while current < today:
        end = current + relativedelta(months=3)
        if end > today:
            end = today + timedelta(days=1)  # Include today
        quarters.append((current, end))
        current = end

    return quarters


# ─── Progress tracking ──────────────────────────────────────────────────────

def get_pending_searches(token_address: str, token_symbol: str | None, creation_date: date) -> list[dict]:
    """Get list of quarterly searches not yet completed for a token."""
    quarters = generate_quarters(creation_date)

    # Check what's already done
    try:
        result = supabase.table("token_tweet_scrape_progress") \
            .select("search_type, period_start, status") \
            .eq("token_address", token_address.lower()) \
            .in_("status", ["done", "in_progress"]) \
            .execute()
        done = {(r["search_type"], r["period_start"]) for r in (result.data or [])}
    except Exception:
        done = set()

    pending = []
    for q_start, q_end in quarters:
        start_str = q_start.isoformat()

        # Symbol search
        if token_symbol and ("symbol", start_str) not in done:
            pending.append({
                "token_address": token_address,
                "token_symbol": token_symbol,
                "search_type": "symbol",
                "period_start": q_start,
                "period_end": q_end,
                "query": f'"{token_symbol}" pulsechain since:{q_start.isoformat()} until:{q_end.isoformat()}',
            })

        # Address search
        if ("address", start_str) not in done:
            pending.append({
                "token_address": token_address,
                "token_symbol": token_symbol,
                "search_type": "address",
                "period_start": q_start,
                "period_end": q_end,
                "query": f'{token_address} since:{q_start.isoformat()} until:{q_end.isoformat()}',
            })

    return pending


def mark_progress(token_address: str, search_type: str, period_start: date, period_end: date,
                  status: str, tweet_count: int = 0, token_symbol: str | None = None):
    """Update scrape progress in database."""
    try:
        supabase.table("token_tweet_scrape_progress").upsert({
            "token_address": token_address.lower(),
            "token_symbol": token_symbol,
            "search_type": search_type,
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "status": status,
            "tweet_count": tweet_count,
            "scraped_at": datetime.now(timezone.utc).isoformat() if status == "done" else None,
        }, on_conflict="token_address,search_type,period_start").execute()
    except Exception as e:
        logger.warning(f"Failed to update progress: {e}")


# ─── Tweet extraction ────────────────────────────────────────────────────────

def extract_tweets_from_search(data: dict, token_address: str, token_symbol: str | None) -> list[dict]:
    """Extract tweets from GraphQL SearchTimeline response."""
    tweets = []

    def _extract_user(obj: dict) -> tuple[dict, dict]:
        core = obj.get("core", {})
        for path_fn in [
            lambda: (core.get("user_results", {}).get("result", {}).get("legacy", {}),
                     core.get("user_results", {}).get("result", {})),
            lambda: (core.get("user_results", {}).get("result", {}),
                     core.get("user_results", {}).get("result", {})),
            lambda: (core.get("user_result", {}).get("result", {}).get("legacy", {}),
                     core.get("user_result", {}).get("result", {})),
            lambda: (obj.get("author", {}).get("legacy", {}), obj.get("author", {})),
            lambda: (obj.get("author", {}), obj.get("author", {})),
        ]:
            ul, ur = path_fn()
            if ul.get("screen_name"):
                return ul, ur
        return {}, {}

    def walk(obj):
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


# ─── Deep search with scroll ────────────────────────────────────────────────

async def deep_search(page, query: str, token_address: str, token_symbol: str | None) -> list[dict]:
    """Execute a Twitter search with deep scrolling until exhausted."""
    collected = {}  # id -> tweet dict (dedup across scrolls)

    async def handle_response(response):
        url = response.url
        if "/graphql/" not in url:
            return
        if "SearchTimeline" in url or "SearchAdaptive" in url:
            try:
                body = await response.json()
                tweets = extract_tweets_from_search(body, token_address, token_symbol)
                for t in tweets:
                    if t["id"] not in collected:
                        collected[t["id"]] = t
            except Exception:
                pass

    page.on("response", handle_response)

    try:
        encoded_query = query.replace('"', '%22').replace(' ', '%20')
        search_url = f"https://x.com/search?q={encoded_query}&src=typed_query&f=live"

        await page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(4000)

        stale_count = 0
        prev_count = 0

        for i in range(MAX_SCROLLS_PER_SEARCH):
            await page.evaluate("window.scrollBy(0, 1200)")
            await page.wait_for_timeout(SCROLL_PAUSE_MS)

            current = len(collected)
            if current > prev_count:
                stale_count = 0
                prev_count = current
            else:
                stale_count += 1

            if (i + 1) % 10 == 0:
                logger.info(f"      Scroll {i+1}/{MAX_SCROLLS_PER_SEARCH} — {current} tweets")

            if stale_count >= STALE_THRESHOLD:
                logger.info(f"      End of results after {i+1} scrolls")
                break

    except Exception as e:
        logger.warning(f"      Search error: {e}")
    finally:
        page.remove_listener("response", handle_response)

    return list(collected.values())


# ─── Top voices aggregation ─────────────────────────────────────────────────

def update_top_voices(token_address: str, token_symbol: str | None, intel_accounts: set[str]):
    """Aggregate author stats from token_tweets into token_top_voices."""
    try:
        # Get all tweets for this token
        result = supabase.table("token_tweets") \
            .select("author_username, author_name, author_followers, author_is_verified, like_count, retweet_count, quote_count, tweeted_at") \
            .eq("token_address", token_address.lower()) \
            .execute()

        if not result.data:
            return

        # Aggregate by author
        authors: dict[str, dict] = {}
        for t in result.data:
            username = t["author_username"]
            if username not in authors:
                authors[username] = {
                    "author_username": username,
                    "author_name": t.get("author_name", ""),
                    "author_followers": t.get("author_followers", 0),
                    "author_is_verified": t.get("author_is_verified", False),
                    "tweet_count": 0,
                    "total_engagement": 0,
                    "first_mention": t.get("tweeted_at"),
                    "last_mention": t.get("tweeted_at"),
                }

            a = authors[username]
            a["tweet_count"] += 1
            a["total_engagement"] += (
                (t.get("like_count") or 0)
                + (t.get("retweet_count") or 0) * 2
                + (t.get("quote_count") or 0) * 3
            )
            # Update followers to latest
            if (t.get("author_followers") or 0) > (a["author_followers"] or 0):
                a["author_followers"] = t["author_followers"]

            tweeted = t.get("tweeted_at")
            if tweeted:
                if not a["first_mention"] or tweeted < a["first_mention"]:
                    a["first_mention"] = tweeted
                if not a["last_mention"] or tweeted > a["last_mention"]:
                    a["last_mention"] = tweeted

        # Upsert top voices (only authors with 2+ tweets)
        voices = []
        for username, data in authors.items():
            if data["tweet_count"] >= 2:
                voices.append({
                    "token_address": token_address.lower(),
                    "token_symbol": token_symbol,
                    "author_username": username,
                    "author_name": data["author_name"],
                    "author_followers": data["author_followers"],
                    "author_is_verified": data["author_is_verified"],
                    "tweet_count": data["tweet_count"],
                    "total_engagement": data["total_engagement"],
                    "is_intel_account": username.lower() in intel_accounts,
                    "first_mention": data["first_mention"],
                    "last_mention": data["last_mention"],
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                })

        if voices:
            for v in voices:
                supabase.table("token_top_voices").upsert(
                    v, on_conflict="token_address,author_username"
                ).execute()
            logger.info(f"    Top voices: {len(voices)} authors tracked")

    except Exception as e:
        logger.warning(f"    Top voices update failed: {e}")


# ─── Main ────────────────────────────────────────────────────────────────────

async def run():
    logger.info("=== Token Tweet Scraper (Quarterly Deep Search) ===")
    logger.info(f"Time: {datetime.now(timezone.utc).isoformat()}")

    # Get tokens with creation dates
    tokens = get_tokens_with_age()
    if not tokens:
        logger.warning("No tokens found. Done.")
        return

    # Get symbol mapping
    symbol_map = get_token_symbols()
    for t in tokens:
        t["symbol"] = symbol_map.get(t["address"].lower())

    # Get INTEL accounts for top voices cross-reference
    intel_accounts = get_intel_accounts()
    logger.info(f"INTEL accounts: {len(intel_accounts)}")

    # Build priority queue of pending searches across all tokens
    all_pending = []
    for t in tokens:
        if not t["symbol"]:
            continue
        pending = get_pending_searches(t["address"], t["symbol"], t["creation_date"])
        for p in pending:
            p["liquidity"] = t["liquidity"]
        all_pending.extend(pending)

    # Sort: highest liquidity tokens first, then chronologically (newest quarters first)
    all_pending.sort(key=lambda x: (-x["liquidity"], -x["period_start"].toordinal()))

    total_pending = len(all_pending)
    searches_this_run = min(total_pending, MAX_SEARCHES_PER_RUN)
    logger.info(f"Total pending searches: {total_pending}, this run: {searches_this_run}")

    if searches_this_run == 0:
        logger.info("All historical quarters already scraped. Running incremental update...")
        # TODO: incremental mode for recent tweets
        return

    from playwright.async_api import async_playwright

    total_tweets = 0
    searches_done = 0

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

        # Inject Twitter session cookies
        await context.add_cookies([
            {"name": "auth_token", "value": TWITTER_AUTH_TOKEN, "domain": ".x.com", "path": "/"},
            {"name": "ct0", "value": TWITTER_CT0, "domain": ".x.com", "path": "/"},
        ])
        logger.info("Twitter session cookies injected")

        await context.add_init_script(STEALTH_JS)
        page = await context.new_page()
        await page.route("**/*.{png,jpg,jpeg,gif,webp,svg,mp4,woff,woff2,ttf}", lambda route: route.abort())

        current_token = None

        for search in all_pending[:searches_this_run]:
            token_addr = search["token_address"]
            symbol = search["token_symbol"]
            search_type = search["search_type"]
            q = search["query"]
            p_start = search["period_start"]
            p_end = search["period_end"]

            # Token change → update top voices for previous token + delay
            if current_token and current_token != token_addr:
                update_top_voices(current_token, symbol_map.get(current_token), intel_accounts)
                delay = random.randint(*DELAY_BETWEEN_TOKENS)
                logger.info(f"  Token change — waiting {delay}s...")
                await page.wait_for_timeout(delay * 1000)

            current_token = token_addr

            logger.info(f"  ${symbol} [{search_type}] {p_start} → {p_end}")
            logger.info(f"    Query: {q}")

            # Mark in_progress
            mark_progress(token_addr, search_type, p_start, p_end, "in_progress", token_symbol=symbol)

            try:
                tweets = await deep_search(page, q, token_addr, symbol)

                if tweets:
                    count = upsert_tweets(tweets)
                    logger.info(f"    {count} tweets upserted")
                    total_tweets += count
                else:
                    logger.info(f"    0 tweets found")

                mark_progress(token_addr, search_type, p_start, p_end, "done",
                             tweet_count=len(tweets), token_symbol=symbol)

            except Exception as e:
                logger.error(f"    Search failed: {e}")
                mark_progress(token_addr, search_type, p_start, p_end, "failed", token_symbol=symbol)

            searches_done += 1

            # Anti-detection delay between searches
            if searches_done < searches_this_run:
                delay = random.randint(*DELAY_BETWEEN_SEARCHES)
                logger.info(f"    Waiting {delay}s before next search...")
                await page.wait_for_timeout(delay * 1000)

        # Final top voices update for last token
        if current_token:
            update_top_voices(current_token, symbol_map.get(current_token), intel_accounts)

        await browser.close()

    remaining = total_pending - searches_done
    logger.info(f"\nTotal: {total_tweets} tweets, {searches_done} searches done, {remaining} remaining")
    if remaining > 0:
        logger.info(f"Next cron run will process {min(remaining, MAX_SEARCHES_PER_RUN)} more searches")
    logger.info("=== Done ===")


def main():
    asyncio.run(run())


if __name__ == "__main__":
    main()
