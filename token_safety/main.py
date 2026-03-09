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
BATCH_LIMIT = int(os.environ.get("BATCH_LIMIT", "200"))
ENABLE_SCHEDULER = os.environ.get("ENABLE_SCHEDULER", "true").lower() == "true"


async def _scheduler_loop():
    """Background scheduler: runs radar every 30min, batch every 12h."""
    await asyncio.sleep(30)  # Wait 30s after startup before first run
    logger.info(f"Scheduler started: radar every {RADAR_INTERVAL_MIN}min, batch every {BATCH_INTERVAL_HOURS}h")

    radar_interval = RADAR_INTERVAL_MIN * 60
    batch_interval = BATCH_INTERVAL_HOURS * 3600
    last_radar = 0
    last_batch = 0

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
    allow_origins=["*"],
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
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)[:200]}")

    # Save to DB
    save_score(analysis)

    response.headers["X-Cache"] = "MISS"
    response.headers["Cache-Control"] = "public, max-age=300"
    return {
        "data": analysis,
        "cached": False,
    }


@app.get("/api/v1/tokens/safety/batch")
def batch_safety(request: Request, limit: int = Query(20, ge=1, le=100)):
    """Get recent safety scores for all analyzed tokens."""
    try:
        from db import supabase
        result = supabase.table("token_safety_scores").select(
            "token_address, score, grade, risks, is_honeypot, is_verified, "
            "total_liquidity_usd, holder_count, top10_pct, analyzed_at"
        ).order("analyzed_at", desc=True).limit(limit).execute()

        return {
            "data": result.data or [],
            "count": len(result.data or []),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:200])


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
        raise HTTPException(status_code=500, detail=str(e)[:200])


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


# ── Cron endpoints (called by Railway cron or external scheduler) ──

CRON_SECRET = os.environ.get("CRON_SECRET", "")


def _check_cron_secret(secret: str):
    """Validate cron secret. Blocks access if CRON_SECRET is not configured."""
    if not CRON_SECRET:
        raise HTTPException(status_code=403, detail="CRON_SECRET not configured")
    if secret != CRON_SECRET:
        raise HTTPException(status_code=403, detail="Invalid secret")


@app.get("/cron/radar")
def cron_radar(request: Request, secret: str = Query("")):
    """Run scam radar scan. Protected by CRON_SECRET."""
    _check_cron_secret(secret)

    from scam_radar import run_scan, save_alerts
    from db import supabase

    alerts = run_scan(since_minutes=30)
    saved = 0
    if alerts:
        saved = save_alerts(alerts, supabase)
    return {"alerts_found": len(alerts), "alerts_saved": saved}


@app.get("/cron/batch")
def cron_batch(request: Request, secret: str = Query(""), limit: int = Query(100, ge=1, le=1000)):
    """Run batch token safety analysis. Protected by CRON_SECRET."""
    _check_cron_secret(secret)

    import threading

    def _run():
        run_batch(max_tokens=limit)

    # Run in background thread to avoid timeout
    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return {"status": "started", "max_tokens": limit}


# ── Batch mode ────────────────────────────────────────────────────

def run_batch(max_tokens: int = 1000):
    """Analyze all active tokens (for cron job)."""
    logger.info("Starting batch token safety analysis...")
    tokens = get_all_tokens_to_analyze()
    tokens = tokens[:max_tokens]
    logger.info(f"Found {len(tokens)} tokens to analyze (limit={max_tokens})")

    analyzed = 0
    errors = 0

    for addr in tokens:
        try:
            analysis = analyze_token(addr)
            save_score(analysis)
            analyzed += 1

            # Rate limit: 1 token per 2 seconds to avoid hammering APIs
            time.sleep(2)

        except Exception as e:
            logger.error(f"Failed to analyze {addr}: {e}")
            errors += 1

        if analyzed % 50 == 0:
            logger.info(f"Progress: {analyzed}/{len(tokens)} analyzed, {errors} errors")

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
