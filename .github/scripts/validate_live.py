#!/usr/bin/env python3
"""Validate the deployed Cloudflare Pages site against the current source tree."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urljoin

BASE = "https://www.ghezelbaash.ir/"
APEX = "https://ghezelbaash.ir/"
PAGES = "https://doctor-ghezelbaash.pages.dev/"
PRODUCTION_PATHS = (
    "src", "public", "astro.config.mjs", "package.json", "package-lock.json", ".node-version",
)

errors: list[str] = []
warnings: list[str] = []


def require(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def warn(condition: bool, message: str) -> None:
    if not condition:
        warnings.append(message)


@dataclass
class Response:
    url: str
    status: int | None
    effective_url: str
    headers: str
    body: bytes

    @property
    def header_map(self) -> dict[str, list[str]]:
        output: dict[str, list[str]] = {}
        blocks = [block for block in self.headers.replace("\r\n", "\n").split("\n\n") if block.strip()]
        block = blocks[-1] if blocks else self.headers
        for line in block.splitlines()[1:]:
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            output.setdefault(key.strip().lower(), []).append(value.strip())
        return output

    def header(self, name: str) -> str:
        return ", ".join(self.header_map.get(name.lower(), []))


def fetch(url: str, *, follow: bool = False, range_header: str | None = None, timeout: int = 60) -> Response:
    body_path = Path("live-audit") / (hashlib.sha256((url + str(follow) + str(range_header)).encode()).hexdigest() + ".body")
    command = [
        "curl", "-sS", "--compressed", "--max-time", str(timeout),
        "-H", "Cache-Control: no-cache",
        "-D", "-", "-o", str(body_path),
        "-w", "\n__META__%{http_code}\t%{url_effective}",
    ]
    if follow:
        command.append("-L")
    if range_header:
        command.extend(["-H", f"Range: {range_header}"])
    command.append(url)
    process = subprocess.run(command, capture_output=True, text=True)
    output = process.stdout
    headers, meta = output.rsplit("\n__META__", 1) if "\n__META__" in output else (output, "")
    parts = meta.strip().split("\t")
    status = int(parts[0]) if parts and parts[0].isdigit() else None
    effective = parts[1] if len(parts) > 1 else url
    body = body_path.read_bytes() if body_path.exists() else b""
    if process.returncode != 0:
        errors.append(f"curl failed for {url}: {process.stderr.strip()}")
    return Response(url=url, status=status, effective_url=effective, headers=headers, body=body)


def deployment_marker(html: str) -> str | None:
    match = re.search(r'<meta\s+name=["\']x-deploy-commit["\']\s+content=["\']([0-9a-f]{7,40}|local)["\']', html, re.I)
    if not match:
        match = re.search(r'<meta\s+content=["\']([0-9a-f]{7,40}|local)["\']\s+name=["\']x-deploy-commit["\']', html, re.I)
    return match.group(1) if match else None


def sha_matches(expected_sha: str | None, marker: str | None) -> bool:
    return bool(expected_sha and marker and (expected_sha.startswith(marker) or marker.startswith(expected_sha)))


def production_equivalent(expected_sha: str | None, marker: str | None) -> bool:
    if not expected_sha or not marker:
        return False
    if not re.fullmatch(r"[0-9a-f]{40}", expected_sha) or not re.fullmatch(r"[0-9a-f]{40}", marker):
        return False
    subprocess.run(
        ["git", "fetch", "--quiet", "--no-tags", "origin", expected_sha, marker],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False,
    )
    probe = subprocess.run(
        ["git", "diff", "--quiet", expected_sha, marker, "--", *PRODUCTION_PATHS],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False,
    )
    return probe.returncode == 0


def wait_for_deployment(expected_sha: str | None, timeout: int) -> Response:
    deadline = time.time() + timeout
    last = fetch(BASE, follow=True)
    while expected_sha and time.time() < deadline:
        html = last.body.decode("utf-8", errors="replace")
        marker = deployment_marker(html)
        if marker and (sha_matches(expected_sha, marker) or production_equivalent(expected_sha, marker)):
            return last
        print(f"Waiting for Cloudflare deployment: expected={expected_sha}, live={marker}", flush=True)
        time.sleep(15)
        last = fetch(BASE, follow=True)
    return last


def same_bytes(label: str, live: bytes, source_path: str) -> None:
    source = Path(source_path).read_bytes()
    require(live == source, f"{label} differs from current source ({hashlib.sha256(live).hexdigest()} != {hashlib.sha256(source).hexdigest()})")


def is_compressed(response: Response) -> bool:
    encodings = {value.strip().lower() for value in response.header("content-encoding").split(",") if value.strip()}
    return bool(encodings & {"br", "gzip", "zstd"})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--expected-sha", default=None)
    parser.add_argument("--deployment-timeout", type=int, default=600)
    args = parser.parse_args()

    Path("live-audit").mkdir(exist_ok=True)
    root = wait_for_deployment(args.expected_sha, args.deployment_timeout)
    root_html = root.body.decode("utf-8", errors="replace")
    marker = deployment_marker(root_html)

    require(root.status == 200, f"canonical root returned {root.status}")
    if args.expected_sha:
        require(bool(marker), "live HTML has no x-deploy-commit marker")
        require(bool(marker) and (sha_matches(args.expected_sha, marker) or production_equivalent(args.expected_sha, marker)), f"Cloudflare is not serving expected or production-equivalent commit: expected={args.expected_sha}, live={marker}")
    require(len(root.body) < 1_900_000, f"live uncompressed HTML exceeds 1.90 MB: {len(root.body)} bytes")
    require(is_compressed(root), f"live root is not content-encoded: {root.header('content-encoding') or 'none'}")
    require('rel="canonical" href="https://www.ghezelbaash.ir/"' in root_html or 'href="https://www.ghezelbaash.ir/" rel="canonical"' in root_html, "live canonical link is incorrect")
    require("در حال معاینه بالینی مراجعه‌کننده" not in root_html, "live root contains obsolete Office wording")
    require("PresentationDigitalDocument" in root_html, "live root lacks PresentationDigitalDocument")
    require('"priceRange":"$$$$"' in root_html or '"priceRange": "$$$$"' in root_html, "live root lacks premium priceRange")
    require("static.cloudflareinsights.com" not in root_html and "cloudflareinsights.com" not in root_html, "Cloudflare Web Analytics script is injected into live HTML")

    csp = root.header("content-security-policy")
    link = root.header("link")
    require(bool(csp), "live root has no Content-Security-Policy header")
    for directive in ("script-src-attr 'none'", "style-src-attr 'none'", "connect-src 'self'", "object-src 'none'", "frame-ancestors 'none'"):
        require(directive in csp, f"live CSP misses {directive}")
    require("'unsafe-inline'" not in csp and "'unsafe-eval'" not in csp, "live CSP contains an unsafe execution source")
    require("graph.jsonld" in link and 'rel="describedby"' in link, "live root Link header does not discover graph.jsonld")
    require("graph.ttl" in link and 'rel="describedby"' in link, "live root Link header does not discover graph.ttl")
    require(root.header("content-language").lower() == "fa-ir", "live root Content-Language is not fa-IR")

    # Canonicalization must happen before content is served.
    apex = fetch(APEX, follow=False)
    require(apex.status in {301, 308}, f"apex must redirect permanently to www, got {apex.status}")
    require(apex.header("location").startswith(BASE.rstrip("/")), f"apex redirect target is wrong: {apex.header('location')}")
    http = fetch("http://www.ghezelbaash.ir/", follow=False)
    require(http.status in {301, 308}, f"HTTP www must redirect permanently to HTTPS, got {http.status}")
    require(http.header("location").startswith(BASE.rstrip("/")), f"HTTP redirect target is wrong: {http.header('location')}")
    index = fetch(BASE + "index.html", follow=False)
    require(index.status in {301, 308}, f"/index.html must redirect permanently, got {index.status}")
    require(index.header("location") in {"/", BASE}, f"/index.html redirect target is wrong: {index.header('location')}")

    # Machine-readable resources must be current, correctly typed and cross-origin readable.
    graph = fetch(BASE + "graph.jsonld", follow=True)
    ttl = fetch(BASE + "graph.ttl", follow=True)
    sitemap = fetch(BASE + "sitemap.xml", follow=True)
    robots = fetch(BASE + "robots.txt", follow=True)
    for label, response in (("graph", graph), ("ttl", ttl), ("sitemap", sitemap), ("robots", robots)):
        require(response.status == 200, f"{label} returned {response.status}")
    require("application/ld+json" in graph.header("content-type"), f"graph MIME is wrong: {graph.header('content-type')}")
    require("text/turtle" in ttl.header("content-type"), f"Turtle MIME is wrong: {ttl.header('content-type')}")
    require(graph.header("access-control-allow-origin") == "*", "graph CORS is not public")
    require(ttl.header("access-control-allow-origin") == "*", "Turtle CORS is not public")
    require("graph.ttl" in graph.header("link") and "alternate" in graph.header("link"), "graph Link header lacks Turtle alternate")
    require("graph.jsonld" in ttl.header("link") and "alternate" in ttl.header("link"), "Turtle Link header lacks JSON-LD alternate")
    same_bytes("live graph.jsonld", graph.body, "public/graph.jsonld")
    same_bytes("live graph.ttl", ttl.body, "public/graph.ttl")
    same_bytes("live sitemap.xml", sitemap.body, "public/sitemap.xml")
    same_bytes("live robots.txt", robots.body, "public/robots.txt")

    # Verify native not-found behavior without assigning significance to disposable development URLs.
    response = fetch(urljoin(BASE, "__production-validation-not-found__"), follow=False)
    require(response.status in {404, 410}, f"unknown path returned {response.status}, expected 404 or 410")
    require(response.header("location") == "", f"unknown path redirects to {response.header('location')}")

    # Preview hostname must be redirected or excluded from indexing.
    pages = fetch(PAGES, follow=False)
    if pages.status in {301, 308}:
        require(pages.header("location").startswith(BASE.rstrip("/")), f"pages.dev redirect target is wrong: {pages.header('location')}")
    else:
        require(pages.status == 200, f"pages.dev returned unexpected status {pages.status}")
        require("noindex" in pages.header("x-robots-tag").lower(), "pages.dev is not protected by X-Robots-Tag: noindex")

    # Identity image headers must retain entity/license discovery.
    image_targets = {
        "portrait": "media/images/physician/master/saeed-ghezelbaash-physician-portrait.jpg",
        "team": "media/images/physician/master/saeed-ghezelbaash-with-clinical-team.jpg",
        "office": "media/images/physician/master/saeed-ghezelbaash-in-clinical-office.jpg",
    }
    for label, path in image_targets.items():
        response = fetch(urljoin(BASE, path), follow=True)
        require(response.status == 200, f"{label} master image returned {response.status}")
        image_link = response.header("link")
        require("graph.jsonld" in image_link and "describedby" in image_link, f"{label} image lacks graph discovery")
        require("creativecommons.org/licenses/by/4.0" in image_link and "license" in image_link, f"{label} image lacks CC BY 4.0 Link header")

    report = {
        "expectedSha": args.expected_sha,
        "liveMarker": marker,
        "rootBytes": len(root.body),
        "rootStatus": root.status,
        "contentEncoding": root.header("content-encoding"),
        "apexStatus": apex.status,
        "httpStatus": http.status,
        "indexStatus": index.status,
        "graphSha256": hashlib.sha256(graph.body).hexdigest(),
        "ttlSha256": hashlib.sha256(ttl.body).hexdigest(),
        "warnings": warnings,
        "errors": errors,
    }
    Path("live-audit/http-summary.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    for warning in warnings:
        print("WARNING:", warning)
    if errors:
        for error in errors:
            print("ERROR:", error, file=sys.stderr)
        raise SystemExit(f"{len(errors)} live validation error(s)")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
