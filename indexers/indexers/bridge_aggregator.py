"""Bridge aggregator — computes daily stats and token stats from bridge_transfers."""

import logging
from datetime import datetime, timezone

from db import supabase

logger = logging.getLogger(__name__)


def _set_status(status, error=None):
    supabase.table("sync_status").update({
        "status": status,
        "error_message": error,
        "last_synced_at": datetime.now(timezone.utc).isoformat(),
    }).eq("indexer_name", "bridge_aggregator").execute()


def _aggregate_daily():
    """Compute bridge_daily_stats from bridge_transfers using Supabase RPC."""
    result = supabase.rpc("get_bridge_daily_stats", {}).execute()

    if hasattr(result, "data") and result.data:
        rows = result.data
        now = datetime.now(timezone.utc).isoformat()
        upsert_rows = []
        for row in rows:
            upsert_rows.append({
                "date": row["date"],
                "deposit_count": row["deposit_count"],
                "withdrawal_count": row["withdrawal_count"],
                "deposit_volume_usd": row["deposit_volume_usd"] or 0,
                "withdrawal_volume_usd": row["withdrawal_volume_usd"] or 0,
                "net_flow_usd": (row["deposit_volume_usd"] or 0) - (row["withdrawal_volume_usd"] or 0),
                "unique_users": row["unique_users"],
                "updated_at": now,
            })
        # Batch upsert (500 at a time)
        for i in range(0, len(upsert_rows), 500):
            supabase.table("bridge_daily_stats").upsert(
                upsert_rows[i:i + 500], on_conflict="date"
            ).execute()
        logger.info(f"Aggregated {len(rows)} daily stats rows")
    else:
        logger.info("No daily stats to aggregate (RPC not yet created, skipping)")


def _aggregate_tokens():
    """Compute bridge_token_stats from bridge_transfers."""
    result = supabase.rpc("get_bridge_token_stats", {}).execute()

    if hasattr(result, "data") and result.data:
        rows = result.data
        now = datetime.now(timezone.utc).isoformat()
        upsert_rows = []
        for row in rows:
            upsert_rows.append({
                "token_address": row["token_address"],
                "token_symbol": row.get("token_symbol"),
                "total_deposit_count": row["deposit_count"],
                "total_withdrawal_count": row["withdrawal_count"],
                "total_deposit_volume_usd": row["deposit_volume_usd"] or 0,
                "total_withdrawal_volume_usd": row["withdrawal_volume_usd"] or 0,
                "net_flow_usd": (row["deposit_volume_usd"] or 0) - (row["withdrawal_volume_usd"] or 0),
                "last_bridge_at": row.get("last_bridge_at"),
                "updated_at": now,
            })
        # Batch upsert (500 at a time)
        for i in range(0, len(upsert_rows), 500):
            supabase.table("bridge_token_stats").upsert(
                upsert_rows[i:i + 500], on_conflict="token_address"
            ).execute()
        logger.info(f"Aggregated {len(rows)} token stats rows")
    else:
        logger.info("No token stats to aggregate (RPC not yet created, skipping)")


def _compute_usd_prices():
    """Compute amount_usd for new transfers using current token prices."""
    result = supabase.rpc("compute_bridge_usd_prices", {}).execute()
    count = result.data if result.data else 0
    if count:
        logger.info(f"Computed USD prices for {count} transfers")


def run():
    """Run all aggregations."""
    logger.info("Starting bridge aggregation...")
    _set_status("running")

    errors = []
    for name, fn in [("usd_prices", _compute_usd_prices), ("daily_stats", _aggregate_daily), ("token_stats", _aggregate_tokens)]:
        try:
            fn()
        except Exception as e:
            logger.warning(f"Bridge aggregation step '{name}' failed: {e}")
            errors.append(f"{name}: {str(e)[:200]}")

    if errors:
        _set_status("error", "; ".join(errors))
    else:
        _set_status("idle")
        logger.info("Bridge aggregation complete")
