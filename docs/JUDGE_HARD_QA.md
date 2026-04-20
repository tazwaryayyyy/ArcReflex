# Judge Hard Q&A (Crisp Answers)

## Q1: Why blockchain instead of internal ledger?

Answer:
Internal ledgers are cheaper to write entries, but they rely on operator trust. ArcReflex prioritizes verifiable settlement receipts and independent auditability while retaining micropayment viability.

## Q2: Is this fully trustless?

Answer:
No. Settlement receipts and deterministic payout logic are verifiable, but orchestrator policy and service operation remain trusted components. We present this explicitly in the trust model.

## Q3: What happens when a provider degrades in real time?

Answer:
The system withholds payment on failed quality, logs the decision, applies a configurable reputation penalty to the failing provider (default -15 pts, floor 10), switches to the next-best provider by reputation/price auction, and continues execution without restarting the task. Reputation is tracked in a rolling window and restored only via explicit `/reset`. This is demonstrated in deterministic red-team mode.

## Q4: How do we know results are not hand-curated?

Answer:
Search results are grounded live via DuckDuckGo HTML retrieval (real-time web scraping per query, no pre-seeded data), with an LLM fill stage and deterministic template tail as fallbacks. Runs produce content hashes, and an independent verifier validates the artifacts without importing orchestrator internals.

## Q5: What is the business wedge?

Answer:
Teams already spending on agent workflows need enforceable quality economics. ArcReflex ties quality outcomes to payout release and provides receipts, reducing spend leakage and audit risk.
