"""
ArcReflex — Filter Agent A
===========================
Reputation: 81  |  Price: $0.0001/item  |  Auction score: 8100

Highest-reputation filter agent. Wins the auction reliably.
CRITICAL DEMO BEHAVIOR: Quality drops to 0.61 at item 150.

This triggers the switching moment:
  - Quality Oracle detects score below 0.70
  - Orchestrator withholds payment ($0 gas, no signing)
  - New auction fires → Filter B selected
  - Filter A receives on-chain reputation penalty
  - Demo shows this at exactly T+45s every single run

The quality drop is deterministic — it makes the demo 100% reliable.
In production: actual quality would vary based on real filter output.
"""

import os
import time
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ArcReflex Filter Agent A", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"])

AGENT_ID           = "filter_a"
AGENT_WALLET       = os.getenv("FILTER_A_WALLET", "0xFILTER_A")
PRICE_PER_ITEM     = 0.0001
REPUTATION         = 81
QUALITY_DROP_INDEX = 150  # Quality drops here — guaranteed demo trigger


@app.post("/filter")
async def filter_results(body: dict):
    """
    Score and rank search results by relevance.
    Each item costs $0.0001 → 200 items = 200 nanopayments = $0.020 total.

    NOTE: The Orchestrator tracks item index and applies the quality oracle.
    This endpoint always returns results — quality withholding happens in
    the Orchestrator (off-chain), not here.
    """
    items = body.get("items", [])
    start_index = body.get("start_index", 0)

    filtered = []
    for i, item in enumerate(items):
        global_index = start_index + i

        # Simulate work: generate relevance score
        base_score = 0.70 + (i % 5) * 0.06  # 0.70–0.94 cycling

        # Quality degradation after item 150 (simulates realistic drift)
        if global_index >= QUALITY_DROP_INDEX:
            quality_score = 0.58  # Below 0.70 threshold
        else:
            quality_score = 0.85  # Above threshold — passes QA

        filtered.append({
            "item_index":     global_index,
            "relevance_score": base_score,
            "quality_score":  quality_score,  # Agent reports its own score (honest)
            "keep":           base_score >= 0.65,
            "item":           item,
            "processed_at":   time.time(),
        })

    return {
        "agent_id":     AGENT_ID,
        "agent_wallet": AGENT_WALLET,
        "price_per_item": PRICE_PER_ITEM,
        "reputation":   REPUTATION,
        "n_input":      len(items),
        "n_filtered":   len(filtered),
        "filtered":     filtered,
        "quality_note": f"Quality degrades at item {QUALITY_DROP_INDEX} (demo trigger)",
    }


@app.get("/health")
async def health():
    return {
        "agent":             AGENT_ID,
        "reputation":        REPUTATION,
        "price_per_item":    PRICE_PER_ITEM,
        "wallet":            AGENT_WALLET,
        "status":            "active",
        "quality_drop_at":   QUALITY_DROP_INDEX,
        "demo_note":         "Quality drops to 0.61 at item 150 — guaranteed switching moment",
    }
