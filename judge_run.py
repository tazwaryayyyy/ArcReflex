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
import statistics
import time
from pathlib import Path

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


def run_once(client: httpx.Client, base_url: str, task_text: str, degrade_at: int) -> dict:
    started = time.time()
    resp = client.post(
        f"{base_url}/judge/run-sync",
        json={
            "text": task_text,
            "red_team": True,
            "red_team_degrade_at": degrade_at,
        },
        timeout=180.0,
    )
    elapsed_ms = int((time.time() - started) * 1000)
    resp.raise_for_status()
    data = resp.json()
    data["wall_clock_ms"] = elapsed_ms
    return data


def main() -> int:
    parser = argparse.ArgumentParser(
        description="ArcReflex deterministic judge runner")
    parser.add_argument(
        "--base-url", default="http://localhost:8000", help="Orchestrator base URL")
    parser.add_argument("--runs", type=int, default=3,
                        help="Number of deterministic runs")
    parser.add_argument(
        "--task", default="ArcReflex deterministic judge scenario", help="Task text")
    parser.add_argument("--degrade-at", type=int, default=120,
                        help="Forced red-team degradation index")
    parser.add_argument("--output", default="artifacts/judge",
                        help="Output folder for summary artifacts")
    parser.add_argument(
        "--print-hash-only",
        action="store_true",
        help="Print only the summary hash line for CI/judge scripts",
    )
    args = parser.parse_args()

    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    all_runs = []
    failures = 0

    with httpx.Client() as client:
        for i in range(args.runs):
            run_data = run_once(
                client=client,
                base_url=args.base_url,
                task_text=f"{args.task} #{i + 1}",
                degrade_at=args.degrade_at,
            )
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
