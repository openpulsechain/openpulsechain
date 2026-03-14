"""
Single-token scraper — scrapes ALL historical quarters for ONE token.
Usage: SYMBOL=HEX ADDRESS=0x... python3 scrape_single_token.py
"""
from __future__ import annotations
import os, sys, asyncio, logging, json, random
from datetime import datetime, timezone, timedelta, date
from dateutil.relativedelta import relativedelta
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
TWITTER_AUTH_TOKEN = os.getenv("TWITTER_AUTH_TOKEN")
TWITTER_CT0 = os.getenv("TWITTER_CT0")
TOKEN_SYMBOL = os.getenv("SYMBOL", "")
TOKEN_ADDRESS = os.getenv("ADDRESS", "")

if not all([SUPABASE_URL, SUPABASE_KEY, TWITTER_AUTH_TOKEN, TWITTER_CT0, TOKEN_SYMBOL]):
    logger.error("Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TWITTER_AUTH_TOKEN, TWITTER_CT0, SYMBOL")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

STEALTH_JS = """
Object.defineProperty(navigator, 'webdriver', { get: () => false });
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
window.chrome = { runtime: {} };
"""

MAX_SCROLLS = 30
STALE_THRESHOLD = 10
DELAY_BETWEEN = (12, 25)  # seconds between searches
MONTHS_BEFORE_LAUNCH = 4  # Start searching 4 months before token launch

# Token launch date override via env, otherwise PulseChain launch
_start_env = os.getenv("START_DATE", "")
TOKEN_START_DATE = datetime.strptime(_start_env, "%Y-%m-%d").date() if _start_env else date(2023, 5, 10)


def generate_quarters(start_date: date) -> list[tuple[date, date]]:
    """Generate quarterly periods from start_date to now."""
    quarters = []
    now = date.today() + timedelta(days=1)
    # Start N months before token launch
    d = start_date - relativedelta(months=MONTHS_BEFORE_LAUNCH)
    # Align to quarter start
    d = d.replace(day=1, month=((d.month - 1) // 3) * 3 + 1)
    while d < now:
        end = min(d + relativedelta(months=3), now)
        quarters.append((d, end))
        d = end
    return quarters


def get_done_periods() -> set[str]:
    """Get already-done search keys for this token."""
    addr = TOKEN_ADDRESS.lower() if TOKEN_ADDRESS else TOKEN_SYMBOL.lower()
    try:
        r = supabase.table("token_tweet_scrape_progress") \
            .select("search_type, period_start, status") \
            .eq("token_address", addr) \
            .in_("status", ["done", "in_progress"]) \
            .execute()
        return {f"{row['search_type']}_{row['period_start']}" for row in (r.data or [])}
    except:
        return set()


def mark_progress(addr: str, search_type: str, period_start: date, period_end: date, status: str, count: int = 0):
    try:
        supabase.table("token_tweet_scrape_progress").upsert({
            "token_address": addr,
            "token_symbol": TOKEN_SYMBOL,
            "search_type": search_type,
            "period_start": str(period_start),
            "period_end": str(period_end),
            "status": status,
            "tweet_count": count,
            "scraped_at": datetime.now(timezone.utc).isoformat() if status == "done" else None,
        }, on_conflict="token_address,search_type,period_start").execute()
    except Exception as e:
        logger.warning(f"Progress update failed: {e}")


async def deep_search(page, query: str) -> list[dict]:
    """Execute Twitter search and scroll to collect tweets."""
    tweets = []
    seen_ids = set()

    url = f"https://x.com/search?q={query}&src=typed_query&f=live"
    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
    await asyncio.sleep(3)

    prev_count = 0
    stale = 0

    for scroll_n in range(1, MAX_SCROLLS + 1):
        await page.evaluate("window.scrollBy(0, window.innerHeight * 2)")
        await asyncio.sleep(2.5)

        articles = await page.query_selector_all('article[data-testid="tweet"]')
        for article in articles:
            try:
                tweet_data = await extract_tweet(article)
                if tweet_data and tweet_data["id"] not in seen_ids:
                    seen_ids.add(tweet_data["id"])
                    tweets.append(tweet_data)
            except:
                pass

        if scroll_n % 10 == 0:
            logger.info(f"      Scroll {scroll_n}/{MAX_SCROLLS} — {len(tweets)} tweets")

        if len(tweets) == prev_count:
            stale += 1
            if stale >= STALE_THRESHOLD:
                logger.info(f"      End of results after {scroll_n} scrolls")
                break
        else:
            stale = 0
            prev_count = len(tweets)

    return tweets


async def extract_tweet(article) -> dict | None:
    """Extract tweet data from article element."""
    # Get tweet link for ID
    links = await article.query_selector_all('a[href*="/status/"]')
    tweet_id = None
    tweet_url = None
    for link in links:
        href = await link.get_attribute("href")
        if href and "/status/" in href:
            parts = href.split("/status/")
            if len(parts) == 2 and parts[1].isdigit():
                tweet_id = parts[1]
                tweet_url = f"https://x.com{href}"
                break
    if not tweet_id:
        return None

    # Author
    author_link = await article.query_selector('a[href^="/"][role="link"]')
    username = ""
    if author_link:
        href = await author_link.get_attribute("href")
        username = href.strip("/") if href else ""

    name_el = await article.query_selector('div[data-testid="User-Name"] span')
    author_name = await name_el.inner_text() if name_el else username

    # Text
    text_el = await article.query_selector('div[data-testid="tweetText"]')
    text = await text_el.inner_text() if text_el else ""

    # Engagement
    def parse_count(s):
        if not s: return 0
        s = s.replace(",", "").strip()
        if s.endswith("K"): return int(float(s[:-1]) * 1000)
        if s.endswith("M"): return int(float(s[:-1]) * 1000000)
        try: return int(s)
        except: return 0

    like_el = await article.query_selector('[data-testid="like"] span')
    reply_el = await article.query_selector('[data-testid="reply"] span')
    rt_el = await article.query_selector('[data-testid="retweet"] span')

    like_count = parse_count(await like_el.inner_text() if like_el else "0")
    reply_count = parse_count(await reply_el.inner_text() if reply_el else "0")
    retweet_count = parse_count(await rt_el.inner_text() if rt_el else "0")

    # Time
    time_el = await article.query_selector("time")
    tweeted_at = None
    if time_el:
        dt = await time_el.get_attribute("datetime")
        tweeted_at = dt

    # Media (images, videos, GIFs)
    media_urls = []
    media_types = []
    # Photos
    photo_els = await article.query_selector_all('div[data-testid="tweetPhoto"] img')
    for img in photo_els:
        src = await img.get_attribute("src")
        if src and "pbs.twimg.com/media" in src:
            # Get highest quality: append ?format=jpg&name=large
            clean_url = src.split("?")[0] if "?" in src else src
            media_urls.append(f"{clean_url}?format=jpg&name=large")
            media_types.append("photo")
    # Videos / GIFs
    video_els = await article.query_selector_all('video')
    for vid in video_els:
        poster = await vid.get_attribute("poster")
        src = await vid.get_attribute("src")
        if src:
            media_urls.append(src)
            media_types.append("video")
        elif poster:
            media_urls.append(poster)
            media_types.append("video")

    # Verified badge
    verified = False
    badge = await article.query_selector('svg[data-testid="icon-verified"]')
    if badge:
        verified = True

    # Profile pic
    avatar = await article.query_selector('div[data-testid="Tweet-User-Avatar"] img')
    profile_pic = None
    if avatar:
        profile_pic = await avatar.get_attribute("src")

    return {
        "id": tweet_id,
        "token_address": TOKEN_ADDRESS.lower() if TOKEN_ADDRESS else TOKEN_SYMBOL.lower(),
        "token_symbol": TOKEN_SYMBOL,
        "text": text[:2000],
        "author_username": username,
        "author_name": author_name[:200] if author_name else None,
        "author_followers": 0,
        "author_is_verified": verified,
        "author_profile_pic": profile_pic,
        "like_count": like_count,
        "reply_count": reply_count,
        "retweet_count": retweet_count,
        "quote_count": 0,
        "tweet_url": tweet_url,
        "tweeted_at": tweeted_at,
        "media_urls": media_urls if media_urls else None,
        "media_types": media_types if media_types else None,
        "lang": None,
        "processed": False,
        "cluster_processed": False,
    }


def upsert_tweets(tweets: list[dict]) -> int:
    if not tweets:
        return 0
    batch_size = 50
    for i in range(0, len(tweets), batch_size):
        batch = tweets[i:i+batch_size]
        supabase.table("token_tweets").upsert(batch, on_conflict="id").execute()
    return len(tweets)


async def main():
    from playwright.async_api import async_playwright

    logger.info(f"=== Single Token Scraper: ${TOKEN_SYMBOL} ===")
    if TOKEN_ADDRESS:
        logger.info(f"Address: {TOKEN_ADDRESS}")

    quarters = generate_quarters(TOKEN_START_DATE)
    done = get_done_periods()

    # Build search list
    searches = []
    for q_start, q_end in reversed(quarters):  # Most recent first
        key_sym = f"symbol_{q_start}"
        if key_sym not in done:
            searches.append(("symbol", q_start, q_end))
        if TOKEN_ADDRESS:
            key_addr = f"address_{q_start}"
            if key_addr not in done:
                searches.append(("address", q_start, q_end))

    logger.info(f"Pending searches: {len(searches)}")
    if not searches:
        logger.info("All quarters already done!")
        return

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        await context.add_cookies([
            {"name": "auth_token", "value": TWITTER_AUTH_TOKEN, "domain": ".x.com", "path": "/"},
            {"name": "ct0", "value": TWITTER_CT0, "domain": ".x.com", "path": "/"},
        ])
        page = await context.new_page()
        await page.add_init_script(STEALTH_JS)
        logger.info("Twitter session ready")

        total_tweets = 0
        for i, (search_type, q_start, q_end) in enumerate(searches):
            if search_type == "symbol":
                query = f'"{TOKEN_SYMBOL}" pulsechain since:{q_start} until:{q_end}'
            else:
                query = f'{TOKEN_ADDRESS} since:{q_start} until:{q_end}'

            logger.info(f"  [{i+1}/{len(searches)}] {search_type} {q_start} → {q_end}")
            logger.info(f"    Query: {query}")

            addr = TOKEN_ADDRESS.lower() if TOKEN_ADDRESS else TOKEN_SYMBOL.lower()
            mark_progress(addr, search_type, q_start, q_end, "in_progress")

            try:
                tweets = await deep_search(page, query)
                count = upsert_tweets(tweets)
                total_tweets += count
                if count:
                    logger.info(f"    {count} tweets upserted")
                else:
                    logger.info(f"    0 tweets found")
                mark_progress(addr, search_type, q_start, q_end, "done", count)
            except Exception as e:
                logger.error(f"    Search failed: {e}")
                mark_progress(addr, search_type, q_start, q_end, "failed")

            # Delay
            if i < len(searches) - 1:
                delay = random.randint(*DELAY_BETWEEN)
                await asyncio.sleep(delay)

        await browser.close()

    logger.info(f"\n=== ${TOKEN_SYMBOL} DONE: {total_tweets} tweets total ===")


if __name__ == "__main__":
    asyncio.run(main())
