# Baseline Comparison (Identical 225-Transaction Workload)

Method:
- Arc numbers are taken from artifacts/judge/judge_summary.json and per-run bundles.
- Non-blockchain ledger baseline assumes centralized internal accounting with no on-chain receipts.
- Competing chain baseline uses conservative gas-equivalent assumptions for identical transaction count.

To make this judge-ready, replace assumptions with measured values from your own benchmark runs.

## Why Blockchain Here (Concise)

A normal internal ledger can represent balances, but cannot provide public, third-party settlement receipts without trusting the operator.
ArcReflex uses on-chain receipts for payout finality and dispute auditability while keeping per-transaction cost low enough for micro-economics.

## Comparison Table

| Dimension | ArcReflex on Arc | Internal Ledger (Centralized) | Ethereum L1-style Settlement |
|---|---:|---:|---:|
| Workload | 225 tx/task | 225 entries/task | 225 tx/task |
| Settlement receipt | Public tx hash per release | Operator DB row | Public tx hash per release |
| Third-party verification | Yes (bundle + tx hashes) | No (operator-trusted) | Yes |
| Cost for 225 actions | ~ $0.000225 total gas-equivalent (from run artifacts) | Near-zero infra cost | ~ $477 gas-equivalent |
| Quality-gated withhold + failover | Yes | Yes | Yes |
| Practical micropayment viability | High | Medium (trust-heavy) | Low (cost-heavy) |

## Measured Results (Fill Before Demo)

Use this table in your slide exactly as captured from run output. Do not leave placeholders at judging time.

| Metric (225-action workload) | ArcReflex on Arc (Measured) | Internal Ledger Baseline | Competing Chain Baseline |
|---|---:|---:|---:|
| Total latency p50 (ms) | 131,296 | ~131,000 (no on-chain overhead) | ~135,000 (L1 confirmation latency) |
| Total latency p95 (ms) | 137,189 | ~136,000 | ~180,000+ |
| Cost per run (USD) | $0.000225 gas-equivalent | ~$0 (DB write only) | ~$477 gas-equivalent (Ethereum L1) |
| Withheld events triggered | 1 / run (100%) | Manual review only | Manual review only |
| Public receipt verifiability | **Yes** (bundle + tx hashes) | No (operator-trusted DB) | Yes |

> Source: `artifacts/judge_render/judge_summary.json` — 3 deterministic runs, `VERIFIER_STATUS=PASS`, SHA256: `2e2b0ecf5cbb17eee17ea1caa64d79c07950e1ae8ba52c69388af6beef6f5571`

## Collection Procedure (Exact)

1) Run Arc proof flow:

```bash
npm run judge:prove
```

2) Copy Arc metrics from:
- artifacts/judge/judge_summary.json
- artifacts/judge/bundle_<task_id>.json

3) Run your internal-ledger and competing-chain baselines with the same 225-action workload and quality-gate logic.

4) Fill the table with measured p50/p95 latency and measured run cost for all three columns.

5) Keep terminal screenshots for each run command as judge backup evidence.

## Evidence Pointers

- Summary: artifacts/judge/judge_summary.json
- Per-run bundle: artifacts/judge/bundle_<task_id>.json
- Independent verification: python verify_evidence.py --expected-runs 3

## Judge Read

If your evaluation prioritizes trust-minimized settlement receipts and reproducibility, ArcReflex has a clear edge over internal-ledger alternatives.
If your evaluation prioritizes lowest absolute infra cost only, centralized ledgers are cheaper but lose public verifiability.
