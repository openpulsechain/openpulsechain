"""
Holder Leagues — Scrape top holders for PLS, PLSX, pHEX, INC
and classify into ocean-themed tiers (Poseidon → Turtle).

Runs every 6h via scheduler. Paginates Scan API from top holder
downward, stopping once balance drops below Turtle threshold (0.0001%).
"""

import logging
import time
import requests
from datetime import datetime, timezone

from config import SCAN_API_URL, RPC_URL

logger = logging.getLogger("holder_leagues")

# ── Token config ─────────────────────────────────────────────

LEAGUE_TOKENS = [
    {
        "symbol": "PLS",
        "address": "0xa1077a294dde1b09bb078844df40758a5d0f9a27",  # WPLS
        "is_native": True,
        "decimals": 18,
    },
    {
        "symbol": "PLSX",
        "address": "0x95b303987a60c71504d99aa1b13b4da07b0790ab",
        "is_native": False,
        "decimals": 18,
    },
    {
        "symbol": "pHEX",
        "address": "0x2b591e99afe9f32eaa6214f7b7629768c40eeb39",
        "is_native": False,
        "decimals": 8,
    },
    {
        "symbol": "INC",
        "address": "0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d",
        "is_native": False,
        "decimals": 18,
    },
]

# Tier thresholds as % of total supply
TIERS = [
    ("poseidon", 10.0),
    ("whale", 1.0),
    ("shark", 0.1),
    ("dolphin", 0.01),
    ("squid", 0.001),
    ("turtle", 0.0001),
]

RATE_LIMIT_S = 0.3  # seconds between API pages
MAX_PAGES = 5000     # safety limit
REQUEST_TIMEOUT = 15


# ── Helpers ──────────────────────────────────────────────────

def _get_token_info(address: str) -> dict:
    """Fetch token metadata from Scan API."""
    resp = requests.get(
        f"{SCAN_API_URL}/api/v2/tokens/{address}",
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def _get_chain_stats() -> dict:
    """Fetch chain-level stats (for native PLS total supply)."""
    resp = requests.get(
        f"{SCAN_API_URL}/api/v2/stats",
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def _paginate_token_holders(address: str, min_balance_raw: int) -> list[dict]:
    """
    Paginate /api/v2/tokens/{address}/holders from top to bottom.
    Stops when holder balance drops below min_balance_raw.
    Returns list of {address, value} dicts.
    """
    holders = []
    params = {"limit": 50}
    page = 0

    while page < MAX_PAGES:
        try:
            resp = requests.get(
                f"{SCAN_API_URL}/api/v2/tokens/{address}/holders",
                params=params,
                timeout=REQUEST_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            logger.warning(f"Page {page} fetch error: {e}")
            break

        items = data.get("items", [])
        if not items:
            break

        for item in items:
            value_str = item.get("value", "0")
            try:
                value_raw = int(value_str)
            except (ValueError, TypeError):
                continue

            if value_raw < min_balance_raw:
                # All subsequent holders will be smaller — stop
                return holders

            holders.append({
                "address": item.get("address", {}).get("hash", ""),
                "value_raw": value_raw,
            })

        # Next page
        next_params = data.get("next_page_params")
        if not next_params:
            break

        params = {**next_params, "limit": 50}
        page += 1
        time.sleep(RATE_LIMIT_S)

    return holders


def _paginate_native_holders(min_balance_wei: int) -> list[dict]:
    """
    Paginate /api/v2/addresses sorted by native coin balance.
    Stops when balance drops below min_balance_wei.
    """
    holders = []
    params = {"sort": "balance", "order": "desc", "limit": 50}
    page = 0

    while page < MAX_PAGES:
        try:
            resp = requests.get(
                f"{SCAN_API_URL}/api/v2/addresses",
                params=params,
                timeout=REQUEST_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            logger.warning(f"Native page {page} fetch error: {e}")
            break

        items = data.get("items", [])
        if not items:
            break

        for item in items:
            balance_str = item.get("coin_balance", "0")
            try:
                balance_wei = int(balance_str)
            except (ValueError, TypeError):
                continue

            if balance_wei < min_balance_wei:
                return holders

            holders.append({
                "address": item.get("hash", ""),
                "value_raw": balance_wei,
            })

        next_params = data.get("next_page_params")
        if not next_params:
            break

        params = {**next_params, "sort": "balance", "order": "desc", "limit": 50}
        page += 1
        time.sleep(RATE_LIMIT_S)

    return holders


# ── Main scrape logic ────────────────────────────────────────

def scrape_token_holders(token: dict) -> dict:
    """
    Scrape holders for a single token and count per tier.
    Returns dict ready for Supabase insert.
    """
    symbol = token["symbol"]
    address = token["address"]
    decimals = token["decimals"]
    is_native = token.get("is_native", False)

    logger.info(f"[LEAGUES] Scraping {symbol}...")
    start = time.time()

    # Get total supply and holder count
    if is_native:
        # PLS total supply ~138.89T (genesis). Stats API doesn't expose it.
        # Use total_addresses as holder count proxy.
        PLS_TOTAL_SUPPLY = 138_890_000_000_000  # 138.89 trillion PLS
        total_supply_raw = int(PLS_TOTAL_SUPPLY * (10 ** 18))

        stats = _get_chain_stats()
        total_holders = int(stats.get("total_addresses", "0"))

        # Turtle threshold in wei
        turtle_threshold_raw = int(total_supply_raw * TIERS[-1][1] / 100)

        holders = _paginate_native_holders(turtle_threshold_raw)
    else:
        info = _get_token_info(address)
        total_supply_str = info.get("total_supply", "0")
        try:
            total_supply_raw = int(total_supply_str)
        except (ValueError, TypeError):
            total_supply_raw = 0

        total_holders = int(info.get("holders", "0") or "0")

        # Turtle threshold in raw units
        turtle_threshold_raw = int(total_supply_raw * TIERS[-1][1] / 100)

        holders = _paginate_token_holders(address, turtle_threshold_raw)

    # Count holders per tier
    tier_counts = {name: 0 for name, _ in TIERS}

    for h in holders:
        balance = h["value_raw"]
        for tier_name, tier_pct in TIERS:
            threshold = int(total_supply_raw * tier_pct / 100)
            if balance >= threshold:
                tier_counts[tier_name] += 1

    # Compute tokens required per tier (human-readable)
    total_supply_human = total_supply_raw / (10 ** decimals)

    elapsed = round(time.time() - start, 1)
    pages = len(holders) // 50 + (1 if len(holders) % 50 else 0)

    logger.info(
        f"[LEAGUES] {symbol}: {len(holders)} significant holders in {elapsed}s "
        f"({pages} pages). Tiers: P={tier_counts['poseidon']} W={tier_counts['whale']} "
        f"S={tier_counts['shark']} D={tier_counts['dolphin']} "
        f"Sq={tier_counts['squid']} T={tier_counts['turtle']}"
    )

    return {
        "token_symbol": symbol,
        "token_address": address,
        "total_holders": total_holders,
        "total_supply": str(total_supply_raw),  # Store as string to avoid precision loss
        "total_supply_human": total_supply_human,
        "poseidon_count": tier_counts["poseidon"],
        "whale_count": tier_counts["whale"],
        "shark_count": tier_counts["shark"],
        "dolphin_count": tier_counts["dolphin"],
        "squid_count": tier_counts["squid"],
        "turtle_count": tier_counts["turtle"],
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "scrape_duration_s": elapsed,
        "pages_fetched": pages,
        "significant_holders": len(holders),
    }


def save_league_snapshot(data: dict):
    """Save to both snapshot history and current tables."""
    from db import supabase

    # 1. Insert into history
    snapshot_row = {
        "token_symbol": data["token_symbol"],
        "token_address": data["token_address"],
        "total_holders": data["total_holders"],
        "total_supply": data["total_supply"],
        "total_supply_human": data["total_supply_human"],
        "poseidon_count": data["poseidon_count"],
        "whale_count": data["whale_count"],
        "shark_count": data["shark_count"],
        "dolphin_count": data["dolphin_count"],
        "squid_count": data["squid_count"],
        "turtle_count": data["turtle_count"],
        "scraped_at": data["scraped_at"],
        "scrape_duration_s": data["scrape_duration_s"],
        "pages_fetched": data["pages_fetched"],
    }
    supabase.table("holder_league_snapshots").insert(snapshot_row).execute()

    # 2. Upsert into current (latest view)
    current_row = {
        "token_symbol": data["token_symbol"],
        "token_address": data["token_address"],
        "total_holders": data["total_holders"],
        "total_supply": data["total_supply"],
        "total_supply_human": data["total_supply_human"],
        "poseidon_count": data["poseidon_count"],
        "whale_count": data["whale_count"],
        "shark_count": data["shark_count"],
        "dolphin_count": data["dolphin_count"],
        "squid_count": data["squid_count"],
        "turtle_count": data["turtle_count"],
        "updated_at": data["scraped_at"],
    }
    supabase.table("holder_league_current").upsert(
        current_row, on_conflict="token_symbol"
    ).execute()


def run_holder_leagues():
    """Scrape all 4 tokens and save league data."""
    logger.info("[LEAGUES] Starting holder league scrape...")
    start = time.time()

    for token in LEAGUE_TOKENS:
        try:
            result = scrape_token_holders(token)
            save_league_snapshot(result)
        except Exception as e:
            logger.error(f"[LEAGUES] Failed {token['symbol']}: {e}")

    elapsed = round(time.time() - start, 1)
    logger.info(f"[LEAGUES] All tokens scraped in {elapsed}s")


# ── CLI ──────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    run_holder_leagues()
