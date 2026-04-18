# Security and Abuse Posture

## Threats and Controls

1. Payout abuse (agent claims payment for low-quality work)
- Control: threshold gate before release; withhold on failure.
- Evidence: quality_decisions + withheld counters in bundle.

2. Replay-like payment misuse
- Control: authorization-based payment flow with unique per-item context and tx identifiers.
- Evidence: per-transaction records and hashes in artifacts.

3. Quality gaming by one provider
- Control: deterministic degradation trigger in judge mode to validate failover and slashing path.
- Evidence: switch_events and measurable recovery fields.

4. Operator overclaim risk
- Control: independent verifier script that checks exported artifacts without orchestrator imports.
- Evidence: verify_evidence.py output with VERIFIER_STATUS and summary hash.

## Red-Team Proof Included

- Forced degrade event: red_team_degrade_at
- Expected behavior:
- withhold payment
- switch provider
- recover and complete task

## Current Limitations (Honest)

- Orchestrator remains a trusted payout policy authority.
- This is trust-minimized settlement, not fully trustless orchestration.

## Near-Term Hardening

- Policy commitments anchored on-chain.
- Multi-party authorization for high-value payout releases.
- Signed quality attestations from independent evaluators.
