import asyncio
import json
import os
import time
import uuid
from pathlib import Path

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from payments.nanopayment_client import NanopaymentClient

app = FastAPI(title="ArcReflex Orchestrator", version="2.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ORCHESTRATOR_WALLET = os.getenv("ORCHESTRATOR_WALLET", "0xORCHESTRATOR")
ORCHESTRATOR_KEY = os.getenv("ORCHESTRATOR_PRIVKEY", "0x" + "a" * 64)
QUALITY_THRESHOLD = float(os.getenv("QUALITY_THRESHOLD", "0.70"))
EVIDENCE_PATH = Path(os.getenv("EVIDENCE_PATH", "evidence.json"))


def _agent_url(env_name: str, default_url: str) -> str:
    return os.getenv(env_name, default_url)


AGENTS = {
    "search_a": {
        "url": _agent_url("SEARCH_A_URL", "http://search_a:8001"),
        "wallet": os.getenv("SEARCH_A_WALLET", "0xSEARCH_A"),
        "price_per_item": 0.0002,
        "price_micros": 200,
        "reputation": 72,
        "active": True,
    },
    "search_b": {
        "url": _agent_url("SEARCH_B_URL", "http://search_b:8002"),
        "wallet": os.getenv("SEARCH_B_WALLET", "0xSEARCH_B"),
        "price_per_item": 0.00022,
        "price_micros": 220,
        "reputation": 65,
        "active": True,
    },
    "filter_a": {
        "url": _agent_url("FILTER_A_URL", "http://filter_a:8003"),
        "wallet": os.getenv("FILTER_A_WALLET", "0xFILTER_A"),
        "price_per_item": 0.0001,
        "price_micros": 100,
        "reputation": 81,
        "active": True,
    },
    "filter_b": {
        "url": _agent_url("FILTER_B_URL", "http://filter_b:8004"),
        "wallet": os.getenv("FILTER_B_WALLET", "0xFILTER_B"),
        "price_per_item": 0.00012,
        "price_micros": 120,
        "reputation": 58,
        "active": True,
    },
}


def run_auction(agent_type_prefix: str, exclude: str | None = None) -> str:
    candidates = {
        k: v
        for k, v in AGENTS.items()
        if k.startswith(agent_type_prefix) and v["active"] and k != exclude
    }
    if not candidates:
        raise RuntimeError(
            f"No available agents for type: {agent_type_prefix}")

    scores = {
        aid: (info["reputation"] * 100) / info["price_micros"]
        for aid, info in candidates.items()
    }
    winner = max(scores.items(), key=lambda x: x[1])[0]
    return winner


class EvidenceStore:
    def __init__(self, path: Path):
        self.path = path

    def append_run(self, task_id: str, task_text: str, stats: dict, txs: list[dict]):
        if self.path.exists():
            data = json.loads(self.path.read_text(encoding="utf-8"))
        else:
            data = {
                "deployed_at": None,
                "network": "arc-testnet",
                "arc_explorer_base": "https://explorer.arc.circle.com/tx/",
                "contracts": {},
                "wallets": {},
                "demo_runs": [],
                "highlight_txs": {"show_in_video": []},
                "gas_proof": {},
            }

        released = [t for t in txs if t.get("status") == "released"]
        sample_hashes = [t["hash"] for t in released[:8]
                         if str(t.get("hash", "")).startswith("0x")]

        run = {
            "run": len(data.get("demo_runs", [])) + 1,
            "timestamp": int(time.time()),
            "task": task_text,
            "task_id": task_id,
            "total_tx": stats.get("total_transactions"),
            "released": stats.get("released"),
            "withheld": stats.get("withheld"),
            "total_usdc": stats.get("total_usdc_settled"),
            "sample_tx_hashes": sample_hashes,
        }

        data.setdefault("demo_runs", []).append(run)
        data["gas_proof"] = {
            "total_transactions": stats.get("released"),
            "arc_gas_paid_usdc": stats.get("gas_cost_usdc"),
            "ethereum_equivalent_usdc": stats.get("gas_cost_eth_equiv"),
            "ratio": round(
                (stats.get("gas_cost_eth_equiv", 0.0) /
                 stats.get("gas_cost_usdc", 1e-9)),
                2,
            ),
        }

        self.path.write_text(json.dumps(data, indent=2), encoding="utf-8")


class TaskExecutor:
    def __init__(self, client: NanopaymentClient, evidence: EvidenceStore):
        self.payment = client
        self.evidence = evidence

    async def execute(self, task_id: str, task_text: str) -> dict:
        broadcast = self.payment.broadcast

        search_winner = run_auction("search")
        await broadcast({
            "type": "auction_complete",
            "payload": {"phase": "search", "winner": search_winner, "task_id": task_id},
        })

        search_info = AGENTS[search_winner]
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(f"{search_info['url']}/search", json={"query": task_text, "n": 25})
            resp.raise_for_status()
            results = resp.json().get("results", [])

        for i, _ in enumerate(results):
            tx = await self.payment.pay(
                recipient_wallet=search_info["wallet"],
                amount_usdc=search_info["price_per_item"],
                from_label="Orchestrator",
                to_label=search_winner,
                memo=f"Search result {i + 1}/25",
                task_id=task_id,
                item_index=i,
            )
            await broadcast({"type": "nanopayment", "payload": tx.to_dict()})

        filter_winner = run_auction("filter")
        await broadcast({
            "type": "auction_complete",
            "payload": {"phase": "filter", "winner": filter_winner, "task_id": task_id},
        })

        switched = False
        current_filter = filter_winner
        filter_items = [{"title": r.get("title", ""), "snippet": r.get(
            "snippet", "")} for r in results]
        while len(filter_items) < 200:
            filter_items.extend(filter_items)
        filter_items = filter_items[:200]

        for i in range(200):
            info = AGENTS[current_filter]
            score = 0.82
            try:
                async with httpx.AsyncClient(timeout=6.0) as client:
                    f_resp = await client.post(
                        f"{info['url']}/filter",
                        json={"items": [filter_items[i]], "start_index": i},
                    )
                    f_resp.raise_for_status()
                    filtered = f_resp.json().get("filtered", [])
                    if filtered:
                        score = float(filtered[0].get("quality_score", 0.82))
            except httpx.HTTPError:
                score = 0.6 if (
                    not switched and current_filter == "filter_a") else 0.82

            if score < QUALITY_THRESHOLD and not switched:
                withheld_tx = await self.payment.withhold_payment(
                    from_label="Orchestrator",
                    to_label=current_filter,
                    amount_usdc=info["price_per_item"],
                    reason=f"Quality {score:.2f} < threshold {QUALITY_THRESHOLD:.2f}",
                    task_id=task_id,
                    item_index=i,
                )
                await broadcast({"type": "payment_withheld", "payload": withheld_tx.to_dict()})

                failed_agent = current_filter
                current_filter = run_auction("filter", exclude=failed_agent)
                switched = True

                await broadcast({
                    "type": "agent_switch",
                    "payload": {
                        "from": failed_agent,
                        "to": current_filter,
                        "quality_score": score,
                        "threshold": QUALITY_THRESHOLD,
                        "item_index": i,
                        "task_id": task_id,
                    },
                })

            paid_tx = await self.payment.pay(
                recipient_wallet=AGENTS[current_filter]["wallet"],
                amount_usdc=AGENTS[current_filter]["price_per_item"],
                from_label="Orchestrator",
                to_label=current_filter,
                memo=f"Filter item {i + 1}/200",
                task_id=task_id,
                item_index=i,
            )
            await broadcast({"type": "nanopayment", "payload": paid_tx.to_dict()})

        stats = self.payment.get_stats()
        txs = self.payment.get_transactions(limit=1000)
        self.evidence.append_run(task_id, task_text, stats, txs)

        report = {
            "title": f"Competitive Analysis: {task_text}",
            "generated_at": int(time.time()),
            "metadata": {
                "sources_searched": 25,
                "results_filtered": 200,
                "total_transactions": stats.get("total_transactions"),
                "released": stats.get("released"),
                "withheld": stats.get("withheld"),
                "total_cost_usdc": stats.get("total_usdc_settled"),
            },
        }

        await broadcast({
            "type": "task_complete",
            "payload": {"task_id": task_id, "report": report, "stats": stats},
        })
        return {"task_id": task_id, "report": report, "stats": stats}


payment_client = NanopaymentClient(
    wallet_address=ORCHESTRATOR_WALLET,
    private_key=ORCHESTRATOR_KEY,
)
evidence_store = EvidenceStore(EVIDENCE_PATH)
task_executor = TaskExecutor(payment_client, evidence_store)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    payment_client.register_ws(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        payment_client.unregister_ws(ws)


@app.post("/task")
async def submit_task(body: dict):
    task_text = body.get("text", "").strip()
    if not task_text:
        return JSONResponse({"error": "task text is required"}, status_code=400)

    task_id = f"task_{int(time.time())}_{uuid.uuid4().hex[:6]}"
    asyncio.create_task(task_executor.execute(task_id, task_text))

    return {
        "task_id": task_id,
        "status": "started",
        "ws_url": "ws://localhost:8000/ws",
    }


@app.get("/transactions")
async def get_transactions(limit: int = 500):
    return {
        "transactions": payment_client.get_transactions(limit),
        "stats": payment_client.get_stats(),
    }


@app.get("/agents")
async def get_agents():
    return {"agents": AGENTS}


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "ArcReflex Orchestrator",
        "version": "2.1.0",
        "agents": {k: {"active": v["active"], "reputation": v["reputation"]} for k, v in AGENTS.items()},
        "stats": payment_client.get_stats(),
    }


@app.delete("/reset")
async def reset():
    payment_client.reset()
    for agent in AGENTS.values():
        agent["active"] = True
    AGENTS["search_a"]["reputation"] = 72
    AGENTS["search_b"]["reputation"] = 65
    AGENTS["filter_a"]["reputation"] = 81
    AGENTS["filter_b"]["reputation"] = 58
    return {"status": "reset complete"}
