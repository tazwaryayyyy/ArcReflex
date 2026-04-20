# Finals Readiness Checklist

## 1) Guaranteed Happy Path

- Command: npm run judge:prove
- Expected output lines:
- JUDGE_SUMMARY_SHA256=...
- VERIFIER_SUMMARY_SHA256=...
- VERIFIER_STATUS=PASS
- UI confirmation:
- Judge tab shows compact checks PASS
- Export Evidence button downloads bundle

## 2) Guaranteed Fallback Path

- If live run fails, run verifier on existing artifacts:
- python verify_evidence.py --expected-runs 3
- Continue presentation with trust model + economics + security slides.

## 3) Rehearsal With Stopwatch (No live debugging)

- Run: python judge_rehearse.py --runs 5 --base-url <orchestrator_url>
- Target: runs_failed = 0
- Report location: artifacts/judge/rehearsal_report.json

## 4) Third-Party Proof

- Export latest bundle live from UI.
- Verify via CLI without orchestrator imports:
- python verify_evidence.py --expected-runs 3

## 5) Business Value Pack

- Buyer (fixed): AI Ops lead at enterprise research/intelligence teams.
- KPI:
- spend on low-quality agent outputs
- mean time to detect quality regression
- Before/After comparison must be shown on one slide.

## 6) Originality One-Liner (say this consistently)

"ArcReflex delivers quality-gated economic enforcement per agent action with verifiable settlement receipts."

## 7) Judge Emotional Outcome

Judges should feel:
- this works now
- this matters commercially
- risks are disclosed honestly
- the approach is hard to copy quickly
