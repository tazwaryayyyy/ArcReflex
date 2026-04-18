#!/usr/bin/env python3
"""Independent ArcReflex evidence verifier.

This script intentionally does not import orchestrator internals.
It validates exported artifacts using only JSON files on disk.
"""

from __future__ import annotations

import argparse
import glob
import hashlib
import json
from pathlib import Path


def canonical_sha256(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def is_hex_tx(value: object) -> bool:
    if not isinstance(value, str) or not value.startswith("0x") or len(value) != 66:
        return False
    body = value[2:]
    return all(c in "0123456789abcdefABCDEF" for c in body)


def verify_bundle(bundle: dict, idx: int) -> list[str]:
    errors: list[str] = []

    checks = bundle.get("checks", [])
    if not isinstance(checks, list) or len(checks) == 0:
        errors.append(f"bundle[{idx}] missing checks")
    elif not all(bool(c.get("passed")) for c in checks if isinstance(c, dict)):
        errors.append(f"bundle[{idx}] has failing checks")

    stats = bundle.get("stats", {})
    total_tx = int(stats.get("total_transactions", 0))
    if total_tx < 225:
        errors.append(f"bundle[{idx}] total_transactions={total_tx} < 225")

    released_hashes = bundle.get("released_transaction_hashes", [])
    if not released_hashes:
        errors.append(f"bundle[{idx}] has no released_transaction_hashes")
    elif not all(is_hex_tx(h) for h in released_hashes):
        errors.append(f"bundle[{idx}] contains invalid released tx hash")

    latencies = bundle.get("latencies_ms", {})
    if int(latencies.get("total_ms", 0)) <= 0:
        errors.append(f"bundle[{idx}] non-positive total latency")

    if bundle.get("red_team_enabled"):
        withheld = int(stats.get("withheld", 0))
        switches = bundle.get("switch_events", [])
        if withheld < 1:
            errors.append(
                f"bundle[{idx}] red-team run has withheld={withheld}, expected >=1")
        if not isinstance(switches, list) or len(switches) < 1:
            errors.append(f"bundle[{idx}] red-team run has no switch event")

    return errors


def verify_summary(summary: dict, expected_runs: int | None) -> list[str]:
    errors: list[str] = []

    runs = int(summary.get("runs", 0))
    failed_runs = int(summary.get("failed_runs", 0))
    if expected_runs is not None and runs != expected_runs:
        errors.append(f"summary runs={runs}, expected {expected_runs}")

    if failed_runs != 0:
        errors.append(f"summary failed_runs={failed_runs}, expected 0")

    hard = summary.get("hard_numbers", {})
    required = [
        "total_latency_ms",
        "wall_clock_ms",
        "total_transactions",
        "withheld_payments",
        "total_usdc_settled",
    ]
    for key in required:
        node = hard.get(key)
        if not isinstance(node, dict):
            errors.append(f"summary missing hard_numbers.{key}")
            continue
        median = float(node.get("median", 0))
        p95 = float(node.get("p95", 0))
        if median < 0 or p95 < 0:
            errors.append(f"summary hard_numbers.{key} has negative values")
        if p95 < median:
            errors.append(f"summary hard_numbers.{key} has p95 < median")

    claimed_hash = summary.get("summary_sha256")
    if not isinstance(claimed_hash, str) or len(claimed_hash) != 64:
        errors.append("summary missing valid summary_sha256")
    else:
        clone = dict(summary)
        clone.pop("summary_sha256", None)
        recomputed = canonical_sha256(clone)
        if recomputed != claimed_hash:
            errors.append("summary_sha256 mismatch")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Independent verifier for ArcReflex judge artifacts")
    parser.add_argument(
        "--summary", default="artifacts/judge/judge_summary.json", help="Path to judge summary JSON")
    parser.add_argument("--bundle-glob", default="artifacts/judge/bundle_*.json",
                        help="Glob path for per-run bundle JSONs")
    parser.add_argument("--expected-runs", type=int,
                        default=None, help="Expected number of runs")
    args = parser.parse_args()

    summary_path = Path(args.summary)
    if not summary_path.exists():
        print(f"ERROR: summary file not found: {summary_path}")
        return 2

    bundle_paths = sorted(Path(p) for p in glob.glob(args.bundle_glob))
    if not bundle_paths:
        print(f"ERROR: no bundles matched: {args.bundle_glob}")
        return 2

    summary = load_json(summary_path)
    errors = verify_summary(summary, args.expected_runs)

    for i, path in enumerate(bundle_paths, start=1):
        bundle = load_json(path)
        errors.extend(verify_bundle(bundle, i))

    summary_hash = summary.get("summary_sha256", "")
    print(f"VERIFIER_SUMMARY_SHA256={summary_hash}")
    print(f"VERIFIER_BUNDLES={len(bundle_paths)}")

    if errors:
        print("VERIFIER_STATUS=FAIL")
        for err in errors:
            print(f"- {err}")
        return 2

    print("VERIFIER_STATUS=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
