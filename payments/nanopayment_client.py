"""Compatibility exports for nanopayment components.

This module re-exports selected symbols from the root implementation to keep
imports like `payments.nanopayment_client` stable without wildcard imports.
"""

from nanopayment_client import (
    ALLOW_INSECURE_DEMO,
    ARC_CHAIN_ID,
    CIRCLE_API_KEY,
    CIRCLE_GATEWAY_URL,
    USDC_ADDRESS,
    EIP3009Authorization,
    NanopaymentClient,
    Transaction,
)

__all__ = [
    "ALLOW_INSECURE_DEMO",
    "ARC_CHAIN_ID",
    "CIRCLE_API_KEY",
    "CIRCLE_GATEWAY_URL",
    "USDC_ADDRESS",
    "EIP3009Authorization",
    "NanopaymentClient",
    "Transaction",
]
