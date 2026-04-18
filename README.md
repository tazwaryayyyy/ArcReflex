# ArcReflex

ArcReflex is a multi-agent prototype where an orchestrator selects agents, scores quality, and releases micro-payments only for acceptable work. It includes:

- payment authorization flow (EIP-3009-style request/response handling)
- quality-gated payout logic
- x402-style middleware for paid API access
- basic frontend to visualize orchestration activity

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

When payment flow is exercised successfully, execution artifacts can be appended to `evidence.json`.

## License

This project is licensed under the MIT License. See `LICENSE`.
