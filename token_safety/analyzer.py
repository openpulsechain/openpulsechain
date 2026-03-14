"""
Main token safety analyzer — orchestrates all checks and produces final score.
"""

import logging
import time
from datetime import datetime, timezone

from honeypot_checker import check_honeypot
from contract_analyzer import analyze_contract
from lp_analyzer import analyze_lp
from holder_analyzer import analyze_holders
from scorer import calculate_score

logger = logging.getLogger(__name__)


def analyze_token(token_address: str) -> dict:
    """
    Run full safety analysis on a token.
    Returns complete analysis with score, risks, and detailed breakdown.
    """
    addr = token_address.lower()
    start = time.time()

    logger.info(f"Analyzing token: {addr}")

    # Run all 4 analyses
    honeypot = check_honeypot(addr)
    logger.info(f"  Honeypot check done: is_honeypot={honeypot.get('is_honeypot')}")

    contract = analyze_contract(addr)
    logger.info(f"  Contract analysis done: verified={contract.get('is_verified')}, dangers={contract.get('dangers')}")

    lp = analyze_lp(addr)
    logger.info(f"  LP analysis done: has_lp={lp.get('has_lp')}, liquidity=${lp.get('total_liquidity_usd', 0):,.0f}")

    holders = analyze_holders(addr)
    logger.info(f"  Holder analysis done: count={holders.get('holder_count')}, top10={holders.get('top10_pct')}%")

    # Calculate composite score
    score_result = calculate_score(honeypot, contract, lp, holders)

    elapsed = round(time.time() - start, 2)
    logger.info(f"  Score: {score_result['score']}/100 (grade {score_result['grade']}) in {elapsed}s")

    return {
        "address": addr,
        "score": score_result["score"],
        "grade": score_result["grade"],
        "risks": score_result["risks"],
        "honeypot": {
            "score": score_result["honeypot_score"],
            "is_honeypot": honeypot.get("is_honeypot"),
            "buy_tax_pct": honeypot.get("buy_tax_pct"),
            "sell_tax_pct": honeypot.get("sell_tax_pct"),
            "transfer_tax_pct": honeypot.get("transfer_tax_pct"),
            "buy_gas": honeypot.get("buy_gas"),
            "sell_gas": honeypot.get("sell_gas"),
            "max_tx_amount": honeypot.get("max_tx_amount"),
            "max_wallet_amount": honeypot.get("max_wallet_amount"),
            "dynamic_tax": honeypot.get("dynamic_tax", False),
            "tax_by_amount": honeypot.get("tax_by_amount"),
            "flags": honeypot.get("flags", []),
            "router": honeypot.get("router"),
            "error": honeypot.get("error"),
        },
        "contract": {
            "score": score_result["contract_score"],
            "is_verified": contract.get("is_verified"),
            "is_proxy": contract.get("is_proxy"),
            "ownership_renounced": contract.get("ownership_renounced"),
            "has_mint": contract.get("has_mint"),
            "has_pause": contract.get("has_pause"),
            "has_blacklist": contract.get("has_blacklist"),
            "has_variable_fee": contract.get("has_variable_fee"),
            "dangers": contract.get("dangers", []),
        },
        "lp": {
            "score": score_result["lp_score"],
            "has_lp": lp.get("has_lp"),
            "total_liquidity_usd": lp.get("total_liquidity_usd"),
            "pair_count": lp.get("pair_count"),
            "best_pair": lp.get("best_pair"),
            "all_pairs": lp.get("all_pairs", []),
            "recent_burns_24h": len(lp.get("recent_burns", [])),
            "recent_mints_24h": len(lp.get("recent_mints", [])),
        },
        "holders": {
            "score": score_result["holders_score"],
            "holder_count": holders.get("holder_count"),
            "top10_pct": holders.get("top10_pct"),
            "top1_pct": holders.get("top1_pct"),
            "top_holders": holders.get("top_holders", [])[:5],
        },
        "age": score_result["details"].get("age", {}),
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
        "analysis_time_s": elapsed,
    }
