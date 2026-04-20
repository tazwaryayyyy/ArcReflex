# Business Value Pack

## Target Buyer (Not Everyone)

- Primary ICP: AI Operations Lead in research, competitive intelligence, or analyst teams running multi-agent workflows.
- Decision pain: paying for unreliable agent output and discovering failure too late.

## Pain KPI To Track

- Wasted spend on low-quality outputs (USD/week)
- Mean time to detect quality drop (minutes)
- Task completion reliability after provider degradation (pass rate)

## Before vs After Template

Before ArcReflex:
- Quality failures are discovered post-hoc.
- Payment and quality accountability are weakly coupled.
- Spend leakage on bad output is difficult to audit.

After ArcReflex:
- Quality threshold is enforced before payout release.
- Failed quality events trigger withhold + provider switch.
- Evidence bundles provide transaction and decision traceability.

## ROI Calculator (Slide-Ready)

Use this formula:

ROI = ((weekly_avoided_waste + weekly_time_savings_value) - weekly_platform_cost) / weekly_platform_cost

Inputs to collect:
- weekly_avoided_waste = (bad_outputs_before - bad_outputs_after) * avg_cost_per_bad_output
- weekly_time_savings_value = analyst_hours_saved * blended_hourly_rate
- weekly_platform_cost = infra + operational overhead

## Minimum External Validation Artifact (Any One)

- advisor memo with explicit problem/fit statement
- email intent from potential design partner
- pilot success criteria document with owner and date

Do not fabricate claims. One authentic artifact beats ten generic statements.

Use these companion templates:
- `docs/EXTERNAL_VALIDATION.md`
- `docs/RELIABILITY_PROOF.md`
