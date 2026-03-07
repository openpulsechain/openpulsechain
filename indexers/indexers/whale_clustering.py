"""Whale clustering indexer — finds connections between whale addresses.

Heuristics:
1. Common funding source: if 2+ whales received their first PLS from the same address
2. Direct transfers: whale A sent PLS or tokens to whale B
3. Shared contract interactions: same staking/DEX patterns (future)

Uses PulseChain Scan API v2 for transaction history.
"""

import logging
import time
from datetime import datetime, timezone
from collections import defaultdict

import requests

from db import supabase

logger = logging.getLogger(__name__)

SCAN_API = "https://api.scan.pulsechain.com/api/v2"

# Known infrastructure to ignore as "funders"
INFRA_ADDRESSES = {
    "0x0000000000000000000000000000000000000000",
    "0x000000000000000000000000000000000000dead",
    # PulseX routers
    "0x98bf93ebf5c380c0e6ae8e192a7e2ae08edacc3a",
    "0x165c3410fc91f0b75b2ab5093d7226e3929e0bff",
    # OmniBridge
    "0x4fdef7c7bfceb52b77b3e04f20df35e76d287c8d",
    # WPLS contract
    "0xa1077a294dde1b09bb078844df40758a5d0f9a27",
    # HEX contract
    "0x2b591e99afe9f32eaa6214f7b7629768c40eeb39",
}


def _fetch_transactions(address, limit=50):
    """Fetch transactions for an address from Scan API v2."""
    url = f"{SCAN_API}/addresses/{address}/transactions"
    try:
        resp = requests.get(url, params={"limit": limit}, timeout=15)
        if resp.status_code != 200:
            return []
        data = resp.json()
        return data.get("items", [])
    except Exception as e:
        logger.debug(f"Failed to fetch txs for {address[:12]}: {e}")
        return []


def _fetch_token_transfers(address, direction="to", limit=50):
    """Fetch token transfers for an address."""
    url = f"{SCAN_API}/addresses/{address}/token-transfers"
    try:
        resp = requests.get(url, params={"limit": limit, "filter": direction, "type": "ERC-20"}, timeout=15)
        if resp.status_code != 200:
            return []
        data = resp.json()
        return data.get("items", [])
    except Exception as e:
        logger.debug(f"Failed to fetch token transfers for {address[:12]}: {e}")
        return []


def _find_funder(txs, whale_address):
    """Find the first address that sent PLS to this whale."""
    # Sort by block number ascending to find earliest
    incoming = []
    for tx in txs:
        to_addr = (tx.get("to") or {}).get("hash", "").lower()
        from_addr = tx.get("from", {}).get("hash", "").lower()
        value = int(tx.get("value", "0"))

        if to_addr == whale_address.lower() and value > 0:
            block = tx.get("block_number") or 999999999
            incoming.append((block, from_addr, value))

    if not incoming:
        return None

    incoming.sort(key=lambda x: x[0])
    _, funder, _ = incoming[0]

    if funder in INFRA_ADDRESSES:
        # Try second funder
        for _, f, _ in incoming[1:]:
            if f not in INFRA_ADDRESSES:
                return f
        return None

    return funder


def _find_direct_links(txs, whale_address, whale_set):
    """Find direct PLS transfers between this whale and other known whales."""
    links = []
    for tx in txs:
        from_addr = tx.get("from", {}).get("hash", "").lower()
        to_addr = (tx.get("to") or {}).get("hash", "").lower()
        value = int(tx.get("value", "0"))

        if value == 0:
            continue

        if from_addr == whale_address.lower() and to_addr in whale_set:
            links.append(("sent_pls", to_addr, value / 1e18))
        elif to_addr == whale_address.lower() and from_addr in whale_set:
            links.append(("received_pls", from_addr, value / 1e18))

    return links


def _find_token_links(transfers, whale_address, whale_set):
    """Find token transfers between this whale and other known whales."""
    links = []
    for tx in transfers:
        from_addr = tx.get("from", {}).get("hash", "").lower()
        to_addr = tx.get("to", {}).get("hash", "").lower()
        symbol = tx.get("token", {}).get("symbol", "?")

        if from_addr == whale_address.lower() and to_addr in whale_set:
            links.append(("sent_token", to_addr, symbol))
        elif to_addr == whale_address.lower() and from_addr in whale_set:
            links.append(("received_token", from_addr, symbol))

    return links


def _set_status(status, error=None):
    supabase.table("sync_status").update({
        "status": status,
        "error_message": error,
        "last_synced_at": datetime.now(timezone.utc).isoformat(),
    }).eq("indexer_name", "whale_clustering").execute()


def run():
    """Analyze whale addresses to find clusters (same owner)."""
    logger.info("Starting whale clustering...")
    _set_status("running")

    try:
        # 1. Load all whale addresses
        result = supabase.table("whale_addresses") \
            .select("address, total_usd, token_count, top_tokens, is_contract") \
            .order("total_usd", desc=True) \
            .limit(200) \
            .execute()

        whales = result.data or []
        whale_set = {w["address"].lower() for w in whales}
        logger.info(f"Analyzing {len(whales)} whale addresses")

        if not whales:
            _set_status("idle")
            return

        now = datetime.now(timezone.utc).isoformat()
        funder_map = {}  # whale_address -> funder_address
        all_links = []   # list of {from, to, link_type, detail}
        funder_groups = defaultdict(list)  # funder -> [whale addresses]

        # 2. For each whale, find funder + direct links
        for i, whale in enumerate(whales):
            addr = whale["address"]

            # Fetch transactions
            txs = _fetch_transactions(addr)

            if txs:
                # Find first funder
                funder = _find_funder(txs, addr)
                if funder:
                    funder_map[addr] = funder
                    funder_groups[funder].append(addr)

                # Find direct whale-to-whale links
                pls_links = _find_direct_links(txs, addr, whale_set)
                for link_type, other, amount in pls_links:
                    all_links.append({
                        "address_from": addr if "sent" in link_type else other,
                        "address_to": other if "sent" in link_type else addr,
                        "link_type": "direct_transfer",
                        "detail": f"{amount:,.0f} PLS",
                        "updated_at": now,
                    })

            # Fetch token transfers (both directions)
            token_in = _fetch_token_transfers(addr, "to", 30)
            token_out = _fetch_token_transfers(addr, "from", 30)
            token_txs = token_in + token_out

            if token_txs:
                token_links = _find_token_links(token_txs, addr, whale_set)
                for link_type, other, symbol in token_links:
                    all_links.append({
                        "address_from": addr if "sent" in link_type else other,
                        "address_to": other if "sent" in link_type else addr,
                        "link_type": "token_transfer",
                        "detail": symbol,
                        "updated_at": now,
                    })

            # Rate limit (0.3s between requests, ~4 requests per whale)
            time.sleep(0.3)

            if (i + 1) % 20 == 0:
                logger.info(f"  Processed {i + 1}/{len(whales)} whales")

        # 3. Build funding clusters (same funder = likely same owner)
        cluster_links = []
        for funder, funded_whales in funder_groups.items():
            if len(funded_whales) >= 2:
                # All whales funded by this address are likely the same entity
                logger.info(f"  Cluster: funder {funder[:12]}... funds {len(funded_whales)} whales")
                for w in funded_whales:
                    cluster_links.append({
                        "address_from": funder,
                        "address_to": w,
                        "link_type": "common_funder",
                        "detail": f"funded {len(funded_whales)} whales",
                        "updated_at": now,
                    })
                # Also link the funded whales to each other
                for j in range(len(funded_whales)):
                    for k in range(j + 1, len(funded_whales)):
                        cluster_links.append({
                            "address_from": funded_whales[j],
                            "address_to": funded_whales[k],
                            "link_type": "same_funder",
                            "detail": f"both funded by {funder[:12]}...",
                            "updated_at": now,
                        })

        all_links.extend(cluster_links)

        # 4. Deduplicate links (keep unique from-to-type combinations)
        seen = set()
        unique_links = []
        for link in all_links:
            key = (link["address_from"], link["address_to"], link["link_type"])
            if key not in seen:
                seen.add(key)
                unique_links.append(link)

        # 5. Store results
        logger.info(f"Found {len(unique_links)} unique links ({len(cluster_links)} from clustering)")

        # Clear old links
        supabase.table("whale_links").delete().neq("address_from", "").execute()

        # Insert new links
        batch_size = 500
        for i in range(0, len(unique_links), batch_size):
            batch = unique_links[i:i + batch_size]
            supabase.table("whale_links").insert(batch).execute()

        # Update whale_addresses with funder info
        for addr, funder in funder_map.items():
            supabase.table("whale_addresses").update({
                "funder_address": funder,
                "updated_at": now,
            }).eq("address", addr).execute()

        # Summary
        funding_clusters = sum(1 for v in funder_groups.values() if len(v) >= 2)
        direct_links = sum(1 for l in unique_links if l["link_type"] == "direct_transfer")
        token_links = sum(1 for l in unique_links if l["link_type"] == "token_transfer")

        logger.info(f"Clustering complete: {funding_clusters} funding clusters, "
                     f"{direct_links} direct PLS links, {token_links} token links")
        _set_status("idle")

    except Exception as e:
        logger.error(f"Whale clustering failed: {e}")
        _set_status("error", str(e)[:500])
        raise
