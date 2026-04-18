import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ArcReflex Search Agent B", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"])

AGENT_ID = "search_b"
AGENT_WALLET = os.getenv("SEARCH_B_WALLET", "0xSEARCH_B")
PRICE_USDC = 0.00022
REPUTATION = 65

RESULT_TEMPLATES_B = [
    {"source": "reuters.com", "type": "news", "authority": 0.88},
    {"source": "apnews.com", "type": "news", "authority": 0.85},
    {"source": "medium.com", "type": "analysis", "authority": 0.62},
    {"source": "businessinsider.com", "type": "news", "authority": 0.70},
    {"source": "cnbc.com", "type": "market", "authority": 0.79},
    {"source": "marketwatch.com", "type": "market", "authority": 0.76},
    {"source": "forbes.com", "type": "analysis", "authority": 0.74},
    {"source": "fortune.com", "type": "analysis", "authority": 0.77},
    {"source": "gartner.com", "type": "research", "authority": 0.86},
    {"source": "forrester.com", "type": "research", "authority": 0.84},
    {"source": "idc.com", "type": "research", "authority": 0.83},
    {"source": "crunchbase.com", "type": "market", "authority": 0.80},
    {"source": "pitchbook.com", "type": "market", "authority": 0.82},
    {"source": "sec.gov", "type": "regulatory", "authority": 0.97},
    {"source": "patents.google.com", "type": "technical", "authority": 0.90},
    {"source": "producthunt.com", "type": "community", "authority": 0.65},
    {"source": "ycombinator.com", "type": "community", "authority": 0.78},
    {"source": "acm.org", "type": "research", "authority": 0.92},
    {"source": "scholar.google.com", "type": "research", "authority": 0.91},
    {"source": "semanticscholar.org", "type": "research", "authority": 0.89},
    {"source": "linkedin.com", "type": "industry", "authority": 0.68},
    {"source": "quora.com", "type": "discussion", "authority": 0.55},
    {"source": "reddit.com", "type": "discussion", "authority": 0.58},
    {"source": "twitter.com", "type": "social", "authority": 0.52},
    {"source": "youtube.com", "type": "video", "authority": 0.65},
]


@app.post("/search")
async def search(body: dict):
    query = body.get("query", "")
    n = min(body.get("n", 25), 25)

    results = []
    for i in range(n):
        tmpl = RESULT_TEMPLATES_B[i % len(RESULT_TEMPLATES_B)]
        results.append({
            "rank": i + 1,
            "title": f"[B] {query.title()} - {tmpl['type'].capitalize()} #{i + 1}",
            "url": f"https://{tmpl['source']}/search/{query.lower().replace(' ', '-')}-{i + 1}",
            "snippet": f"Secondary coverage of {query} from {tmpl['source']}. "
            f"Authority: {tmpl['authority']:.2f}. Type: {tmpl['type']}.",
            "source": tmpl["source"],
            "authority": tmpl["authority"],
            "type": tmpl["type"],
        })

    return {
        "agent_id": AGENT_ID,
        "agent_wallet": AGENT_WALLET,
        "price_usdc": PRICE_USDC,
        "reputation": REPUTATION,
        "query": query,
        "n_returned": len(results),
        "results": results,
    }


@app.get("/health")
async def health():
    return {
        "agent": AGENT_ID,
        "reputation": REPUTATION,
        "price_usdc": PRICE_USDC,
        "wallet": AGENT_WALLET,
        "status": "standby",
    }
