#!/usr/bin/env python3
"""Aggregate repeated Lighthouse reports and enforce final quality gates."""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path


def score_100(category: dict | None) -> int | None:
    score = category.get("score") if isinstance(category, dict) else None
    return round(score * 100) if isinstance(score, (int, float)) else None


def agentic_result(data: dict) -> dict:
    categories = data.get("categories", {})
    category = categories.get("agentic-browsing") or categories.get("agentic")
    if not isinstance(category, dict):
        return {"available": False, "passed": 0, "applicable": 0, "failed": []}
    audits = data.get("audits", {})
    passed = 0
    applicable = 0
    failed: list[str] = []
    for reference in category.get("auditRefs", []):
        audit_id = reference.get("id")
        audit = audits.get(audit_id, {})
        mode = audit.get("scoreDisplayMode")
        if mode in {"notApplicable", "manual", "informative"}:
            continue
        applicable += 1
        if audit.get("score") == 1:
            passed += 1
        else:
            failed.append(audit_id)
    return {"available": True, "passed": passed, "applicable": applicable, "failed": failed}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", default="live-audit")
    parser.add_argument("--enforce-performance-100", action="store_true")
    parser.add_argument("--enforce-agentic", action="store_true")
    args = parser.parse_args()

    directory = Path(args.directory)
    errors: list[str] = []
    report: dict[str, dict] = {}

    for mode in ("mobile", "desktop"):
        rows: list[dict] = []
        for path in sorted(directory.glob(f"lighthouse-{mode}-*.json")):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                categories = data["categories"]
                audits = data["audits"]
                agentic = agentic_result(data)
                row = {
                    "file": path.name,
                    "performance": score_100(categories.get("performance")),
                    "accessibility": score_100(categories.get("accessibility")),
                    "bestPractices": score_100(categories.get("best-practices")),
                    "seo": score_100(categories.get("seo")),
                    "lcp": audits.get("largest-contentful-paint", {}).get("numericValue"),
                    "fcp": audits.get("first-contentful-paint", {}).get("numericValue"),
                    "tbt": audits.get("total-blocking-time", {}).get("numericValue"),
                    "cls": audits.get("cumulative-layout-shift", {}).get("numericValue"),
                    "speedIndex": audits.get("speed-index", {}).get("numericValue"),
                    "totalByteWeight": audits.get("total-byte-weight", {}).get("numericValue"),
                    "mainThreadWork": audits.get("mainthread-work-breakdown", {}).get("numericValue"),
                    "agentic": agentic,
                }
                rows.append(row)
            except Exception as exc:
                errors.append(f"{path}: {exc}")

        if not rows:
            errors.append(f"no Lighthouse reports found for {mode}")
            report[mode] = {"runs": [], "median": {}}
            continue

        numeric_keys = (
            "performance", "accessibility", "bestPractices", "seo", "lcp", "fcp",
            "tbt", "cls", "speedIndex", "totalByteWeight", "mainThreadWork",
        )
        medians = {}
        for key in numeric_keys:
            values = [row[key] for row in rows if isinstance(row.get(key), (int, float))]
            medians[key] = statistics.median(values) if values else None
        report[mode] = {"runs": rows, "median": medians}

        for row in rows:
            for category in ("accessibility", "bestPractices", "seo"):
                if row[category] != 100:
                    errors.append(f"{mode} {row['file']}: {category} score is {row[category]}, expected 100")
            if args.enforce_performance_100 and row["performance"] != 100:
                errors.append(f"{mode} {row['file']}: performance score is {row['performance']}, expected 100")
            if isinstance(row.get("cls"), (int, float)) and row["cls"] > 0:
                errors.append(f"{mode} {row['file']}: CLS is {row['cls']}, expected 0")
            agentic = row["agentic"]
            if args.enforce_agentic:
                if not agentic["available"]:
                    errors.append(f"{mode} {row['file']}: Agentic Browsing category is unavailable")
                elif agentic["applicable"] < 3:
                    errors.append(f"{mode} {row['file']}: only {agentic['applicable']} Agentic Browsing checks were applicable")
                elif agentic["passed"] != agentic["applicable"]:
                    errors.append(f"{mode} {row['file']}: Agentic Browsing failed {agentic['failed']}")

    output = directory / "lighthouse-summary.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))

    if errors:
        for error in errors:
            print("ERROR:", error, file=sys.stderr)
        raise SystemExit(f"{len(errors)} Lighthouse validation error(s)")


if __name__ == "__main__":
    main()
