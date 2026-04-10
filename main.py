"""
ArcReflex — Search Agent A
===========================
Reputation: 72  |  Price: $0.0002/query  |  Auction score: 3600

Returns pre-canned search results instantly.
Mock implementation — zero API dependencies, zero latency, 100% demo reliability.

In production: integrate Brave Search API, Serper, or SerpAPI.
The payment model is identical — per-query nanopayment regardless of search provider.
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ArcReflex Search Agent A", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"])

AGENT_ID     = "search_a"
AGENT_WALLET = os.getenv("SEARCH_A_WALLET", "0xSEARCH_A")
PRICE_USDC   = 0.0002
REPUTATION   = 72

# ── Pre-canned search results (production-quality mock) ───────────────────────

RESULT_TEMPLATES = [
    {"source": "arxiv.org",         "type": "research",  "authority": 0.92},
    {"source": "techcrunch.com",    "type": "news",      "authority": 0.78},
    {"source": "github.com",        "type": "code",      "authority": 0.88},
    {"source": "hbr.org",           "type": "analysis",  "authority": 0.85},
    {"source": "wired.com",         "type": "news",      "authority": 0.76},
    {"source": "venturebeat.com",   "type": "news",      "authority": 0.72},
    {"source": "nature.com",        "type": "research",  "authority": 0.96},
    {"source": "bloomberg.com",     "type": "market",    "authority": 0.89},
    {"source": "a16z.com",          "type": "analysis",  "authority": 0.82},
    {"source": "mit.edu",           "type": "research",  "authority": 0.94},
    {"source": "ft.com",            "type": "market",    "authority": 0.87},
    {"source": "hackernews.com",    "type": "discussion", "authority": 0.65},
    {"source": "stanford.edu",      "type": "research",  "authority": 0.95},
    {"source": "theverge.com",      "type": "news",      "authority": 0.74},
    {"source": "mckinsey.com",      "type": "analysis",  "authority": 0.88},
    {"source": "ieee.org",          "type": "research",  "authority": 0.93},
    {"source": "economist.com",     "type": "analysis",  "authority": 0.90},
    {"source": "openai.com",        "type": "research",  "authority": 0.85},
    {"source": "anthropic.com",     "type": "research",  "authority": 0.87},
    {"source": "deepmind.google",   "type": "research",  "authority": 0.91},
    {"source": "semianalysis.com",  "type": "analysis",  "authority": 0.83},
    {"source": "stratechery.com",   "type": "analysis",  "authority": 0.80},
    {"source": "lesswrong.com",     "type": "discussion", "authority": 0.70},
    {"source": "substack.com",      "type": "analysis",  "authority": 0.68},
    {"source": "wsj.com",           "type": "market",    "authority": 0.88},
]


@app.post("/search")
async def search(body: dict):
    """
    Execute a search query. Returns n results.
    Each result triggers a $0.0002 nanopayment from the Orchestrator.
    Quality score: 0.85 (above threshold — always passes QA).
    """
    query = body.get("query", "")
    n     = min(body.get("n", 25), 25)

    results = []
    for i in range(n):
        tmpl = RESULT_TEMPLATES[i % len(RESULT_TEMPLATES)]
        results.append({
            "rank":      i + 1,
            "title":     f"{query.title()} — {tmpl['type'].capitalize()} Report #{i+1}",
            "url":       f"https://{tmpl['source']}/articles/{query.lower().replace(' ', '-')}-{i+1}",
            "snippet":   f"Comprehensive {tmpl['type']} on {query} from {tmpl['source']}. "
                         f"Published with authority score {tmpl['authority']:.2f}. "
                         f"Contains market sizing, competitive landscape, and trend analysis.",
            "source":    tmpl["source"],
            "authority": tmpl["authority"],
            "type":      tmpl["type"],
        })

    return {
        "agent_id":   AGENT_ID,
        "agent_wallet": AGENT_WALLET,
        "price_usdc": PRICE_USDC,
        "reputation": REPUTATION,
        "query":      query,
        "n_returned": len(results),
        "results":    results,
    }


@app.get("/health")
async def health():
    return {
        "agent":      AGENT_ID,
        "reputation": REPUTATION,
        "price_usdc": PRICE_USDC,
        "wallet":     AGENT_WALLET,
        "status":     "active",
    }
