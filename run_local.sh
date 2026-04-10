#!/usr/bin/env bash
# ArcReflex — Local Dev Runner (no Docker required)
# Starts all 5 services in background processes, logs to ./logs/
#
# Usage:
#   chmod +x scripts/run_local.sh
#   ./scripts/run_local.sh          # start all
#   ./scripts/run_local.sh stop     # stop all
#   ./scripts/run_local.sh logs     # tail all logs

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"
PID_FILE="$PROJECT_ROOT/.pids"

# ── Colours ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

log()  { echo -e "${CYAN}[arcreflex]${NC} $*"; }
ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
warn() { echo -e "${YELLOW}  ⚠${NC} $*"; }
err()  { echo -e "${RED}  ✗${NC} $*"; }

# ── Stop ──────────────────────────────────────────────────────────────────────
stop_all() {
  if [[ ! -f "$PID_FILE" ]]; then
    warn "No PID file found — nothing to stop"
    return
  fi
  log "Stopping all services…"
  while IFS= read -r pid; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" && ok "Stopped PID $pid"
    fi
  done < "$PID_FILE"
  rm -f "$PID_FILE"
  ok "All services stopped."
}

# ── Logs ──────────────────────────────────────────────────────────────────────
tail_logs() {
  if [[ ! -d "$LOG_DIR" ]]; then
    err "No log directory found. Start services first."
    exit 1
  fi
  log "Tailing all service logs (Ctrl+C to exit)…"
  tail -f "$LOG_DIR"/*.log
}

# ── Health check ──────────────────────────────────────────────────────────────
wait_healthy() {
  local name=$1 port=$2
  local retries=15
  for i in $(seq 1 $retries); do
    if curl -sf "http://localhost:$port/health" > /dev/null 2>&1; then
      ok "$name is healthy (port $port)"
      return 0
    fi
    sleep 0.5
  done
  warn "$name did not respond on port $port after ${retries} attempts"
}

# ── Start ──────────────────────────────────────────────────────────────────────
start_all() {
  # Prerequisites
  if ! command -v uvicorn &> /dev/null; then
    err "uvicorn not found. Run: pip install -r requirements.txt"
    exit 1
  fi

  mkdir -p "$LOG_DIR"
  > "$PID_FILE"  # Reset PID file

  # Load env
  if [[ -f "$PROJECT_ROOT/.env" ]]; then
    set -a && source "$PROJECT_ROOT/.env" && set +a
    ok ".env loaded"
  else
    warn ".env not found — using defaults (demo mode)"
  fi

  log "Starting ArcReflex services…"
  echo ""

  # Define services: name | module | port
  declare -A SERVICES=(
    ["Orchestrator"]="orchestrator.main:app|8000"
    ["Search-A"]="agents.search_a.main:app|8001"
    ["Search-B"]="agents.search_b.main:app|8002"
    ["Filter-A"]="agents.filter_a.main:app|8003"
    ["Filter-B"]="agents.filter_b.main:app|8004"
    ["FactCheck"]="agents.factcheck.main:app|8005"
  )

  # Start in dependency order (agents first, orchestrator last)
  for name in "Search-A" "Search-B" "Filter-A" "Filter-B" "FactCheck" "Orchestrator"; do
    IFS='|' read -r module port <<< "${SERVICES[$name]}"
    log_file="$LOG_DIR/${name,,}.log"

    PYTHONPATH="$PROJECT_ROOT" uvicorn "$module" \
      --host 0.0.0.0 \
      --port "$port" \
      --reload \
      --log-level warning \
      > "$log_file" 2>&1 &

    pid=$!
    echo "$pid" >> "$PID_FILE"
    echo -e "  ${CYAN}→${NC} $name  (PID $pid, port $port, log: logs/${name,,}.log)"
    sleep 0.3  # Stagger starts
  done

  echo ""
  log "Waiting for health checks…"
  sleep 2  # Give processes time to bind

  wait_healthy "Search-A"    8001
  wait_healthy "Search-B"    8002
  wait_healthy "Filter-A"    8003
  wait_healthy "Filter-B"    8004
  wait_healthy "FactCheck"   8005
  wait_healthy "Orchestrator" 8000

  echo ""
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  ArcReflex is running.${NC}"
  echo ""
  echo -e "  ${CYAN}Orchestrator:${NC}   http://localhost:8000"
  echo -e "  ${CYAN}WebSocket:${NC}      ws://localhost:8000/ws"
  echo -e "  ${CYAN}Submit task:${NC}    POST http://localhost:8000/task"
  echo -e "  ${CYAN}Transactions:${NC}   GET  http://localhost:8000/transactions"
  echo -e "  ${CYAN}Fact-check:${NC}     POST http://localhost:8005/fact-check  (x402-gated)"
  echo ""
  echo -e "  ${YELLOW}x402 demo:${NC}"
  echo -e "  curl -X POST http://localhost:8005/fact-check \\\\"
  echo -e "    -H 'Content-Type: application/json' \\\\"
  echo -e "    -d '{\"claim\": \"Arc is cheaper than Ethereum\"}'"
  echo ""
  echo -e "  ${YELLOW}Submit task:${NC}"
  echo -e "  curl -X POST http://localhost:8000/task \\\\"
  echo -e "    -H 'Content-Type: application/json' \\\\"
  echo -e "    -d '{\"text\": \"AI agent frameworks competitive analysis\"}'"
  echo ""
  echo -e "  ${YELLOW}Stop:${NC} ./scripts/run_local.sh stop"
  echo -e "  ${YELLOW}Logs:${NC} ./scripts/run_local.sh logs"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ── Entry point ───────────────────────────────────────────────────────────────
case "${1:-start}" in
  stop)  stop_all ;;
  logs)  tail_logs ;;
  start) stop_all 2>/dev/null || true; start_all ;;
  *)     start_all ;;
esac
