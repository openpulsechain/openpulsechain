"""Database operations for token safety scores."""

import json
import logging
from supabase import create_client
from config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

logger = logging.getLogger(__name__)

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def save_score(analysis: dict) -> bool:
    """Save or update a token safety score in Supabase."""
    try:
        row = {
            "token_address": analysis["address"],
            "score": analysis["score"],
            "grade": analysis["grade"],
            "risks": analysis["risks"],
            "honeypot_score": analysis["honeypot"]["score"],
            "is_honeypot": analysis["honeypot"]["is_honeypot"],
            "buy_tax_pct": analysis["honeypot"]["buy_tax_pct"],
            "sell_tax_pct": analysis["honeypot"]["sell_tax_pct"],
            "contract_score": analysis["contract"]["score"],
            "is_verified": analysis["contract"]["is_verified"],
            "is_proxy": analysis["contract"]["is_proxy"],
            "ownership_renounced": analysis["contract"]["ownership_renounced"],
            "has_mint": analysis["contract"]["has_mint"],
            "has_blacklist": analysis["contract"]["has_blacklist"],
            "contract_dangers": analysis["contract"]["dangers"],
            "lp_score": analysis["lp"]["score"],
            "has_lp": analysis["lp"]["has_lp"],
            "total_liquidity_usd": analysis["lp"]["total_liquidity_usd"],
            "pair_count": analysis["lp"]["pair_count"],
            "recent_burns_24h": analysis["lp"]["recent_burns_24h"],
            "holders_score": analysis["holders"]["score"],
            "holder_count": analysis["holders"]["holder_count"],
            "top10_pct": analysis["holders"]["top10_pct"],
            "top1_pct": analysis["holders"]["top1_pct"],
            "age_score": analysis["age"].get("score", 0),
            "age_days": analysis["age"].get("age_days", 0),
            "analysis_details": json.dumps({
                "honeypot": analysis["honeypot"],
                "contract": analysis["contract"],
                "lp": analysis["lp"],
                "holders": analysis["holders"],
                "age": analysis["age"],
            }),
            "analyzed_at": analysis["analyzed_at"],
        }

        # Upsert (insert or update on conflict)
        supabase.table("token_safety_scores").upsert(
            row,
            on_conflict="token_address"
        ).execute()

        logger.info(f"Saved score for {analysis['address']}: {analysis['score']}/100")
        return True

    except Exception as e:
        logger.error(f"Failed to save score for {analysis['address']}: {e}")
        return False


def get_score(token_address: str) -> dict | None:
    """Get cached safety score for a token."""
    try:
        result = supabase.table("token_safety_scores").select("*").eq(
            "token_address", token_address.lower()
        ).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        logger.error(f"Failed to get score for {token_address}: {e}")
        return None


def get_all_tokens_to_analyze() -> list[str]:
    """Get list of active token addresses to analyze."""
    try:
        result = supabase.table("pulsechain_tokens").select("address").eq(
            "is_active", True
        ).execute()
        return [r["address"] for r in (result.data or [])]
    except Exception as e:
        logger.error(f"Failed to get token list: {e}")
        return []
