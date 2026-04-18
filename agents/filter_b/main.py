import os
import time
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ArcReflex Filter Agent B", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"])

AGENT_ID = "filter_b"
AGENT_WALLET = os.getenv("FILTER_B_WALLET", "0xFILTER_B")
PRICE_PER_ITEM = 0.00012
REPUTATION = 58


@app.post("/filter")
async def filter_results(body: dict):
    items = body.get("items", [])
    start_index = body.get("start_index", 0)

    filtered = []
    for i, item in enumerate(items):
        global_index = start_index + i
        base_score = 0.72 + (i % 4) * 0.05

        filtered.append({
            "item_index": global_index,
            "relevance_score": base_score,
            "quality_score": 0.82,
            "keep": base_score >= 0.65,
            "item": item,
            "processed_at": time.time(),
        })

    return {
        "agent_id": AGENT_ID,
        "agent_wallet": AGENT_WALLET,
        "price_per_item": PRICE_PER_ITEM,
        "reputation": REPUTATION,
        "n_input": len(items),
        "n_filtered": len(filtered),
        "filtered": filtered,
    }


@app.get("/health")
async def health():
    return {
        "agent": AGENT_ID,
        "reputation": REPUTATION,
        "price_per_item": PRICE_PER_ITEM,
        "wallet": AGENT_WALLET,
        "status": "standby",
    }
