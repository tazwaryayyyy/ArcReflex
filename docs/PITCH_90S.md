# 90-Second Live Pitch Structure

## 0:00-0:10 Problem

"Teams running multi-agent workflows pay for actions, but not all actions are high quality. This creates silent spend leakage."

## 0:10-0:25 Why current approaches fail

"Traditional pipelines detect bad quality late. Internal accounting logs payments, but does not provide independent, receipt-grade verification tied to quality gates."

**Ablation point (say this if asked about novelty):** "Without ArcReflex, 100% of payments go through regardless of output quality — there is no mechanism to withhold, switch providers, or produce a verifiable receipt that a quality gate was enforced. ArcReflex makes quality enforcement an on-chain economic fact, not a log entry."

## 0:25-1:00 Live proof

- Run: npm run judge:prove
- Show pass + verification hashes
- Open Judge tab: show withhold decision, switch event, and compact checks PASS
- Export evidence bundle

## 1:00-1:20 Business impact

"We reduce low-quality spend leakage by enforcing quality before payout release, while preserving task completion via deterministic failover."

## 1:20-1:30 Close

"ArcReflex is quality-gated economic enforcement per agent action with verifiable settlement receipts."

(Use this verbal structure for live demo; adapt wording to your speaking style.)
