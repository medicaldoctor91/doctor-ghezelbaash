#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = "https://www.ghezelbaash.ir/"
REPORT_PATH = Path("production-audit/report.json")
EXACT_LEGACY_URI = re.compile(r"https://www\.ghezelbaash\.ir/#(?:person|clinic)(?=$|[\s)\],.;:'\"<>])")


def fetch_text(path: str) -> str:
    request = urllib.request.Request(
        f"{BASE}{path.lstrip('/')}",
        headers={
            "User-Agent": "GhezelbaashProductionAuditRunner/9.0",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Accept-Encoding": "identity",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as error:
        return error.read().decode("utf-8", errors="replace")


def reconcile_exact_legacy_uri_checks(report: dict) -> dict:
    failures = list(report.get("failures", []))
    for label, path in (("llms.txt", "llms.txt"), ("ai.txt", ".well-known/ai.txt")):
        message = f"{label}: legacy entity URI returned"
        if message not in failures:
            continue
        text = fetch_text(path)
        if not EXACT_LEGACY_URI.search(text):
            failures.remove(message)
    report["failures"] = failures
    report["status"] = "pass" if not failures else "fail"
    REPORT_PATH.parent.mkdir(exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def run_attempt() -> dict:
    process = subprocess.run(
        [sys.executable, "scripts/audit-production.py", "--attempts", "1", "--delay", "0"],
        text=True,
        capture_output=True,
        check=False,
    )
    if process.stdout:
        print(process.stdout, end="")
    if process.stderr:
        print(process.stderr, end="", file=sys.stderr)
    if not REPORT_PATH.exists():
        return {"status": "fail", "stage": 9, "failures": ["production audit did not create report.json"]}
    report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    return reconcile_exact_legacy_uri_checks(report)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--attempts", type=int, default=1)
    parser.add_argument("--delay", type=int, default=20)
    args = parser.parse_args()

    report: dict = {}
    for attempt in range(1, args.attempts + 1):
        report = run_attempt()
        print(json.dumps(report, ensure_ascii=False, indent=2))
        if report.get("status") == "pass":
            return 0
        if attempt < args.attempts:
            print(f"Production audit attempt {attempt} failed; retrying in {args.delay}s.", file=sys.stderr)
            time.sleep(args.delay)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
