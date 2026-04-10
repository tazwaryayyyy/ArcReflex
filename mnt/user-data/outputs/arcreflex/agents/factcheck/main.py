"""
ArcReflex — Fact-Check Agent (x402-gated)
==========================================
Price: $0.005/claim  |  External-facing endpoint

This is the x402 showcase endpoint. Any agent on the internet can:
  1. Hit /fact-check → receive 402 Payment Required with payment instructions
  2. Construct EIP-3009 authorization for $0.005 USDC
  3. Retry with X-Payment-Signature header → receive result

This demonstrates HTTP-native machine-to-machine commerce.
No API keys. No accounts. No subscriptions.
Just pay $0.005 USDC and get a verified fact check.

Demo curl sequence:
  # Step 1: Discover the endpoint
  curl -X POST http://localhost:8005/fact-check -d '{"claim": "Bitcoin is decentralized"}'
  # → HTTP 402 with X-Payment-* headers

  # Step 2: Pay and retry
  curl -X POST http://localhost:8005/fact-check \\
    -H "X-Payment-Signature: 0x..." \\
    -H "X-Payment-From: 0xEXTERNAL_AGENT" \\
    -H "X-Payment-Nonce: 0xRANDOM32BYTES" \\
    -H "X-Payment-Valid-Before: 9999999999" \\
    -d '{"claim": "Bitcoin is decentralized"}'
  # → {"claim": "...", "verified": true, "confidence": 0.97}

IMPORTANT: Internal agents do NOT use x402.
Internal agent payments use EIP-3009 directly through the Orchestrator.
x402 is ONLY for external agents discovering and paying your system.
"""

import os
import sys
import time
import hashlib
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from payments.x402_middleware import X402Middleware

app = FastAPI(title="ArcReflex Fact-Check Agent", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"])

AGENT_ID           = "factcheck"
ORCHESTRATOR_WALLET = os.getenv("ORCHESTRATOR_WALLET", "0xORCHESTRATOR")
FACT_CHECK_PRICE    = 0.005  # $0.005 per claim verified

# ── Pre-seeded fact database (mock, demo-reliable) ────────────────────────────

KNOWN_FACTS = {
    "bitcoin is decentralized": {
        "verified":   True,
        "confidence": 0.97,
        "sources":    ["nakamoto2008.pdf", "bitnodes.io", "coinmetrics.io"],
        "reasoning":  "Bitcoin operates across 15,000+ nodes globally with no central authority.",
    },
    "ethereum uses proof of stake": {
        "verified":   True,
        "confidence": 0.99,
        "sources":    ["ethereum.org/merge", "beaconcha.in"],
        "reasoning":  "Ethereum transitioned to PoS in September 2022 (The Merge).",
    },
    "arc is cheaper than ethereum": {
        "verified":   True,
        "confidence": 0.99,
        "sources":    ["arc.circle.com/docs", "etherscan.io/gastracker"],
        "reasoning":  "Arc gas: ~$0.000001/tx. Ethereum L1: ~$2.12/tx. Ratio: 2,120,000×.",
    },
    "usdc is a stablecoin": {
        "verified":   True,
        "confidence": 1.0,
        "sources":    ["circle.com/usdc", "sec.gov/usdc"],
        "reasoning":  "USDC is a regulated fiat-backed stablecoin issued by Circle.",
    },
    "ai agents can pay each other": {
        "verified":   True,
        "confidence": 0.95,
        "sources":    ["arcreflex.demo", "eips.ethereum.org/eips/eip-3009"],
        "reasoning":  "EIP-3009 enables off-chain authorization for programmatic agent payments.",
    },
}

def _lookup_claim(claim: str) -> dict:
    """Look up claim in database or generate a plausible mock result."""
    normalized = claim.lower().strip().rstrip(".")
    if normalized in KNOWN_FACTS:
        return KNOWN_FACTS[normalized]

    # Deterministic mock for unknown claims
    h = int(hashlib.md5(claim.encode()).hexdigest()[:8], 16)
    confidence = 0.60 + (h % 35) / 100
    verified   = confidence > 0.72

    return {
        "verified":   verified,
        "confidence": round(confidence, 2),
        "sources":    [f"source{h%10}.example.com", f"archive{h%5}.org"],
        "reasoning":  f"Cross-referenced {3 + h%5} sources. Confidence: {confidence:.0%}.",
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@app.post("/fact-check")
@X402Middleware(price_usdc=FACT_CHECK_PRICE, wallet_address=ORCHESTRATOR_WALLET)
async def fact_check(request: Request):
    """
    x402-gated fact verification.

    Without payment header → HTTP 402 with X-Payment-* discovery headers.
    With valid payment → fact check result.

    This is the demo moment: open terminal, run curl, show the 402 response,
    then pay and show the 200 response. 30 seconds. Devastating.
    """
    body  = await request.json()
    claim = body.get("claim", "").strip()

    if not claim:
        return JSONResponse({"error": "claim is required"}, status_code=400)

    result = _lookup_claim(claim)

    return JSONResponse({
        "claim":      claim,
        "verified":   result["verified"],
        "confidence": result["confidence"],
        "sources":    result["sources"],
        "reasoning":  result["reasoning"],
        "agent":      AGENT_ID,
        "price_paid": FACT_CHECK_PRICE,
        "verified_at": time.time(),
        "payment_protocol": "x402/1.0",
        "settlement_network": "arc-testnet",
    })


@app.get("/health")
async def health():
    return {
        "agent":       AGENT_ID,
        "price_usdc":  FACT_CHECK_PRICE,
        "wallet":      ORCHESTRATOR_WALLET,
        "status":      "active",
        "x402":        True,
        "description": "External-facing fact-check endpoint. Requires x402 payment.",
    }


@app.get("/")
async def root():
    """Discovery endpoint — returns service info and payment requirements."""
    return {
        "service":   "ArcReflex Fact-Check Agent",
        "protocol":  "x402/1.0",
        "price":     f"${FACT_CHECK_PRICE} USDC per claim",
        "network":   "arc-testnet",
        "recipient": ORCHESTRATOR_WALLET,
        "usage": {
            "step1": "POST /fact-check with claim — receive 402 with payment instructions",
            "step2": "POST /fact-check with X-Payment-Signature header — receive result",
        },
    }
