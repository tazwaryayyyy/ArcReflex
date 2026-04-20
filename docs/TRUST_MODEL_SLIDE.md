# Trust Model (Judge Slide)

## Trustless Today

- Settlement receipts: released payments emit transaction hashes for on-chain verification on Arc.
- Deterministic quality threshold enforcement: orchestrator applies explicit threshold checks before release.
- Evidence reproducibility: bundles include commit hash and runtime flags.
- Live web grounding: search results retrieved from DuckDuckGo HTML at query time — not pre-seeded data.
- Closed-loop reputation: failing providers receive a configurable reputation penalty and are re-ranked in the next auction without manual intervention.

## Trusted Today

- Orchestrator policy authority: decides whether to sign/release payments.
- Agent services: correctness and uptime of search/filter endpoints.
- Off-chain execution environment: service operators and infrastructure.

## Roadmap to Stronger Guarantees

- On-chain policy commitments for payout conditions.
- Attested quality scoring and verifiable execution proofs.
- Multi-party authorization for payout release.
- Additional replay-resistant payment attestations at gateway edge.

## Why This Is Still Useful Now

- Demonstrates working micro-economics loop end-to-end.
- Makes failures visible and economically actionable in real time.
- Produces compact receipts judges can verify quickly.
