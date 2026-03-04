"""Token prices indexer — fetches prices from CoinGecko."""

import logging
from datetime import datetime, timezone

import requests

from db import supabase
from config import COINGECKO_BASE, COINGECKO_API_KEY, TRACKED_TOKENS
from utils.retry import with_retry

logger = logging.getLogger(__name__)


def run():
    logger.info("Fetching token prices from CoinGecko...")

    supabase.table("sync_status").update({
        "status": "running",
    }).eq("indexer_name", "token_prices").execute()

    try:
        ids = ",".join(TRACKED_TOKENS.keys())
        params = {
            "ids": ids,
            "vs_currencies": "usd",
            "include_market_cap": "true",
            "include_24hr_vol": "true",
            "include_24hr_change": "true",
        }
        headers = {}
        if COINGECKO_API_KEY:
            headers["x-cg-demo-api-key"] = COINGECKO_API_KEY

        resp = with_retry(
            lambda: requests.get(f"{COINGECKO_BASE}/simple/price", params=params, headers=headers, timeout=30)
        )
        data = resp.json()

        rows = []
        for cg_id, info in TRACKED_TOKENS.items():
            price_data = data.get(cg_id, {})
            if not price_data:
                continue

            rows.append({
                "id": cg_id,
                "symbol": info["symbol"],
                "name": info["name"],
                "price_usd": price_data.get("usd"),
                "market_cap_usd": price_data.get("usd_market_cap"),
                "volume_24h_usd": price_data.get("usd_24h_vol"),
                "price_change_24h_pct": price_data.get("usd_24h_change"),
                "last_updated": datetime.now(timezone.utc).isoformat(),
            })

        if rows:
            supabase.table("token_prices").upsert(rows, on_conflict="id").execute()

        supabase.table("sync_status").update({
            "status": "idle",
            "last_synced_at": datetime.now(timezone.utc).isoformat(),
            "records_synced": len(rows),
            "error_message": None,
        }).eq("indexer_name", "token_prices").execute()

        logger.info(f"Updated prices for {len(rows)} tokens")

    except Exception as e:
        supabase.table("sync_status").update({
            "status": "error",
            "error_message": str(e)[:500],
        }).eq("indexer_name", "token_prices").execute()
        raise
