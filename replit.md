# ArcReflex — Autonomous Economic Nervous System

## Project Overview

ArcReflex is an interactive demo dashboard for a Circle Hackathon project demonstrating autonomous AI agents paying each other per action in real-time USDC on the Arc network. 225 nanopayments totaling $0.025 — compared to $477 equivalent gas on Ethereum.

## Architecture

### Frontend (React + Vite)
- **App.jsx** — Main React component with full simulation and WebSocket support
- **ArcReflex.jsx** — Alternate/simpler version of the component
- **src/main.jsx** — Vite entry point, mounts App.jsx
- **index.html** — HTML shell
- **vite.config.js** — Vite config, serves on port 5000

### Backend (Python / FastAPI) — not running in Replit
- **main.py** — Search Agent A (FastAPI service)
- **nanopayment_client.py** — EIP-3009 signing + Circle Gateway submission
- **x402_middleware.py** — HTTP 402 payment gate for FastAPI
- **deploy.py** — Day 1 setup: wallets + contract + env
- **AgentRegistry.vy** — Vyper smart contract: ERC-8004 agent identity + reputation

### Infrastructure
- **docker-compose.yml** — All 5 services (orchestrator, agents, frontend)
- **Dockerfile.agent** — Agent container
- **requirements.txt** — Python dependencies

## Running

The frontend runs via the "Start application" workflow (`npm run dev` on port 5000).

- **Simulation mode**: Auto-activated when no backend WebSocket is available. Fully functional demo.
- **Live mode**: Connects to `ws://localhost:8000/ws` for real orchestrator events.

## Key Features

1. **Agent Graph** — Live SVG visualization of Orchestrator, Search A/B, Filter A/B, Quality Oracle
2. **Nanopayment Feed** — Real-time transaction stream (up to 500 entries)
3. **Economy Tab** — Gas comparison chart + agent revenue breakdown
4. **Report Tab** — Agent-generated competitive analysis report
5. **Switching Moment** — Quality Oracle detects Filter A score 0.61 < 0.70, withholds payment at $0 gas, triggers new auction, Filter B takes over
6. **Concurrent Tasks** — Fire 2 simultaneous task streams (450+ transactions)

## Circle Technologies

- Arc (sub-cent settlement), USDC, Circle Nanopayments (EIP-3009), Circle Wallets, x402, USYC, ERC-8004

## Dependencies

- React 18, React DOM, Vite 5, @vitejs/plugin-react
- Node.js 20
