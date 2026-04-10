# ArcReflex — The Autonomous Economic Nervous System

**225 nanopayments. $0.025 total. $477 equivalent gas on Ethereum.**

ArcReflex is the first protocol where autonomous AI agents pay each other per action, per item, in real-time USDC on Arc — with autonomous quality enforcement, ERC-8004 reputation staking, and USYC yield on idle capital.

**One developer. Built in 5 days. This is what the agentic economy looks like.**

---

## The Problem

Every complex AI task is a supply chain. A competitive analysis generates:
- 25 web searches → 25 payments
- 200 result filterings → 200 payments

That's **225 discrete economic actions**. Each has real value. None can be priced individually on any existing chain.

| Chain | Gas/tx | 225 tx total | Gas/Value ratio |
|-------|--------|-------------|-----------------|
| Ethereum L1 | ~$2.12 | **$477.00** | 19,080× |
| Arbitrum | ~$0.10 | **$22.50** | 900× |
| Solana | ~$0.0025 | **$0.56** | 22× |
| **Arc + Nanopayments** | **~$0.000001** | **$0.000225** | **0.009× ✓** |

On Ethereum, gas exceeds value by **19,080×**. This is why nobody has built a granular agent economy. Until Arc.

---

## What ArcReflex Actually Does

```
OFF-CHAIN (Circle Nanopayments)          ON-CHAIN (Arc)
────────────────────────────────         ──────────────────
Orchestrator holds USDC in Circle Wallet
         │
         ▼
Quality Oracle (Python) scores output
         │
  Pass? → Orchestrator signs EIP-3009  → Batch settles on Arc
  Fail? → Orchestrator does NOT sign   → $0 gas, $0 cost
         │
         ▼
Agent Wallet receives payment instantly

ERC-8004 AgentRegistry (Vyper) ─────────→ Identity + Reputation on-chain
USYC (Circle) ─────────────────────────→ Idle budget earns yield
x402 (Fact-Check endpoint) ─────────────→ External agents can pay and discover
```

**Key insight**: Quality enforcement lives in Python, not Vyper. The Orchestrator holds the money. It decides whether to sign. Zero gas for failed quality checks.

---

## Circle Technologies Used

| Technology | How Used |
|------------|----------|
| **Arc** | Settlement network — sub-cent gas makes 225 tx economically viable |
| **USDC** | Native Arc gas token + payment currency (no dual-token problem) |
| **Circle Nanopayments (EIP-3009)** | Core payment primitive — off-chain auth, batched on-chain settlement |
| **Circle Wallets** | One programmatic wallet per agent — created via POST /wallets in <2s |
| **x402** | External Fact-Check endpoint — any agent on the internet can discover and pay |
| **USYC** | Idle task budget earns yield while agents work — "your money works while your agents work" |
| **ERC-8004** | AgentRegistry.vy — permanent on-chain identity and reputation for every agent |

---

## The Agent Economy

```
User deposits 0.10 USDC
        │
        ▼
Orchestrator (reputation-weighted auction)
        │
   ┌────┴────┐
   ▼         ▼
Search A  Search B   ← auction: A wins (rep:72, score:3600 > B score:2954)
$0.0002/q (standby)
   │
   ▼ 25 payments × $0.0002 = $0.005
   │
   ▼
Filter A          ← auction: A wins (rep:81, score:8100)
$0.0001/item × 150 items = $0.015
   │
   │ ← Quality Oracle: score 0.61 at item 150 → PAYMENT WITHHELD
   │ ← New auction fires → Filter B wins
   ▼
Filter B (replacement)
$0.00012/item × 50 items = $0.006
   │
   ▼
Task complete. Report generated. USYC position closed. Yield +$0.0000021.
```

**225 transactions. $0.025 total. Every one verifiable on Arc block explorer.**

---

## The Switching Moment

At item 150, Filter Agent A's quality score drops to 0.61 (below the 0.70 threshold):

1. **Orchestrator detects failure** — quality oracle returns 0.61
2. **Payment withheld** — Orchestrator does NOT sign the EIP-3009 auth. $0 gas. $0 cost.
3. **New auction fires** — Filter Agent B selected in 300ms
4. **On-chain penalty** — AgentRegistry.slash_agent() called: -10% stake, -15 reputation points
5. **Economy self-heals** — Filter B takes over, payments resume immediately

This is what a real economy looks like. Automatic. Instant. Trustless.

---

## Tracks

ArcReflex qualifies for all four tracks:

- **Agent-to-Agent Payment Loop** — agents pay each other per action, autonomously
- **Per-API Monetization Engine** — every agent endpoint is self-monetizing via x402
- **Usage-Based Compute Billing** — per-query, per-item, real-time settlement
- **Real-Time Micro-Commerce Flow** — agents buy and sell per interaction, not per batch

---

## Project Structure

```
arcreflex/
├── contracts/
│   └── AgentRegistry.vy          # ERC-8004 agent identity + reputation
├── orchestrator/
│   └── main.py                   # Payment engine, auction, WebSocket broadcast
├── agents/
│   ├── search_a/main.py          # rep:72 · $0.0002/query
│   ├── search_b/main.py          # rep:65 · $0.00022/query (standby)
│   ├── filter_a/main.py          # rep:81 · $0.0001/item (drops quality at item 150)
│   ├── filter_b/main.py          # rep:58 · $0.00012/item (backup)
│   └── factcheck/main.py         # x402-gated · $0.005/claim (external)
├── payments/
│   ├── nanopayment_client.py     # EIP-3009 signing + Circle Gateway submission
│   └── x402_middleware.py        # HTTP 402 payment gate for FastAPI
├── scripts/
│   └── deploy.py                 # Day 1 setup: wallets + contract + env
├── frontend/                     # React + D3 neural graph dashboard
├── docker-compose.yml            # All 5 services with one command
├── requirements.txt
└── .env.example
```

---

## Run Locally

```bash
# 1. Clone and install
git clone https://github.com/tazwaryayyyy/ArcReflex
cd ArcReflex
pip install -r requirements.txt

# 2. Configure
cp .env.example .env
# Fill in CIRCLE_API_KEY and wallet addresses

# 3. Setup (creates wallets, deploys contract)
python scripts/deploy.py

# 4. Start all services
docker compose up

# 5. Open frontend
open http://localhost:3000

# 6. Demonstrate x402
curl -X POST http://localhost:8005/fact-check \
  -H "Content-Type: application/json" \
  -d '{"claim": "Arc is cheaper than Ethereum"}'
# → HTTP 402 Payment Required

# Pay via Circle Console, retry with signature:
curl -X POST http://localhost:8005/fact-check \
  -H "X-Payment-Signature: 0x..." \
  -d '{"claim": "Arc is cheaper than Ethereum"}'
# → {"verified": true, "confidence": 0.99}
```

---

## Security Assumptions

ArcReflex's x402 verification on the external Fact-Check endpoint relies on Circle Gateway for signature validation. Internal agent-to-agent payments use off-chain EIP-3009 authorizations with the Orchestrator as the trusted payment authority. For production deployment, a smart contract gatekeeper for x402 verification would be the natural next step. We prioritized economic correctness over full decentralization for this hackathon scope.

---

## Why This Wins

Every other project answers: *"What can I sell per-action?"*

ArcReflex answers: *"What does the economy between agents look like when coordination costs approach zero?"*

That question is more important. The answer is more original. And on Arc, for the first time in history, it has an answer.

---

*ArcReflex — built solo in 5 days for the Circle Hackathon 2025.*
*One developer. A protocol built for thousands of agents.*
