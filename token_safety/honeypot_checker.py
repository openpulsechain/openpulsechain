"""
Honeypot detection via FeeChecker contract on PulseChain.
Simulates buy+sell and checks if token can be sold.
"""

import logging
from web3 import Web3
from config import RPC_URL, FEE_CHECKER_CONTRACT, PULSEX_V1_ROUTER, PULSEX_V2_ROUTER, WPLS_ADDRESS

logger = logging.getLogger(__name__)

w3 = Web3(Web3.HTTPProvider(RPC_URL))

# FeeChecker ABI (only honeyCheck function)
FEE_CHECKER_ABI = [
    {
        "inputs": [
            {"name": "tokenAddr", "type": "address"},
            {"name": "routerAddr", "type": "address"}
        ],
        "name": "honeyCheck",
        "outputs": [
            {
                "components": [
                    {"name": "buyResult", "type": "uint256"},
                    {"name": "tokenBalance2", "type": "uint256"},
                    {"name": "sellResult", "type": "uint256"},
                    {"name": "buyCost", "type": "uint256"},
                    {"name": "sellCost", "type": "uint256"},
                    {"name": "expectedAmount", "type": "uint256"}
                ],
                "name": "",
                "type": "tuple"
            }
        ],
        "stateMutability": "payable",
        "type": "function"
    }
]

fee_checker = w3.eth.contract(
    address=Web3.to_checksum_address(FEE_CHECKER_CONTRACT),
    abi=FEE_CHECKER_ABI
)

# Simulation amount: 1 PLS (in wei)
SIM_AMOUNT = w3.to_wei(1, "ether")


def check_honeypot(token_address: str) -> dict:
    """
    Simulate buy+sell via FeeChecker contract.
    Returns:
        {
            "is_honeypot": bool,
            "buy_tax_pct": float,
            "sell_tax_pct": float,
            "buy_success": bool,
            "sell_success": bool,
            "error": str | None,
            "router": str
        }
    """
    # WPLS cannot be honeypot-checked (swap WPLS→WPLS = IDENTICAL_ADDRESSES)
    if token_address.lower() == WPLS_ADDRESS.lower():
        return {
            "is_honeypot": False,
            "buy_tax_pct": 0.0,
            "sell_tax_pct": 0.0,
            "buy_success": True,
            "sell_success": True,
            "error": None,
            "router": "native",
        }

    token_addr = Web3.to_checksum_address(token_address)

    # Try V2 router first, then V1
    for router_name, router_addr in [("V2", PULSEX_V2_ROUTER), ("V1", PULSEX_V1_ROUTER)]:
        try:
            result = fee_checker.functions.honeyCheck(
                token_addr,
                Web3.to_checksum_address(router_addr)
            ).call({"value": SIM_AMOUNT})

            buy_result, token_balance2, sell_result, buy_cost, sell_cost, expected_amount = result

            buy_success = buy_result > 0
            sell_success = sell_result > 0

            # Calculate taxes
            buy_tax_pct = 0.0
            sell_tax_pct = 0.0

            if buy_success and expected_amount > 0 and buy_result > 0:
                # Buy tax = difference between expected tokens and actually received
                if buy_result < expected_amount:
                    buy_tax_pct = ((expected_amount - buy_result) / expected_amount) * 100

            if sell_success and sell_result > 0:
                # Roundtrip loss: PLS in (SIM_AMOUNT) vs PLS out (sellResult)
                # This includes both buy tax and sell tax
                roundtrip_loss = max(0, ((SIM_AMOUNT - sell_result) / SIM_AMOUNT) * 100)
                # Sell tax ≈ roundtrip loss minus buy tax (approximate)
                sell_tax_pct = max(0, roundtrip_loss - buy_tax_pct)

            is_honeypot = not sell_success or sell_result == 0

            return {
                "is_honeypot": is_honeypot,
                "buy_tax_pct": round(buy_tax_pct, 2),
                "sell_tax_pct": round(sell_tax_pct, 2),
                "buy_success": buy_success,
                "sell_success": sell_success,
                "error": None,
                "router": router_name,
            }

        except Exception as e:
            error_str = str(e)
            # If this router failed, try the other
            if router_name == "V2":
                logger.debug(f"V2 router failed for {token_address}, trying V1: {error_str[:100]}")
                continue
            # Both failed
            logger.warning(f"Honeypot check failed for {token_address}: {error_str[:200]}")
            return {
                "is_honeypot": None,  # Unknown
                "buy_tax_pct": None,
                "sell_tax_pct": None,
                "buy_success": False,
                "sell_success": False,
                "error": error_str[:200],
                "router": None,
            }

    # Should not reach here
    return {
        "is_honeypot": None,
        "buy_tax_pct": None,
        "sell_tax_pct": None,
        "buy_success": False,
        "sell_success": False,
        "error": "All routers failed",
        "router": None,
    }
