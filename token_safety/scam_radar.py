from __future__ import annotations
"""
Scam Radar — Real-time monitoring for suspicious on-chain events.
Monitors:
1. LP removals (rug pulls)
2. Large mint events
3. Whale dumps (>X% supply sold)
4. Tax changes (if detectable)

Stores alerts in Supabase for frontend display and webhook delivery.
"""

import logging
import time
import json
import requests
from datetime import datetime, timezone
from config import PULSEX_V1_SUBGRAPH, PULSEX_V2_SUBGRAPH, SCAN_API_URL

logger = logging.getLogger(__name__)

# Thresholds
LP_REMOVAL_USD_THRESHOLD = 1000  # Alert if >$1K LP removed
WHALE_DUMP_SUPPLY_PCT = 5  # Alert if >5% supply sold
MINT_EVENT_SUPPLY_PCT = 1  # Alert if mint >1% of supply


def _query_subgraph(url: str, query: str, variables: dict = None) -> dict:
    try:
        resp = requests.post(url, json={"query": query, "variables": variables or {}}, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        return data.get("data", {})
    except Exception as e:
        logger.warning(f"Subgraph query error: {str(e)[:100]}")
        return {}


def check_lp_removals(since_timestamp: int) -> list[dict]:
    """
    Check for significant LP removals across PulseX V1 & V2.
    Returns list of alerts.
    """
    alerts = []

    burns_query = """
    query($timestamp: String!) {
        burns(where: {timestamp_gt: $timestamp}, orderBy: amountUSD, orderDirection: desc, first: 50) {
            id
            timestamp
            pair {
                id
                token0 { id symbol name }
                token1 { id symbol name }
                reserveUSD
            }
            amount0
            amount1
            amountUSD
            sender
            to
        }
    }
    """

    for dex_name, url in [("PulseX_V2", PULSEX_V2_SUBGRAPH), ("PulseX_V1", PULSEX_V1_SUBGRAPH)]:
        data = _query_subgraph(url, burns_query, {"timestamp": str(since_timestamp)})
        for burn in data.get("burns", []):
            amount_usd = float(burn.get("amountUSD", 0) or 0)

            # Filter inflated values (PulseX subgraph quirk)
            if amount_usd > 1_000_000_000:
                continue

            if amount_usd >= LP_REMOVAL_USD_THRESHOLD:
                pair = burn.get("pair", {})
                token0 = pair.get("token0", {})
                token1 = pair.get("token1", {})

                alerts.append({
                    "type": "lp_removal",
                    "severity": "high" if amount_usd > 10000 else "medium",
                    "dex": dex_name,
                    "pair_address": pair.get("id", ""),
                    "token0_symbol": token0.get("symbol", "?"),
                    "token0_address": token0.get("id", ""),
                    "token1_symbol": token1.get("symbol", "?"),
                    "token1_address": token1.get("id", ""),
                    "amount_usd": round(amount_usd, 2),
                    "sender": burn.get("sender", ""),
                    "timestamp": int(burn.get("timestamp", 0)),
                    "tx_id": burn.get("id", ""),
                })

    return alerts


def check_large_transfers(token_address: str, total_supply: float, since_block: int = 0) -> list[dict]:
    """
    Check for large transfers (whale dumps) via Scan API.
    Returns list of alerts.
    """
    alerts = []
    addr = token_address.lower()

    try:
        # Get recent transfers
        resp = requests.get(
            f"{SCAN_API_URL}/api/v2/tokens/{addr}/transfers",
            params={"limit": 50},
            timeout=15
        )
        if resp.status_code != 200:
            return alerts

        data = resp.json()
        for tx in data.get("items", []):
            # Check transfer value
            value_str = tx.get("total", {}).get("value", "0")
            decimals = int(tx.get("total", {}).get("decimals", "18") or "18")
            value = int(value_str) / (10 ** decimals) if value_str else 0

            if total_supply > 0:
                pct_of_supply = (value / total_supply) * 100
                if pct_of_supply >= WHALE_DUMP_SUPPLY_PCT:
                    alerts.append({
                        "type": "whale_dump",
                        "severity": "high" if pct_of_supply > 10 else "medium",
                        "token_address": addr,
                        "from": tx.get("from", {}).get("hash", ""),
                        "to": tx.get("to", {}).get("hash", ""),
                        "value": value,
                        "pct_of_supply": round(pct_of_supply, 2),
                        "timestamp": tx.get("timestamp", ""),
                        "tx_hash": tx.get("tx_hash", ""),
                    })

    except Exception as e:
        logger.warning(f"Transfer check error for {addr}: {str(e)[:100]}")

    return alerts


def run_scan(since_minutes: int = 30) -> list[dict]:
    """
    Run a full scam radar scan.
    Returns all alerts found.
    """
    since_ts = int(time.time()) - (since_minutes * 60)
    all_alerts = []

    # 1. Check LP removals
    logger.info(f"Checking LP removals since {since_minutes}m ago...")
    lp_alerts = check_lp_removals(since_ts)
    all_alerts.extend(lp_alerts)
    logger.info(f"  Found {len(lp_alerts)} LP removal alerts")

    # 2. Check whale dumps on tokens with recent LP alerts
    token_addresses_seen = set()
    for alert in lp_alerts:
        for addr_key in ("token0_address", "token1_address"):
            addr = alert.get(addr_key, "")
            if addr and addr not in token_addresses_seen:
                token_addresses_seen.add(addr)

    for addr in list(token_addresses_seen)[:20]:
        try:
            # Get total supply from Scan API
            resp = requests.get(f"{SCAN_API_URL}/api/v2/tokens/{addr}", timeout=10)
            if resp.status_code != 200:
                continue
            token_data = resp.json()
            total_supply_str = token_data.get("total_supply", "0")
            decimals = int(token_data.get("decimals", "18") or "18")
            total_supply = int(total_supply_str) / (10 ** decimals) if total_supply_str else 0

            if total_supply > 0:
                logger.info(f"  Checking whale dumps for {addr[:10]}...")
                dump_alerts = check_large_transfers(addr, total_supply)
                all_alerts.extend(dump_alerts)
                if dump_alerts:
                    logger.info(f"    Found {len(dump_alerts)} whale dump alerts")

            time.sleep(0.5)  # Rate limit
        except Exception as e:
            logger.warning(f"  Whale dump check error for {addr[:10]}: {str(e)[:80]}")

    return all_alerts


def save_alerts(alerts: list[dict], supabase_client) -> int:
    """Save alerts to Supabase."""
    saved = 0
    for alert in alerts:
        try:
            row = {
                "alert_type": alert["type"],
                "severity": alert["severity"],
                "data": json.dumps(alert),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            # Add token-specific fields
            if alert.get("token0_address"):
                row["token_address"] = alert["token0_address"]
            elif alert.get("token_address"):
                row["token_address"] = alert["token_address"]

            if alert.get("pair_address"):
                row["pair_address"] = alert["pair_address"]

            supabase_client.table("scam_radar_alerts").upsert(
                row, on_conflict="alert_type,data->>'tx_id'"
            ).execute()
            saved += 1
        except Exception as e:
            # Use insert as fallback (upsert might fail on jsonb conflict)
            try:
                supabase_client.table("scam_radar_alerts").insert(row).execute()
                saved += 1
            except Exception as e2:
                logger.warning(f"Failed to save alert: {str(e2)[:100]}")

    return saved
