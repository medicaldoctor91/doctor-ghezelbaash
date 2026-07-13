#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

BASE = "https://www.ghezelbaash.ir/"
SITE_ID = BASE
OUTPUT = Path("production-audit")
RFC3339 = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$")
REQUIRED_SAME_AS = {
    "https://orcid.org/0009-0001-9346-8475",
    "https://www.instagram.com/doctor.ghezelbaash/",
    "https://www.linkedin.com/in/saeed-ghezelbash-93310a96",
    "https://www.facebook.com/Ghezelbaash/",
    "https://www.pinterest.com/qezelbaash/",
    "https://www.wikidata.org/entity/Q140287622",
    "https://huggingface.co/Ghezelbaash",
    "https://github.com/Medicaldoctor91",
    "https://www.ncbi.nlm.nih.gov/myncbi/saeed.ghezelbash.1/bibliography/public/",
}
REQUIRED_IDENTIFIERS = {
    ("IRIMC", "167430"),
    ("ORCID", "0009-0001-9346-8475"),
    ("Wikidata", "Q140287622"),
    ("MINC", "CAMD-0224-1997"),
    ("NCBI Bibliography", "saeed.ghezelbash.1"),
    ("Hugging Face Profile", "Ghezelbaash"),
}
OWNED_HEAD_LINKS = {
    "https://orcid.org/0009-0001-9346-8475",
    "https://www.instagram.com/doctor.ghezelbaash/",
    "https://www.linkedin.com/in/saeed-ghezelbash-93310a96",
    "https://www.facebook.com/Ghezelbaash/",
    "https://www.pinterest.com/qezelbaash/",
}


def as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def node_types(node: dict[str, Any] | None) -> set[str]:
    return {str(item) for item in as_list((node or {}).get("@type"))}


def fetch(path_or_url: str, *, headers: dict[str, str] | None = None, timeout: int = 45) -> tuple[int, str, dict[str, str], bytes]:
    url = path_or_url if path_or_url.startswith("http") else urllib.parse.urljoin(BASE, path_or_url.lstrip("/"))
    request_headers = {
        "User-Agent": "GhezelbaashProductionAudit/1.0",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Accept-Encoding": "identity",
        **(headers or {}),
    }
    request = urllib.request.Request(url, headers=request_headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.geturl(), {key.lower(): value for key, value in response.headers.items()}, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.geturl(), {key.lower(): value for key, value in error.headers.items()}, error.read()


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []
        self.fragment_hrefs: list[str] = []
        self.rel_me: list[str] = []
        self.canonicals: list[str] = []
        self.stylesheets: list[str] = []
        self.images: list[dict[str, str]] = []
        self.videos: list[dict[str, str]] = []
        self.sources: list[dict[str, str]] = []
        self.sections: list[str] = []
        self.h1_count = 0
        self.quiet_best: list[dict[str, str]] = []
        self.article_flow = 0
        self.guide_cards = 0
        self.contextual_images = 0
        self._ld_depth = 0
        self._ld_buffer: list[str] = []
        self.ldjson: list[str] = []

    @staticmethod
    def attrs_dict(attrs: list[tuple[str, str | None]]) -> dict[str, str]:
        return {key: value or "" for key, value in attrs}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = self.attrs_dict(attrs)
        classes = set(data.get("class", "").split())
        if "id" in data:
            self.ids.append(data["id"])
        if tag == "a" and data.get("href", "").startswith("#"):
            self.fragment_hrefs.append(data["href"][1:])
        if tag == "link":
            rel = set(data.get("rel", "").split())
            if "me" in rel:
                self.rel_me.append(data.get("href", ""))
            if "canonical" in rel:
                self.canonicals.append(data.get("href", ""))
            if "stylesheet" in rel:
                self.stylesheets.append(data.get("href", ""))
        if tag == "img":
            self.images.append(data)
        if tag == "video":
            self.videos.append(data)
        if tag == "source":
            self.sources.append(data)
        if tag == "section" and "id" in data:
            self.sections.append(data["id"])
        if tag == "h1":
            self.h1_count += 1
        if tag == "details" and "quiet-best" in classes:
            self.quiet_best.append(data)
        if "article-flow" in classes:
            self.article_flow += 1
        if "guide-card" in classes:
            self.guide_cards += 1
        if "data-contextual-image" in data:
            self.contextual_images += 1
        if tag == "script" and data.get("type") == "application/ld+json":
            self._ld_depth = 1
            self._ld_buffer = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._ld_depth:
            self.ldjson.append("".join(self._ld_buffer).strip())
            self._ld_depth = 0
            self._ld_buffer = []

    def handle_data(self, data: str) -> None:
        if self._ld_depth:
            self._ld_buffer.append(data)


def parse_json(data: bytes, label: str, failures: list[str]) -> Any:
    try:
        return json.loads(data.decode("utf-8-sig"))
    except Exception as error:  # noqa: BLE001
        failures.append(f"{label}: invalid JSON: {error}")
        return {}


def collect_same_site_refs(value: Any, output: set[str]) -> None:
    if isinstance(value, list):
        for item in value:
            collect_same_site_refs(item, output)
    elif isinstance(value, dict):
        identifier = value.get("@id")
        if isinstance(identifier, str) and identifier.startswith(BASE):
            output.add(identifier)
        for item in value.values():
            collect_same_site_refs(item, output)


def audit_once(cache_key: str) -> tuple[list[str], dict[str, Any]]:
    failures: list[str] = []
    report: dict[str, Any] = {"status": "fail", "cacheKey": cache_key}

    homepage_url = f"{BASE}?production-audit={urllib.parse.quote(cache_key)}"
    status, final_url, headers, body = fetch(homepage_url)
    html = body.decode("utf-8", errors="replace")
    OUTPUT.mkdir(exist_ok=True)
    (OUTPUT / "production.html").write_text(html, encoding="utf-8")

    if status != 200:
        failures.append(f"homepage: expected 200, got {status}")
    if not final_url.startswith(BASE):
        failures.append(f"homepage: unexpected final URL {final_url}")
    content_type = headers.get("content-type", "")
    if "text/html" not in content_type:
        failures.append(f"homepage: invalid Content-Type {content_type}")
    for key, expected in {
        "content-language": "fa-IR",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
    }.items():
        if expected.lower() not in headers.get(key, "").lower():
            failures.append(f"homepage: missing or invalid {key}")
    if "max-age=" not in headers.get("strict-transport-security", ""):
        failures.append("homepage: HSTS header missing")
    if "describedby" not in headers.get("link", "") or "knowledge-graph.jsonld" not in headers.get("link", ""):
        failures.append("homepage: HTTP Link describedby header missing")

    csp = headers.get("content-security-policy", "")
    if "static.cloudflareinsights.com/beacon.min.js" in html:
        if "https://static.cloudflareinsights.com" not in csp:
            failures.append("homepage: CSP blocks injected Cloudflare analytics script")
        if "https://cloudflareinsights.com" not in csp:
            failures.append("homepage: CSP blocks Cloudflare analytics beacon connection")

    parser = PageParser()
    parser.feed(html)
    if parser.h1_count != 1:
        failures.append(f"homepage: expected one H1, found {parser.h1_count}")
    if len(parser.ids) != len(set(parser.ids)):
        failures.append("homepage: duplicate HTML IDs")
    broken_fragments = sorted({fragment for fragment in parser.fragment_hrefs if fragment and fragment not in set(parser.ids)})
    if broken_fragments:
        failures.append(f"homepage: broken fragments: {', '.join(broken_fragments[:10])}")
    if parser.canonicals != [BASE]:
        failures.append(f"homepage: canonical mismatch {parser.canonicals}")
    if set(parser.rel_me) != OWNED_HEAD_LINKS:
        failures.append(f"homepage: rel=me set mismatch {sorted(parser.rel_me)}")
    if len(parser.quiet_best) != 1 or "open" in parser.quiet_best[0]:
        failures.append("homepage: best-doctor wrapper must exist once and stay closed")
    if parser.article_flow != 1 or parser.guide_cards != 0:
        failures.append("homepage: continuous article contract failed")
    if any(item in parser.sections for item in ("videos", "clinic", "doctor", "decision-model")):
        failures.append("homepage: standalone media or artificial section returned")
    if len(parser.videos) != 12:
        failures.append(f"homepage: expected 12 videos, found {len(parser.videos)}")
    for index, video in enumerate(parser.videos, start=1):
        if video.get("preload") != "none" or not video.get("poster") or not video.get("width") or not video.get("height"):
            failures.append(f"homepage: video {index} lacks preload/poster/dimensions")
    mp4_sources = [item for item in parser.sources if item.get("type") == "video/mp4"]
    if len(mp4_sources) != 12:
        failures.append(f"homepage: expected 12 MP4 sources, found {len(mp4_sources)}")
    if parser.contextual_images < 11:
        failures.append(f"homepage: contextual images unexpectedly low: {parser.contextual_images}")
    for index, image in enumerate(parser.images, start=1):
        if "alt" not in image or not image.get("width") or not image.get("height"):
            failures.append(f"homepage: image {index} lacks alt or dimensions")
    if len(parser.ldjson) != 1:
        failures.append(f"homepage: expected one inline JSON-LD block, found {len(parser.ldjson)}")
        inline = {"@graph": []}
    else:
        try:
            inline = json.loads(parser.ldjson[0])
        except Exception as error:  # noqa: BLE001
            failures.append(f"homepage: inline JSON-LD is invalid: {error}")
            inline = {"@graph": []}

    inline_nodes = inline.get("@graph", []) if isinstance(inline, dict) else []
    inline_by_id = {node.get("@id"): node for node in inline_nodes if isinstance(node, dict) and node.get("@id")}
    if len(inline_nodes) > 60:
        failures.append(f"inline graph too broad: {len(inline_nodes)} nodes")
    if any(node_types(node) & {"VideoObject", "Clip", "ScholarlyArticle"} for node in inline_nodes):
        failures.append("inline graph contains disallowed video, clip, or research nodes")

    person = inline_by_id.get(f"{SITE_ID}#person", {})
    clinic = inline_by_id.get(f"{SITE_ID}#clinic", {})
    page = inline_by_id.get(f"{SITE_ID}#webpage", {})
    article = inline_by_id.get(f"{SITE_ID}#article", {})
    if not REQUIRED_SAME_AS.issubset(set(as_list(person.get("sameAs")))):
        failures.append("inline Person sameAs is incomplete")
    identifiers = {(item.get("propertyID"), item.get("value")) for item in as_list(person.get("identifier")) if isinstance(item, dict)}
    if not REQUIRED_IDENTIFIERS.issubset(identifiers):
        failures.append("inline Person identifiers are incomplete")
    if clinic.get("address", {}).get("postalCode") != "6714657412":
        failures.append("inline clinic postalCode is incorrect")
    if page.get("mainEntity", {}).get("@id") != f"{SITE_ID}#person":
        failures.append("inline page mainEntity is not Person")
    for key in ("datePublished", "dateModified"):
        if not RFC3339.match(str(article.get(key, ""))):
            failures.append(f"inline Article {key} lacks timezone-aware RFC3339 value")

    allowed_medical_types = {"MedicalProcedure", "SurgicalProcedure", "MedicalTest", "MedicalTherapy"}
    available_refs = as_list(clinic.get("availableService"))
    if not available_refs:
        failures.append("inline clinic has no availableService entries")
    for item in available_refs:
        identifier = item.get("@id") if isinstance(item, dict) else None
        node = inline_by_id.get(identifier, {})
        if not node_types(node) & allowed_medical_types:
            failures.append(f"inline availableService has invalid type: {identifier}")
        if node_types(node) & {"Service", "WebPageElement"}:
            failures.append(f"inline availableService points to non-medical node: {identifier}")
    if f"{SITE_ID}#service-coverage-panel" in inline_by_id:
        failures.append("inline graph contains service-coverage WebPageElement")
    for identifier, node in inline_by_id.items():
        if identifier.startswith(f"{SITE_ID}#service-") and "Service" not in node_types(node):
            failures.append(f"inline #service-* node is not Service: {identifier}")

    endpoint_specs = {
        "knowledge-graph.jsonld": "application/ld+json",
        "llms.txt": "text/plain",
        "robots.txt": "text/plain",
        "sitemap.xml": "application/xml",
        "image-sitemap.xml": "application/xml",
        "video-sitemap.xml": "application/xml",
        "site.webmanifest": "application/manifest+json",
        ".well-known/ai.txt": "text/plain",
        ".well-known/security.txt": "text/plain",
    }
    endpoint_data: dict[str, tuple[dict[str, str], bytes]] = {}
    for path, expected_type in endpoint_specs.items():
        endpoint_status, _, endpoint_headers, endpoint_body = fetch(path)
        endpoint_data[path] = (endpoint_headers, endpoint_body)
        if endpoint_status != 200:
            failures.append(f"/{path}: expected 200, got {endpoint_status}")
        if expected_type not in endpoint_headers.get("content-type", ""):
            failures.append(f"/{path}: invalid Content-Type {endpoint_headers.get('content-type', '')}")

    graph_headers, graph_body = endpoint_data["knowledge-graph.jsonld"]
    if "noindex" not in graph_headers.get("x-robots-tag", ""):
        failures.append("knowledge graph: X-Robots-Tag noindex missing")
    if graph_headers.get("access-control-allow-origin") != "*":
        failures.append("knowledge graph: CORS wildcard missing")
    canonical = parse_json(graph_body, "knowledge graph", failures)
    canonical_nodes = canonical.get("@graph", []) if isinstance(canonical, dict) else []
    canonical_ids = [node.get("@id") for node in canonical_nodes if isinstance(node, dict) and node.get("@id")]
    canonical_defined = set(canonical_ids)
    if len(canonical_nodes) < 800:
        failures.append(f"knowledge graph: unexpectedly narrow ({len(canonical_nodes)} nodes)")
    if len(canonical_ids) != len(canonical_defined):
        failures.append("knowledge graph: duplicate @id values")
    canonical_refs: set[str] = set()
    collect_same_site_refs(canonical_nodes, canonical_refs)
    dangling = sorted(canonical_refs - canonical_defined)
    if dangling:
        failures.append(f"knowledge graph: dangling same-site references: {', '.join(dangling[:10])}")
    canonical_by_id = {node.get("@id"): node for node in canonical_nodes if isinstance(node, dict) and node.get("@id")}
    if f"{SITE_ID}#knowledge-graph-dataset" not in canonical_by_id:
        failures.append("knowledge graph: Dataset node missing")
    canonical_person = canonical_by_id.get(f"{SITE_ID}#person", {})
    if not REQUIRED_SAME_AS.issubset(set(as_list(canonical_person.get("sameAs")))):
        failures.append("knowledge graph: Person sameAs is incomplete")

    llms = endpoint_data["llms.txt"][1].decode("utf-8", errors="replace")
    for token in ("CAMD-0224-1997", "LinkedIn", "Facebook", "Pinterest", "6714657412"):
        if token not in llms:
            failures.append(f"llms.txt: missing {token}")
    robots = endpoint_data["robots.txt"][1].decode("utf-8", errors="replace")
    for path in ("sitemap.xml", "image-sitemap.xml", "video-sitemap.xml"):
        if f"Sitemap: {BASE}{path}" not in robots:
            failures.append(f"robots.txt: missing {path}")

    try:
        sitemap_root = ET.fromstring(endpoint_data["sitemap.xml"][1])
        sitemap_locs = [element.text for element in sitemap_root.findall("{http://www.sitemaps.org/schemas/sitemap/0.9}url/{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
        if sitemap_locs != [BASE]:
            failures.append(f"sitemap.xml: canonical URL mismatch {sitemap_locs}")
    except Exception as error:  # noqa: BLE001
        failures.append(f"sitemap.xml: invalid XML: {error}")

    try:
        video_root = ET.fromstring(endpoint_data["video-sitemap.xml"][1])
        video_items = video_root.findall(".//{http://www.google.com/schemas/sitemap-video/1.1}video")
        if len(video_items) != 12:
            failures.append(f"video-sitemap.xml: expected 12 videos, found {len(video_items)}")
    except Exception as error:  # noqa: BLE001
        failures.append(f"video-sitemap.xml: invalid XML: {error}")

    try:
        image_root = ET.fromstring(endpoint_data["image-sitemap.xml"][1])
        image_items = image_root.findall(".//{http://www.google.com/schemas/sitemap-image/1.1}image")
        if len(image_items) < 13:
            failures.append(f"image-sitemap.xml: too few images ({len(image_items)})")
    except Exception as error:  # noqa: BLE001
        failures.append(f"image-sitemap.xml: invalid XML: {error}")

    manifest = parse_json(endpoint_data["site.webmanifest"][1], "site.webmanifest", failures)
    if not manifest.get("name") or manifest.get("start_url") not in ("/", BASE):
        failures.append("site.webmanifest: name or start_url missing")
    if len(as_list(manifest.get("icons"))) < 1:
        failures.append("site.webmanifest: icons missing")

    ai_text = endpoint_data[".well-known/ai.txt"][1].decode("utf-8", errors="replace")
    if f"Canonical physician entity: {BASE}#person" not in ai_text or "CAMD-0224-1997" not in ai_text:
        failures.append("ai.txt: physician identity anchors incomplete")
    security_text = endpoint_data[".well-known/security.txt"][1].decode("utf-8", errors="replace")
    if "Contact:" not in security_text or "Expires:" not in security_text:
        failures.append("security.txt: Contact or Expires missing")

    not_found_status, _, not_found_headers, _ = fetch(f"missing-production-audit-{cache_key}.html")
    if not_found_status != 404:
        failures.append(f"404: expected 404, got {not_found_status}")
    if "noindex" not in not_found_headers.get("x-robots-tag", ""):
        failures.append("404: X-Robots-Tag noindex missing")

    if mp4_sources:
        video_url = urllib.parse.urljoin(BASE, mp4_sources[0].get("src", ""))
        range_status, _, range_headers, range_body = fetch(video_url, headers={"Range": "bytes=0-1023"})
        if range_status != 206:
            failures.append(f"video range: expected 206, got {range_status}")
        if "bytes" not in range_headers.get("accept-ranges", "") and "bytes" not in range_headers.get("content-range", ""):
            failures.append("video range: byte-range headers missing")
        if not range_body:
            failures.append("video range: empty response")

    if parser.images:
        image_url = urllib.parse.urljoin(BASE, parser.images[0].get("src", ""))
        image_status, _, image_headers, image_body = fetch(image_url)
        if image_status != 200 or not image_headers.get("content-type", "").startswith("image/") or not image_body:
            failures.append("representative image is not fetchable")

    if parser.stylesheets:
        css_url = urllib.parse.urljoin(BASE, parser.stylesheets[0])
        css_status, _, css_headers, css_body = fetch(css_url)
        if css_status != 200 or "text/css" not in css_headers.get("content-type", "") or not css_body:
            failures.append("main stylesheet is not fetchable")

    report.update({
        "status": "pass" if not failures else "fail",
        "homepageBytes": len(body),
        "htmlIds": len(parser.ids),
        "videos": len(parser.videos),
        "contextualImages": parser.contextual_images,
        "inlineGraphNodes": len(inline_nodes),
        "inlineAvailableMedicalServices": len(available_refs),
        "canonicalGraphNodes": len(canonical_nodes),
        "contentSecurityPolicy": csp,
        "endpointsChecked": len(endpoint_specs),
        "failures": failures,
    })
    (OUTPUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return failures, report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--attempts", type=int, default=1)
    parser.add_argument("--delay", type=int, default=20)
    args = parser.parse_args()

    last_failures: list[str] = []
    last_report: dict[str, Any] = {}
    for attempt in range(1, args.attempts + 1):
        cache_key = f"{int(time.time())}-{attempt}"
        try:
            last_failures, last_report = audit_once(cache_key)
        except Exception as error:  # noqa: BLE001
            last_failures = [f"audit execution error: {error}"]
            last_report = {"status": "fail", "failures": last_failures, "cacheKey": cache_key}
            OUTPUT.mkdir(exist_ok=True)
            (OUTPUT / "report.json").write_text(json.dumps(last_report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(last_report, ensure_ascii=False, indent=2))
        if not last_failures:
            return 0
        if attempt < args.attempts:
            print(f"Production audit attempt {attempt} failed; retrying in {args.delay}s.", file=sys.stderr)
            time.sleep(args.delay)

    print("Production audit failed after all attempts.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
