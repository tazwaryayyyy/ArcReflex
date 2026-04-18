# Demo Choreography (Primary + Fallback)

## Primary Path (90 seconds)

1. Start with objective: pay only for acceptable agent work, prove it with receipts.
2. Run one command: npm run judge:prove
3. Show output lines:
- JUDGE_SUMMARY_SHA256=...
- VERIFIER_STATUS=PASS
4. Open Judge tab and show:
- quality withhold event
- provider switch event
- compact checks all PASS
5. Export latest bundle and point to tx hashes.

## Fallback Path (45 seconds)

1. If live run has dependency hiccup, use existing artifact set in artifacts/judge.
2. Run verifier only:
- python verify_evidence.py --expected-runs 3
3. Show VERIFIER_STATUS=PASS and hash line.
4. Continue with trust model and baseline table.

## Time-boxed Cues

- 0:00-0:10: problem and why naive ledgers are weak
- 0:10-0:40: one-command proof
- 0:40-1:05: UI checks and red-team failover
- 1:05-1:20: baseline table and economics
- 1:20-1:30: close with trust boundaries and roadmap

## Demo Guardrails

- Keep fallback artifacts pre-generated.
- Keep browser on Judge tab before presenting.
- Keep one terminal focused on command output only.
- Never claim fully trustless orchestration; say trust-minimized settlement with explicit trusted components.
