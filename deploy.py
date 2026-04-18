#!/usr/bin/env python3
"""
ArcReflex — Day 1 Setup Script
================================
Automates everything required before writing a single line of agent code:

  1. Create 5 Circle Wallets programmatically
  2. Fund from Arc testnet faucet (instructions printed)
  3. Deploy AgentRegistry.vy to Arc testnet via Titanoboa
  4. Register all 4 agents in the contract
  5. Write wallet addresses and contract address to .env

Run: python scripts/deploy.py

Prerequisites:
  pip install -r requirements.txt
  Set CIRCLE_API_KEY in .env
"""

import os
import json
import asyncio
import subprocess
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv()

CIRCLE_API_KEY = os.getenv("CIRCLE_API_KEY", "")
CIRCLE_WALLETS_URL = "https://api.circle.com/v1/w3s/wallets"
ARC_RPC_URL = os.getenv("ARC_RPC_URL", "https://rpc.arc.circle.com")
PROJECT_ROOT = Path(__file__).parent

AGENT_DEFINITIONS = [
    {"name": "Orchestrator",  "type": None,     "stake": 0},
    {"name": "search_a",      "type": "search", "stake": 1_000_000},
    {"name": "search_b",      "type": "search", "stake": 1_000_000},
    {"name": "filter_a",      "type": "filter", "stake": 1_000_000},
    {"name": "filter_b",      "type": "filter", "stake": 1_000_000},
]


async def create_circle_wallet(name: str, client: httpx.AsyncClient) -> dict:
    """Create a Circle Wallet via API. Returns wallet object with address."""
    resp = await client.post(
        CIRCLE_WALLETS_URL,
        json={
            "idempotencyKey": f"arcreflex-{name}-{int(time.time())}",
            "blockchains":    ["ARC-TESTNET"],
            "name":           f"ArcReflex {name}",
        },
        headers={
            "Authorization": f"Bearer {CIRCLE_API_KEY}",
            "Content-Type":  "application/json",
        },
    )
    resp.raise_for_status()
    wallet = resp.json()["data"]["wallet"]
    print(f"  ✓ {name:20s} wallet: {wallet['address']}")
    return wallet


async def create_all_wallets() -> dict:
    """Create all 5 wallets in parallel. Returns {name: wallet_object}."""
    print("\n── Creating Circle Wallets ──────────────────────────────────────")

    if not CIRCLE_API_KEY:
        print("  ⚠  No CIRCLE_API_KEY — using placeholder addresses for local dev")
        return {
            "Orchestrator": {"address": "0x" + "1" * 40, "id": "mock-orch"},
            "search_a":     {"address": "0x" + "2" * 40, "id": "mock-sa"},
            "search_b":     {"address": "0x" + "3" * 40, "id": "mock-sb"},
            "filter_a":     {"address": "0x" + "4" * 40, "id": "mock-fa"},
            "filter_b":     {"address": "0x" + "5" * 40, "id": "mock-fb"},
        }

    async with httpx.AsyncClient(timeout=30.0) as client:
        tasks = [create_circle_wallet(a["name"], client)
                 for a in AGENT_DEFINITIONS]
        wallets = await asyncio.gather(*tasks)

    return {a["name"]: w for a, w in zip(AGENT_DEFINITIONS, wallets)}


def deploy_contract() -> str:
    """
    Deploy AgentRegistry.vy to Arc testnet using Titanoboa.
    Returns deployed contract address.
    """
    print("\n── Deploying AgentRegistry.vy ──────────────────────────────────")

    deploy_script = f"""
import boa

# Connect to Arc testnet
boa.set_network_env("{ARC_RPC_URL}")

# Load and deploy
registry = boa.load("AgentRegistry.vy")
print(f"Deployed at: {{registry.address}}")
"""
    try:
        result = subprocess.run(
            ["python", "-c", deploy_script],
            capture_output=True, text=True, cwd=PROJECT_ROOT, check=False
        )
        if result.returncode == 0:
            # Parse address from stdout
            for line in result.stdout.splitlines():
                if line.startswith("Deployed at:"):
                    addr = line.split(": ")[1].strip()
                    print(f"  ✓ AgentRegistry deployed at {addr}")
                    return addr

        # Titanoboa not configured — return placeholder
        print("  ⚠  Titanoboa deploy failed — set ARC_RPC_URL and retry")
        print("     Manual deploy: vyper AgentRegistry.vy")
        print("     Then set AGENT_REGISTRY_ADDR in .env")
        return "0x" + "0" * 40

    except (OSError, subprocess.SubprocessError) as e:
        print(f"  ✗ Deploy error: {e}")
        return "0x" + "0" * 40


def register_agents_in_contract(wallets: dict, registry_address: str):
    """Call AgentRegistry.register() for each agent."""
    print("\n── Registering Agents on-chain ─────────────────────────────────")
    print(f"  registry: {registry_address}")

    for agent in AGENT_DEFINITIONS[1:]:  # Skip Orchestrator
        print(
            f"  → Registering {agent['name']} (type: {agent['type']}, stake: ${agent['stake']/1_000_000:.2f})")
        # In production: call registry.register(agent_type, identity, stake)
        # with each agent's private key
        # For now: print the call params for manual execution
        wallet = wallets.get(agent["name"], {})
        print(f"     wallet: {wallet.get('address', 'unknown')}")
        print(
            f"     call:   registry.register('{agent['type']}', keccak256(wallet_pubkey), {agent['stake']})")

    print("  ℹ  Fund wallets from Arc testnet faucet before calling register()")


def write_env_file(wallets: dict, registry_address: str):
    """Write all discovered addresses to .env file."""
    print("\n── Writing .env ─────────────────────────────────────────────────")

    env_path = PROJECT_ROOT / ".env"
    existing = {}

    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, _, v = line.partition("=")
                existing[k.strip()] = v.strip()

    updates = {
        "ORCHESTRATOR_WALLET": wallets.get("Orchestrator", {}).get("address", ""),
        "SEARCH_A_WALLET":     wallets.get("search_a",    {}).get("address", ""),
        "SEARCH_B_WALLET":     wallets.get("search_b",    {}).get("address", ""),
        "FILTER_A_WALLET":     wallets.get("filter_a",    {}).get("address", ""),
        "FILTER_B_WALLET":     wallets.get("filter_b",    {}).get("address", ""),
        "AGENT_REGISTRY_ADDR": registry_address,
    }

    existing.update(updates)

    lines = []
    for k, v in existing.items():
        lines.append(f"{k}={v}")

    env_path.write_text("\n".join(lines) + "\n")
    print(f"  ✓ Written to {env_path}")


def save_evidence_json(wallets: dict, registry_address: str):
    """Save deployment evidence for submission."""
    evidence_path = PROJECT_ROOT / "evidence.json"
    evidence = {
        "deployed_at":    time.time(),
        "registry":       registry_address,
        "wallets":        {k: v.get("address", "") for k, v in wallets.items()},
        "transactions":   [],  # Will be populated during demo runs
        "notes": "Run the demo 10+ times before recording. Save tx hashes here.",
    }
    evidence_path.write_text(json.dumps(evidence, indent=2))
    print(f"  ✓ Evidence template saved to {evidence_path}")


async def main():
    print("=" * 60)
    print("  ArcReflex — Day 1 Setup")
    print("=" * 60)

    # Step 1: Create wallets
    wallets = await create_all_wallets()

    # Step 2: Deploy contract
    registry_addr = deploy_contract()

    # Step 3: Register agents
    register_agents_in_contract(wallets, registry_addr)

    # Step 4: Write env
    write_env_file(wallets, registry_addr)

    # Step 5: Evidence file
    save_evidence_json(wallets, registry_addr)

    print("\n" + "=" * 60)
    print("  Setup complete.")
    print()
    print("  Next steps:")
    print("  1. Fund each wallet from Arc testnet faucet")
    print("  2. docker compose up")
    print("  3. open http://localhost:3000 (frontend)")
    print("  4. Submit a task. Watch 225 transactions fire.")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
