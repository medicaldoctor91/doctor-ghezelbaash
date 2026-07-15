#!/usr/bin/env python3
import argparse
import json
import re
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

SITE = "https://www.ghezelbaash.ir"
OUTPUT = Path("production-audit")
SCRIPT_RE = re.compile(
    r'<script\b[^>]*id="homepage-entity-graph"[^>]*type="application/ld\+json"[^>]*>([\s\S]*?)</script>',
    re.IGNORECASE,
)


def fetch(url: str):
    request = Request(url, headers={
        "User-Agent": "Ghezelbaash-Schema-Visibility-Verifier/2.0",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Accept": "text/html,application/ld+json;q=1.0,*/*;q=0.1",
    })
    try:
        with urlopen(request, timeout=45) as response:
            return response.status, dict(response.headers.items()), response.read()
    except HTTPError as error:
        return error.code, dict(error.headers.items()), error.read()


def header(headers, name):
    target = name.lower()
    for key, value in headers.items():
        if key.lower() == target:
            return value
    return ""


def verify(commit: str):
    cache = f"schema={commit}-{int(time.time())}"
    home_status, home_headers, home_body = fetch(f"{SITE}/?{cache}")
    html = home_body.decode("utf-8", errors="replace")
    head = re.search(r"<head>([\s\S]*?)</head>", html, re.IGNORECASE)
    head_html = head.group(1) if head else ""
    script = SCRIPT_RE.search(head_html)
    script_position = head_html.find('id="homepage-entity-graph"')
    describedby_position = head_html.find('rel="describedby"')
    alternate_position = head_html.find('rel="alternate"')
    inline_graph = {}
    inline_error = None
    if script:
        try:
            inline_graph = json.loads(script.group(1))
        except json.JSONDecodeError as error:
            inline_error = str(error)

    graph_status, graph_headers, graph_body = fetch(f"{SITE}/knowledge-graph.jsonld?{cache}")
    external_graph = {}
    external_error = None
    try:
        external_graph = json.loads(graph_body.decode("utf-8"))
    except json.JSONDecodeError as error:
        external_error = str(error)

    inline_nodes = inline_graph.get("@graph", []) if isinstance(inline_graph, dict) else []
    external_nodes = external_graph.get("@graph", []) if isinstance(external_graph, dict) else []
    inline_ids = {node.get("@id") for node in inline_nodes if isinstance(node, dict)}
    external_ids = {node.get("@id") for node in external_nodes if isinstance(node, dict)}
    person = f"{SITE}/#mohammad-saeed-ghezelbash"
    clinic = f"{SITE}/#dr-saeed-ghezelbash-aesthetic-clinic"
    graph_x_robots = header(graph_headers, "x-robots-tag").lower()
    graph_cache = header(graph_headers, "cache-control").lower()
    graph_disposition = header(graph_headers, "content-disposition").lower()

    checks = {
        "homepageStatus200": home_status == 200,
        "inlineScriptInHead": script is not None,
        "stableInlineScriptId": 'id="homepage-entity-graph"' in head_html,
        "fullSchemaMarker": 'data-schema-completeness="full"' in head_html,
        "schemaNearStartOfHead": script_position >= 0 and script_position < 4000,
        "describedByBeforeSchema": describedby_position >= 0 and describedby_position < script_position,
        "alternateBeforeSchema": alternate_position >= 0 and alternate_position < script_position,
        "inlineJsonParses": inline_error is None and isinstance(inline_graph, dict),
        "inlineGraphPreserved": len(inline_nodes) >= 120 and len(script.group(1).encode("utf-8")) >= 100_000 if script else False,
        "inlinePerson": person in inline_ids,
        "inlineClinic": clinic in inline_ids,
        "externalStatus200": graph_status == 200,
        "externalContentType": header(graph_headers, "content-type").lower().startswith("application/ld+json"),
        "externalCrawlable": "noindex" not in graph_x_robots,
        "externalFresh": "max-age=0" in graph_cache and "must-revalidate" in graph_cache,
        "externalInlineDisposition": "inline" in graph_disposition,
        "externalCors": header(graph_headers, "access-control-allow-origin") == "*",
        "externalJsonParses": external_error is None and isinstance(external_graph, dict),
        "externalGraphPreserved": len(external_nodes) >= 600 and len(graph_body) >= 750_000,
        "externalPerson": person in external_ids,
        "externalClinic": clinic in external_ids,
        "inlineIsExternalSubset": inline_ids.issubset(external_ids),
    }

    evidence = {
        "commit": commit,
        "verifiedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "pass" if all(checks.values()) else "fail",
        "checks": checks,
        "inline": {
            "nodes": len(inline_nodes),
            "bytes": len(script.group(1).encode("utf-8")) if script else 0,
            "parseError": inline_error,
            "position": script_position,
        },
        "external": {
            "status": graph_status,
            "contentType": header(graph_headers, "content-type"),
            "xRobotsTag": header(graph_headers, "x-robots-tag"),
            "cacheControl": header(graph_headers, "cache-control"),
            "contentDisposition": header(graph_headers, "content-disposition"),
            "nodes": len(external_nodes),
            "bytes": len(graph_body),
            "parseError": external_error,
        },
    }
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "schema-visibility.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUTPUT / "schema-home.html").write_text(html, encoding="utf-8")
    (OUTPUT / "schema-external.jsonld").write_bytes(graph_body)
    return evidence


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", required=True)
    parser.add_argument("--attempts", type=int, default=18)
    parser.add_argument("--delay", type=int, default=20)
    args = parser.parse_args()
    last = None
    for attempt in range(1, args.attempts + 1):
        try:
            last = verify(args.commit)
        except (URLError, TimeoutError) as error:
            last = {"status": "fail", "error": str(error)}
        print(json.dumps({"attempt": attempt, **last}, ensure_ascii=False, indent=2))
        if last.get("status") == "pass":
            return 0
        if attempt < args.attempts:
            time.sleep(args.delay)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
