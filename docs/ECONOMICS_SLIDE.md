# Economics Clarity (Judge Slide)

## Who Pays

- Task sponsor pays per successful action (search/filter processing).
- Orchestrator only releases payment when quality threshold passes.

## Who Earns

- Search and filter agents earn micropayments for accepted work.
- Failed quality events cause withhold/slash behavior.

## Why This Is Net Positive

- Arc cost profile keeps settlement overhead effectively negligible at micropayment scale.
- Quality-gated payouts reduce spend on low-value agent output.
- Backup failover preserves task completion while containing bad-work costs.

## Unit Economics Snapshot

- Workload: 225+ micropayments/task.
- Arc gas-equivalent per run: from bundle stats.cost_summary.arc_gas_usdc.
- Settled value and withheld counts: from compact summary and hard numbers.

## Narrative Line

"We are not just automating agents; we are enforcing economic accountability at per-action granularity with verifiable receipts."
