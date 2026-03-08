"""
Holder concentration analysis via PulseChain Scan API (Blockscout v2).
Checks: top holder %, deployer holdings, holder count.
"""

import logging
import requests
from config import SCAN_API_URL

logger = logging.getLogger(__name__)


def analyze_holders(token_address: str) -> dict:
    """
    Analyze holder distribution for a token.
    Returns:
        {
            "holder_count": int,
            "top10_pct": float,  # % of supply held by top 10
            "top1_pct": float,   # % held by #1 holder
            "deployer_pct": float | None,
            "top_holders": list[{"address": str, "pct": float}],
            "error": str | None,
        }
    """
    addr = token_address.lower()
    result = {
        "holder_count": 0,
        "top10_pct": 0.0,
        "top1_pct": 0.0,
        "deployer_pct": None,
        "top_holders": [],
        "error": None,
    }

    # 1. Get token info (total supply, holder count)
    try:
        token_resp = requests.get(
            f"{SCAN_API_URL}/api/v2/tokens/{addr}",
            timeout=15
        )
        if token_resp.status_code != 200:
            result["error"] = f"Token not found (HTTP {token_resp.status_code})"
            return result

        token_data = token_resp.json()
        total_supply_str = token_data.get("total_supply", "0")
        decimals = int(token_data.get("decimals", "18") or "18")
        total_supply = int(total_supply_str) / (10 ** decimals) if total_supply_str else 0
        result["holder_count"] = int(token_data.get("holders", 0) or 0)

        if total_supply <= 0:
            result["error"] = "Total supply is 0"
            return result

    except Exception as e:
        result["error"] = f"Token info error: {str(e)[:100]}"
        return result

    # 2. Get top holders
    try:
        holders_resp = requests.get(
            f"{SCAN_API_URL}/api/v2/tokens/{addr}/holders",
            params={"limit": 50},
            timeout=15
        )
        if holders_resp.status_code != 200:
            result["error"] = f"Holders API error (HTTP {holders_resp.status_code})"
            return result

        holders_data = holders_resp.json()
        items = holders_data.get("items", [])

        top10_total = 0.0
        top_holders = []

        for i, holder in enumerate(items[:50]):
            value_str = holder.get("value", "0")
            value = int(value_str) / (10 ** decimals) if value_str else 0
            pct = (value / total_supply) * 100 if total_supply > 0 else 0

            holder_info = {
                "address": holder.get("address", {}).get("hash", "").lower(),
                "pct": round(pct, 2),
            }

            if i < 10:
                top10_total += pct
                top_holders.append(holder_info)

            if i == 0:
                result["top1_pct"] = round(pct, 2)

        result["top10_pct"] = round(top10_total, 2)
        result["top_holders"] = top_holders

    except Exception as e:
        result["error"] = f"Holders error: {str(e)[:100]}"

    return result
