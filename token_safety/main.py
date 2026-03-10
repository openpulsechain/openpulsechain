"""
Token Safety Score — Main service.
Runs as:
1. HTTP API server (for on-demand analysis)
2. Cron batch analyzer (for periodic re-scoring of all tokens)
"""

import os
import sys
import json
import logging
import time
import asyncio
import secrets
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn

from analyzer import analyze_token
from db import save_score, get_score, get_all_tokens_to_analyze

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("token_safety")

# ── Background Scheduler ─────────────────────────────────────────

RADAR_INTERVAL_MIN = int(os.environ.get("RADAR_INTERVAL_MIN", "30"))
BATCH_INTERVAL_HOURS = int(os.environ.get("BATCH_INTERVAL_HOURS", "12"))
LEAGUE_INTERVAL_HOURS = int(os.environ.get("LEAGUE_INTERVAL_HOURS", "6"))
LP_MONITOR_INTERVAL_HOURS = int(os.environ.get("LP_MONITOR_INTERVAL_HOURS", "2"))
LP_MONITOR_LIMIT = int(os.environ.get("LP_MONITOR_LIMIT", "50"))
BATCH_LIMIT = int(os.environ.get("BATCH_LIMIT", "200"))
ENABLE_SCHEDULER = os.environ.get("ENABLE_SCHEDULER", "true").lower() == "true"


async def _scheduler_loop():
    """Background scheduler: runs radar every 30min, batch every 12h."""
    await asyncio.sleep(30)  # Wait 30s after startup before first run
    logger.info(f"Scheduler started: radar every {RADAR_INTERVAL_MIN}min, batch every {BATCH_INTERVAL_HOURS}h, leagues every {LEAGUE_INTERVAL_HOURS}h, LP monitor every {LP_MONITOR_INTERVAL_HOURS}h")

    radar_interval = RADAR_INTERVAL_MIN * 60
    batch_interval = BATCH_INTERVAL_HOURS * 3600
    league_interval = LEAGUE_INTERVAL_HOURS * 3600
    lp_monitor_interval = LP_MONITOR_INTERVAL_HOURS * 3600
    last_radar = 0
    last_batch = 0
    last_league = 0
    last_lp_monitor = 0

    while True:
        now = time.time()

        # Scam Radar
        if now - last_radar >= radar_interval:
            try:
                logger.info("[CRON] Running Scam Radar scan...")
                from scam_radar import run_scan, save_alerts
                from db import supabase
                alerts = run_scan(since_minutes=RADAR_INTERVAL_MIN)
                saved = 0
                if alerts:
                    saved = save_alerts(alerts, supabase)
                logger.info(f"[CRON] Radar: {len(alerts)} alerts, {saved} saved")
            except Exception as e:
                logger.error(f"[CRON] Radar error: {e}")
            last_radar = time.time()

        # Holder Leagues
        if now - last_league >= league_interval:
            try:
                logger.info("[CRON] Running Holder Leagues scrape...")
                import threading
                from holder_leagues import run_holder_leagues
                t = threading.Thread(target=run_holder_leagues, daemon=True)
                t.start()
            except Exception as e:
                logger.error(f"[CRON] Leagues error: {e}")
            last_league = time.time()

        # LP Liquidity Monitor — re-check top tokens' liquidity
        if now - last_lp_monitor >= lp_monitor_interval:
            try:
                logger.info(f"[CRON] Running LP liquidity monitor (top {LP_MONITOR_LIMIT} tokens)...")
                import threading
                t = threading.Thread(target=_run_lp_monitor, args=(LP_MONITOR_LIMIT,), daemon=True)
                t.start()
            except Exception as e:
                logger.error(f"[CRON] LP monitor error: {e}")
            last_lp_monitor = time.time()

        # Batch analysis
        if now - last_batch >= batch_interval:
            try:
                logger.info(f"[CRON] Running batch analysis (limit={BATCH_LIMIT})...")
                import threading
                t = threading.Thread(target=run_batch, args=(BATCH_LIMIT,), daemon=True)
                t.start()
            except Exception as e:
                logger.error(f"[CRON] Batch error: {e}")
            last_batch = time.time()

        await asyncio.sleep(60)  # Check every minute


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start background scheduler on app startup."""
    task = None
    if ENABLE_SCHEDULER:
        task = asyncio.create_task(_scheduler_loop())
        logger.info("Background scheduler enabled")
    else:
        logger.info("Background scheduler disabled (ENABLE_SCHEDULER=false)")
    yield
    if task:
        task.cancel()


# FastAPI app
app = FastAPI(
    title="OpenPulsechain Token Safety",
    description="Token safety scoring for PulseChain tokens.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://openpulsechain.com",
        "https://www.openpulsechain.com",
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Address validation
import re
ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")


def _validate_address(address: str) -> str:
    addr = address.strip().lower()
    if not ADDRESS_RE.match(addr):
        raise HTTPException(status_code=400, detail="Invalid address format")
    return addr


# ── Endpoints ─────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "token_safety",
        "scheduler_enabled": ENABLE_SCHEDULER,
        "radar_interval_min": RADAR_INTERVAL_MIN,
        "batch_interval_hours": BATCH_INTERVAL_HOURS,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/v1/token/{address}/safety")
def token_safety(address: str, request: Request, response: Response, fresh: bool = Query(False)):
    """
    Get safety score for a token.
    - Returns cached score if available (< 1h old)
    - Set fresh=true to force re-analysis
    """
    addr = _validate_address(address)

    # Check cache first (unless fresh requested)
    if not fresh:
        cached = get_score(addr)
        if cached:
            # Check if cache is recent (< 1 hour)
            analyzed_at = cached.get("analyzed_at", "")
            if analyzed_at:
                try:
                    analyzed_dt = datetime.fromisoformat(analyzed_at.replace("Z", "+00:00"))
                    age_seconds = (datetime.now(timezone.utc) - analyzed_dt).total_seconds()
                    if age_seconds < 3600:
                        response.headers["X-Cache"] = "HIT"
                        response.headers["Cache-Control"] = "public, max-age=300"
                        return {
                            "data": cached,
                            "cached": True,
                            "cache_age_s": int(age_seconds),
                        }
                except (ValueError, TypeError):
                    pass

    # Run fresh analysis
    try:
        analysis = analyze_token(addr)
    except Exception as e:
        logger.error(f"Analysis failed for {addr}: {e}")
        raise HTTPException(status_code=500, detail="Internal error")

    # Save to DB
    save_score(analysis)

    response.headers["X-Cache"] = "MISS"
    response.headers["Cache-Control"] = "public, max-age=300"
    return {
        "data": analysis,
        "cached": False,
    }


@app.get("/api/v1/token/{address}/liquidity")
def token_liquidity(address: str, response: Response, fresh: bool = Query(False)):
    """Get detailed liquidity breakdown for a token — all pairs with links."""
    addr = _validate_address(address)
    response.headers["Cache-Control"] = "public, max-age=300"

    from db import supabase

    # Try to get from analysis_details JSONB
    row = supabase.table("token_safety_scores").select(
        "analysis_details, total_liquidity_usd, pair_count"
    ).eq("token_address", addr).execute()

    if not row.data:
        raise HTTPException(status_code=404, detail="Token not analyzed yet")

    record = row.data[0]
    raw_details = record.get("analysis_details") or {}
    # analysis_details may be stored as JSON string
    if isinstance(raw_details, str):
        import json as _json
        try:
            raw_details = _json.loads(raw_details)
        except Exception:
            raw_details = {}
    details = raw_details
    lp_data = details.get("lp", {})
    all_pairs = lp_data.get("all_pairs", [])

    # If no pairs stored yet or fresh requested, re-analyze
    if not all_pairs or fresh:
        from lp_analyzer import analyze_lp
        lp_result = analyze_lp(addr)
        all_pairs = lp_result.get("all_pairs", [])
        # Update analysis_details with fresh pair data
        lp_data["all_pairs"] = all_pairs
        lp_data["total_liquidity_usd"] = lp_result.get("total_liquidity_usd", 0)
        lp_data["pair_count"] = lp_result.get("pair_count", 0)
        lp_data["best_pair"] = lp_result.get("best_pair")
        details["lp"] = lp_data
        supabase.table("token_safety_scores").update({
            "analysis_details": json.dumps(details),
            "total_liquidity_usd": lp_result.get("total_liquidity_usd", 0),
            "pair_count": lp_result.get("pair_count", 0),
        }).eq("token_address", addr).execute()

    return {
        "token_address": addr,
        "total_liquidity_usd": lp_data.get("total_liquidity_usd", record.get("total_liquidity_usd", 0)),
        "pair_count": lp_data.get("pair_count", record.get("pair_count", 0)),
        "pairs": all_pairs,
    }


@app.get("/api/v1/tokens/safety/batch")
def batch_safety(request: Request, limit: int = Query(20, ge=1, le=100)):
    """Get recent safety scores for all analyzed tokens."""
    try:
        from db import supabase
        result = supabase.table("token_safety_scores").select(
            "token_address, score, grade, risks, is_honeypot, is_verified, "
            "total_liquidity_usd, holder_count, top10_pct, analyzed_at"
        ).order("total_liquidity_usd", desc=True).limit(limit).execute()

        return {
            "data": result.data or [],
            "count": len(result.data or []),
        }
    except Exception as e:
        logger.error(f"Batch safety query failed: {e}")
        raise HTTPException(status_code=500, detail="Internal error")


# ── Scam Radar ────────────────────────────────────────────────────

@app.get("/api/v1/alerts/recent")
def recent_alerts(request: Request, limit: int = Query(50, ge=1, le=200), alert_type: str = Query(None)):
    """Get recent scam radar alerts."""
    try:
        from db import supabase
        query = supabase.table("scam_radar_alerts").select("*")
        if alert_type:
            query = query.eq("alert_type", alert_type)
        result = query.order("created_at", desc=True).limit(limit).execute()
        return {"data": result.data or [], "count": len(result.data or [])}
    except Exception as e:
        logger.error(f"Recent alerts query failed: {e}")
        raise HTTPException(status_code=500, detail="Internal error")


# ── Deployer Reputation ──────────────────────────────────────────

@app.get("/api/v1/deployer/{address}")
def deployer_reputation(address: str, request: Request, response: Response, fresh: bool = Query(False)):
    """Get deployer reputation score."""
    addr = _validate_address(address)

    if not fresh:
        try:
            from db import supabase
            cached = supabase.table("deployer_reputation").select("*").eq(
                "deployer_address", addr
            ).execute()
            if cached.data:
                response.headers["X-Cache"] = "HIT"
                return {"data": cached.data[0], "cached": True}
        except Exception:
            pass

    # Fresh analysis
    from serial_rugger import calculate_deployer_score
    result = calculate_deployer_score(addr)

    # Save
    try:
        from db import supabase
        import json
        supabase.table("deployer_reputation").upsert({
            "deployer_address": result["deployer"],
            "tokens_deployed": result["tokens_deployed"],
            "tokens_dead": result["tokens_dead"],
            "tokens_alive": result["tokens_alive"],
            "dead_ratio": result["dead_ratio"],
            "reputation_score": result["reputation_score"],
            "risk_level": result["risk_level"],
            "tokens": json.dumps(result["tokens"]),
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="deployer_address").execute()
    except Exception as e:
        logger.warning(f"Failed to cache deployer score: {e}")

    response.headers["X-Cache"] = "MISS"
    return {"data": result, "cached": False}


@app.get("/api/v1/token/{address}/deployer")
def token_deployer(address: str, request: Request, response: Response):
    """Get deployer reputation for a specific token."""
    addr = _validate_address(address)

    from serial_rugger import analyze_deployer_for_token
    result = analyze_deployer_for_token(addr)
    if not result:
        raise HTTPException(status_code=404, detail="Could not determine deployer")

    return {"data": result}


# ── Smart Money ───────────────────────────────────────────────────

@app.get("/api/v1/smart-money/feed")
def smart_money_feed(
    request: Request,
    response: Response,
    hours: int = Query(24, ge=1, le=168),
    min_usd: float = Query(5000, ge=100),
):
    """Smart money feed: top wallets by volume + their recent activity."""
    response.headers["Cache-Control"] = "public, max-age=300"
    from smart_money import build_smart_money_feed
    return build_smart_money_feed(since_hours=hours, min_usd=min_usd)


@app.get("/api/v1/smart-money/swaps")
def smart_money_swaps(
    request: Request,
    response: Response,
    minutes: int = Query(60, ge=5, le=1440),
    min_usd: float = Query(1000, ge=100),
):
    """Recent large swaps across PulseX."""
    response.headers["Cache-Control"] = "public, max-age=60"
    from smart_money import get_recent_large_swaps
    swaps = get_recent_large_swaps(since_minutes=minutes, min_usd=min_usd)
    return {"data": swaps, "count": len(swaps)}


@app.get("/api/v1/wallet/{address}/swaps")
def wallet_swaps(address: str, request: Request, response: Response):
    """Recent swap history for a wallet."""
    addr = _validate_address(address)
    response.headers["Cache-Control"] = "public, max-age=120"
    from smart_money import get_wallet_swap_history
    swaps = get_wallet_swap_history(addr)
    return {"data": swaps, "wallet": addr, "count": len(swaps)}


@app.get("/api/v1/wallet/{address}/balances")
def wallet_balances(address: str, request: Request, response: Response):
    """Current token balances for a wallet."""
    addr = _validate_address(address)
    response.headers["Cache-Control"] = "public, max-age=120"
    from smart_money import get_wallet_token_balances
    balances = get_wallet_token_balances(addr)
    return {"data": balances, "wallet": addr, "count": len(balances)}


# ── Bridge stats ──

@app.get("/api/v1/bridge/stats")
def bridge_stats(response: Response):
    """Bridge daily stats for the last 7 days."""
    response.headers["Cache-Control"] = "public, max-age=300"
    from db import supabase
    from datetime import timedelta
    since = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
    result = supabase.table("bridge_daily_stats") \
        .select("date,deposit_count,withdrawal_count,deposit_volume_usd,withdrawal_volume_usd,net_flow_usd") \
        .gte("date", since) \
        .order("date", desc=True) \
        .execute()
    return {"data": result.data or [], "count": len(result.data or [])}


# ── Holder Leagues ───────────────────────────────────────────────

@app.get("/api/v1/leagues")
def holder_leagues(response: Response):
    """Current holder league counts for all tracked tokens."""
    response.headers["Cache-Control"] = "public, max-age=600"
    from db import supabase
    result = supabase.table("holder_league_current").select("*").execute()
    return {"data": result.data or [], "count": len(result.data or [])}


@app.get("/api/v1/leagues/rank/{address}")
def holder_rank(address: str, response: Response):
    """Get holder rank for a wallet address across all league tokens (PLS, PLSX, pHEX, INC)."""
    if not re.match(r"^0x[0-9a-fA-F]{40}$", address):
        raise HTTPException(status_code=400, detail="Invalid address")
    response.headers["Cache-Control"] = "public, max-age=300"
    from db import supabase
    addr = address.lower()
    ranks = {}
    for sym in ("PLS", "PLSX", "pHEX", "INC"):
        # Find the holder's entry
        entry = supabase.table("holder_league_addresses").select("balance_pct,tier") \
            .eq("token_symbol", sym).eq("holder_address", addr).execute()
        if not entry.data:
            continue
        holder = entry.data[0]
        # Count how many holders have a higher balance_pct = rank
        count_above = supabase.table("holder_league_addresses").select("holder_address", count="exact") \
            .eq("token_symbol", sym).gt("balance_pct", holder["balance_pct"]).execute()
        # Get total holders from current table
        total = supabase.table("holder_league_current").select("total_holders") \
            .eq("token_symbol", sym).execute()
        total_holders = total.data[0]["total_holders"] if total.data else 0
        rank = (count_above.count or 0) + 1
        ranks[sym] = {
            "rank": rank,
            "total_holders": total_holders,
            "tier": holder["tier"],
            "balance_pct": holder["balance_pct"],
        }
    return {"address": addr, "ranks": ranks}


@app.get("/api/v1/leagues/{symbol}")
def holder_league_detail(symbol: str, response: Response):
    """Current holder league for a specific token."""
    sym = symbol.upper()
    if sym == "PHEX":
        sym = "pHEX"
    if sym not in ("PLS", "PLSX", "pHEX", "INC"):
        raise HTTPException(status_code=400, detail="Invalid token symbol")
    response.headers["Cache-Control"] = "public, max-age=600"
    from db import supabase
    result = supabase.table("holder_league_current").select("*").eq("token_symbol", sym).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="No data yet")
    return {"data": result.data[0]}


@app.get("/api/v1/leagues/{symbol}/holders")
def league_holders(symbol: str, response: Response, tier: str = Query(None)):
    """Individual holders for a token, optionally filtered by tier."""
    sym = symbol.upper()
    if sym == "PHEX":
        sym = "pHEX"
    if sym not in ("PLS", "PLSX", "pHEX", "INC"):
        raise HTTPException(status_code=400, detail="Invalid token symbol")
    response.headers["Cache-Control"] = "public, max-age=600"
    from db import supabase
    query = supabase.table("holder_league_addresses").select("*").eq("token_symbol", sym)
    if tier:
        valid_tiers = ("poseidon", "whale", "shark", "dolphin", "squid", "turtle")
        if tier not in valid_tiers:
            raise HTTPException(status_code=400, detail="Invalid tier")
        query = query.eq("tier", tier)
    result = query.order("balance_pct", desc=True).limit(500).execute()
    return {"data": result.data or [], "count": len(result.data or [])}


@app.get("/api/v1/leagues/{symbol}/families")
def league_families(symbol: str, response: Response, tier: str = Query(None)):
    """Family clusters for a token, optionally filtered by combined tier."""
    sym = symbol.upper()
    if sym == "PHEX":
        sym = "pHEX"
    if sym not in ("PLS", "PLSX", "pHEX", "INC"):
        raise HTTPException(status_code=400, detail="Invalid token symbol")
    response.headers["Cache-Control"] = "public, max-age=600"
    from db import supabase
    query = supabase.table("holder_league_families").select("*").eq("token_symbol", sym)
    if tier:
        query = query.eq("combined_tier", tier)
    result = query.order("combined_balance_pct", desc=True).limit(100).execute()
    return {"data": result.data or [], "count": len(result.data or [])}


@app.get("/api/v1/leagues/{symbol}/families/{family_id}/members")
def family_members(symbol: str, family_id: str, response: Response):
    """All members of a specific family for a token."""
    sym = symbol.upper()
    if sym == "PHEX":
        sym = "pHEX"
    if sym not in ("PLS", "PLSX", "pHEX", "INC"):
        raise HTTPException(status_code=400, detail="Invalid token symbol")
    if not re.match(r"^0x[0-9a-fA-F]{40}$", family_id):
        raise HTTPException(status_code=400, detail="Invalid address")
    response.headers["Cache-Control"] = "public, max-age=600"
    from db import supabase
    result = supabase.table("holder_league_addresses").select("*") \
        .eq("token_symbol", sym).eq("family_id", family_id.lower()) \
        .order("balance_pct", desc=True).execute()
    return {"data": result.data or [], "count": len(result.data or [])}


@app.get("/api/v1/leagues/{symbol}/history")
def holder_league_history(symbol: str, response: Response, days: int = Query(30, ge=1, le=365)):
    """Historical holder league data for trend charts."""
    sym = symbol.upper()
    if sym == "PHEX":
        sym = "pHEX"
    if sym not in ("PLS", "PLSX", "pHEX", "INC"):
        raise HTTPException(status_code=400, detail="Invalid token symbol")
    response.headers["Cache-Control"] = "public, max-age=1800"
    from db import supabase
    from datetime import timedelta
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    result = supabase.table("holder_league_snapshots") \
        .select("token_symbol,total_holders,poseidon_count,whale_count,shark_count,dolphin_count,squid_count,turtle_count,scraped_at") \
        .eq("token_symbol", sym) \
        .gte("scraped_at", since) \
        .order("scraped_at", desc=False) \
        .execute()
    return {"data": result.data or [], "count": len(result.data or [])}


# ── Cron endpoints (called by Railway cron or external scheduler) ──

CRON_SECRET = os.environ.get("CRON_SECRET", "")


def _check_cron_secret(secret: str = "", request: Request = None):
    """Validate cron secret. Timing-safe comparison."""
    if not CRON_SECRET:
        raise HTTPException(status_code=403, detail="CRON_SECRET not configured")
    # Support both query param and Authorization header
    token = secret
    if not token and request:
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not secrets.compare_digest(token, CRON_SECRET):
        raise HTTPException(status_code=403, detail="Unauthorized")


@app.get("/cron/radar")
def cron_radar(request: Request, secret: str = Query("")):
    """Run scam radar scan. Protected by CRON_SECRET."""
    _check_cron_secret(secret, request)

    from scam_radar import run_scan, save_alerts
    from db import supabase

    alerts = run_scan(since_minutes=30)
    saved = 0
    if alerts:
        saved = save_alerts(alerts, supabase)
    return {"alerts_found": len(alerts), "alerts_saved": saved}


# ── Funding tree ─────────────────────────────────────────

import requests as http_req

SCAN_API_V2 = "https://api.scan.pulsechain.com/api/v2"

# Known bridge / system contracts on PulseChain
KNOWN_LABELS: dict[str, str] = {
    "0x1715a3e4a142d8b698131108995174f37aeba10d": "PulseChain Bridge",
    "0x0000000000000000000000000000000000000000": "Null (Mint)",
}


def _fetch_incoming_txs(addr: str, limit: int = 50) -> list[dict]:
    """Fetch incoming transactions for an address from PulseChain Scan API v2."""
    try:
        resp = http_req.get(
            f"{SCAN_API_V2}/addresses/{addr}/transactions",
            params={"filter": "to"},
            timeout=12,
        )
        if resp.status_code != 200:
            return []
        items = resp.json().get("items", [])[:limit]
        return items
    except Exception:
        return []


def _fetch_address_info(addr: str) -> dict:
    """Fetch address metadata (name, is_contract) from Scan API."""
    try:
        resp = http_req.get(f"{SCAN_API_V2}/addresses/{addr}", timeout=8)
        if resp.status_code != 200:
            return {}
        return resp.json()
    except Exception:
        return {}


def _build_funders(addr: str, max_funders: int = 10) -> list[dict]:
    """Group incoming transactions by sender, return top funders."""
    items = _fetch_incoming_txs(addr)
    senders: dict[str, dict] = {}

    for tx in items:
        from_info = tx.get("from") or {}
        sender = (from_info.get("hash") or "").lower()
        if not sender or sender == addr:
            continue

        value_wei = int(tx.get("value") or "0")
        value_pls = value_wei / 1e18

        if sender not in senders:
            senders[sender] = {
                "address": sender,
                "total_pls": 0,
                "tx_count": 0,
                "is_contract": from_info.get("is_contract", False),
                "label": KNOWN_LABELS.get(sender) or from_info.get("name"),
                "first_tx": tx.get("timestamp"),
            }
        senders[sender]["total_pls"] += value_pls
        senders[sender]["tx_count"] += 1

    result = sorted(senders.values(), key=lambda x: x["total_pls"], reverse=True)
    return result[:max_funders]


@app.get("/api/v1/address/{address}/funding-tree")
def address_funding_tree(address: str, response: Response):
    """Trace funding sources of an address (2 levels deep).
    Returns: target info + funders (each with optional sub-funders)."""
    if not ADDRESS_RE.match(address):
        raise HTTPException(status_code=400, detail="Invalid address")

    addr = address.lower()
    response.headers["Cache-Control"] = "public, max-age=3600"

    # Get target address info
    target_info = _fetch_address_info(addr)

    # Level 1: direct funders
    funders = _build_funders(addr, max_funders=10)

    # Level 2: for the top 5 non-contract funders, trace their funders
    for f in funders[:5]:
        if not f["is_contract"] and f["total_pls"] > 0:
            f["funders"] = _build_funders(f["address"], max_funders=5)
        else:
            f["funders"] = []

    # Also check whale_links for known relationships
    from db import supabase
    links_out = supabase.table("whale_links").select("*") \
        .eq("address_from", addr).limit(20).execute()
    links_in = supabase.table("whale_links").select("*") \
        .eq("address_to", addr).limit(20).execute()

    return {
        "target": addr,
        "target_name": target_info.get("name"),
        "target_is_contract": target_info.get("is_contract", False),
        "funders": funders,
        "whale_links": (links_out.data or []) + (links_in.data or []),
    }


@app.get("/cron/leagues")
def cron_leagues(request: Request, secret: str = Query("")):
    """Run holder leagues scraper. Protected by CRON_SECRET."""
    _check_cron_secret(secret, request)
    import threading
    from holder_leagues import run_holder_leagues
    t = threading.Thread(target=run_holder_leagues, daemon=True)
    t.start()
    return {"status": "started"}


@app.get("/cron/batch")
def cron_batch(request: Request, secret: str = Query(""), limit: int = Query(100, ge=1, le=1000)):
    """Run batch token safety analysis. Protected by CRON_SECRET."""
    _check_cron_secret(secret, request)

    import threading

    def _run():
        run_batch(max_tokens=limit)

    # Run in background thread to avoid timeout
    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return {"status": "started", "max_tokens": limit}


@app.get("/cron/lp-monitor")
def cron_lp_monitor(request: Request, secret: str = Query(""), limit: int = Query(200, ge=1, le=500)):
    """Force LP liquidity re-check for top tokens. Fixes inflated values."""
    _check_cron_secret(secret, request)
    import threading
    t = threading.Thread(target=_run_lp_monitor, args=(limit,), daemon=True)
    t.start()
    return {"status": "started", "limit": limit}


# ── LP Liquidity Monitor ─────────────────────────────────────────

def _run_lp_monitor(limit: int = 50):
    """Re-check liquidity for top tokens by total_liquidity_usd.
    Updates all_pairs, pair_count, total_liquidity_usd in Supabase."""
    from lp_analyzer import analyze_lp
    from db import supabase

    logger.info(f"[LP Monitor] Starting liquidity check for top {limit} tokens...")

    # Get top tokens by liquidity
    rows = supabase.table("token_safety_scores").select(
        "token_address, total_liquidity_usd, analysis_details"
    ).order("total_liquidity_usd", desc=True).limit(limit).execute()

    updated = 0
    skipped = 0
    for row in (rows.data or []):
        addr = row["token_address"]
        try:
            lp = analyze_lp(addr)
            new_liq = lp.get("total_liquidity_usd", 0)
            old_liq = float(row.get("total_liquidity_usd", 0) or 0)

            # Safety: if subgraph returned 0 but old value was reasonable (<$50M),
            # it's likely a transient error — skip to avoid erasing valid data.
            # Only overwrite with 0 if old value was clearly inflated (>$50M).
            if new_liq == 0 and 0 < old_liq <= 50_000_000:
                logger.info(f"[LP Monitor] Skipping {addr[:12]}... — subgraph returned $0 but old=${old_liq:,.0f} looks valid")
                skipped += 1
                continue

            raw = row.get("analysis_details") or {}
            if isinstance(raw, str):
                import json as _json
                try:
                    raw = _json.loads(raw)
                except Exception:
                    raw = {}
            details = raw
            lp_section = details.get("lp", {})
            lp_section["all_pairs"] = lp.get("all_pairs", [])
            lp_section["total_liquidity_usd"] = new_liq
            lp_section["pair_count"] = lp.get("pair_count", 0)
            lp_section["best_pair"] = lp.get("best_pair")
            lp_section["recent_burns_24h"] = len(lp.get("recent_burns", []))
            lp_section["recent_mints_24h"] = len(lp.get("recent_mints", []))
            details["lp"] = lp_section

            supabase.table("token_safety_scores").update({
                "total_liquidity_usd": new_liq,
                "pair_count": lp.get("pair_count", 0),
                "analysis_details": json.dumps(details),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("token_address", addr).execute()
            updated += 1

            time.sleep(2)  # Rate limit
        except Exception as e:
            logger.warning(f"[LP Monitor] Error for {addr}: {e}")

    logger.info(f"[LP Monitor] Done: {updated} updated, {skipped} skipped (transient $0) out of {len(rows.data or [])}")


# ── Batch progress tracking ───────────────────────────────────────

_batch_progress = {
    "running": False,
    "total": 0,
    "analyzed": 0,
    "errors": 0,
    "started_at": None,
    "finished_at": None,
}


@app.get("/cron/batch/status")
def batch_status():
    """Return current batch progress."""
    p = _batch_progress
    pct = round(p["analyzed"] / max(p["total"], 1) * 100, 1)
    elapsed = 0
    eta_s = None
    if p["started_at"]:
        elapsed = round(time.time() - p["started_at"], 1)
        if p["analyzed"] > 0 and p["running"]:
            per_token = elapsed / p["analyzed"]
            remaining = p["total"] - p["analyzed"] - p["errors"]
            eta_s = round(per_token * remaining)
    return {
        "running": p["running"],
        "total": p["total"],
        "analyzed": p["analyzed"],
        "errors": p["errors"],
        "percent": pct,
        "elapsed_s": elapsed,
        "eta_s": eta_s,
        "started_at": datetime.fromtimestamp(p["started_at"], tz=timezone.utc).isoformat() if p["started_at"] else None,
        "finished_at": datetime.fromtimestamp(p["finished_at"], tz=timezone.utc).isoformat() if p["finished_at"] else None,
    }


# ── Batch mode ────────────────────────────────────────────────────

def run_batch(max_tokens: int = 1000):
    """Analyze all active tokens (for cron job)."""
    global _batch_progress
    logger.info("Starting batch token safety analysis...")
    tokens = get_all_tokens_to_analyze()
    tokens = tokens[:max_tokens]
    logger.info(f"Found {len(tokens)} tokens to analyze (limit={max_tokens})")

    _batch_progress = {
        "running": True,
        "total": len(tokens),
        "analyzed": 0,
        "errors": 0,
        "started_at": time.time(),
        "finished_at": None,
    }

    analyzed = 0
    errors = 0

    for addr in tokens:
        try:
            analysis = analyze_token(addr)
            save_score(analysis)
            analyzed += 1
            _batch_progress["analyzed"] = analyzed

            # Rate limit: 1 token per 2 seconds to avoid hammering APIs
            time.sleep(2)

        except Exception as e:
            logger.error(f"Failed to analyze {addr}: {e}")
            errors += 1
            _batch_progress["errors"] = errors

        if analyzed % 50 == 0:
            logger.info(f"Progress: {analyzed}/{len(tokens)} analyzed, {errors} errors")

    _batch_progress["running"] = False
    _batch_progress["finished_at"] = time.time()
    logger.info(f"Batch complete: {analyzed} analyzed, {errors} errors out of {len(tokens)} tokens")


# ── Main ──────────────────────────────────────────────────────────

def run_scam_radar():
    """Run scam radar scan (for cron job)."""
    from scam_radar import run_scan, save_alerts
    from db import supabase

    logger.info("Running Scam Radar scan...")
    alerts = run_scan(since_minutes=30)
    if alerts:
        saved = save_alerts(alerts, supabase)
        logger.info(f"Scam Radar: {len(alerts)} alerts found, {saved} saved")
    else:
        logger.info("Scam Radar: No alerts")


if __name__ == "__main__":
    mode = os.environ.get("MODE", "server")

    if mode == "batch":
        run_batch()
    elif mode == "radar":
        run_scam_radar()
    elif mode == "all":
        # Run both batch analysis and radar scan
        run_scam_radar()
        run_batch()
    else:
        port = int(os.environ.get("PORT", 8080))
        logger.info(f"Starting Token Safety API on port {port}")
        uvicorn.run(app, host="0.0.0.0", port=port)
