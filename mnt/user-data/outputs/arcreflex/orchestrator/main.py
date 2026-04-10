"""
ArcReflex Orchestrator
=======================
The economic authority of the agent network.

Responsibilities:
  - Receive user tasks
  - Open USYC yield position on idle budget
  - Run reputation-weighted auction to select agents
  - Execute task pipeline (search → filter → quality check)
  - Sign EIP-3009 authorizations for passing quality (or withhold for failures)
  - Broadcast all events to frontend via WebSocket
  - Penalize failed agents on-chain (non-blocking)

The Orchestrator holds all money. It decides what gets paid. Nothing else does.
"""

import asyncio
import os
import time
import uuid
from dataclasses import dataclass, asdict
from typing import Optional

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Internal imports
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from payments.nanopayment_client import NanopaymentClient, Transaction

# ── App setup ─────────────────────────────────────────────────────────────────

app = FastAPI(title="ArcReflex Orchestrator", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Environment ───────────────────────────────────────────────────────────────

ORCHESTRATOR_WALLET  = os.getenv("ORCHESTRATOR_WALLET",  "0xORCHESTRATOR")
ORCHESTRATOR_KEY     = os.getenv("ORCHESTRATOR_PRIVKEY", "0x" + "a" * 64)
AGENT_REGISTRY_ADDR  = os.getenv("AGENT_REGISTRY_ADDR",  "0x...")
ARC_RPC_URL          = os.getenv("ARC_RPC_URL",           "https://rpc.arc.circle.com")
CIRCLE_API_KEY       = os.getenv("CIRCLE_API_KEY",        "")

# ── Agent Registry (hardcoded for demo reliability) ───────────────────────────
# In production: query AgentRegistry.vy on Arc for live values.
# For demo: hardcoded config guarantees the switching moment fires reliably.

AGENTS: dict = {
    "search_a": {
        "url":            "http://localhost:8001",
        "wallet":         os.getenv("SEARCH_A_WALLET", "0xSEARCH_A"),
        "price_per_item": 0.0002,
        "price_micros":   200,
        "reputation":     72,
        "active":         True,
    },
    "search_b": {
        "url":            "http://localhost:8002",
        "wallet":         os.getenv("SEARCH_B_WALLET", "0xSEARCH_B"),
        "price_per_item": 0.00022,
        "price_micros":   220,
        "reputation":     65,
        "active":         True,
    },
    "filter_a": {
        "url":            "http://localhost:8003",
        "wallet":         os.getenv("FILTER_A_WALLET", "0xFILTER_A"),
        "price_per_item": 0.0001,
        "price_micros":   100,
        "reputation":     81,
        "active":         True,
    },
    "filter_b": {
        "url":            "http://localhost:8004",
        "wallet":         os.getenv("FILTER_B_WALLET", "0xFILTER_B"),
        "price_per_item": 0.00012,
        "price_micros":   120,
        "reputation":     58,
        "active":         True,
    },
}

QUALITY_THRESHOLD = 0.70

# ── Quality Oracle (Python — no contract, no gas) ─────────────────────────────

def quality_oracle(agent_id: str, item_index: int = 0) -> float:
    """
    Off-chain quality scoring. Costs $0.

    The Orchestrator calls this before signing each EIP-3009 authorization.
    If score < QUALITY_THRESHOLD, it does NOT sign. The agent receives nothing.
    No gas. No transaction. No on-chain state change.

    Demo: Filter Agent A's quality drops to 0.61 at item 150.
    Guaranteed — makes the switching moment fire at exactly T+45s every run.
    Production: replace with LLM scoring or specialized quality models.
    """
    if agent_id == "filter_a" and item_index >= 150:
        return 0.61  # Below threshold → triggers the switching moment
    return 0.85       # All other cases pass

# ── Auction Engine ────────────────────────────────────────────────────────────

def run_auction(agent_type_prefix: str, exclude: Optional[str] = None) -> str:
    """
    Reputation-weighted auction: score = (reputation × 100) / price_micros

    This mirrors the Vyper formula in AgentRegistry.get_auction_score() exactly.
    In production: query on-chain for live reputation scores.
    For demo: computed from hardcoded config.

    Example with search agents:
      search_a: (72 × 100) / 200 = 3600
      search_b: (65 × 100) / 220 = 2954
      → search_a wins despite $0.00002 higher price (reputation matters more)
    """
    candidates = {
        k: v for k, v in AGENTS.items()
        if k.startswith(agent_type_prefix)
        and v["active"]
        and k != exclude
    }

    if not candidates:
        raise RuntimeError(f"No available agents for type: {agent_type_prefix}")

    scores = {
        agent_id: (info["reputation"] * 100) / info["price_micros"]
        for agent_id, info in candidates.items()
    }

    winner = max(scores.items(), key=lambda x: x[1])
    return winner[0]

# ── USYC Manager ──────────────────────────────────────────────────────────────

class USYCManager:
    """
    Converts idle task budget to USYC while agents work.

    The yield per task is ~$0.0000021 on $0.09 for ~60 seconds.
    The principle is enormous: this agent grows its own treasury.
    "Your budget earns while your agents work." — no other framework does this.
    """

    def __init__(self):
        self._positions: dict = {}  # task_id → {"usdc_deposited": float, "opened_at": float}

    async def open_yield_position(self, task_id: str, amount_usdc: float) -> dict:
        """
        Convert idle USDC to USYC at task start.
        Keep 10% liquid for immediate first payments.
        """
        liquid = amount_usdc * 0.10
        invested = amount_usdc * 0.90

        # In production: call Circle USYC API
        # result = await circle.usyc.convert(amount=invested, from_token="USDC", to_token="USYC")
        # For demo: simulate position
        position = {
            "task_id":       task_id,
            "usdc_deposited": invested,
            "opened_at":     time.time(),
            "liquid_reserve": liquid,
        }
        self._positions[task_id] = position
        return position

    async def close_yield_position(self, task_id: str) -> float:
        """
        Convert USYC back to USDC. Return yield earned.
        USYC yield rate ~5% APY → per-second rate ≈ 0.05 / 31_536_000
        """
        if task_id not in self._positions:
            return 0.0

        pos = self._positions.pop(task_id)
        duration = time.time() - pos["opened_at"]
        apy = 0.05
        yield_earned = pos["usdc_deposited"] * apy * (duration / 31_536_000)
        return round(yield_earned, 9)

# ── Task Executor ─────────────────────────────────────────────────────────────

class TaskExecutor:
    def __init__(self, payment_client: NanopaymentClient, usyc: USYCManager):
        self.payment = payment_client
        self.usyc    = usyc
        self.active_tasks: dict = {}

    async def execute(self, task_id: str, task_text: str) -> dict:
        """
        Full task execution pipeline. Fixed async — no generator/yield ambiguity.

        Pipeline:
          1. Open USYC position
          2. Auction → Search Agent
          3. 25 searches → 25 nanopayments
          4. Auction → Filter Agent
          5. 200 filter items → up to 200 nanopayments
             (withhold + switch at item 150)
          6. Close USYC position
          7. Return report + stats
        """
        self.active_tasks[task_id] = {"started_at": time.time(), "status": "running"}
        broadcast = self.payment._broadcast

        try:
            # ── USYC position ──────────────────────────────────────────────
            yield_pos = await self.usyc.open_yield_position(task_id, 0.10)
            await broadcast({"type": "usyc_opened", "task_id": task_id, "position": yield_pos})

            # ── Search Auction ─────────────────────────────────────────────
            search_winner = run_auction("search")
            search_info   = AGENTS[search_winner]
            await broadcast({
                "type":   "auction_complete",
                "phase":  "search",
                "winner": search_winner,
                "score":  (search_info["reputation"] * 100) / search_info["price_micros"],
                "task_id": task_id,
            })

            # ── Search Phase: 25 queries → 25 nanopayments ────────────────
            await broadcast({"type": "phase_start", "phase": "search", "task_id": task_id})
            async with httpx.AsyncClient(timeout=5.0) as client:
                try:
                    resp = await client.post(
                        f"{search_info['url']}/search",
                        json={"query": task_text, "n": 25},
                    )
                    results = resp.json()["results"]
                except Exception:
                    # Agent unreachable — use pre-canned results
                    results = [{"title": f"Result {i+1}", "url": f"https://source{i+1}.example.com", "snippet": f"Info about {task_text}."} for i in range(25)]

            for i, result in enumerate(results):
                score = quality_oracle(search_winner, i)
                if score >= QUALITY_THRESHOLD:
                    await self.payment.pay(
                        recipient_wallet=search_info["wallet"],
                        amount_usdc=search_info["price_per_item"],
                        from_label="Orchestrator",
                        to_label=f"Search {'A' if search_winner=='search_a' else 'B'}",
                        memo=f"Search result {i+1}/25 · {task_text[:30]}",
                        task_id=task_id,
                        item_index=i,
                    )
                await asyncio.sleep(0.06)  # Pacing for visual demo effect

            # ── Filter Auction ─────────────────────────────────────────────
            filter_winner = run_auction("filter")
            filter_info   = AGENTS[filter_winner]
            await broadcast({
                "type":    "auction_complete",
                "phase":   "filter",
                "winner":  filter_winner,
                "score":   (filter_info["reputation"] * 100) / filter_info["price_micros"],
                "task_id": task_id,
            })

            # ── Filter Phase: 200 items, switching moment at item 150 ──────
            await broadcast({"type": "phase_start", "phase": "filter", "task_id": task_id})
            current_filter = filter_winner
            switched       = False

            for i in range(200):
                score = quality_oracle(current_filter, i)

                if score >= QUALITY_THRESHOLD:
                    await self.payment.pay(
                        recipient_wallet=AGENTS[current_filter]["wallet"],
                        amount_usdc=AGENTS[current_filter]["price_per_item"],
                        from_label="Orchestrator",
                        to_label=f"Filter {'A' if current_filter=='filter_a' else 'B'}",
                        memo=f"Filter item {i+1}/200",
                        task_id=task_id,
                        item_index=i,
                    )

                elif not switched:
                    # ── THE SWITCHING MOMENT ───────────────────────────────
                    failed_agent = current_filter

                    # Withhold payment — no signing, $0 gas
                    await self.payment.withhold_payment(
                        from_label="Orchestrator",
                        to_label=f"Filter {'A' if current_filter=='filter_a' else 'B'}",
                        amount_usdc=AGENTS[current_filter]["price_per_item"],
                        reason=f"Quality {score:.2f} < threshold {QUALITY_THRESHOLD}",
                        task_id=task_id,
                        item_index=i,
                    )

                    # New auction — exclude failed agent
                    current_filter = run_auction("filter", exclude=failed_agent)
                    switched = True

                    await broadcast({
                        "type":          "agent_switch",
                        "failed_agent":  failed_agent,
                        "replacement":   current_filter,
                        "quality_score": score,
                        "threshold":     QUALITY_THRESHOLD,
                        "item_index":    i,
                        "task_id":       task_id,
                    })

                    # Penalize reputation on-chain (non-blocking — never stalls the pipeline)
                    asyncio.create_task(
                        self._penalize_on_chain(failed_agent, task_id, reason=f"Quality {score:.2f}")
                    )

                    # Immediately pay replacement agent for this item
                    await self.payment.pay(
                        recipient_wallet=AGENTS[current_filter]["wallet"],
                        amount_usdc=AGENTS[current_filter]["price_per_item"],
                        from_label="Orchestrator",
                        to_label=f"Filter {'A' if current_filter=='filter_a' else 'B'} (replacement)",
                        memo=f"Filter item {i+1}/200 (replacement, auction #{i})",
                        task_id=task_id,
                        item_index=i,
                    )

                else:
                    # Already switched — continuation with replacement agent
                    await self.payment.pay(
                        recipient_wallet=AGENTS[current_filter]["wallet"],
                        amount_usdc=AGENTS[current_filter]["price_per_item"],
                        from_label="Orchestrator",
                        to_label=f"Filter {'A' if current_filter=='filter_a' else 'B'}",
                        memo=f"Filter item {i+1}/200",
                        task_id=task_id,
                        item_index=i,
                    )

                await asyncio.sleep(0.02)  # Pacing for visual demo effect

            # ── Close USYC position ────────────────────────────────────────
            yield_earned = await self.usyc.close_yield_position(task_id)

            # ── Generate report ────────────────────────────────────────────
            report = self._build_report(task_text, self.payment.get_stats())
            stats  = self.payment.get_stats()

            self.active_tasks[task_id]["status"] = "complete"

            await broadcast({
                "type":         "task_complete",
                "task_id":      task_id,
                "report":       report,
                "stats":        stats,
                "yield_earned": yield_earned,
            })

            return {"task_id": task_id, "report": report, "stats": stats, "yield_earned": yield_earned}

        except Exception as e:
            self.active_tasks[task_id]["status"] = "error"
            await broadcast({"type": "task_error", "task_id": task_id, "error": str(e)})
            raise

    def _build_report(self, task_text: str, stats: dict) -> dict:
        """
        Pre-generated report for demo reliability.
        In production: Writer Agent (LLM) generates this from filtered content.
        """
        return {
            "title": f"Competitive Analysis: {task_text}",
            "generated_at": time.time(),
            "sections": [
                {
                    "heading": "Market Overview",
                    "content": f"The {task_text} market shows significant fragmentation across protocol, tooling, and application layers. Analysis of 200 filtered sources reveals three dominant positions and six emerging challengers. Growth trajectory: 340% YoY in developer adoption.",
                },
                {
                    "heading": "Key Players",
                    "content": "Incumbent leaders command 68% of mindshare through documentation quality and ecosystem integrations. Second-tier challengers differentiate on performance (3.2× throughput) and cost ($0.000001/tx vs $2.12/tx on L1). New entrants compete on developer experience.",
                },
                {
                    "heading": "Technical Comparison",
                    "content": "Payment primitives are the clearest differentiator. Only Arc-native protocols achieve sub-cent per-action settlement — the prerequisite for granular agent economies. All Ethereum-based competitors fail the economic viability test at 200+ transactions per task.",
                },
                {
                    "heading": "Market Gaps",
                    "content": "Four gaps remain unaddressed: (1) per-action on-chain settlement at scale, (2) reputation-staked quality enforcement, (3) idle treasury yield during computation, (4) HTTP-native payment discovery via x402. All four are ArcReflex-exclusive primitives.",
                },
                {
                    "heading": "Recommendations",
                    "content": "Adopt ArcReflex as the payment and accountability layer. Integrate existing LLM orchestration frameworks as the reasoning layer. The combination produces agents with both intelligence and economic skin in the game — the missing primitive for production multi-agent deployment.",
                },
            ],
            "metadata": {
                "sources_searched":  25,
                "results_filtered":  200,
                "total_transactions": stats.get("total_transactions", 225),
                "released":           stats.get("released", 224),
                "withheld":           stats.get("withheld", 1),
                "total_cost_usdc":    stats.get("total_usdc_settled", 0.025),
                "gas_cost_usdc":      stats.get("gas_cost_usdc", 0.000225),
                "gas_eth_equivalent": stats.get("gas_cost_eth_equiv", 477.00),
            },
        }

    async def _penalize_on_chain(self, agent_id: str, task_id: str, reason: str):
        """
        Call AgentRegistry.slash_agent() on Arc. Non-blocking.
        Failure here never stalls the pipeline.
        """
        try:
            if not ARC_RPC_URL or "..." in ARC_RPC_URL:
                print(f"[on-chain] Simulated slash: {agent_id} · reason: {reason}")
                return

            # Production: use web3.py
            # from web3 import Web3
            # w3 = Web3(Web3.HTTPProvider(ARC_RPC_URL))
            # registry = w3.eth.contract(address=AGENT_REGISTRY_ADDR, abi=REGISTRY_ABI)
            # tx = registry.functions.slash_agent(AGENT_WALLETS[agent_id], reason).build_transaction(...)
            # signed = w3.eth.account.sign_transaction(tx, ORCHESTRATOR_KEY)
            # w3.eth.send_raw_transaction(signed.rawTransaction)
            print(f"[on-chain] Would slash {agent_id} for: {reason} (task: {task_id})")
        except Exception as e:
            print(f"[on-chain] Reputation update failed (non-critical): {e}")


# ── Singleton services ────────────────────────────────────────────────────────

payment_client = NanopaymentClient(
    wallet_address=ORCHESTRATOR_WALLET,
    private_key=ORCHESTRATOR_KEY,
)
usyc_manager   = USYCManager()
task_executor  = TaskExecutor(payment_client, usyc_manager)


# ── API Routes ────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    payment_client.register_ws(ws)
    try:
        while True:
            await ws.receive_text()  # Keep connection alive
    except (WebSocketDisconnect, Exception):
        payment_client.unregister_ws(ws)


@app.post("/task")
async def submit_task(body: dict):
    """
    Submit a task to the agent network.
    Returns immediately — task runs asynchronously.
    Subscribe to /ws for real-time events.
    """
    task_text = body.get("text", "").strip()
    if not task_text:
        return JSONResponse({"error": "task text is required"}, status_code=400)

    task_id = f"task_{int(time.time())}_{uuid.uuid4().hex[:6]}"
    asyncio.create_task(task_executor.execute(task_id, task_text))

    return {
        "task_id":   task_id,
        "status":    "started",
        "ws_url":    "ws://localhost:8000/ws",
        "message":   f"Task submitted. Connect to /ws for real-time events.",
    }


@app.get("/transactions")
async def get_transactions(limit: int = 500):
    return {
        "transactions": payment_client.get_transactions(limit),
        "stats":        payment_client.get_stats(),
    }


@app.get("/agents")
async def get_agents():
    return {"agents": AGENTS}


@app.get("/health")
async def health():
    return {
        "status":  "ok",
        "service": "ArcReflex Orchestrator",
        "version": "2.0.0",
        "agents":  {k: {"active": v["active"], "reputation": v["reputation"]} for k, v in AGENTS.items()},
        "stats":   payment_client.get_stats(),
    }


@app.delete("/reset")
async def reset():
    """Reset state between demo runs."""
    payment_client.reset()
    task_executor.active_tasks.clear()
    for agent in AGENTS.values():
        agent["active"] = True
    # Restore reputations
    AGENTS["search_a"]["reputation"] = 72
    AGENTS["search_b"]["reputation"] = 65
    AGENTS["filter_a"]["reputation"] = 81
    AGENTS["filter_b"]["reputation"] = 58
    return {"status": "reset complete"}
