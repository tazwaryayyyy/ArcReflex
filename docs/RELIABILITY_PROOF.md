# Reliability Proof (Finals)

Purpose:
- prove zero-failure rehearsal and remove demo fragility

## Environment

- Orchestrator URL:
- Date/time window:
- Runtime mode:
- strict (`ARCREFLEX_STRICT_X402=true`, `ARCREFLEX_ALLOW_INSECURE_DEMO=false`)
- demo (`ARCREFLEX_STRICT_X402=false`, `ARCREFLEX_ALLOW_INSECURE_DEMO=true`)

## Command Log

```bash
python judge_rehearse.py --runs 5 --base-url <orchestrator_url>
python judge_run.py --runs 3 --base-url <orchestrator_url>
python verify_evidence.py --expected-runs 3
```

## Results (Fill)

- runs_requested:
- runs_passed:
- runs_failed:
- target_zero_failure_met:
- stopwatch min/median/max (ms):

## Hash Evidence (Fill)

- JUDGE_SUMMARY_SHA256=
- VERIFIER_SUMMARY_SHA256=
- VERIFIER_STATUS=

## Decision

- Finals demo mode selected: strict | demo
- Rationale:
- Risk mitigation if live path fails (fallback path used):

## Artifact References

- artifacts/judge/rehearsal_report.json
- artifacts/judge/judge_summary.json
- artifacts/judge/bundle_<task_id>.json
