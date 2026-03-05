"""PulseX stats indexer — syncs daily DEX data from PulseX subgraph."""

import logging
from datetime import datetime, timezone

from db import supabase
from config import SUBGRAPH_PAGE_SIZE
from utils.subgraph import paginate_subgraph

logger = logging.getLogger(__name__)

PULSEX_SUBGRAPH = "https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsex"

DAY_DATA_FIELDS = """
    id
    date
    dailyVolumeUSD
    totalLiquidityUSD
    totalVolumeUSD
    totalTransactions
"""


def _set_status(status, error=None):
    supabase.table("sync_status").update({
        "status": status,
        "error_message": error,
        "last_synced_at": datetime.now(timezone.utc).isoformat(),
    }).eq("indexer_name", "pulsex_stats").execute()


def run():
    """Sync PulseX daily stats from subgraph."""
    logger.info("Starting PulseX stats sync...")
    _set_status("running")

    try:
        # Get cursor (last synced date as unix timestamp)
        result = supabase.table("sync_status").select("last_cursor").eq(
            "indexer_name", "pulsex_stats"
        ).single().execute()
        cursor = result.data.get("last_cursor") or "0"

        total_synced = 0
        last_date = cursor

        for batch in paginate_subgraph(
            endpoint=PULSEX_SUBGRAPH,
            entity="pulsexDayDatas",
            fields=DAY_DATA_FIELDS,
            where=f'date_gt: {cursor}',
            order_by="date",
            page_size=SUBGRAPH_PAGE_SIZE,
            max_pages=10,
        ):
            rows = []
            for day in batch:
                ts = int(day.get("date", 0))
                date_str = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")

                rows.append({
                    "date": date_str,
                    "daily_volume_usd": float(day.get("dailyVolumeUSD", 0)),
                    "total_liquidity_usd": float(day.get("totalLiquidityUSD", 0)),
                    "total_volume_usd": float(day.get("totalVolumeUSD", 0)),
                    "total_transactions": int(day.get("totalTransactions", 0)),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                })
                last_date = str(ts)

            if rows:
                supabase.table("pulsex_daily_stats").upsert(
                    rows, on_conflict="date"
                ).execute()
                total_synced += len(rows)

        # Update cursor
        supabase.table("sync_status").update({
            "last_cursor": last_date,
            "records_synced": total_synced,
            "last_synced_at": datetime.now(timezone.utc).isoformat(),
            "status": "idle",
            "error_message": None,
        }).eq("indexer_name", "pulsex_stats").execute()

        logger.info(f"PulseX stats: synced {total_synced} days")

    except Exception as e:
        _set_status("error", str(e)[:500])
        logger.warning(f"PulseX stats sync failed: {e}")
