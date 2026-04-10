"""
ArcReflex — Filter Agent B
===========================
Reputation: 58  |  Price: $0.00012/item  |  Auction score: 4833

Standby filter agent. Loses auction to Filter A (lower rep-to-price ratio).
Activates when Filter A is disqualified at item 150.

Despite lower reputation, Filter B maintains consistent quality (score 0.82).
This demonstrates the auction system: lower-reputation agents must price lower
to compete. After Filter A's quality failure, Filter B wins the re-auction
and completes items 151–200 at $0.00012/item.

The economic outcome for Filter A:
  - Payment withheld: $0 received for items 150–200 (would have been $0.005)
  - Stake slashed: 10% of $1.00 USDC stake = $0.10 USDC
  - Reputation penalty: -15 points (81 → 66)
  - Must lower price significantly to win future auctions
"""

import os
import time
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ArcReflex Filter Agent B", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"])

AGENT_ID       = "filter_b"
AGENT_WALLET   = os.getenv("FILTER_B_WALLET", "0xFILTER_B")
PRICE_PER_ITEM = 0.00012
REPUTATION     = 58


@app.post("/filter")
async def filter_results(body: dict):
    """
    Backup filter — consistent quality (0.82) throughout all items.
    No quality degradation. Called from item 150 onward after Filter A fails.
    Slightly higher per-item cost ($0.00012 vs Filter A's $0.0001) but more reliable.
    """
    items       = body.get("items", [])
    start_index = body.get("start_index", 0)

    filtered = []
    for i, item in enumerate(items):
        global_index = start_index + i
        base_score   = 0.72 + (i % 4) * 0.05  # 0.72–0.87 cycling

        filtered.append({
            "item_index":     global_index,
            "relevance_score": base_score,
            "quality_score":  0.82,  # Consistent quality — always above threshold
            "keep":           base_score >= 0.65,
            "item":           item,
            "processed_at":   time.time(),
        })

    return {
        "agent_id":      AGENT_ID,
        "agent_wallet":  AGENT_WALLET,
        "price_per_item": PRICE_PER_ITEM,
        "reputation":    REPUTATION,
        "n_input":       len(items),
        "n_filtered":    len(filtered),
        "filtered":      filtered,
        "quality_note":  "Consistent quality — backup agent does not degrade",
    }


@app.get("/health")
async def health():
    return {
        "agent":          AGENT_ID,
        "reputation":     REPUTATION,
        "price_per_item": PRICE_PER_ITEM,
        "wallet":         AGENT_WALLET,
        "status":         "standby",
    }
