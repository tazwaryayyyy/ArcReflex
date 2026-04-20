#!/usr/bin/env python3
"""ArcReflex finals rehearsal runner.

Purpose:
- execute judge mode repeatedly (default 5 runs)
- verify stability target (0 failed runs)
- produce stopwatch-style report for finals prep
"""

from __future__ import annotations

import argparse
import json
import statistics
import time
from pathlib import Path

import httpx


def run_once(client: httpx.Client, base_url: str, run_idx: int, degrade_at: int) -> dict:
    started = time.time()
    resp = client.post(
        f"{base_url}/judge/run-sync",
        json={
            "text": f"ArcReflex finals rehearsal run #{run_idx}",
            "red_team": True,
            "red_team_degrade_at": degrade_at,
        },
        timeout=240.0,
    )
    elapsed_ms = int((time.time() - started) * 1000)

    try:
        payload = resp.json()
    except ValueError:
        payload = {"error": resp.text[:500]}

    ok = bool(resp.is_success)
    compact = payload.get("compact", {}) if isinstance(payload, dict) else {}
    status = compact.get("status", "failed")

    return {
        "run": run_idx,
        "http_status": resp.status_code,
        "request_ok": ok,
        "judge_status": status,
        "wall_clock_ms": elapsed_ms,
        "task_id": compact.get("task_id"),
        "error": payload.get("error") if isinstance(payload, dict) else "unknown error",
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="ArcReflex finals rehearsal checker")
    parser.add_argument(
        "--base-url", default="http://localhost:8000", help="Orchestrator base URL")
    parser.add_argument("--runs", type=int, default=5,
                        help="How many end-to-end rehearsals to execute")
    parser.add_argument("--degrade-at", type=int, default=120,
                        help="Deterministic red-team degrade index")
    parser.add_argument("--output", default="artifacts/judge/rehearsal_report.json",
                        help="Path to write rehearsal report")
    args = parser.parse_args()

    results: list[dict] = []

    with httpx.Client() as client:
        for i in range(1, args.runs + 1):
            row = run_once(client, args.base_url, i, args.degrade_at)
            results.append(row)
            print(
                f"run={row['run']} http={row['http_status']} status={row['judge_status']} "
                f"wall_ms={row['wall_clock_ms']}"
            )

    success_rows = [r for r in results if r["request_ok"]
                    and r["judge_status"] == "pass"]
    failed_rows = [r for r in results if r not in success_rows]
    wall = [r["wall_clock_ms"] for r in results]

    report = {
        "timestamp": int(time.time()),
        "base_url": args.base_url,
        "runs_requested": args.runs,
        "runs_passed": len(success_rows),
        "runs_failed": len(failed_rows),
        "target_zero_failure_met": len(failed_rows) == 0,
        "stopwatch_ms": {
            "min": min(wall) if wall else 0,
            "median": statistics.median(wall) if wall else 0,
            "max": max(wall) if wall else 0,
        },
        "results": results,
    }

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("\nArcReflex Finals Rehearsal")
    print("=" * 28)
    print(f"Runs requested: {args.runs}")
    print(f"Runs passed:    {len(success_rows)}")
    print(f"Runs failed:    {len(failed_rows)}")
    print(f"Zero-failure target: {report['target_zero_failure_met']}")
    print(
        "Stopwatch ms (min/median/max): "
        f"{report['stopwatch_ms']['min']} / {report['stopwatch_ms']['median']} / {report['stopwatch_ms']['max']}"
    )
    print(f"Report: {out_path.resolve()}")

    return 0 if report["target_zero_failure_met"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
