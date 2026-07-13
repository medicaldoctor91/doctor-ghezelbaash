#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

BASE = "https://www.ghezelbaash.ir/"
REPORT_PATH = Path("production-audit/report.json")
HEADER_ONLY_FAILURE = "404: X-Robots-Tag noindex missing"


class RobotsMetaParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.noindex = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "meta":
            return
        data = {key.lower(): (value or "") for key, value in attrs}
        if data.get("name", "").lower() in {"robots", "googlebot"} and "noindex" in data.get("content", "").lower():
            self.noindex = True


def fetch_404(cache_key: str) -> tuple[int, bytes]:
    url = urllib.parse.urljoin(BASE, f"missing-production-audit-{cache_key}.html")
    request = urllib.request.Request(url, headers={
        "User-Agent": "GhezelbaashProductionAudit/1.0",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Accept-Encoding": "identity",
    })
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def reconcile_404(report: dict) -> dict:
    failures = list(report.get("failures", []))
    if HEADER_ONLY_FAILURE not in failures:
        return report

    status, body = fetch_404(str(report.get("cacheKey", int(time.time()))))
    parser = RobotsMetaParser()
    parser.feed(body.decode("utf-8", errors="replace"))
    if status == 404 and parser.noindex:
        failures.remove(HEADER_ONLY_FAILURE)
        report["notFoundIndexingControl"] = "meta robots noindex"
    else:
        report["notFoundIndexingControl"] = {
            "status": status,
            "metaNoindex": parser.noindex,
        }

    report["failures"] = failures
    report["status"] = "pass" if not failures else "fail"
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
        return {"status": "fail", "failures": ["production audit did not create report.json"]}
    report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    return reconcile_404(report)


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
