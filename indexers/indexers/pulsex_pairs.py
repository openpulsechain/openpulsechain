"""PulseX top pairs indexer — fetches top 50 pairs by volume from PulseX subgraph."""

import logging
from datetime import datetime, timezone

from db import supabase
from utils.subgraph import query_subgraph

logger = logging.getLogger(__name__)

PULSEX_SUBGRAPH = "https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsex"

PAIRS_QUERY = """
{
  pairs(first: 50, orderBy: volumeUSD, orderDirection: desc) {
    id
    token0 { symbol name }
    token1 { symbol name }
    volumeUSD
    reserveUSD
    totalTransactions
  }
}
"""


def run():
    logger.info("Fetching PulseX top pairs...")

    supabase.table("sync_status").update({
        "status": "running",
    }).eq("indexer_name", "pulsex_pairs").execute()

    try:
        data = query_subgraph(PULSEX_SUBGRAPH, PAIRS_QUERY)
        pairs = data.get("pairs", [])

        if not pairs:
            logger.warning("No pairs returned from subgraph")
            return

        now = datetime.now(timezone.utc).isoformat()
        rows = []
        for p in pairs:
            rows.append({
                "pair_address": p["id"],
                "token0_symbol": p["token0"]["symbol"],
                "token0_name": p["token0"]["name"],
                "token1_symbol": p["token1"]["symbol"],
                "token1_name": p["token1"]["name"],
                "volume_usd": float(p["volumeUSD"]),
                "reserve_usd": float(p["reserveUSD"]),
                "total_transactions": int(p["totalTransactions"]),
                "updated_at": now,
            })

        supabase.table("pulsex_top_pairs").upsert(rows, on_conflict="pair_address").execute()

        supabase.table("sync_status").update({
            "status": "idle",
            "last_synced_at": now,
            "records_synced": len(rows),
            "error_message": None,
        }).eq("indexer_name", "pulsex_pairs").execute()

        logger.info(f"Updated {len(rows)} top pairs")

    except Exception as e:
        supabase.table("sync_status").update({
            "status": "error",
            "error_message": str(e)[:500],
        }).eq("indexer_name", "pulsex_pairs").execute()
        raise
