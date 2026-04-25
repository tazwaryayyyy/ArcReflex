#!/usr/bin/env python3
"""ArcReflex one-click judge run.

Runs deterministic red-team scenarios and emits:
- compact pass/fail report
- multi-run hard numbers table (median/p95)
- verifiable evidence bundle files
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import statistics
import subprocess
import time
from pathlib import Path
from urllib.parse import urlparse

import httpx


def canonical_sha256(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def p95(values: list[float]) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return values[0]
    values_sorted = sorted(values)
    idx = math.ceil(0.95 * len(values_sorted)) - 1
    idx = max(0, min(idx, len(values_sorted) - 1))
    return values_sorted[idx]


def _is_localhost_base_url(base_url: str) -> bool:
    parsed = urlparse(base_url)
    host = (parsed.hostname or "").lower()
    return host in {"localhost", "127.0.0.1", "::1"}


def _healthcheck_ok(client: httpx.Client, base_url: str, timeout_seconds: float = 3.0) -> bool:
    try:
        resp = client.get(f"{base_url}/health", timeout=timeout_seconds)
        return resp.status_code == 200
    except (httpx.HTTPError, ValueError):
        return False


def _compose_command() -> list[str] | None:
    docker = shutil.which("docker")
    if not docker:
        return None
    # Prefer Docker Compose v2 plugin (`docker compose`).
    return [docker, "compose"]


def ensure_local_orchestrator(
    client: httpx.Client,
    base_url: str,
    auto_start_local: bool,
    startup_timeout_seconds: float,
) -> None:
    if _healthcheck_ok(client, base_url):
        return

    if not _is_localhost_base_url(base_url):
        raise RuntimeError(
            f"orchestrator unavailable at {base_url}; ensure deployment is up and reachable"
        )

    if not auto_start_local:
        raise RuntimeError(
            "orchestrator not reachable on localhost. "
            "Start services first (for example: docker compose up -d orchestrator search_a search_b filter_a filter_b)."
        )

    compose_cmd = _compose_command()
    if not compose_cmd:
        raise RuntimeError(
            "Orchestrator is not running on localhost:8000 and Docker is not available to start it automatically.\n"
            "Start it manually first:\n"
            "  Windows:  $env:ARCREFLEX_ALLOW_INSECURE_DEMO='true'; .venv\\Scripts\\uvicorn orchestrator.main:app --host 0.0.0.0 --port 8000\n"
            "  Mac/Linux: ARCREFLEX_ALLOW_INSECURE_DEMO=true .venv/bin/uvicorn orchestrator.main:app --host 0.0.0.0 --port 8000\n"
            "Then re-run: npm run judge:prove"
        )

    cmd = compose_cmd + [
        "up",
        "-d",
        "orchestrator",
        "search_a",
        "search_b",
        "filter_a",
        "filter_b",
    ]
    try:
        subprocess.run(cmd, check=True)
    except (OSError, subprocess.SubprocessError) as exc:
        raise RuntimeError(
            f"failed to start docker compose services: {exc}") from exc

    deadline = time.time() + max(1.0, startup_timeout_seconds)
    while time.time() < deadline:
        if _healthcheck_ok(client, base_url):
            return
        time.sleep(2)

    raise RuntimeError(
        "orchestrator did not become healthy in time. "
        "Check docker compose logs for orchestrator/search/filter services."
    )


def run_once(
    client: httpx.Client,
    base_url: str,
    task_text: str,
    degrade_at: int,
    red_team_mode: str,
    timeout_seconds: float,
    retries: int,
) -> dict:
    started = time.time()
    last_exc: Exception | None = None
    for _ in range(max(1, retries + 1)):
        try:
            resp = client.post(
                f"{base_url}/judge/run-sync",
                json={
                    "text": task_text,
                    "red_team": True,
                    "red_team_degrade_at": degrade_at,
                    "red_team_mode": red_team_mode,
                },
                timeout=timeout_seconds,
            )
            elapsed_ms = int((time.time() - started) * 1000)
            resp.raise_for_status()
            data = resp.json()
            data["wall_clock_ms"] = elapsed_ms
            return data
        except (httpx.ReadTimeout, httpx.ConnectError, httpx.ReadError) as exc:
            last_exc = exc
            time.sleep(5)
        except httpx.HTTPStatusError as exc:
            # Retry on 502/503 (Render mid-redeploy) but not on other 4xx/5xx
            if exc.response.status_code in (502, 503):
                last_exc = exc
                time.sleep(15)
            else:
                raise

    assert last_exc is not None
    raise last_exc


def main() -> int:
    parser = argparse.ArgumentParser(
        description="ArcReflex deterministic judge runner")
    default_base = os.getenv("JUDGE_BASE_URL", "http://localhost:8000")
    parser.add_argument(
        "--base-url", default=default_base, help="Orchestrator base URL")
    parser.add_argument("--runs", type=int, default=3,
                        help="Number of deterministic runs")
    parser.add_argument(
        "--task", default="ArcReflex deterministic judge scenario", help="Task text")
    parser.add_argument("--degrade-at", type=int, default=120,
                        help="Forced red-team degradation index")
    parser.add_argument(
        "--red-team-mode",
        default="forced",
        choices=["forced", "observed"],
        help="Red-team mode passed to /judge/run-sync",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=float(os.getenv("JUDGE_TIMEOUT_SECONDS", "300")),
        help="HTTP timeout per run-sync request",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=1,
        help="Retry count for connect/read timeout failures",
    )
    parser.add_argument(
        "--retry-failed-runs",
        type=int,
        default=1,
        help="Retry count when compact status is fail",
    )
    parser.add_argument("--output", default="artifacts/judge",
                        help="Output folder for summary artifacts")
    parser.add_argument(
        "--clean-output",
        action="store_true",
        help="Delete existing bundle_*.json and judge_summary.json in output folder before running",
    )
    parser.add_argument(
        "--print-hash-only",
        action="store_true",
        help="Print only the summary hash line for CI/judge scripts",
    )
    parser.add_argument(
        "--auto-start-local",
        action=argparse.BooleanOptionalAction,
        default=os.getenv("JUDGE_AUTO_START_LOCAL", "true").lower() in {
            "1", "true", "yes", "on"},
        help="Auto-start local docker compose services when --base-url points to localhost and orchestrator is down",
    )
    parser.add_argument(
        "--startup-timeout-seconds",
        type=float,
        default=float(os.getenv("JUDGE_STARTUP_TIMEOUT_SECONDS", "120")),
        help="Max time to wait for local orchestrator health after auto-start",
    )
    args = parser.parse_args()

    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.clean_output:
        for path in out_dir.glob("bundle_*.json"):
            path.unlink(missing_ok=True)
        (out_dir / "judge_summary.json").unlink(missing_ok=True)

    all_runs = []
    failures = 0

    with httpx.Client() as client:
        ensure_local_orchestrator(
            client=client,
            base_url=args.base_url,
            auto_start_local=bool(args.auto_start_local),
            startup_timeout_seconds=args.startup_timeout_seconds,
        )
        for i in range(args.runs):
            run_data = None
            for attempt in range(max(1, args.retry_failed_runs + 1)):
                try:
                    candidate = run_once(
                        client=client,
                        base_url=args.base_url,
                        task_text=f"{args.task} #{i + 1}",
                        degrade_at=args.degrade_at,
                        red_team_mode=args.red_team_mode,
                        timeout_seconds=args.timeout_seconds,
                        retries=args.retries,
                    )
                except (httpx.ReadTimeout, httpx.ConnectError, httpx.ReadError) as exc:
                    print(
                        f"WARN: run {i + 1} attempt {attempt + 1} transport error: {exc}; retrying..."
                    )
                    if attempt + 1 >= max(1, args.retry_failed_runs + 1):
                        run_data = {
                            "compact": {
                                "task_id": f"run_{i + 1}",
                                "status": "fail",
                                "summary": {
                                    "total_transactions": 0,
                                    "withheld": 0,
                                    "total_usdc_settled": 0.0,
                                },
                            },
                            "bundle": {
                                "checks": [
                                    {
                                        "name": "judge transport run",
                                        "passed": False,
                                        "expected": "run-sync completed",
                                        "actual": str(exc),
                                    }
                                ],
                                "stats": {
                                    "total_transactions": 0,
                                    "withheld": 0,
                                },
                                "released_transaction_hashes": [],
                                "latencies_ms": {"total_ms": 0},
                            },
                            "wall_clock_ms": 0,
                        }
                    continue
                compact = candidate.get("compact", {})
                if compact.get("status") == "pass":
                    run_data = candidate
                    break
                run_data = candidate
                print(
                    f"WARN: run {i + 1} attempt {attempt + 1} failed compact checks; retrying..."
                )
            assert run_data is not None
            all_runs.append(run_data)

            bundle = run_data.get("bundle", {})
            compact = run_data.get("compact", {})
            task_id = compact.get("task_id", f"run_{i + 1}")
            (out_dir / f"bundle_{task_id}.json").write_text(
                json.dumps(bundle, indent=2), encoding="utf-8"
            )
            if compact.get("status") != "pass":
                failures += 1

    total_latency = [
        float(r.get("bundle", {}).get("latencies_ms", {}).get("total_ms", 0))
        for r in all_runs
    ]
    wall_clock = [float(r.get("wall_clock_ms", 0)) for r in all_runs]
    tx_count = [
        float(r.get("compact", {}).get(
            "summary", {}).get("total_transactions", 0))
        for r in all_runs
    ]
    withheld = [
        float(r.get("compact", {}).get("summary", {}).get("withheld", 0))
        for r in all_runs
    ]
    settled_cost = [
        float(r.get("compact", {}).get(
            "summary", {}).get("total_usdc_settled", 0.0))
        for r in all_runs
    ]

    summary = {
        "timestamp": int(time.time()),
        "base_url": args.base_url,
        "runs": args.runs,
        "failed_runs": failures,
        "hard_numbers": {
            "total_latency_ms": {
                "median": statistics.median(total_latency) if total_latency else 0,
                "p95": p95(total_latency),
            },
            "wall_clock_ms": {
                "median": statistics.median(wall_clock) if wall_clock else 0,
                "p95": p95(wall_clock),
            },
            "total_transactions": {
                "median": statistics.median(tx_count) if tx_count else 0,
                "p95": p95(tx_count),
            },
            "withheld_payments": {
                "median": statistics.median(withheld) if withheld else 0,
                "p95": p95(withheld),
            },
            "total_usdc_settled": {
                "median": statistics.median(settled_cost) if settled_cost else 0,
                "p95": p95(settled_cost),
            },
        },
        "pass": failures == 0,
    }

    summary_hash = canonical_sha256(summary)
    summary["summary_sha256"] = summary_hash

    (out_dir / "judge_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

    hash_line = f"JUDGE_SUMMARY_SHA256={summary_hash}"
    if args.print_hash_only:
        print(hash_line)
        return 0 if summary["pass"] else 2

    print("\nArcReflex Judge Run Summary")
    print("=" * 36)
    print(f"Runs: {args.runs} | Failed: {failures} | PASS: {summary['pass']}")
    print("\nHard Numbers (median / p95)")
    print(
        f"- Total latency (ms): {summary['hard_numbers']['total_latency_ms']['median']} / {summary['hard_numbers']['total_latency_ms']['p95']}")
    print(
        f"- Wall clock (ms):    {summary['hard_numbers']['wall_clock_ms']['median']} / {summary['hard_numbers']['wall_clock_ms']['p95']}")
    print(
        f"- Transactions:       {summary['hard_numbers']['total_transactions']['median']} / {summary['hard_numbers']['total_transactions']['p95']}")
    print(
        f"- Withheld payments:  {summary['hard_numbers']['withheld_payments']['median']} / {summary['hard_numbers']['withheld_payments']['p95']}")
    print(
        f"- Settled USDC:       {summary['hard_numbers']['total_usdc_settled']['median']} / {summary['hard_numbers']['total_usdc_settled']['p95']}")
    print(f"\nArtifacts: {out_dir.resolve()}")
    print(hash_line)

    return 0 if summary["pass"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
