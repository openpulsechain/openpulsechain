"""
Tweet Analyzer — 3-layer intelligence pipeline:
  1. Python regex extraction (addresses, tokens, amounts, actions)
  2. LLM analysis via OpenRouter (context, sentiment, relationships)
  3. Synthesis: combine both into actionable conclusions
"""
from __future__ import annotations
import os
import sys
import re
import json
import logging
import time
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client
import httpx

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env.local"), override=True)

_print = __builtins__.__dict__['print'] if isinstance(__builtins__, dict) else __builtins__.print
print = lambda *a, **kw: _print(*a, **{**kw, 'flush': True})

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
LLM_MODEL = os.getenv("LLM_MODEL", "anthropic/claude-3.5-haiku")

if not all([SUPABASE_URL, SUPABASE_KEY]):
    logger.error("Missing: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY")
    sys.exit(1)

if not OPENROUTER_API_KEY:
    logger.error("Missing: OPENROUTER_API_KEY")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ─── Regex patterns ───

ADDRESS_RE = re.compile(r'0x[a-fA-F0-9]{40}')
TOKEN_RE = re.compile(r'\$([A-Z]{2,10})\b')
AMOUNT_USD_RE = re.compile(r'\$[\d,.]+[KkMmBb]?\b')
AMOUNT_ETH_RE = re.compile(r'~?([\d,.]+)\s*\$?ETH\b', re.IGNORECASE)
AMOUNT_GENERIC_RE = re.compile(r'([\d,.]+)\s*(million|billion|thousand|[KkMmBb])\s*(worth|of|in)?\s*', re.IGNORECASE)

ACTION_KEYWORDS = {
    'dump': ['dump', 'dumped', 'dumping', 'offload', 'offloading', 'sold', 'selling', 'sell-off'],
    'bridge': ['bridge', 'bridged', 'bridging', 'cross-chain'],
    'accumulate': ['accumulate', 'accumulated', 'buying', 'bought', 'added', 'stacking'],
    'swap': ['swap', 'swapped', 'swapping', 'converted', 'converting'],
    'manipulate': ['manipulate', 'manipulation', 'shill', 'shilling', 'pump', 'rug'],
    'dormant': ['dormant', 'dormancy', 'waking', 'reactivat', 'inactive'],
    'tornado': ['tornado', 'tornadocash', 'mixer', 'mixing'],
    'redistribute': ['redistribu', 'airdrop'],
}

PROTOCOL_KEYWORDS = {
    'PulseX': ['pulsex', 'plsx'],
    'PulseChain': ['pulsechain', 'pls'],
    'OmniBridge': ['omnibridge', 'bridge'],
    'LibertySwap': ['liberty swap', 'libertyswap'],
    'TornadoCash': ['tornadocash', 'tornado cash', 'tornado'],
    'MakerDAO': ['makerdao', 'maker', 'pdai', 'dai'],
    'GoPulse': ['gopulse', 'go pulse'],
    'HEX': ['hex'],
}


# ─── Layer 1: Python Regex Extraction ───

def extract_entities(tweet_id: str, text: str) -> list[dict]:
    """Extract structured entities from tweet text using regex."""
    entities = []
    now = datetime.now(timezone.utc).isoformat()
    text_lower = text.lower()

    # Addresses
    for addr in ADDRESS_RE.findall(text):
        # Get surrounding context (30 chars each side)
        idx = text.find(addr)
        ctx = text[max(0, idx-30):idx+72]
        entities.append({
            "tweet_id": tweet_id,
            "entity_type": "address",
            "entity_value": addr.lower(),
            "context": ctx.strip(),
            "confidence": 1.0,
        })

    # Tokens
    for token in TOKEN_RE.findall(text):
        entities.append({
            "tweet_id": tweet_id,
            "entity_type": "token",
            "entity_value": token.upper(),
            "context": "",
            "confidence": 1.0,
        })

    # USD amounts
    for amount in AMOUNT_USD_RE.findall(text):
        entities.append({
            "tweet_id": tweet_id,
            "entity_type": "amount",
            "entity_value": amount,
            "context": "USD",
            "confidence": 0.9,
        })

    # ETH amounts
    for match in AMOUNT_ETH_RE.finditer(text):
        entities.append({
            "tweet_id": tweet_id,
            "entity_type": "amount",
            "entity_value": f"{match.group(1)} ETH",
            "context": "ETH",
            "confidence": 0.9,
        })

    # Actions
    for action, keywords in ACTION_KEYWORDS.items():
        for kw in keywords:
            if kw in text_lower:
                entities.append({
                    "tweet_id": tweet_id,
                    "entity_type": "action",
                    "entity_value": action,
                    "context": kw,
                    "confidence": 0.8,
                })
                break

    # Protocols
    for protocol, keywords in PROTOCOL_KEYWORDS.items():
        for kw in keywords:
            if kw in text_lower:
                entities.append({
                    "tweet_id": tweet_id,
                    "entity_type": "protocol",
                    "entity_value": protocol,
                    "context": kw,
                    "confidence": 0.8,
                })
                break

    return entities


def run_regex_extraction(tweets: list[dict]) -> int:
    """Run Layer 1 on all unprocessed tweets."""
    all_entities = []
    for tweet in tweets:
        entities = extract_entities(tweet["id"], tweet["text"])
        all_entities.extend(entities)

    if not all_entities:
        return 0

    # Batch upsert
    batch_size = 100
    total = 0
    for i in range(0, len(all_entities), batch_size):
        batch = all_entities[i:i+batch_size]
        supabase.table("research_extracted_entities").insert(batch).execute()
        total += len(batch)

    return total


# ─── Layer 2: LLM Analysis ───

SYSTEM_PROMPT = """You are an on-chain intelligence analyst specializing in PulseChain ecosystem.
Analyze the given tweet and extract structured intelligence.

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "summary": "one-sentence summary of the key intelligence",
  "sentiment": "bullish|bearish|neutral|warning|accusation",
  "action_detected": "dump|bridge|accumulate|swap|manipulate|redistribute|tornado_funded|none",
  "addresses_mentioned": [{"address": "0x...", "role": "description of what this address did"}],
  "tokens_mentioned": ["PLS", "PLSX"],
  "amounts_mentioned": [{"value": "$580k", "token": "PLS", "context": "dumped"}],
  "relationships": [{"from": "0x...", "to": "0x...", "type": "funded_by|sent_to|same_entity", "detail": "description"}],
  "risk_level": "low|medium|high|critical"
}

Rules:
- risk_level: critical = active dump/manipulation with large amounts, high = suspicious patterns, medium = notable activity, low = informational
- Always lowercase addresses
- If no addresses/amounts found, use empty arrays
- Keep summary under 100 words"""


def analyze_with_llm(tweet: dict) -> dict | None:
    """Send tweet to OpenRouter LLM for analysis."""
    try:
        response = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": LLM_MODEL,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"Tweet by @{tweet['author_username']} ({tweet['tweeted_at']}):\n\n{tweet['text']}"},
                ],
                "temperature": 0.1,
                "max_tokens": 800,
            },
            timeout=30.0,
        )
        response.raise_for_status()
        data = response.json()

        content = data["choices"][0]["message"]["content"]
        # Clean markdown wrapper if present
        content = content.strip()
        if content.startswith("```"):
            content = re.sub(r'^```\w*\n?', '', content)
            content = re.sub(r'\n?```$', '', content)

        parsed = json.loads(content)

        return {
            "tweet_id": tweet["id"],
            "summary": parsed.get("summary", ""),
            "sentiment": parsed.get("sentiment", "neutral"),
            "action_detected": parsed.get("action_detected", "none"),
            "addresses_mentioned": parsed.get("addresses_mentioned", []),
            "tokens_mentioned": parsed.get("tokens_mentioned", []),
            "amounts_mentioned": parsed.get("amounts_mentioned", []),
            "relationships": parsed.get("relationships", []),
            "risk_level": parsed.get("risk_level", "low"),
            "raw_response": parsed,
            "model_used": LLM_MODEL,
        }

    except Exception as e:
        logger.warning(f"  LLM error for tweet {tweet['id']}: {e}")
        return None


def run_llm_analysis(tweets: list[dict]) -> int:
    """Run Layer 2 on all unprocessed tweets."""
    total = 0
    for tweet in tweets:
        result = analyze_with_llm(tweet)
        if result:
            supabase.table("research_llm_analysis").upsert(
                result, on_conflict="tweet_id"
            ).execute()
            total += 1
            logger.info(f"  [{result['risk_level'].upper()}] {result['summary'][:80]}")

        # Rate limit respect
        time.sleep(1)

    return total


# ─── Layer 3: Synthesis ───

def run_synthesis():
    """Combine regex + LLM results into actionable conclusions."""
    now = datetime.now(timezone.utc).isoformat()

    # Get all LLM analyses
    llm_data = supabase.table("research_llm_analysis") \
        .select("*") \
        .execute().data or []

    # Get all extracted entities
    entities_data = supabase.table("research_extracted_entities") \
        .select("*") \
        .execute().data or []

    # Group by address
    address_intel: dict[str, dict] = {}

    # From regex extraction
    for e in entities_data:
        if e["entity_type"] == "address":
            addr = e["entity_value"].lower()
            if addr not in address_intel:
                address_intel[addr] = {
                    "tweets": set(),
                    "actions": set(),
                    "tokens": set(),
                    "amounts": [],
                    "risk_levels": [],
                    "summaries": [],
                    "evidence": [],
                }
            address_intel[addr]["tweets"].add(e["tweet_id"])
            address_intel[addr]["evidence"].append({
                "tweet_id": e["tweet_id"],
                "source": "regex",
                "detail": e["context"],
            })

    # Enrich with LLM data
    for llm in llm_data:
        for addr_info in (llm.get("addresses_mentioned") or []):
            addr = addr_info.get("address", "").lower()
            if not addr or not addr.startswith("0x") or len(addr) != 42:
                continue
            if addr not in address_intel:
                address_intel[addr] = {
                    "tweets": set(),
                    "actions": set(),
                    "tokens": set(),
                    "amounts": [],
                    "risk_levels": [],
                    "summaries": [],
                    "evidence": [],
                }
            address_intel[addr]["tweets"].add(llm["tweet_id"])
            address_intel[addr]["summaries"].append(llm["summary"])
            address_intel[addr]["evidence"].append({
                "tweet_id": llm["tweet_id"],
                "source": "llm",
                "detail": addr_info.get("role", ""),
            })
            if llm.get("action_detected") and llm["action_detected"] != "none":
                address_intel[addr]["actions"].add(llm["action_detected"])
            address_intel[addr]["risk_levels"].append(llm.get("risk_level", "low"))
            for t in (llm.get("tokens_mentioned") or []):
                address_intel[addr]["tokens"].add(t)
            for a in (llm.get("amounts_mentioned") or []):
                address_intel[addr]["amounts"].append(a)

    # Also add tokens from regex to matching addresses
    entity_by_tweet: dict[str, list] = {}
    for e in entities_data:
        entity_by_tweet.setdefault(e["tweet_id"], []).append(e)

    for addr, intel in address_intel.items():
        for tweet_id in intel["tweets"]:
            for e in entity_by_tweet.get(tweet_id, []):
                if e["entity_type"] == "token":
                    intel["tokens"].add(e["entity_value"])
                elif e["entity_type"] == "action":
                    intel["actions"].add(e["entity_value"])

    # Build conclusions
    risk_priority = {"critical": 4, "high": 3, "medium": 2, "low": 1}
    conclusions = []

    for addr, intel in address_intel.items():
        if not intel["tweets"]:
            continue

        # Determine highest risk
        max_risk = "low"
        for r in intel["risk_levels"]:
            if risk_priority.get(r, 0) > risk_priority.get(max_risk, 0):
                max_risk = r

        # Build title
        actions_str = ", ".join(sorted(intel["actions"])) if intel["actions"] else "mentioned"
        tokens_str = ", ".join(sorted(intel["tokens"])[:5]) if intel["tokens"] else "unknown"
        title = f"Address {addr[:10]}...{addr[-4:]} — {actions_str} ({tokens_str})"

        # Build summary from LLM summaries or fallback
        if intel["summaries"]:
            summary = " | ".join(intel["summaries"][:3])
        else:
            summary = f"Address mentioned in {len(intel['tweets'])} tweet(s). Actions: {actions_str}. Tokens: {tokens_str}."

        # Get tweet dates for first_seen/last_seen
        tweet_dates = []
        for llm in llm_data:
            if llm["tweet_id"] in intel["tweets"]:
                tweet_dates.append(llm.get("created_at", ""))

        conclusions.append({
            "conclusion_type": "address_profile",
            "subject": addr,
            "title": title,
            "summary": summary,
            "evidence": intel["evidence"],
            "addresses_involved": [addr],
            "tokens_involved": list(intel["tokens"]),
            "risk_level": max_risk,
            "tweet_count": len(intel["tweets"]),
            "first_seen": min(tweet_dates) if tweet_dates else now,
            "last_seen": max(tweet_dates) if tweet_dates else now,
            "is_active": True,
            "updated_at": now,
        })

    # Also create event-level conclusions for high/critical LLM analyses
    for llm in llm_data:
        if llm.get("risk_level") in ("high", "critical") and llm.get("action_detected") != "none":
            # Check if we already have this as address_profile
            addrs = [a.get("address", "").lower() for a in (llm.get("addresses_mentioned") or [])]
            conclusions.append({
                "conclusion_type": "event",
                "subject": llm["tweet_id"],
                "title": f"[{llm['risk_level'].upper()}] {llm.get('action_detected', 'unknown')} detected",
                "summary": llm["summary"],
                "evidence": [{"tweet_id": llm["tweet_id"], "source": "llm", "detail": llm["summary"]}],
                "addresses_involved": addrs,
                "tokens_involved": llm.get("tokens_mentioned", []),
                "risk_level": llm["risk_level"],
                "tweet_count": 1,
                "first_seen": llm.get("created_at", now),
                "last_seen": llm.get("created_at", now),
                "is_active": True,
                "updated_at": now,
            })

    # Upsert conclusions
    if conclusions:
        # Delete old conclusions and rewrite (simpler than complex merge logic)
        supabase.table("research_intel_conclusions").delete().gte("id", 0).execute()
        batch_size = 50
        for i in range(0, len(conclusions), batch_size):
            batch = conclusions[i:i+batch_size]
            supabase.table("research_intel_conclusions").insert(batch).execute()

    return len(conclusions)


# ─── Main ───

def main():
    logger.info("=== Tweet Analyzer (3-layer pipeline) ===")
    logger.info(f"Time: {datetime.now(timezone.utc).isoformat()}")
    logger.info(f"LLM model: {LLM_MODEL}")

    # Get unprocessed tweets
    result = supabase.table("research_tweets") \
        .select("id, text, author_username, tweeted_at") \
        .eq("processed", False) \
        .order("tweeted_at", desc=True) \
        .execute()

    tweets = result.data or []
    logger.info(f"Unprocessed tweets: {len(tweets)}")

    if not tweets:
        logger.info("Nothing to analyze. Done.")
        return

    # Layer 1: Regex
    logger.info("\n--- Layer 1: Regex Extraction ---")
    regex_count = run_regex_extraction(tweets)
    logger.info(f"Extracted {regex_count} entities")

    # Layer 2: LLM
    logger.info("\n--- Layer 2: LLM Analysis ---")
    llm_count = run_llm_analysis(tweets)
    logger.info(f"Analyzed {llm_count}/{len(tweets)} tweets with LLM")

    # Mark as processed
    tweet_ids = [t["id"] for t in tweets]
    for tid in tweet_ids:
        supabase.table("research_tweets").update({"processed": True}).eq("id", tid).execute()

    # Layer 3: Synthesis
    logger.info("\n--- Layer 3: Synthesis ---")
    conclusions_count = run_synthesis()
    logger.info(f"Generated {conclusions_count} conclusions")

    logger.info(f"\n=== Done: {regex_count} entities, {llm_count} LLM analyses, {conclusions_count} conclusions ===")


if __name__ == "__main__":
    main()
