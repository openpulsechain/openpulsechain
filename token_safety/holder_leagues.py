"""
Holder Leagues — Scrape top holders for PLS, PLSX, pHEX, INC
and classify into ocean-themed tiers (Poseidon → Turtle).

Phase 2: Also stores individual holder addresses and builds family
clusters by cross-referencing with whale_links (common_funder, etc.).

Runs every 6h via scheduler. Paginates Scan API from top holder
downward, stopping once balance drops below Turtle threshold (0.0001%).
"""

import logging
import time
import requests
from datetime import datetime, timezone
from collections import defaultdict

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

# Link types that form families (Mother → Daughters)
FAMILY_LINK_TYPES = ("common_funder", "bridge_funded", "same_funder", "bridge_siblings")

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


def _assign_tier(balance_raw: int, total_supply_raw: int) -> str:
    """Assign the highest tier this balance qualifies for."""
    for tier_name, tier_pct in TIERS:
        threshold = int(total_supply_raw * tier_pct / 100)
        if balance_raw >= threshold:
            return tier_name
    return "turtle"


def _paginate_token_holders(address: str, min_balance_raw: int) -> list[dict]:
    """
    Paginate /api/v2/tokens/{address}/holders from top to bottom.
    Stops when holder balance drops below min_balance_raw.
    Returns list of {address, value_raw} dicts.
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
                return holders

            holders.append({
                "address": item.get("address", {}).get("hash", ""),
                "value_raw": value_raw,
            })

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


# ── Family clustering ────────────────────────────────────────

class UnionFind:
    """Simple union-find for grouping addresses into families."""

    def __init__(self):
        self.parent = {}

    def find(self, x):
        if x not in self.parent:
            self.parent[x] = x
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[ra] = rb


def build_families(holders: list[dict], token_symbol: str, total_supply_raw: int) -> tuple[list[dict], list[dict]]:
    """
    Cross-reference holder addresses with whale_links to form families.
    Returns (holders_with_family_id, family_summaries).
    """
    from db import supabase

    holder_set = {h["address"].lower() for h in holders}
    holder_map = {h["address"].lower(): h for h in holders}

    # Load all whale_links (small table, ~755 rows)
    try:
        result = supabase.table("whale_links").select(
            "address_from, address_to, link_type"
        ).in_("link_type", list(FAMILY_LINK_TYPES)).execute()
        links = result.data or []
    except Exception as e:
        logger.warning(f"[FAMILIES] Failed to load whale_links: {e}")
        links = []

    if not links:
        # No links — return holders without family grouping
        return holders, []

    # Union-Find to merge addresses into groups
    uf = UnionFind()
    link_types_per_pair = defaultdict(set)

    for link in links:
        addr_from = link["address_from"].lower()
        addr_to = link["address_to"].lower()
        lt = link["link_type"]

        # Only group if at least one address is in our holder set
        if addr_from in holder_set or addr_to in holder_set:
            uf.union(addr_from, addr_to)
            pair_key = tuple(sorted([addr_from, addr_to]))
            link_types_per_pair[pair_key].add(lt)

    # Build groups: root -> [members in holder_set]
    groups = defaultdict(list)
    for addr in holder_set:
        root = uf.find(addr)
        groups[root].append(addr)

    # For each group with 2+ members, elect Mother (highest balance)
    families = []  # family summary rows
    family_assignments = {}  # addr -> family_id

    for root, members in groups.items():
        if len(members) < 2:
            continue  # Solo holder, no family

        # Elect Mother = member with highest balance
        members_sorted = sorted(
            members,
            key=lambda a: holder_map[a]["value_raw"],
            reverse=True,
        )
        mother = members_sorted[0]
        daughters = members_sorted[1:]

        # Assign family_id to all members
        for addr in members:
            family_assignments[addr] = mother

        # Collect link types for this family
        family_link_types = set()
        for i, a in enumerate(members):
            for b in members[i + 1:]:
                pair_key = tuple(sorted([a, b]))
                family_link_types.update(link_types_per_pair.get(pair_key, set()))

        # Combined balance
        combined_raw = sum(holder_map[a]["value_raw"] for a in members)
        combined_pct = (combined_raw / total_supply_raw) * 100 if total_supply_raw else 0
        combined_tier = _assign_tier(combined_raw, total_supply_raw)
        individual_tier = _assign_tier(holder_map[mother]["value_raw"], total_supply_raw)

        families.append({
            "token_symbol": token_symbol,
            "family_id": mother,
            "mother_address": mother,
            "daughter_count": len(daughters),
            "combined_balance_pct": round(combined_pct, 6),
            "combined_tier": combined_tier,
            "individual_tier": individual_tier,
            "link_types": sorted(family_link_types),
        })

    # Annotate holders with family_id
    for h in holders:
        addr = h["address"].lower()
        h["family_id"] = family_assignments.get(addr)

    logger.info(
        f"[FAMILIES] {token_symbol}: {len(families)} families found "
        f"({sum(f['daughter_count'] for f in families)} daughters total)"
    )

    return holders, families


# ── Main scrape logic ────────────────────────────────────────

def scrape_token_holders(token: dict) -> dict:
    """
    Scrape holders for a single token and count per tier.
    Returns dict ready for Supabase insert, including individual holders.
    """
    symbol = token["symbol"]
    address = token["address"]
    decimals = token["decimals"]
    is_native = token.get("is_native", False)

    logger.info(f"[LEAGUES] Scraping {symbol}...")
    start = time.time()

    # Get total supply and holder count
    if is_native:
        PLS_TOTAL_SUPPLY = 138_890_000_000_000  # 138.89 trillion PLS
        total_supply_raw = int(PLS_TOTAL_SUPPLY * (10 ** 18))

        # For PLS native, get holder count from WPLS token (same address)
        # NOT from chain stats total_addresses (which is 430M+ = all addresses ever)
        wpls_info = _get_token_info(address)
        total_holders = int(wpls_info.get("holders", "0") or "0")

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
        turtle_threshold_raw = int(total_supply_raw * TIERS[-1][1] / 100)
        holders = _paginate_token_holders(address, turtle_threshold_raw)

    # Count holders per tier + annotate each holder
    tier_counts = {name: 0 for name, _ in TIERS}

    for h in holders:
        balance = h["value_raw"]
        tier = _assign_tier(balance, total_supply_raw)
        h["tier"] = tier
        h["balance_pct"] = (balance / total_supply_raw) * 100 if total_supply_raw else 0
        # Count in all qualifying tiers (cumulative)
        for tier_name, tier_pct in TIERS:
            threshold = int(total_supply_raw * tier_pct / 100)
            if balance >= threshold:
                tier_counts[tier_name] += 1

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
        "total_supply": str(total_supply_raw),
        "total_supply_raw": total_supply_raw,
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
        "holders": holders,
    }


def save_league_snapshot(data: dict):
    """Save to snapshot history, current tables, individual addresses, and families."""
    from db import supabase

    token = data["token_symbol"]
    scraped_at = data["scraped_at"]

    # 1. Insert into history
    snapshot_row = {
        "token_symbol": token,
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
        "scraped_at": scraped_at,
        "scrape_duration_s": data["scrape_duration_s"],
        "pages_fetched": data["pages_fetched"],
    }
    supabase.table("holder_league_snapshots").insert(snapshot_row).execute()

    # 2. Upsert into current (latest view)
    current_row = {
        "token_symbol": token,
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
        "updated_at": scraped_at,
    }
    supabase.table("holder_league_current").upsert(
        current_row, on_conflict="token_symbol"
    ).execute()

    # 3. Build families from whale_links
    holders = data.get("holders", [])
    total_supply_raw = data.get("total_supply_raw", 0)

    holders_with_family, families = build_families(holders, token, total_supply_raw)

    # 4. Save individual holder addresses (delete + insert, latest only)
    try:
        supabase.table("holder_league_addresses").delete().eq(
            "token_symbol", token
        ).execute()
    except Exception:
        pass  # Table might not exist yet

    # Batch insert holders (500 per batch)
    for i in range(0, len(holders_with_family), 500):
        batch = [{
            "token_symbol": token,
            "holder_address": h["address"].lower(),
            "balance_raw": str(h["value_raw"]),
            "balance_pct": round(h.get("balance_pct", 0), 6),
            "tier": h.get("tier", "turtle"),
            "family_id": h.get("family_id"),
            "scraped_at": scraped_at,
        } for h in holders_with_family[i:i + 500]]
        try:
            supabase.table("holder_league_addresses").insert(batch).execute()
        except Exception as e:
            logger.warning(f"[LEAGUES] Failed to insert addresses batch: {e}")
            break

    # 5. Save family summaries
    try:
        supabase.table("holder_league_families").delete().eq(
            "token_symbol", token
        ).execute()
    except Exception:
        pass

    if families:
        for f in families:
            f["scraped_at"] = scraped_at
        try:
            supabase.table("holder_league_families").insert(families).execute()
        except Exception as e:
            logger.warning(f"[LEAGUES] Failed to insert families: {e}")

    logger.info(
        f"[LEAGUES] Saved {token}: {len(holders_with_family)} addresses, "
        f"{len(families)} families"
    )


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
