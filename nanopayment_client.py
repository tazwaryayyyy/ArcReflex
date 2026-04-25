"""
ArcReflex Nanopayment Client
=============================
Handles EIP-3009 off-chain authorization and Circle Gateway submission.

Architecture principle:
  - Payments are OFF-CHAIN (EIP-3009 authorization signed by Orchestrator)
  - Settlement is ON-CHAIN (batched by Circle Gateway on Arc)
  - Quality failure = Orchestrator simply does NOT sign. $0 gas. Zero friction.

This is the core of why ArcReflex works:
  225 agent actions → 225 EIP-3009 authorizations → 1 batched on-chain settlement
  Gas per action: ~$0.000001 (shared across batch)
  Vs Ethereum: $2.12 per tx × 225 = $477
"""

import os
import hashlib
import time
from dataclasses import dataclass, asdict
from typing import Optional

import httpx

# ── Configuration ─────────────────────────────────────────────────────────────

CIRCLE_API_KEY = os.getenv("CIRCLE_API_KEY", "")
CIRCLE_GATEWAY_URL = os.getenv(
    "CIRCLE_GATEWAY_URL", "https://api.circle.com/v1/w3s")
ARC_CHAIN_ID = int(os.getenv("ARC_CHAIN_ID", "2040"))
USDC_ADDRESS = os.getenv(
    "USDC_ADDRESS", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")
ALLOW_INSECURE_DEMO = os.getenv(
    "ARCREFLEX_ALLOW_INSECURE_DEMO", "false").lower() == "true"
ALLOW_SYNTHETIC_SETTLEMENT_FALLBACK = os.getenv(
    "ARCREFLEX_ALLOW_SYNTHETIC_SETTLEMENT_FALLBACK", "false").lower() == "true"


def _should_use_demo_settlement_fallback() -> bool:
    return ALLOW_INSECURE_DEMO or ALLOW_SYNTHETIC_SETTLEMENT_FALLBACK


# ── Data Models ───────────────────────────────────────────────────────────────

@dataclass
class Transaction:
    hash: str
    from_agent: str
    to_agent: str
    amount_usdc: float
    memo: str
    timestamp: float
    status: str          # "released" | "withheld"
    task_id: str
    item_index: Optional[int] = None

    def to_dict(self):
        return asdict(self)


@dataclass
class EIP3009Authorization:
    from_address: str
    to_address: str
    value: int           # USDC in micro-units (6 decimals)
    valid_after: int     # Unix timestamp
    valid_before: int    # Unix timestamp
    nonce: str           # 0x-prefixed 32-byte hex
    v: int
    r: str               # 0x-prefixed 32-byte hex
    s: str               # 0x-prefixed 32-byte hex


# ── Nanopayment Client ────────────────────────────────────────────────────────

class NanopaymentClient:
    """
    Issues EIP-3009 off-chain payment authorizations.
    Circle Gateway batches these for on-chain settlement on Arc.

    Every payment is a signal. The Orchestrator signs = work is approved.
    The Orchestrator does NOT sign = quality failure, $0 cost.
    """

    def __init__(
        self,
        wallet_address: str,
        private_key: str,
        circle_api_key: str = CIRCLE_API_KEY,
    ):
        self.wallet = wallet_address
        self.private_key = private_key
        self.api_key = circle_api_key
        self.tx_log: list[Transaction] = []
        self._ws_clients: list = []
        self._nonce_counter = 0

    # ── WebSocket broadcast ───────────────────────────────────────────────────

    def register_ws(self, ws):
        """Register a WebSocket connection for real-time event broadcast."""
        if ws not in self._ws_clients:
            self._ws_clients.append(ws)

    def unregister_ws(self, ws):
        if ws in self._ws_clients:
            self._ws_clients.remove(ws)

    async def _broadcast(self, event: dict):
        """Broadcast event to all connected WebSocket clients."""
        dead = []
        for ws in self._ws_clients:
            try:
                await ws.send_json(event)
            except RuntimeError:
                dead.append(ws)
        for ws in dead:
            self._ws_clients.remove(ws)

    async def broadcast(self, event: dict):
        """Public wrapper for event broadcast."""
        await self._broadcast(event)

    # ── EIP-3009 signing ──────────────────────────────────────────────────────

    def _generate_nonce(self) -> str:
        """Generate a unique 32-byte nonce as 0x-prefixed hex string."""
        raw = os.urandom(32)
        return "0x" + raw.hex()

    def _demo_tx_hash(self, auth: EIP3009Authorization) -> str:
        """Generate a deterministic-looking 32-byte tx hash for demo fallback."""
        seed = (
            f"{auth.from_address}:{auth.to_address}:{auth.value}:"
            f"{auth.valid_after}:{auth.valid_before}:{auth.nonce}:{time.time_ns()}"
        )
        return "0x" + hashlib.sha256(seed.encode("utf-8")).hexdigest()

    def _demo_fallback_reason(self, reason: str) -> str:
        mode = "insecure demo mode" if ALLOW_INSECURE_DEMO else "synthetic settlement fallback"
        return f"Falling back to demo settlement hash because {reason} in {mode}."

    def _build_structured_data(
        self,
        to: str,
        value: int,
        valid_after: int,
        valid_before: int,
        nonce: str,
    ) -> dict:
        """
        Build EIP-712 structured data for transferWithAuthorization.
        This is the signing payload for Circle Nanopayments.
        """
        return {
            "types": {
                "EIP712Domain": [
                    {"name": "name",              "type": "string"},
                    {"name": "version",           "type": "string"},
                    {"name": "chainId",           "type": "uint256"},
                    {"name": "verifyingContract", "type": "address"},
                ],
                "TransferWithAuthorization": [
                    {"name": "from",        "type": "address"},
                    {"name": "to",         "type": "address"},
                    {"name": "value",      "type": "uint256"},
                    {"name": "validAfter", "type": "uint256"},
                    {"name": "validBefore", "type": "uint256"},
                    {"name": "nonce",      "type": "bytes32"},
                ],
            },
            "primaryType": "TransferWithAuthorization",
            "domain": {
                "name": "USD Coin",
                "version": "2",
                "chainId": ARC_CHAIN_ID,
                "verifyingContract": USDC_ADDRESS,
            },
            "message": {
                "from":        self.wallet,
                "to":          to,
                "value":       value,
                "validAfter":  valid_after,
                "validBefore": valid_before,
                "nonce":       nonce,
            },
        }

    def _sign_typed_data(self, structured_data: dict) -> tuple[int, str, str]:
        """
        Sign EIP-712 structured data with the Orchestrator's private key.
        Returns (v, r, s) signature components.

        Requires: pip install eth-account
        """
        try:
            from eth_account import Account
            from eth_account.messages import encode_typed_data

            signer = Account.from_key(  # pylint: disable=no-value-for-parameter
                self.private_key
            )
            signable = encode_typed_data(full_message=structured_data)
            signed = signer.sign_message(signable)
            r = "0x" + signed.r.to_bytes(32, "big").hex()
            s = "0x" + signed.s.to_bytes(32, "big").hex()
            return signed.v, r, s

        except ImportError as e:
            raise RuntimeError(
                "eth-account is required to sign EIP-3009 authorizations. "
                "Install dependencies with requirements.txt."
            ) from e

    async def _submit_to_circle_gateway(self, auth: EIP3009Authorization) -> str:
        """
        Submit EIP-3009 authorization to Circle Gateway for batched settlement.
        Returns the transaction hash.

        Circle Gateway batches multiple authorizations and settles them
        on Arc in a single transaction — this is how gas costs stay near zero.
        """
        payload = {
            "from":        auth.from_address,
            "to":          auth.to_address,
            "value":       auth.value,
            "validAfter":  auth.valid_after,
            "validBefore": auth.valid_before,
            "nonce":       auth.nonce,
            "v":           auth.v,
            "r":           auth.r,
            "s":           auth.s,
            "chainId":     ARC_CHAIN_ID,
        }

        if not self.api_key:
            if _should_use_demo_settlement_fallback():
                # Demo deployments still need stable settlement-shaped artifacts
                # even when Circle credentials are unavailable.
                return self._demo_tx_hash(auth)
            raise RuntimeError(
                "CIRCLE_API_KEY is required for submission mode. "
                "For demo-mode synthetic settlement, set "
                "ARCREFLEX_ALLOW_INSECURE_DEMO=true or "
                "ARCREFLEX_ALLOW_SYNTHETIC_SETTLEMENT_FALLBACK=true."
            )

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{CIRCLE_GATEWAY_URL}/nanopayments/authorize",
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type":  "application/json",
                    },
                    timeout=10.0,
                )
                resp.raise_for_status()
                tx_hash = resp.json().get("transactionHash", "")
                if not isinstance(tx_hash, str) or not tx_hash.startswith("0x") or len(tx_hash) != 66:
                    if _should_use_demo_settlement_fallback():
                        return self._demo_tx_hash(auth)
                    raise RuntimeError(
                        "Circle Gateway response missing a valid transactionHash")
                return tx_hash
        except httpx.HTTPStatusError as e:
            if _should_use_demo_settlement_fallback():
                return self._demo_tx_hash(auth)
            raise RuntimeError(
                f"Circle Gateway rejected authorization: {e.response.text}") from e
        except httpx.RequestError as e:
            if _should_use_demo_settlement_fallback():
                return self._demo_tx_hash(auth)
            raise RuntimeError(f"Circle Gateway unreachable: {e}") from e

    # ── Public payment methods ────────────────────────────────────────────────

    async def pay(
        self,
        recipient_wallet: str,
        amount_usdc: float,
        from_label: str,
        to_label: str,
        memo: str,
        task_id: str,
        item_index: Optional[int] = None,
    ) -> Transaction:
        """
        Issue a Nanopayment via EIP-3009 off-chain authorization.

        1. Build structured data
        2. Sign with Orchestrator private key
        3. Submit to Circle Gateway
        4. Log + broadcast to WebSocket clients

        This is the core payment primitive. Called ~225 times per task.
        """
        value = int(amount_usdc * 1_000_000)  # Convert to micro-USDC
        now = int(time.time())
        nonce = self._generate_nonce()

        structured_data = self._build_structured_data(
            to=recipient_wallet,
            value=value,
            valid_after=now - 60,    # 60s grace period for clock skew
            valid_before=now + 3600,  # 1 hour validity window
            nonce=nonce,
        )

        v, r, s = self._sign_typed_data(structured_data)

        auth = EIP3009Authorization(
            from_address=self.wallet,
            to_address=recipient_wallet,
            value=value,
            valid_after=now - 60,
            valid_before=now + 3600,
            nonce=nonce,
            v=v, r=r, s=s,
        )

        tx_hash = await self._submit_to_circle_gateway(auth)

        tx = Transaction(
            hash=tx_hash,
            from_agent=from_label,
            to_agent=to_label,
            amount_usdc=amount_usdc,
            memo=memo,
            timestamp=time.time(),
            status="released",
            task_id=task_id,
            item_index=item_index,
        )

        self.tx_log.append(tx)
        await self._broadcast({"type": "nanopayment", "tx": tx.to_dict()})
        return tx

    async def withhold_payment(
        self,
        from_label: str,
        to_label: str,
        amount_usdc: float,
        reason: str,
        task_id: str,
        item_index: Optional[int] = None,
    ) -> Transaction:
        """
        Quality oracle rejected this output.
        The Orchestrator does NOT sign the EIP-3009 authorization.
        No blockchain interaction. $0 gas. Just log and broadcast.

        This is the architectural insight: payment withholding is free.
        """
        tx = Transaction(
            hash=f"withheld_{int(time.time() * 1000)}_{item_index or 0}",
            from_agent=from_label,
            to_agent=to_label,
            amount_usdc=amount_usdc,
            memo=f"WITHHELD: {reason}",
            timestamp=time.time(),
            status="withheld",
            task_id=task_id,
            item_index=item_index,
        )

        self.tx_log.append(tx)
        await self._broadcast({
            "type":   "payment_withheld",
            "tx":     tx.to_dict(),
            "reason": reason,
        })
        return tx

    # ── Analytics ─────────────────────────────────────────────────────────────

    def get_stats(self) -> dict:
        released = [t for t in self.tx_log if t.status == "released"]
        withheld = [t for t in self.tx_log if t.status == "withheld"]
        total_usdc = sum(t.amount_usdc for t in released)
        return {
            "total_transactions": len(self.tx_log),
            "released":           len(released),
            "withheld":           len(withheld),
            "total_usdc_settled": round(total_usdc, 8),
            "gas_cost_usdc":      round(len(released) * 0.000001, 8),
            "gas_cost_eth_equiv": round(len(released) * 2.12, 2),
        }

    def get_transactions(self, limit: int = 500) -> list[dict]:
        return [t.to_dict() for t in reversed(self.tx_log[-limit:])]

    def reset(self):
        self.tx_log.clear()
