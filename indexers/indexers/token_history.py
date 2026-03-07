"""Token price history indexer — backfills and updates daily OHLCV from PulseX subgraph.

For each token in pulsechain_tokens, fetches tokenDayDatas from the subgraph
and stores price_usd, daily_volume_usd, total_liquidity_usd per day.
100% sovereign — zero dependency on GeckoTerminal/CoinGecko.
"""

import logging
import time
from datetime import datetime, timezone

import requests

from db import supabase

logger = logging.getLogger(__name__)

PULSEX_SUBGRAPH = "https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsex"

# Max pages per token per run (avoid Railway timeout)
MAX_PAGES_PER_TOKEN = 5
PAGE_SIZE = 1000

# Max runtime per cron run (5 minutes to stay safe within 15-min cron)
MAX_RUNTIME_SECONDS = 5 * 60

# Max tokens per cron run (incremental updates only — bulk done locally)
MAX_TOKENS_PER_RUN = 50


def _query_subgraph(query: str) -> dict:
    """Execute a GraphQL query against PulseX subgraph."""
    resp = requests.post(
        PULSEX_SUBGRAPH,
        json={"query": query},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    if "errors" in data:
        raise ValueError(f"Subgraph error: {data['errors']}")
    return data["data"]


def _get_last_date(address: str) -> str:
    """Get last synced date for a token, or genesis date."""
    res = supabase.table("token_price_history") \
        .select("date") \
        .eq("address", address) \
        .order("date", desc=True) \
        .limit(1) \
        .execute()
    if res.data:
        return res.data[0]["date"]
    return "2023-05-01"


def _timestamp_from_date(date_str: str) -> int:
    """Convert YYYY-MM-DD to unix timestamp."""
    dt = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def _fetch_token_day_datas(address: str, since_timestamp: int) -> list[dict]:
    """Fetch all tokenDayDatas for a token since a given timestamp."""
    all_data = []
    last_date = since_timestamp

    for _ in range(MAX_PAGES_PER_TOKEN):
        query = f"""{{
            tokenDayDatas(
                first: {PAGE_SIZE},
                where: {{token: "{address}", date_gt: {last_date}}},
                orderBy: date,
                orderDirection: asc
            ) {{
                date
                priceUSD
                dailyVolumeUSD
                totalLiquidityUSD
            }}
        }}"""

        data = _query_subgraph(query)
        day_datas = data.get("tokenDayDatas", [])
        if not day_datas:
            break

        all_data.extend(day_datas)
        last_date = day_datas[-1]["date"]

        if len(day_datas) < PAGE_SIZE:
            break

        time.sleep(0.3)

    return all_data


def run():
    logger.info("Syncing token price history from PulseX subgraph...")

    supabase.table("sync_status").upsert({
        "indexer_name": "token_history",
        "status": "running",
    }, on_conflict="indexer_name").execute()

    try:
        # Get top tokens by volume (limit to avoid Railway timeout)
        tokens_res = supabase.table("pulsechain_tokens") \
            .select("address,symbol") \
            .eq("is_active", True) \
            .order("total_volume_usd", desc=True) \
            .limit(MAX_TOKENS_PER_RUN) \
            .execute()

        tokens = tokens_res.data
        if not tokens:
            logger.warning("No tokens in pulsechain_tokens — run token_discovery first")
            return

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        total_synced = 0
        tokens_processed = 0
        run_start = time.time()

        for token in tokens:
            # Check runtime limit
            elapsed = time.time() - run_start
            if elapsed > MAX_RUNTIME_SECONDS:
                logger.info(f"Runtime limit reached ({elapsed:.0f}s). Will continue next run.")
                break

            address = token["address"]
            symbol = token["symbol"]

            last_date = _get_last_date(address)
            since_ts = _timestamp_from_date(last_date)

            day_datas = _fetch_token_day_datas(address, since_ts)
            tokens_processed += 1

            if not day_datas:
                continue

            rows = []
            for dd in day_datas:
                ts = int(dd["date"])
                date_str = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")

                # Skip future dates
                if date_str > today:
                    continue

                price = float(dd.get("priceUSD", 0))
                if price <= 0:
                    continue

                rows.append({
                    "address": address,
                    "date": date_str,
                    "price_usd": price,
                    "daily_volume_usd": float(dd.get("dailyVolumeUSD", 0)),
                    "total_liquidity_usd": float(dd.get("totalLiquidityUSD", 0)),
                    "source": "pulsex_subgraph",
                })

            if rows:
                for i in range(0, len(rows), 500):
                    supabase.table("token_price_history").upsert(
                        rows[i:i + 500], on_conflict="address,date"
                    ).execute()
                total_synced += len(rows)
                logger.info(f"  {symbol}: {len(rows)} days synced")

            time.sleep(0.2)  # Rate limit subgraph

        supabase.table("sync_status").upsert({
            "indexer_name": "token_history",
            "status": "idle",
            "last_synced_at": datetime.now(timezone.utc).isoformat(),
            "records_synced": total_synced,
            "error_message": None,
        }, on_conflict="indexer_name").execute()

        logger.info(f"Total: {total_synced} price records synced for {tokens_processed}/{len(tokens)} tokens")

    except Exception as e:
        supabase.table("sync_status").upsert({
            "indexer_name": "token_history",
            "status": "error",
            "error_message": str(e)[:500],
        }, on_conflict="indexer_name").execute()
        raise
