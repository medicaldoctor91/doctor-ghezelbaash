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
VIDEO_SITEMAP_FAILURE = "/video-sitemap.xml: obsolete sitemap is still published"
HUGGING_FACE_PROFILE = "https://huggingface.co/Ghezelbaash"
HUGGING_FACE_DATASET = "https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data"
EXPECTED_REL_ME = {
    "https://orcid.org/0009-0001-9346-8475",
    "https://www.instagram.com/doctor.ghezelbaash/",
    "https://www.linkedin.com/in/saeed-ghezelbash-93310a96",
    "https://www.facebook.com/Ghezelbaash/",
    "https://www.pinterest.com/qezelbaash/",
}
EXPECTED_DESCRIBED_BY = {
    f"{BASE}knowledge-graph.jsonld",
    HUGGING_FACE_DATASET,
    "https://www.wikidata.org/entity/Q140287622",
    "https://www.wikidata.org/entity/Q140288589",
    "https://www.wikidata.org/entity/Q140304972",
}
EXPECTED_TEXT_ALTERNATES = {
    f"{BASE}llms.txt",
    f"{BASE}.well-known/ai.txt",
}
EXPECTED_HTTP_LINK_TOKENS = {
    "knowledge-graph.jsonld",
    "llms.txt",
    ".well-known/ai.txt",
    HUGGING_FACE_DATASET,
    "https://www.wikidata.org/entity/Q140287622",
    "https://www.wikidata.org/entity/Q140288589",
    "https://www.wikidata.org/entity/Q140304972",
}


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


class HeadLinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rel_me: set[str] = set()
        self.described_by: set[str] = set()
        self.text_alternates: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "link":
            return
        data = {key.lower(): (value or "") for key, value in attrs}
        rel = set(data.get("rel", "").split())
        href = data.get("href", "")
        if "me" in rel:
            self.rel_me.add(href)
        if "describedby" in rel:
            self.described_by.add(href)
        if "alternate" in rel and data.get("type") == "text/plain":
            self.text_alternates.add(href)


def fetch_url(url: str) -> tuple[int, bytes]:
    status, _, body = fetch_url_with_headers(url)
    return status, body


def fetch_url_with_headers(url: str) -> tuple[int, dict[str, str], bytes]:
    request = urllib.request.Request(url, headers={
        "User-Agent": "GhezelbaashProductionAudit/3.2",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Accept-Encoding": "identity",
    })
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return response.status, {key.lower(): value for key, value in response.headers.items()}, response.read()
    except urllib.error.HTTPError as error:
        return error.code, {key.lower(): value for key, value in error.headers.items()}, error.read()


def reconcile_404(report: dict) -> dict:
    failures = list(report.get("failures", []))
    if HEADER_ONLY_FAILURE not in failures:
        return report

    cache_key = str(report.get("cacheKey", int(time.time())))
    status, body = fetch_url(urllib.parse.urljoin(BASE, f"missing-production-audit-{cache_key}.html"))
    parser = RobotsMetaParser()
    parser.feed(body.decode("utf-8", errors="replace"))
    if status == 404 and parser.noindex:
        failures.remove(HEADER_ONLY_FAILURE)
        report["notFoundIndexingControl"] = "meta robots noindex"
    else:
        report["notFoundIndexingControl"] = {"status": status, "metaNoindex": parser.noindex}

    report["failures"] = failures
    report["status"] = "pass" if not failures else "fail"
    return report


def reconcile_removed_video_sitemap(report: dict) -> dict:
    failures = list(report.get("failures", []))
    if VIDEO_SITEMAP_FAILURE not in failures:
        return report

    cache_key = urllib.parse.quote(str(report.get("cacheKey", int(time.time()))))
    url = f"{BASE}video-sitemap.xml?production-audit={cache_key}"
    status, _ = fetch_url(url)
    if status != 200:
        failures.remove(VIDEO_SITEMAP_FAILURE)
    report["removedVideoSitemapStatus"] = status
    report["failures"] = failures
    report["status"] = "pass" if not failures else "fail"
    return report


def reconcile_head_links(report: dict) -> dict:
    failures = [item for item in report.get("failures", []) if not item.startswith("homepage: rel=me set mismatch")]
    cache_key = urllib.parse.quote(str(report.get("cacheKey", int(time.time()))))
    status, headers, body = fetch_url_with_headers(f"{BASE}?head-contract={cache_key}")
    parser = HeadLinkParser()
    parser.feed(body.decode("utf-8", errors="replace"))

    if status != 200:
        failures.append(f"head contract: expected homepage 200, got {status}")
    if parser.rel_me != EXPECTED_REL_ME:
        failures.append(f"head contract: rel=me set mismatch {sorted(parser.rel_me)}")
    if HUGGING_FACE_PROFILE in parser.rel_me:
        failures.append("head contract: Hugging Face profile still appears as rel=me")
    if "https://www.instagram.com/doctor.ghezelbaash/" not in parser.rel_me:
        failures.append("head contract: Instagram rel=me missing")
    missing_described = sorted(EXPECTED_DESCRIBED_BY - parser.described_by)
    if missing_described:
        failures.append(f"head contract: missing rel=describedby links {missing_described}")
    missing_alternates = sorted(EXPECTED_TEXT_ALTERNATES - parser.text_alternates)
    if missing_alternates:
        failures.append(f"head contract: missing text alternate links {missing_alternates}")

    link_header = headers.get("link", "")
    missing_header_tokens = sorted(token for token in EXPECTED_HTTP_LINK_TOKENS if token not in link_header)
    if missing_header_tokens:
        failures.append(f"head contract: HTTP Link header missing resources {missing_header_tokens}")

    report["headLinks"] = {
        "relMe": sorted(parser.rel_me),
        "describedBy": sorted(parser.described_by),
        "textAlternates": sorted(parser.text_alternates),
        "httpLinkHeaderComplete": not missing_header_tokens,
        "huggingFaceProfileRelMe": HUGGING_FACE_PROFILE in parser.rel_me,
        "instagramRelMe": "https://www.instagram.com/doctor.ghezelbaash/" in parser.rel_me,
    }
    report["failures"] = failures
    report["status"] = "pass" if not failures else "fail"
    return report


def persist(report: dict) -> dict:
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
    report = reconcile_404(report)
    report = reconcile_removed_video_sitemap(report)
    report = reconcile_head_links(report)
    return persist(report)


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
