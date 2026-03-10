"""
Token Safety Score calculator.
Combines all analyses into a 0-100 score.

Weights:
- Honeypot simulation: 30 pts
- Contract analysis: 25 pts
- LP analysis: 20 pts
- Holder concentration: 15 pts
- Age & activity: 10 pts
"""

import logging
from config import (
    WEIGHT_HONEYPOT, WEIGHT_CONTRACT, WEIGHT_LP, WEIGHT_HOLDERS, WEIGHT_AGE,
    HOLDER_CONCENTRATION_DANGER, HOLDER_CONCENTRATION_WARNING,
    MIN_HOLDERS_FOR_SAFETY, MIN_TOKEN_AGE_DAYS
)

logger = logging.getLogger(__name__)


def calculate_score(
    honeypot: dict,
    contract: dict,
    lp: dict,
    holders: dict,
) -> dict:
    """
    Calculate composite safety score 0-100.
    Returns:
        {
            "score": int (0-100),
            "grade": str (A/B/C/D/F),
            "honeypot_score": int,
            "contract_score": int,
            "lp_score": int,
            "holders_score": int,
            "age_score": int,
            "risks": list[str],
            "details": dict,
        }
    """
    risks = []
    details = {}

    # ── 1. Honeypot Score (0-30) ──────────────────────────────────
    hp_score = WEIGHT_HONEYPOT

    if honeypot.get("is_honeypot") is True:
        hp_score = 0
        risks.append("HONEYPOT: Token cannot be sold")
    elif honeypot.get("is_honeypot") is None:
        hp_score = WEIGHT_HONEYPOT // 3  # Unknown = partial penalty
        risks.append("Honeypot check inconclusive")
    else:
        # Deduct for taxes
        buy_tax = honeypot.get("buy_tax_pct") or 0
        sell_tax = honeypot.get("sell_tax_pct") or 0

        if sell_tax > 50:
            hp_score = 2
            risks.append(f"Extreme sell tax: {sell_tax}%")
        elif sell_tax > 20:
            hp_score = WEIGHT_HONEYPOT // 3
            risks.append(f"High sell tax: {sell_tax}%")
        elif sell_tax > 10:
            hp_score = WEIGHT_HONEYPOT * 2 // 3
            risks.append(f"Moderate sell tax: {sell_tax}%")
        elif sell_tax > 5:
            hp_score -= 5

        if buy_tax > 20:
            hp_score = max(0, hp_score - 10)
            risks.append(f"High buy tax: {buy_tax}%")
        elif buy_tax > 10:
            hp_score = max(0, hp_score - 5)
            risks.append(f"Moderate buy tax: {buy_tax}%")

    details["honeypot"] = {
        "score": hp_score,
        "max": WEIGHT_HONEYPOT,
        "is_honeypot": honeypot.get("is_honeypot"),
        "buy_tax": honeypot.get("buy_tax_pct"),
        "sell_tax": honeypot.get("sell_tax_pct"),
    }

    # ── 2. Contract Score (0-25) ──────────────────────────────────
    ct_score = WEIGHT_CONTRACT

    if contract.get("error") and "Not a contract" in str(contract.get("error", "")):
        ct_score = 0
        risks.append("Not a smart contract")
    else:
        if not contract.get("is_verified"):
            ct_score -= 10
            risks.append("Contract not verified on explorer")

        if contract.get("is_proxy"):
            ct_score -= 8
            risks.append("Proxy/upgradeable contract")

        if contract.get("has_mint") and not contract.get("ownership_renounced"):
            ct_score -= 8
            risks.append("Owner can mint new tokens")

        if contract.get("has_blacklist"):
            ct_score -= 5
            risks.append("Has blacklist function")

        if contract.get("has_pause"):
            ct_score -= 5
            risks.append("Has pause function")

        if contract.get("has_variable_fee"):
            ct_score -= 4
            risks.append("Has variable fee/tax")

        if contract.get("has_selfdestruct"):
            ct_score -= 8
            risks.append("Has selfdestruct")

        if contract.get("ownership_renounced"):
            ct_score = min(ct_score + 5, WEIGHT_CONTRACT)
            # This is a positive signal, reduce risk

    ct_score = max(0, ct_score)
    details["contract"] = {
        "score": ct_score,
        "max": WEIGHT_CONTRACT,
        "verified": contract.get("is_verified"),
        "proxy": contract.get("is_proxy"),
        "ownership_renounced": contract.get("ownership_renounced"),
        "dangers": contract.get("dangers", []),
    }

    # ── 3. LP Score (0-20) ────────────────────────────────────────
    lp_score = 0

    if not lp.get("has_lp"):
        lp_score = 0
        risks.append("No liquidity pool found")
    else:
        liq = lp.get("total_liquidity_usd", 0)
        if liq >= 1_000_000:
            lp_score = WEIGHT_LP  # $1M+ = full score
        elif liq >= 500_000:
            lp_score = WEIGHT_LP - 1
        elif liq >= 100_000:
            lp_score = WEIGHT_LP - 2
        elif liq >= 50_000:
            lp_score = WEIGHT_LP * 4 // 5
        elif liq >= 10_000:
            lp_score = WEIGHT_LP * 3 // 5
        elif liq >= 1_000:
            lp_score = WEIGHT_LP * 2 // 5
            risks.append(f"Low liquidity: ${liq:,.0f}")
        else:
            lp_score = WEIGHT_LP // 5
            risks.append(f"Very low liquidity: ${liq:,.0f}")

        # Recent burns (LP removals) = danger signal
        # Only penalize if liquidity is < $1M (for large tokens, LP moves are normal)
        burns = lp.get("recent_burns", [])
        if burns and liq < 1_000_000:
            if len(burns) >= 3:
                lp_score = max(0, lp_score - 8)
                risks.append(f"{len(burns)} LP removals in last 24h")
            elif len(burns) >= 1:
                lp_score = max(0, lp_score - 3)
                risks.append(f"{len(burns)} LP removal in last 24h")

    details["lp"] = {
        "score": lp_score,
        "max": WEIGHT_LP,
        "has_lp": lp.get("has_lp"),
        "liquidity_usd": lp.get("total_liquidity_usd"),
        "pair_count": lp.get("pair_count"),
        "recent_burns_24h": len(lp.get("recent_burns", [])),
    }

    # ── 4. Holder Score (0-15) ────────────────────────────────────
    hl_score = WEIGHT_HOLDERS
    holder_count = holders.get("holder_count", 0)
    top10_pct = holders.get("top10_pct", 100)

    if holder_count < 10:
        hl_score = 0
        risks.append(f"Very few holders: {holder_count}")
    elif holder_count < MIN_HOLDERS_FOR_SAFETY:
        hl_score = WEIGHT_HOLDERS // 3
        risks.append(f"Low holder count: {holder_count}")

    if top10_pct > HOLDER_CONCENTRATION_DANGER:
        hl_score = max(0, hl_score - 10)
        risks.append(f"Top 10 holders own {top10_pct:.1f}% of supply")
    elif top10_pct > HOLDER_CONCENTRATION_WARNING:
        hl_score = max(0, hl_score - 5)
        risks.append(f"Top 10 holders own {top10_pct:.1f}%")

    top1 = holders.get("top1_pct", 0)
    if top1 > 30:
        hl_score = max(0, hl_score - 5)
        risks.append(f"Single holder owns {top1:.1f}%")

    details["holders"] = {
        "score": hl_score,
        "max": WEIGHT_HOLDERS,
        "count": holder_count,
        "top10_pct": top10_pct,
        "top1_pct": top1,
    }

    # ── 5. Age & Activity Score (0-10) ────────────────────────────
    age_score = 0
    best_pair = lp.get("best_pair") or {}
    age_days = best_pair.get("age_days", 0)
    txns = best_pair.get("total_txns", 0)

    if age_days >= 90:
        age_score = WEIGHT_AGE
    elif age_days >= 30:
        age_score = WEIGHT_AGE * 3 // 4
    elif age_days >= MIN_TOKEN_AGE_DAYS:
        age_score = WEIGHT_AGE // 2
    elif age_days >= 1:
        age_score = WEIGHT_AGE // 4
        risks.append(f"Very new token: {age_days:.0f} days old")
    else:
        age_score = 0
        risks.append("Token created less than 24h ago")

    if txns < 10:
        age_score = max(0, age_score - 3)
        risks.append(f"Very low activity: {txns} transactions")

    details["age"] = {
        "score": age_score,
        "max": WEIGHT_AGE,
        "age_days": age_days,
        "transactions": txns,
    }

    # ── Total Score ───────────────────────────────────────────────
    total = hp_score + ct_score + lp_score + hl_score + age_score
    total = max(0, min(100, total))

    # Grade
    if total >= 80:
        grade = "A"
    elif total >= 60:
        grade = "B"
    elif total >= 40:
        grade = "C"
    elif total >= 20:
        grade = "D"
    else:
        grade = "F"

    return {
        "score": total,
        "grade": grade,
        "honeypot_score": hp_score,
        "contract_score": ct_score,
        "lp_score": lp_score,
        "holders_score": hl_score,
        "age_score": age_score,
        "risks": risks,
        "details": details,
    }
