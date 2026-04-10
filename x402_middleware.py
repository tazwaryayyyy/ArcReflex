"""
x402 Payment Middleware for FastAPI
====================================
Implements HTTP 402 Payment Required protocol for ArcReflex external endpoints.

x402 is for EXTERNAL agents discovering and paying your system.
Internal agent-to-agent payments use EIP-3009 off-chain authorizations — NOT x402.

Flow:
  1. External agent hits /fact-check with no payment header → 402 response with payment details
  2. Agent reads X-Payment-* headers, constructs EIP-3009 authorization, retries
  3. Middleware validates signature via Circle Gateway, grants access

Demo usage:
  curl -X POST https://arcreflex.onrender.com/fact-check -d '{"claim": "..."}'
  # → 402 with payment instructions

  curl -X POST https://arcreflex.onrender.com/fact-check \
    -H "X-Payment-Signature: 0x..." \
    -d '{"claim": "..."}'
  # → 200 {"verified": true, "confidence": 0.95}
"""

import os
import time
import functools
import hashlib
import hmac
from typing import Optional, Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse


# ── Configuration ─────────────────────────────────────────────────────────────

CIRCLE_GATEWAY_URL = os.getenv("CIRCLE_GATEWAY_URL", "https://api.circle.com/v1/w3s/nanopayments")
ORCHESTRATOR_WALLET = os.getenv("ORCHESTRATOR_WALLET", "0x0000000000000000000000000000000000000001")
ARC_CHAIN_ID = os.getenv("ARC_CHAIN_ID", "1234567")
USDC_ADDRESS = os.getenv("USDC_ADDRESS", "0x...")

PAYMENT_REQUIRED_RESPONSE = {
    "error": "Payment required",
    "protocol": "x402/1.0",
    "accepts": [
        {
            "scheme": "eip3009",
            "network": "arc-testnet",
            "chainId": ARC_CHAIN_ID,
            "token": USDC_ADDRESS,
            "tokenSymbol": "USDC",
            "recipient": ORCHESTRATOR_WALLET,
            "memo": "ArcReflex Fact-Check Service",
        }
    ],
}


# ── Signature validation ───────────────────────────────────────────────────────

class SignatureValidator:
    """
    Validates EIP-3009 payment signatures submitted by external agents.

    In production: calls Circle Gateway to verify the transferWithAuthorization
    signature and confirms the payment has been (or will be) settled on Arc.

    For demo/testnet: performs lightweight signature format checks only.
    Swap _validate_with_circle() for real Circle Gateway call in production.
    """

    def __init__(self):
        self._seen_nonces: set = set()  # Prevent replay attacks

    def validate(
        self,
        signature: str,
        from_address: str,
        amount_micros: int,
        valid_before: int,
        nonce: str,
    ) -> tuple[bool, str]:
        """
        Returns (is_valid: bool, reason: str).
        """
        # Basic format checks
        if not signature.startswith("0x") or len(signature) != 132:
            return False, "ERR_AUTH_SIGNATURE_INVALID: signature must be 0x-prefixed 65-byte hex"

        if int(time.time()) > valid_before:
            return False, "ERR_AUTH_EXPIRED: authorization has expired"

        if amount_micros <= 0:
            return False, "ERR_AUTH_AMOUNT_INVALID: amount must be positive"

        if nonce in self._seen_nonces:
            return False, "ERR_AUTH_NONCE_REPLAYED: nonce already used"

        # In production: call Circle Gateway for on-chain verification
        # gateway_valid, gateway_reason = self._validate_with_circle(...)
        # if not gateway_valid:
        #     return False, gateway_reason

        # Mark nonce as used
        self._seen_nonces.add(nonce)
        return True, "valid"

    def _validate_with_circle(
        self,
        from_address: str,
        to_address: str,
        amount_micros: int,
        valid_after: int,
        valid_before: int,
        nonce: str,
        v: int,
        r: str,
        s: str,
    ) -> tuple[bool, str]:
        """
        Production implementation: POST to Circle Gateway for verification.
        Uncomment and configure for live deployment.
        """
        import httpx

        payload = {
            "from": from_address,
            "to": to_address,
            "value": amount_micros,
            "validAfter": valid_after,
            "validBefore": valid_before,
            "nonce": nonce,
            "v": v,
            "r": r,
            "s": s,
        }

        try:
            resp = httpx.post(
                f"{CIRCLE_GATEWAY_URL}/verify",
                json=payload,
                headers={"Authorization": f"Bearer {os.getenv('CIRCLE_API_KEY')}"},
                timeout=5.0,
            )
            if resp.status_code == 200:
                return True, "valid"
            return False, f"ERR_GATEWAY: {resp.json().get('message', 'unknown error')}"
        except Exception as e:
            return False, f"ERR_GATEWAY_UNREACHABLE: {e}"


# ── Singleton validator ────────────────────────────────────────────────────────
_validator = SignatureValidator()


# ── Middleware decorator ───────────────────────────────────────────────────────

def X402Middleware(price_usdc: float, wallet_address: Optional[str] = None):
    """
    FastAPI route decorator that gates access behind x402 payment.

    Usage:
        @app.post("/fact-check")
        @X402Middleware(price_usdc=0.005)
        async def fact_check(request: Request):
            ...

    Args:
        price_usdc: Price in USDC (e.g., 0.005 = half a cent)
        wallet_address: Recipient wallet. Defaults to ORCHESTRATOR_WALLET env var.
    """
    price_micros = int(price_usdc * 1_000_000)
    recipient = wallet_address or ORCHESTRATOR_WALLET

    def decorator(func: Callable):
        @functools.wraps(func)
        async def wrapper(request: Request, *args, **kwargs):
            payment_sig = request.headers.get("X-Payment-Signature")
            payment_from = request.headers.get("X-Payment-From")
            payment_nonce = request.headers.get("X-Payment-Nonce")
            payment_valid_before = request.headers.get("X-Payment-Valid-Before")

            # No payment headers — return 402 with instructions
            if not payment_sig:
                return JSONResponse(
                    status_code=402,
                    content=PAYMENT_REQUIRED_RESPONSE,
                    headers={
                        "X-Payment-Required": "true",
                        "X-Payment-Price": str(price_usdc),
                        "X-Payment-Price-Micros": str(price_micros),
                        "X-Payment-Token": "USDC",
                        "X-Payment-Network": "arc-testnet",
                        "X-Payment-Recipient": recipient,
                        "X-Payment-Protocol": "x402/1.0",
                        "X-Payment-Scheme": "eip3009",
                    },
                )

            # Validate payment signature
            valid_before = int(payment_valid_before) if payment_valid_before else 0
            is_valid, reason = _validator.validate(
                signature=payment_sig,
                from_address=payment_from or "",
                amount_micros=price_micros,
                valid_before=valid_before,
                nonce=payment_nonce or "",
            )

            if not is_valid:
                return JSONResponse(
                    status_code=402,
                    content={"error": "Payment validation failed", "reason": reason},
                    headers={"X-Payment-Required": "true"},
                )

            # Payment valid — execute the route
            response = await func(request, *args, **kwargs)
            return response

        return wrapper
    return decorator


# ── Standalone middleware class (for app.add_middleware) ──────────────────────

class X402PaymentMiddleware:
    """
    ASGI middleware variant. Apply to entire app or specific path prefixes.

    Usage:
        app.add_middleware(
            X402PaymentMiddleware,
            protected_paths={"/fact-check": 0.005},
            wallet_address=ORCHESTRATOR_WALLET
        )
    """

    def __init__(self, app, protected_paths: dict[str, float], wallet_address: str):
        self.app = app
        # {"/path": price_usdc}
        self.protected = {path: int(p * 1_000_000) for path, p in protected_paths.items()}
        self.wallet = wallet_address

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path not in self.protected:
            await self.app(scope, receive, send)
            return

        # Check for payment header in request
        headers = dict(scope.get("headers", []))
        payment_sig = headers.get(b"x-payment-signature", b"").decode()

        if not payment_sig:
            price_micros = self.protected[path]
            price_usdc = price_micros / 1_000_000
            body = JSONResponse(
                status_code=402,
                content=PAYMENT_REQUIRED_RESPONSE,
                headers={
                    "X-Payment-Price": str(price_usdc),
                    "X-Payment-Recipient": self.wallet,
                    "X-Payment-Protocol": "x402/1.0",
                },
            )
            await body(scope, receive, send)
            return

        await self.app(scope, receive, send)
