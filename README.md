# ArcReflex

ArcReflex is a multi-agent prototype where an orchestrator selects agents, scores quality, and releases micro-payments only for acceptable work. It includes:

- payment authorization flow (EIP-3009-style request/response handling)
- quality-gated payout logic
- x402-style middleware for paid API access
- basic frontend to visualize orchestration activity

Evidence-first positioning:
- deterministic judge-mode execution
- compact pass/fail checks per run
- auto-generated evidence artifacts for verification

## Current Status

The repository has been cleaned and aligned for local development:

- strict-mode payment paths are enabled by default
- compatibility wrappers under `payments/` avoid wildcard imports
- generated/tooling clutter is excluded via `.gitignore`
- docs now match the current root layout

## Repository Layout

```
ArcReflex/
├── AgentRegistry.vy
├── agents/
│   ├── search_a/main.py
│   ├── search_b/main.py
│   ├── filter_a/main.py
│   ├── filter_b/main.py
│   └── factcheck/main.py
├── orchestrator/
│   └── main.py
├── payments/
│   ├── nanopayment_client.py
│   └── x402_middleware.py
├── nanopayment_client.py
├── x402_middleware.py
├── docker-compose.yml
├── deploy.py
├── requirements.txt
├── package.json
├── src/
└── README.md
```

## Quick Start

### Backend

```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
copy .env.example .env
```

Run a quick import smoke test:

```bash
python -c "import orchestrator.main; import agents.search_a.main; import agents.search_b.main; import agents.filter_a.main; import agents.filter_b.main; import agents.factcheck.main; print('ok')"
```

### Frontend

```bash
npm install
npm run dev
```

### Docker Compose

```bash
docker compose up --build
```

## Render Deployment Notes

If Render defaults to Python 3.14, builds may fail while compiling `pydantic-core` from source.
This repo includes `runtime.txt` to pin a supported runtime and `requirements.render.txt` for web-service deploys.

If you are configuring services manually in Render (without Blueprint), set:
- `PYTHON_VERSION=3.11.9`
- Build command: `pip install -r requirements.render.txt`

For each Render backend service use:

```bash
Build Command: pip install -r requirements.render.txt
Start Command: uvicorn <service_module>:app --host 0.0.0.0 --port $PORT
```

Examples for `<service_module>`:
- `orchestrator.main`
- `agents.search_a.main`
- `agents.search_b.main`
- `agents.filter_a.main`
- `agents.filter_b.main`
- `agents.factcheck.main`

## Vercel Frontend Notes

Use Vercel with Vite preset and set these environment variables:
- `VITE_API_BASE_URL=https://arcreflex-orchestrator-7ryd.onrender.com`
- `VITE_WS_URL=wss://arcreflex-orchestrator-7ryd.onrender.com/ws`

The frontend reads those values at build time. After changing them, redeploy Vercel.

## One-Click Judge Run

Run the full deterministic flow with red-team degradation, automatic failover, and compact pass/fail checks:

```bash
npm run judge:run
```

One-command run + independent verification:

```bash
npm run judge:prove
```

Equivalent direct command:

```bash
python judge_run.py --runs 3 --base-url http://localhost:8000
```

Outputs are written to `artifacts/judge/`:
- `bundle_<task_id>.json` (per-run evidence bundle)
- `judge_summary.json` (median/p95 hard numbers)

Reproducibility line emitted by runner:
- `JUDGE_SUMMARY_SHA256=<sha256>`

Independent verifier (no orchestrator imports):

```bash
npm run judge:verify
```

Verifier output includes:
- `VERIFIER_STATUS=PASS|FAIL`
- `VERIFIER_SUMMARY_SHA256=<sha256>`

Note on `GET /judge/summary`:
- If no judge run has completed yet, summary can be unavailable.
- The API returns `summary: null` and `available: false` until the first successful judge run writes artifacts.

## Judge Reproducibility Checklist

Use this list in front of judges for fast validation:

1. Start backend services and ensure orchestrator health endpoint responds.
2. Run one command:

```bash
npm run judge:prove
```

3. Confirm output contains all of these lines:
- `JUDGE_SUMMARY_SHA256=<64-hex>`
- `VERIFIER_SUMMARY_SHA256=<64-hex>`
- `VERIFIER_STATUS=PASS`

4. Confirm the two SHA256 values match exactly.
5. Open Judge tab and verify compact checks are all PASS.
6. Export latest bundle and keep it as submission evidence.

Expected terminal snippet shape:

```text
JUDGE_SUMMARY_SHA256=........................................................
VERIFIER_SUMMARY_SHA256=........................................................
VERIFIER_BUNDLES=3
VERIFIER_STATUS=PASS
```

Each bundle contains:
- transaction hashes
- timestamps and stage latencies
- quality decisions and withheld payments
- total cost summary
- reproducibility metadata (commit + env flags)

## Environment Notes

Key environment variables used by payment/x402 flows include:

- `CIRCLE_API_KEY`
- `CIRCLE_GATEWAY_URL`
- `ARC_CHAIN_ID`
- `USDC_ADDRESS`
- `ARCREFLEX_STRICT_X402`
- `ARCREFLEX_ALLOW_INSECURE_DEMO`

For submission-grade behavior, keep strict mode enabled and insecure demo mode disabled.

## Evidence Output

When payment flow is exercised successfully, execution artifacts are written to:
- `evidence.json` (project run history)
- `artifacts/judge/*.json` (judge-mode bundles and benchmark summary)

## Red-Team Scenario

Judge-mode runs force a deterministic degradation event (`red_team_degrade_at`) to demonstrate:
- degrade an agent
- withhold payment on failed quality
- switch to backup provider
- complete task after recovery with measurable delta

## Judge-Facing Dashboard

The frontend includes a `judge` tab for operator review with:
- current task state
- payment event summary
- quality gate decisions
- compact check list (pass/fail)
- evidence export button

## Trust Model

See `docs/TRUST_MODEL_SLIDE.md` for explicit trust boundaries:
- what is trustless today
- what remains trusted
- what is roadmap

Additional judge materials:
- `docs/JUDGE_BASELINE_TABLE.md`
- `docs/DEMO_CHOREOGRAPHY.md`
- `docs/ECONOMICS_SLIDE.md`
- `docs/SECURITY_AND_ABUSE_POSTURE.md`

## License

This project is licensed under the MIT License. See `LICENSE`.
