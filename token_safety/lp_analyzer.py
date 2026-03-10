"""
LP (Liquidity Pool) analysis via PulseX Subgraph.
Checks: LP exists, reserve size, deployer LP holdings, pair age.

IMPORTANT: PulseX subgraph reserveUSD is unreliable for spam/dust pairs.
We sort by totalTransactions (not reserveUSD), filter low-txn pairs,
and cross-validate using derivedUSD * reserves.
"""

import logging
import time
import requests
from config import PULSEX_V1_SUBGRAPH, PULSEX_V2_SUBGRAPH

logger = logging.getLogger(__name__)

# Minimum transactions to consider a pair legitimate
MIN_TXNS = 50
# Minimum liquidity per side to count as real (not dust)
MIN_SIDE_USD = 100.0
# Maximum realistic liquidity per pair (safety cap)
MAX_PAIR_USD = 100_000_000  # $100M


def _query_subgraph(url: str, query: str, variables: dict = None) -> dict:
    """Execute a GraphQL query against PulseX subgraph."""
    try:
        resp = requests.post(
            url,
            json={"query": query, "variables": variables or {}},
            timeout=15
        )
        resp.raise_for_status()
        data = resp.json()
        if "errors" in data:
            logger.warning(f"Subgraph errors: {data['errors']}")
        return data.get("data", {})
    except Exception as e:
        logger.warning(f"Subgraph query error: {str(e)[:100]}")
        return {}


def _calc_pair_liquidity(pair: dict) -> float:
    """
    Calculate pair liquidity using derivedUSD × reserves.
    Filters out dust/spam pairs where one side has near-zero real value.
    """
    try:
        r0 = float(pair.get("reserve0", 0) or 0)
        r1 = float(pair.get("reserve1", 0) or 0)
        d0 = float(pair.get("token0", {}).get("derivedUSD", 0) or 0)
        d1 = float(pair.get("token1", {}).get("derivedUSD", 0) or 0)

        side0_usd = r0 * d0
        side1_usd = r1 * d1
        calc_usd = side0_usd + side1_usd

        # Both sides must have meaningful value (> $100).
        # Spam pairs have trillions of worthless tokens on one side
        # and near-zero real value on the other.
        if side0_usd < MIN_SIDE_USD or side1_usd < MIN_SIDE_USD:
            return 0.0

        # Reject if total is unreasonably high
        if calc_usd > MAX_PAIR_USD:
            return 0.0

        return calc_usd
    except (ValueError, TypeError):
        return 0.0


def analyze_lp(token_address: str) -> dict:
    """
    Analyze liquidity pools for a token.
    Returns:
        {
            "has_lp": bool,
            "total_liquidity_usd": float,
            "pair_count": int,
            "best_pair": {
                "address": str,
                "dex": str,
                "reserve_usd": float,
                "created_at": int (timestamp),
                "age_days": float,
                "total_txns": int,
            } | None,
            "recent_burns": list[dict],  # LP removals in last 24h
            "recent_mints": list[dict],  # LP additions in last 24h
            "error": str | None,
        }
    """
    addr = token_address.lower()
    result = {
        "has_lp": False,
        "total_liquidity_usd": 0.0,
        "pair_count": 0,
        "best_pair": None,
        "recent_burns": [],
        "recent_mints": [],
        "error": None,
    }

    all_pairs = []

    # Query both V1 and V2 — sorted by totalTransactions to get real pairs first
    # Include reserve0/reserve1 + derivedUSD for cross-validation
    pairs_query = """
    query($token: String!) {
        asToken0: pairs(where: {token0: $token}, orderBy: totalTransactions, orderDirection: desc, first: 50) {
            id
            token0 { id symbol derivedUSD }
            token1 { id symbol derivedUSD }
            reserve0
            reserve1
            reserveUSD
            totalTransactions
            timestamp
        }
        asToken1: pairs(where: {token1: $token}, orderBy: totalTransactions, orderDirection: desc, first: 50) {
            id
            token0 { id symbol derivedUSD }
            token1 { id symbol derivedUSD }
            reserve0
            reserve1
            reserveUSD
            totalTransactions
            timestamp
        }
    }
    """

    for dex_name, subgraph_url in [("PulseX_V2", PULSEX_V2_SUBGRAPH), ("PulseX_V1", PULSEX_V1_SUBGRAPH)]:
        data = _query_subgraph(subgraph_url, pairs_query, {"token": addr})
        for pair in (data.get("asToken0", []) + data.get("asToken1", [])):
            pair["_dex"] = dex_name
            all_pairs.append(pair)

    if not all_pairs:
        return result

    # Deduplicate and filter spam pairs (< MIN_TXNS transactions)
    seen = set()
    unique_pairs = []
    for p in all_pairs:
        if p["id"] not in seen:
            seen.add(p["id"])
            txns = int(p.get("totalTransactions", 0) or 0)
            if txns >= MIN_TXNS:
                unique_pairs.append(p)

    if not unique_pairs:
        return result

    result["has_lp"] = True

    # Calculate total liquidity using derivedUSD cross-validation
    total_liq = 0.0
    real_pair_count = 0
    best = None
    best_reserve = 0.0
    now = int(time.time())

    for p in unique_pairs:
        reserve = _calc_pair_liquidity(p)
        if reserve > 0:
            total_liq += reserve
            real_pair_count += 1
        if reserve > best_reserve:
            best_reserve = reserve
            created_ts = int(p.get("timestamp", 0) or 0)
            age_days = (now - created_ts) / 86400 if created_ts > 0 else 0
            best = {
                "address": p["id"],
                "dex": p["_dex"],
                "reserve_usd": round(reserve, 2),
                "created_at": created_ts,
                "age_days": round(age_days, 1),
                "total_txns": int(p.get("totalTransactions", 0) or 0),
            }

    # Only count pairs with real liquidity (passed bilateral filter)
    result["pair_count"] = real_pair_count
    result["total_liquidity_usd"] = round(total_liq, 2)
    result["best_pair"] = best

    # Check recent burns (LP removals) in last 24h
    if best:
        ts_24h_ago = str(now - 86400)
        burns_query = """
        query($pair: String!, $timestamp: String!) {
            burns(where: {pair: $pair, timestamp_gt: $timestamp}, orderBy: timestamp, orderDirection: desc, first: 10) {
                id
                timestamp
                amount0
                amount1
                amountUSD
                sender
                to
            }
        }
        """
        # Query the subgraph where we found the best pair
        subgraph_url = PULSEX_V2_SUBGRAPH if best["dex"] == "PulseX_V2" else PULSEX_V1_SUBGRAPH
        burn_data = _query_subgraph(subgraph_url, burns_query, {"pair": best["address"], "timestamp": ts_24h_ago})
        result["recent_burns"] = burn_data.get("burns", [])

        # Check recent mints (LP additions)
        mints_query = """
        query($pair: String!, $timestamp: String!) {
            mints(where: {pair: $pair, timestamp_gt: $timestamp}, orderBy: timestamp, orderDirection: desc, first: 10) {
                id
                timestamp
                amount0
                amount1
                amountUSD
                sender
                to
            }
        }
        """
        mint_data = _query_subgraph(subgraph_url, mints_query, {"pair": best["address"], "timestamp": ts_24h_ago})
        result["recent_mints"] = mint_data.get("mints", [])

    return result
