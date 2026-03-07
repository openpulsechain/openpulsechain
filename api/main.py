"""
OpenPulsechain API — Sovereign PulseChain token data.
Public, free, no auth required.
"""

import os
from datetime import datetime, date, timedelta
from typing import Optional, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

API_VERSION = "0.1.0"
SOURCE = "PulseX Subgraph (graph.pulsechain.com)"
LICENSE = "Open Data"

# ---------------------------------------------------------------------------
# App & middleware
# ---------------------------------------------------------------------------

app = FastAPI(
    title="OpenPulsechain API",
    description="Free, public REST API serving PulseChain token data sourced from PulseX Subgraph.",
    version=API_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _meta() -> dict:
    return {
        "source": SOURCE,
        "license": LICENSE,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


def _cache(response: Response, max_age: int = 30):
    response.headers["Cache-Control"] = f"public, max-age={max_age}"


def _normalize_address(address: str) -> str:
    return address.strip().lower()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


# ---- Root -----------------------------------------------------------------

@app.get("/", tags=["Info"])
def root():
    """API info and version."""
    return {
        "name": "OpenPulsechain API",
        "version": API_VERSION,
        "description": "Free public API for PulseChain token data.",
        "docs": "/docs",
        "meta": _meta(),
    }


# ---- Tokens ---------------------------------------------------------------

SORT_MAP = {
    "volume": "total_volume_usd",
    "liquidity": "total_liquidity",
    "symbol": "symbol",
}


@app.get("/api/v1/tokens", tags=["Tokens"])
def list_tokens(
    response: Response,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    sort_by: Literal["volume", "liquidity", "symbol"] = "volume",
    order: Literal["asc", "desc"] = "desc",
):
    """List all active tokens, paginated and sortable."""
    _cache(response, 30)

    col = SORT_MAP[sort_by]
    query = (
        supabase.table("pulsechain_tokens")
        .select("address, symbol, name, decimals, total_volume_usd, total_liquidity, is_active")
        .eq("is_active", True)
        .order(col, desc=(order == "desc"))
        .range(offset, offset + limit - 1)
    )
    result = query.execute()
    tokens = result.data or []

    # Enrich with current price from token_prices
    addresses = [t["address"] for t in tokens]
    prices_map: dict = {}
    if addresses:
        prices_result = (
            supabase.table("token_prices")
            .select("symbol, price_usd, price_change_24h_pct")
            .in_("symbol", list({t["symbol"] for t in tokens}))
            .execute()
        )
        for p in (prices_result.data or []):
            prices_map[p["symbol"]] = {
                "price_usd": p["price_usd"],
                "price_change_24h_pct": p["price_change_24h_pct"],
            }

    for t in tokens:
        t["address"] = t["address"].lower()
        price_info = prices_map.get(t["symbol"], {})
        t["price_usd"] = price_info.get("price_usd")
        t["price_change_24h_pct"] = price_info.get("price_change_24h_pct")

    # Count total
    count_result = (
        supabase.table("pulsechain_tokens")
        .select("address", count="exact")
        .eq("is_active", True)
        .execute()
    )

    return {
        "data": tokens,
        "pagination": {
            "limit": limit,
            "offset": offset,
            "total": count_result.count,
        },
        "meta": _meta(),
    }


@app.get("/api/v1/tokens/{address}", tags=["Tokens"])
def get_token(address: str, response: Response):
    """Token details with current price and 24h change."""
    _cache(response, 30)
    addr = _normalize_address(address)

    result = (
        supabase.table("pulsechain_tokens")
        .select("*")
        .eq("address", addr)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail=f"Token not found: {addr}")

    token = result.data[0]
    token["address"] = token["address"].lower()

    # Current price — try by address (id) first, fallback to symbol
    price_result = (
        supabase.table("token_prices")
        .select("price_usd, volume_24h_usd, market_cap_usd, price_change_24h_pct, last_updated")
        .eq("id", addr)
        .limit(1)
        .execute()
    )
    if not price_result.data:
        price_result = (
            supabase.table("token_prices")
            .select("price_usd, volume_24h_usd, market_cap_usd, price_change_24h_pct, last_updated")
            .eq("symbol", token["symbol"])
            .limit(1)
            .execute()
        )
    price = price_result.data[0] if price_result.data else {}
    token["price_usd"] = price.get("price_usd")
    token["volume_24h_usd"] = price.get("volume_24h_usd")
    token["market_cap_usd"] = price.get("market_cap_usd")
    token["price_change_24h_pct"] = price.get("price_change_24h_pct")
    token["price_last_updated"] = price.get("last_updated")

    return {"data": token, "meta": _meta()}


@app.get("/api/v1/tokens/{address}/history", tags=["Tokens"])
def token_history(
    address: str,
    response: Response,
    days: int = Query(30, ge=1, le=1000),
    start_date: Optional[str] = Query(None, description="ISO date, e.g. 2025-01-01"),
    end_date: Optional[str] = Query(None, description="ISO date, e.g. 2025-12-31"),
):
    """OHLCV-style price history for a token."""
    _cache(response, 300)
    addr = _normalize_address(address)

    # Verify token exists
    exists = (
        supabase.table("pulsechain_tokens")
        .select("address")
        .eq("address", addr)
        .execute()
    )
    if not exists.data:
        raise HTTPException(status_code=404, detail=f"Token not found: {addr}")

    # Date range
    if start_date and end_date:
        d_start = start_date
        d_end = end_date
    else:
        d_end = date.today().isoformat()
        d_start = (date.today() - timedelta(days=days)).isoformat()

    result = (
        supabase.table("token_price_history")
        .select("date, price_usd, daily_volume_usd, total_liquidity_usd, source")
        .eq("address", addr)
        .gte("date", d_start)
        .lte("date", d_end)
        .order("date", desc=False)
        .execute()
    )

    return {
        "data": result.data or [],
        "token": addr,
        "range": {"start": d_start, "end": d_end},
        "meta": _meta(),
    }


@app.get("/api/v1/tokens/{address}/price", tags=["Tokens"])
def token_price(address: str, response: Response):
    """Current price only (fast endpoint)."""
    _cache(response, 30)
    addr = _normalize_address(address)

    # Try token_prices first (fastest)
    # Need to resolve symbol from address
    token_result = (
        supabase.table("pulsechain_tokens")
        .select("symbol")
        .eq("address", addr)
        .execute()
    )
    if not token_result.data:
        raise HTTPException(status_code=404, detail=f"Token not found: {addr}")

    symbol = token_result.data[0]["symbol"]
    price_result = (
        supabase.table("token_prices")
        .select("price_usd, price_change_24h_pct, last_updated")
        .eq("id", addr)
        .limit(1)
        .execute()
    )
    if not price_result.data:
        price_result = (
            supabase.table("token_prices")
            .select("price_usd, price_change_24h_pct, last_updated")
            .eq("symbol", symbol)
            .limit(1)
            .execute()
        )

    if price_result.data:
        p = price_result.data[0]
        return {
            "data": {
                "address": addr,
                "symbol": symbol,
                "price_usd": p["price_usd"],
                "price_change_24h_pct": p["price_change_24h_pct"],
                "last_updated": p["last_updated"],
            },
            "meta": _meta(),
        }

    # Fallback: latest from history
    hist = (
        supabase.table("token_price_history")
        .select("date, price_usd")
        .eq("address", addr)
        .order("date", desc=True)
        .limit(1)
        .execute()
    )
    if hist.data:
        h = hist.data[0]
        return {
            "data": {
                "address": addr,
                "symbol": symbol,
                "price_usd": h["price_usd"],
                "price_change_24h_pct": None,
                "last_updated": h["date"],
            },
            "meta": _meta(),
        }

    raise HTTPException(status_code=404, detail=f"No price data for token: {addr}")


# ---- Pairs ----------------------------------------------------------------

@app.get("/api/v1/pairs", tags=["Pairs"])
def list_pairs(
    response: Response,
    limit: int = Query(50, ge=1, le=500),
):
    """Top PulseX trading pairs by volume."""
    _cache(response, 30)

    result = (
        supabase.table("pulsex_top_pairs")
        .select("pair_address, token0_symbol, token0_name, token1_symbol, token1_name, volume_usd, reserve_usd, total_transactions")
        .order("volume_usd", desc=True)
        .limit(limit)
        .execute()
    )

    pairs = result.data or []
    for p in pairs:
        p["pair_address"] = p["pair_address"].lower()

    return {"data": pairs, "meta": _meta()}


# ---- Market Overview -------------------------------------------------------

@app.get("/api/v1/market/overview", tags=["Market"])
def market_overview(response: Response):
    """Network-level overview: TVL, volume, token count, top movers."""
    _cache(response, 30)

    # Latest TVL
    tvl_result = (
        supabase.table("network_tvl_history")
        .select("date, tvl_usd")
        .order("date", desc=True)
        .limit(1)
        .execute()
    )
    tvl = tvl_result.data[0] if tvl_result.data else {"date": None, "tvl_usd": None}

    # Latest daily volume
    vol_result = (
        supabase.table("network_dex_volume")
        .select("date, volume_usd")
        .order("date", desc=True)
        .limit(1)
        .execute()
    )
    vol = vol_result.data[0] if vol_result.data else {"date": None, "volume_usd": None}

    # Active token count
    count_result = (
        supabase.table("pulsechain_tokens")
        .select("address", count="exact")
        .eq("is_active", True)
        .execute()
    )

    # Top gainers (top 5 by 24h change)
    gainers_result = (
        supabase.table("token_prices")
        .select("symbol, name, price_usd, price_change_24h_pct")
        .order("price_change_24h_pct", desc=True)
        .limit(5)
        .execute()
    )

    # Top losers (bottom 5 by 24h change)
    losers_result = (
        supabase.table("token_prices")
        .select("symbol, name, price_usd, price_change_24h_pct")
        .order("price_change_24h_pct", desc=False)
        .limit(5)
        .execute()
    )

    return {
        "data": {
            "tvl_usd": tvl.get("tvl_usd"),
            "tvl_date": tvl.get("date"),
            "volume_24h_usd": vol.get("volume_usd"),
            "volume_date": vol.get("date"),
            "active_tokens": count_result.count,
            "top_gainers": gainers_result.data or [],
            "top_losers": losers_result.data or [],
        },
        "meta": _meta(),
    }
