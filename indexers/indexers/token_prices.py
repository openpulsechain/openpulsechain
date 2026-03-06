"""Token prices indexer — GeckoTerminal for PulseChain tokens + CoinGecko for majors.

PulseChain tokens use the same GeckoTerminal pools as EvaInvest pulsechain_scraper
to guarantee identical price sources.
"""

import logging
import time
from datetime import datetime, timezone

import requests

from db import supabase
from config import COINGECKO_BASE, COINGECKO_API_KEY
from utils.retry import with_retry

logger = logging.getLogger(__name__)

GT_BASE = "https://api.geckoterminal.com/api/v2"

# PulseChain tokens — same pools as EvaInvest pulsechain_scraper
PULSECHAIN_TOKENS = [
    {
        "id": "pulsex",
        "symbol": "PLSX",
        "name": "PulseX",
        "network": "pulsechain",
        "pool": "0x1b45b9148791d3a104184cd5dfe5ce57193a3ee9",
        "method": "direct",
    },
    {
        "id": "hex-pulsechain",
        "symbol": "HEX",
        "name": "HEX (PulseChain)",
        "network": "pulsechain",
        "pool": "0xf1f4ee610b2babb05c635f726ef8b0c568c8dc65",
        "method": "direct",
    },
    {
        "id": "pulsex-incentive-token",
        "symbol": "INC",
        "name": "Incentive",
        "network": "pulsechain",
        "pool": "0xf808bb6265e9ca27002c0a04562bf50d4fe37eaa",
        "method": "direct",
    },
    {
        "id": "pulsechain",
        "symbol": "PLS",
        "name": "PulseChain",
        "network": "pulsechain",
        "pool": "0x1b45b9148791d3a104184cd5dfe5ce57193a3ee9",
        "method": "derived",  # PLS_USD = PLSX_USD / PLSX_WPLS_ratio
    },
    {
        "id": "hex",
        "symbol": "EHEX",
        "name": "eHEX",
        "network": "eth",
        "pool": "0x55D5c232D921B9eAA6b37b5845E439aCD04b4DBa",
        "method": "direct",
    },
]

# Major tokens from CoinGecko (reliable for these)
COINGECKO_TOKENS = {
    "bitcoin": {"symbol": "BTC", "name": "Bitcoin"},
    "ethereum": {"symbol": "ETH", "name": "Ethereum"},
    "tether": {"symbol": "USDT", "name": "Tether"},
    "usd-coin": {"symbol": "USDC", "name": "USD Coin"},
    "wrapped-bitcoin": {"symbol": "WBTC", "name": "Wrapped Bitcoin"},
    "weth": {"symbol": "WETH", "name": "Wrapped Ether"},
    "dai": {"symbol": "DAI", "name": "Dai"},
}


def _fetch_gecko_terminal_price(token: dict) -> dict | None:
    """Fetch latest price from GeckoTerminal pool OHLCV (2 candles for 24h change)."""
    url = f"{GT_BASE}/networks/{token['network']}/pools/{token['pool']}/ohlcv/day"
    params = {"aggregate": 1, "limit": 2, "currency": "usd"}
    try:
        resp = requests.get(url, params=params, timeout=30)
        if resp.status_code != 200:
            logger.warning(f"GeckoTerminal {resp.status_code} for {token['symbol']}")
            return None
        candles = resp.json().get("data", {}).get("attributes", {}).get("ohlcv_list", [])
        if not candles or candles[0][4] <= 0:
            return None
        today_close = float(candles[0][4])
        change_pct = None
        if len(candles) >= 2 and candles[1][4] > 0:
            yesterday_close = float(candles[1][4])
            change_pct = ((today_close - yesterday_close) / yesterday_close) * 100
        return {
            "close": today_close,
            "volume": float(candles[0][5]),
            "change_pct": change_pct,
        }
    except Exception as e:
        logger.warning(f"GeckoTerminal error for {token['symbol']}: {e}")
        return None


def _fetch_pls_derived_price(token: dict) -> dict | None:
    """Derive PLS price: PLS_USD = PLSX_USD / PLSX_WPLS_ratio."""
    # Get PLSX/WPLS pool in USD (includes 24h change)
    usd_data = _fetch_gecko_terminal_price(token)
    if not usd_data:
        return None

    time.sleep(1.5)

    # Get PLSX/WPLS pool in token units (ratio) — 2 candles for 24h change
    url = f"{GT_BASE}/networks/{token['network']}/pools/{token['pool']}/ohlcv/day"
    params = {"aggregate": 1, "limit": 2, "currency": "token"}
    try:
        resp = requests.get(url, params=params, timeout=30)
        if resp.status_code != 200:
            return None
        candles = resp.json().get("data", {}).get("attributes", {}).get("ohlcv_list", [])
        if not candles or candles[0][4] <= 0:
            return None
        ratio_today = float(candles[0][4])
        pls_price = usd_data["close"] / ratio_today
        change_pct = None
        if len(candles) >= 2 and candles[1][4] > 0 and usd_data.get("change_pct") is not None:
            ratio_yesterday = float(candles[1][4])
            yesterday_usd = usd_data["close"] / (1 + usd_data["change_pct"] / 100)
            pls_yesterday = yesterday_usd / ratio_yesterday
            if pls_yesterday > 0:
                change_pct = ((pls_price - pls_yesterday) / pls_yesterday) * 100
        return {
            "close": pls_price,
            "volume": usd_data["volume"],
            "change_pct": change_pct,
        }
    except Exception as e:
        logger.warning(f"GeckoTerminal derived error for PLS: {e}")
        return None


def _fetch_pulsechain_prices() -> list[dict]:
    """Fetch all PulseChain token prices from GeckoTerminal."""
    rows = []
    now = datetime.now(timezone.utc).isoformat()

    for token in PULSECHAIN_TOKENS:
        if token["method"] == "derived":
            data = _fetch_pls_derived_price(token)
        else:
            data = _fetch_gecko_terminal_price(token)

        if data:
            rows.append({
                "id": token["id"],
                "symbol": token["symbol"],
                "name": token["name"],
                "price_usd": data["close"],
                "volume_24h_usd": data["volume"],
                "market_cap_usd": None,
                "price_change_24h_pct": data.get("change_pct"),
                "last_updated": now,
            })
            logger.info(f"  {token['symbol']}: ${data['close']:.8f} (GeckoTerminal)")

        time.sleep(2)  # Rate limit: 30 req/min

    return rows


def _fetch_coingecko_prices() -> list[dict]:
    """Fetch major token prices from CoinGecko."""
    ids = ",".join(COINGECKO_TOKENS.keys())
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
    now = datetime.now(timezone.utc).isoformat()
    for cg_id, info in COINGECKO_TOKENS.items():
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
            "last_updated": now,
        })

    return rows


def run():
    logger.info("Fetching token prices (GeckoTerminal + CoinGecko)...")

    supabase.table("sync_status").update({
        "status": "running",
    }).eq("indexer_name", "token_prices").execute()

    try:
        # 1. PulseChain tokens from GeckoTerminal (same source as EvaInvest)
        pls_rows = _fetch_pulsechain_prices()

        # 2. Major tokens from CoinGecko
        cg_rows = _fetch_coingecko_prices()

        all_rows = pls_rows + cg_rows

        if all_rows:
            supabase.table("token_prices").upsert(all_rows, on_conflict="id").execute()

        supabase.table("sync_status").update({
            "status": "idle",
            "last_synced_at": datetime.now(timezone.utc).isoformat(),
            "records_synced": len(all_rows),
            "error_message": None,
        }).eq("indexer_name", "token_prices").execute()

        logger.info(f"Updated prices: {len(pls_rows)} PulseChain (GeckoTerminal) + {len(cg_rows)} majors (CoinGecko)")

    except Exception as e:
        supabase.table("sync_status").update({
            "status": "error",
            "error_message": str(e)[:500],
        }).eq("indexer_name", "token_prices").execute()
        raise
