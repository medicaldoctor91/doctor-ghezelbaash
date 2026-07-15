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
OUTPUT = Path("production-audit")
PERSON_ID = f"{BASE}#mohammad-saeed-ghezelbash"
CLINIC_ID = f"{BASE}#dr-saeed-ghezelbash-aesthetic-clinic"
WEBSITE_ID = f"{BASE}#website"
WEBPAGE_ID = f"{BASE}#webpage"
ARTICLE_ID = f"{BASE}#article"
CONTENT_TABLE_ID = f"{BASE}#content-table"
EXPECTED_H1 = "دکتر سعید قزلباش؛ پزشک زیبایی، پوست و مو در کرمانشاه"
EXPECTED_HTTP_LINK = '</knowledge-graph.jsonld>; rel="describedby"; type="application/ld+json"'
MAPS_URL = "https://www.google.com/maps?cid=12350483144643112463"
MAP_RESOURCES = {
    MAPS_URL,
    "https://www.google.com/maps/search/?api=1&query=کلینیک%20زیبایی%20دکتر%20قزلباش%20کرمانشاه&query_place_id=ChIJBTOYDOTt-j8RD-7mAPy6Zas",
    "https://www.openstreetmap.org/node/13530287096",
}
OFFICIAL_PERSON_SOCIALS = {
    "https://www.instagram.com/doctor.ghezelbaash/",
    "https://www.linkedin.com/in/saeed-ghezelbash-93310a96",
    "https://www.facebook.com/Ghezelbaash/",
}
HUGGING_FACE_DATASET = "https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data"
SECTION_IDS = [
    "best-aesthetic-doctor-kermanshah",
    "aesthetic-services-kermanshah",
    "aesthetic-treatment-selection",
    "injectable-aesthetic-treatments",
    "lifting-and-facial-aging",
    "skin-scar-rejuvenation",
    "hair-loss-and-restoration",
    "submental-and-body-contouring",
    "aesthetic-surgery-and-referral",
    "revision-complications-and-safety",
    "aesthetic-cost-and-consultation",
    "aesthetic-faq-kermanshah-iran",
    "medical-research-and-education",
    "clinic-information-kermanshah",
    "knowledge-graph-and-datasets",
    "sources-contact-and-appointment",
]
VIDEO_SLUGS = [
    "home-workshop-thread-lift-training",
    "home-workshop-thread-lift-advanced",
    "clinic-patient-experience-review",
    "botox-vs-subcision-dynamic-static-scar",
    "filler-under-eye-transformation",
    "filler-under-eye-before-after",
    "cat-eye-thread-lift-before-after",
    "jalupro-vs-profhilo-skin-boosters",
    "nonsurgical-rhinoplasty-boundary",
    "nose-filler-before-after",
    "proper-subcision-technique-guide",
    "mesoneedling-dark-spots-warning",
]
FOOTER_GROUPS = [
    "medical-registration",
    "research-identifiers",
    "official-networks",
    "clinic-location",
    "machine-data",
]
LEGACY_ENTITY_IDS = {f"{BASE}#person", f"{BASE}#clinic", f"{BASE}#doctor"}
RFC3339 = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$")


def as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def node_types(node: dict[str, Any] | None) -> set[str]:
    return {str(item) for item in as_list((node or {}).get("@type"))}


def stable(value: Any) -> Any:
    if isinstance(value, list):
        return [stable(item) for item in value]
    if isinstance(value, dict):
        return {key: stable(value[key]) for key in sorted(value)}
    return value


def pick(node: dict[str, Any] | None, fields: list[str]) -> dict[str, Any]:
    node = node or {}
    return {field: node[field] for field in fields if field in node}


def fetch(path_or_url: str, *, headers: dict[str, str] | None = None, timeout: int = 45) -> tuple[int, str, dict[str, str], bytes]:
    url = path_or_url if path_or_url.startswith("http") else urllib.parse.urljoin(BASE, path_or_url.lstrip("/"))
    request = urllib.request.Request(url, headers={
        "User-Agent": "GhezelbaashProductionAudit/9.0",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Accept-Encoding": "identity",
        **(headers or {}),
    })
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.geturl(), {key.lower(): value for key, value in response.headers.items()}, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.geturl(), {key.lower(): value for key, value in error.headers.items()}, error.read()


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []
        self.hrefs: list[str] = []
        self.fragment_hrefs: list[str] = []
        self.canonicals: list[str] = []
        self.author_links: list[str] = []
        self.described_by: list[str] = []
        self.rel_me: list[str] = []
        self.hreflang: list[str] = []
        self.text_alternates: list[str] = []
        self.videos: list[dict[str, str]] = []
        self.sources: list[dict[str, str]] = []
        self.contextual_images = 0
        self.footer_groups: list[str] = []
        self.footer_links: list[str] = []
        self.h1_count = 0
        self._ld_depth = 0
        self._ld_buffer: list[str] = []
        self.ldjson: list[str] = []

    @staticmethod
    def attrs_dict(attrs: list[tuple[str, str | None]]) -> dict[str, str]:
        return {key: value or "" for key, value in attrs}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = self.attrs_dict(attrs)
        if data.get("id"):
            self.ids.append(data["id"])
        if tag == "a":
            href = data.get("href", "")
            self.hrefs.append(href)
            if href.startswith("#"):
                self.fragment_hrefs.append(href[1:])
        if tag == "link":
            rel = set(data.get("rel", "").split())
            href = data.get("href", "")
            if "canonical" in rel:
                self.canonicals.append(href)
            if "author" in rel:
                self.author_links.append(href)
            if "describedby" in rel:
                self.described_by.append(href)
            if "me" in rel:
                self.rel_me.append(href)
            if data.get("hreflang"):
                self.hreflang.append(href)
            if "alternate" in rel and data.get("type") == "text/plain":
                self.text_alternates.append(href)
        if tag == "video":
            self.videos.append(data)
        if tag == "source":
            self.sources.append(data)
        if tag == "img" and "data-contextual-image" in data:
            self.contextual_images += 1
        if "data-contextual-image" in data:
            self.contextual_images += 1
        if data.get("data-footer-group"):
            self.footer_groups.append(data["data-footer-group"])
        if data.get("data-footer-link"):
            self.footer_links.append(data["data-footer-link"])
        if tag == "h1":
            self.h1_count += 1
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


def parse_json(data: bytes, label: str, failures: list[str]) -> Any:
    try:
        return json.loads(data.decode("utf-8-sig"))
    except Exception as error:  # noqa: BLE001
        failures.append(f"{label}: invalid JSON: {error}")
        return {}


def parse_inline_graph(parser: PageParser, failures: list[str]) -> dict[str, Any]:
    if len(parser.ldjson) != 1:
        failures.append(f"homepage: expected one inline JSON-LD block, found {len(parser.ldjson)}")
        return {"@graph": []}
    try:
        graph = json.loads(parser.ldjson[0])
        return graph if isinstance(graph, dict) else {"@graph": []}
    except Exception as error:  # noqa: BLE001
        failures.append(f"homepage: invalid inline JSON-LD: {error}")
        return {"@graph": []}


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


def graph_audit(label: str, graph: dict[str, Any], failures: list[str]) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    nodes = [node for node in graph.get("@graph", []) if isinstance(node, dict)]
    identifiers = [node.get("@id") for node in nodes if node.get("@id")]
    by_id = {node.get("@id"): node for node in nodes if node.get("@id")}
    if len(identifiers) != len(set(identifiers)):
        failures.append(f"{label}: duplicate @id values")
    refs: set[str] = set()
    collect_same_site_refs(nodes, refs)
    dangling = sorted(refs - set(identifiers))
    if dangling:
        failures.append(f"{label}: dangling same-site references: {', '.join(dangling[:10])}")
    for legacy in LEGACY_ENTITY_IDS:
        if legacy in by_id or legacy in refs:
            failures.append(f"{label}: legacy entity ID remains: {legacy}")
    return nodes, by_id


def audit_entity_contract(label: str, by_id: dict[str, dict[str, Any]], failures: list[str]) -> None:
    person = by_id.get(PERSON_ID, {})
    clinic = by_id.get(CLINIC_ID, {})
    page = by_id.get(WEBPAGE_ID, {})
    article = by_id.get(ARTICLE_ID, {})
    toc = by_id.get(CONTENT_TABLE_ID, {})
    if "Person" not in node_types(person):
        failures.append(f"{label}: canonical Person missing")
    if not {"MedicalClinic", "LocalBusiness"}.issubset(node_types(clinic)):
        failures.append(f"{label}: canonical Clinic types incomplete")
    if not {"MedicalWebPage", "ProfilePage"}.issubset(node_types(page)):
        failures.append(f"{label}: Homepage types incomplete")
    if page.get("mainEntity", {}).get("@id") != PERSON_ID or isinstance(page.get("mainEntity"), list):
        failures.append(f"{label}: Person is not the sole Homepage mainEntity")
    if page.get("name") != EXPECTED_H1 or page.get("headline") != EXPECTED_H1 or article.get("headline") != EXPECTED_H1:
        failures.append(f"{label}: H1/WebPage/Article headline parity failed")
    if person.get("url") != PERSON_ID or clinic.get("url") != CLINIC_ID:
        failures.append(f"{label}: canonical entity url mismatch")
    if person.get("worksFor", {}).get("@id") != CLINIC_ID or person.get("workLocation", {}).get("@id") != CLINIC_ID:
        failures.append(f"{label}: Person-to-Clinic relationship incomplete")
    if clinic.get("employee", {}).get("@id") != PERSON_ID:
        failures.append(f"{label}: Clinic.employee mismatch")
    if clinic.get("hasMap") != MAPS_URL:
        failures.append(f"{label}: Clinic.hasMap mismatch")
    aggregate = clinic.get("aggregateRating", {})
    if aggregate.get("ratingValue") != 5 or aggregate.get("bestRating") != 5 or aggregate.get("ratingCount") != 163 or aggregate.get("reviewCount") != 163:
        failures.append(f"{label}: Clinic aggregateRating mismatch {aggregate}")
    person_same_as = set(as_list(person.get("sameAs")))
    clinic_same_as = set(as_list(clinic.get("sameAs")))
    if not OFFICIAL_PERSON_SOCIALS.issubset(person_same_as):
        failures.append(f"{label}: official Person social profiles incomplete")
    if OFFICIAL_PERSON_SOCIALS & clinic_same_as:
        failures.append(f"{label}: Person social profile leaked into Clinic.sameAs")
    if MAP_RESOURCES & clinic_same_as:
        failures.append(f"{label}: map resource leaked into Clinic.sameAs")
    if "ItemList" not in node_types(toc) or toc.get("numberOfItems") != len(SECTION_IDS):
        failures.append(f"{label}: Content Table ItemList mismatch")
    items = as_list(toc.get("itemListElement"))
    if len(items) != len(SECTION_IDS):
        failures.append(f"{label}: Content Table item count mismatch")
    for index, fragment in enumerate(SECTION_IDS):
        section = by_id.get(f"{BASE}#{fragment}", {})
        if "WebPageElement" not in node_types(section):
            failures.append(f"{label}: section WebPageElement missing: {fragment}")
        if index < len(items) and items[index].get("item", {}).get("@id") != f"{BASE}#{fragment}":
            failures.append(f"{label}: Content Table order mismatch at {fragment}")
    video_nodes = [node for node in by_id.values() if "VideoObject" in node_types(node)]
    if len(video_nodes) != len(VIDEO_SLUGS):
        failures.append(f"{label}: expected {len(VIDEO_SLUGS)} VideoObject nodes, found {len(video_nodes)}")
    for slug in VIDEO_SLUGS:
        video = by_id.get(f"{BASE}#video-{slug}", {})
        if "VideoObject" not in node_types(video):
            failures.append(f"{label}: VideoObject missing: {slug}")
        if video.get("creator", {}).get("@id") != PERSON_ID or video.get("publisher", {}).get("@id") != CLINIC_ID:
            failures.append(f"{label}: VideoObject responsibility mismatch: {slug}")
    for key in ("datePublished", "dateModified"):
        if not RFC3339.match(str(article.get(key, ""))):
            failures.append(f"{label}: Article {key} lacks timezone-aware RFC3339")


def audit_once(cache_key: str) -> tuple[list[str], dict[str, Any]]:
    failures: list[str] = []
    report: dict[str, Any] = {"status": "fail", "stage": 9, "cacheKey": cache_key}
    OUTPUT.mkdir(exist_ok=True)

    status, final_url, headers, body = fetch(f"{BASE}?production-audit={urllib.parse.quote(cache_key)}")
    html = body.decode("utf-8", errors="replace")
    (OUTPUT / "production.html").write_text(html, encoding="utf-8")
    if status != 200:
        failures.append(f"homepage: expected 200, got {status}")
    if not final_url.startswith(BASE):
        failures.append(f"homepage: unexpected final URL {final_url}")
    if "text/html" not in headers.get("content-type", ""):
        failures.append("homepage: invalid Content-Type")
    for key, expected in {
        "content-language": "fa-IR",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
    }.items():
        if expected.lower() not in headers.get(key, "").lower():
            failures.append(f"homepage: missing or invalid {key}")
    if "max-age=" not in headers.get("strict-transport-security", ""):
        failures.append("homepage: HSTS header missing")
    if headers.get("link", "").strip() != EXPECTED_HTTP_LINK:
        failures.append(f"homepage: HTTP Link mismatch {headers.get('link', '') or 'missing'}")

    parser = PageParser()
    parser.feed(html)
    h1_match = re.search(r'<h1\b[^>]*id="page-title"[^>]*>([\s\S]*?)</h1>', html)
    h1_text = re.sub(r"<[^>]+>", " ", h1_match.group(1) if h1_match else "")
    h1_text = re.sub(r"\s+", " ", h1_text).strip()
    if parser.h1_count != 1 or h1_text != EXPECTED_H1:
        failures.append(f"homepage: H1 contract mismatch count={parser.h1_count} text={h1_text}")
    if parser.canonicals != [BASE]:
        failures.append(f"homepage: canonical mismatch {parser.canonicals}")
    if parser.author_links != [PERSON_ID]:
        failures.append(f"homepage: author link mismatch {parser.author_links}")
    if parser.described_by != [f"{BASE}knowledge-graph.jsonld"]:
        failures.append(f"homepage: describedby mismatch {parser.described_by}")
    if parser.rel_me or parser.hreflang or parser.text_alternates:
        failures.append("homepage: forbidden rel=me, hreflang or text alternate in head")
    if len(parser.ids) != len(set(parser.ids)):
        failures.append("homepage: duplicate HTML IDs")
    broken_fragments = sorted({fragment for fragment in parser.fragment_hrefs if fragment and fragment not in set(parser.ids)})
    if broken_fragments:
        failures.append(f"homepage: broken fragments: {', '.join(broken_fragments[:10])}")
    for fragment in ["mohammad-saeed-ghezelbash", "dr-saeed-ghezelbash-aesthetic-clinic", "content-table", *SECTION_IDS]:
        if parser.ids.count(fragment) != 1:
            failures.append(f"homepage: canonical ID missing or duplicated: {fragment}")
    for legacy in ("person", "clinic", "doctor", "services", "search-intent-hub", "clinic-reputation"):
        if legacy in parser.ids:
            failures.append(f"homepage: legacy HTML ID returned: {legacy}")
    section_positions = [html.find(f'id="{fragment}"') for fragment in SECTION_IDS]
    if any(value < 0 for value in section_positions) or section_positions != sorted(section_positions):
        failures.append("homepage: canonical section order mismatch")
    toc_start = html.find('id="content-table"')
    toc_end = html.find("</nav>", toc_start)
    toc_html = html[toc_start:toc_end]
    toc_order = [fragment for fragment in re.findall(r'href="#([^"]+)"', toc_html) if fragment in SECTION_IDS]
    if toc_order != SECTION_IDS:
        failures.append(f"homepage: Content Table order mismatch {toc_order}")
    if len(parser.videos) != len(VIDEO_SLUGS):
        failures.append(f"homepage: expected {len(VIDEO_SLUGS)} videos, found {len(parser.videos)}")
    for index, video in enumerate(parser.videos, start=1):
        if video.get("preload") != "none" or not video.get("poster") or not video.get("width") or not video.get("height"):
            failures.append(f"homepage: video {index} lacks preload/poster/dimensions")
    mp4_sources = [item for item in parser.sources if item.get("type") == "video/mp4"]
    if len(mp4_sources) != len(VIDEO_SLUGS):
        failures.append(f"homepage: expected {len(VIDEO_SLUGS)} MP4 sources, found {len(mp4_sources)}")
    if any(re.match(r"^/videos/[^/]+/$", href) for href in parser.hrefs):
        failures.append("homepage: removed video watch-page link returned")
    clinic_start = html.find('id="clinic-information-kermanshah"')
    graph_start = html.find('id="knowledge-graph-and-datasets"')
    testimonial_start = html.find('id="video-clinic-patient-experience-review"')
    if not (clinic_start < testimonial_start < graph_start):
        failures.append("homepage: Clinic testimonial is outside Clinic section")
    if "رضایت زیباجو از خدمات زیبایی دکتر سعید قزلباش" not in html[testimonial_start:html.find("</figure>", testimonial_start)]:
        failures.append("homepage: approved Clinic testimonial title missing")
    education_start = html.find('id="medical-education"')
    for slug in ("home-workshop-thread-lift-training", "home-workshop-thread-lift-advanced"):
        value = html.find(f'id="video-{slug}"')
        if not (education_start < value < clinic_start):
            failures.append(f"homepage: medical education video misplaced: {slug}")
    if parser.footer_groups != FOOTER_GROUPS:
        failures.append(f"homepage: Footer group order mismatch {parser.footer_groups}")
    if len(parser.footer_links) != len(set(parser.footer_links)) or len(parser.footer_links) < 25:
        failures.append(f"homepage: Footer directory IDs invalid count={len(parser.footer_links)}")
    footer_start = html.find("<footer")
    footer_end = html.find("</footer>", footer_start)
    if "https://ig.me/m/doctor.ghezelbaash" in html[footer_start:footer_end]:
        failures.append("homepage: Instagram Direct leaked into Footer directory")
    if len(body) >= 700_000:
        failures.append(f"homepage: raw payload exceeds 700KB ({len(body)})")

    inline = parse_inline_graph(parser, failures)
    inline_nodes, inline_by_id = graph_audit("inline graph", inline, failures)
    audit_entity_contract("inline graph", inline_by_id, failures)
    if len(inline_nodes) > 150:
        failures.append(f"inline graph: unexpectedly broad ({len(inline_nodes)} nodes)")

    endpoint_specs = {
        "knowledge-graph.jsonld": "application/ld+json",
        "llms.txt": "text/plain",
        "robots.txt": "text/plain",
        "sitemap.xml": "application/xml",
        "image-sitemap.xml": "application/xml",
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
    canonical_nodes, canonical_by_id = graph_audit("canonical graph", canonical, failures)
    audit_entity_contract("canonical graph", canonical_by_id, failures)
    if len(canonical_nodes) < 500:
        failures.append(f"canonical graph: unexpectedly narrow ({len(canonical_nodes)} nodes)")
    if not set(inline_by_id).issubset(set(canonical_by_id)):
        failures.append("canonical graph: not a superset of inline graph")

    parity_fields = {
        PERSON_ID: ["@type", "@id", "name", "url", "worksFor", "workLocation", "affiliation"],
        CLINIC_ID: ["@type", "@id", "name", "url", "telephone", "address", "geo", "hasMap", "employee", "aggregateRating"],
        WEBSITE_ID: ["@type", "@id", "url", "name", "creator", "publisher", "about"],
        WEBPAGE_ID: ["@type", "@id", "url", "name", "headline", "mainEntity", "author", "reviewedBy", "publisher"],
        ARTICLE_ID: ["@type", "@id", "headline", "mainEntity", "author", "reviewedBy", "publisher"],
        CONTENT_TABLE_ID: ["@type", "@id", "name", "numberOfItems", "itemListElement"],
    }
    for fragment in SECTION_IDS:
        parity_fields[f"{BASE}#{fragment}"] = ["@type", "@id", "name", "url", "isPartOf", "about"]
    for slug in VIDEO_SLUGS:
        parity_fields[f"{BASE}#video-{slug}"] = ["@type", "@id", "name", "description", "contentUrl", "thumbnailUrl", "isPartOf", "about"]
    parity_failures = [identifier for identifier, fields in parity_fields.items() if stable(pick(inline_by_id.get(identifier), fields)) != stable(pick(canonical_by_id.get(identifier), fields))]
    if parity_failures:
        failures.append(f"graph parity mismatch: {', '.join(parity_failures[:10])}")

    dataset = canonical_by_id.get(HUGGING_FACE_DATASET, {})
    if "Dataset" not in node_types(dataset) or dataset.get("creator", {}).get("@id") != PERSON_ID or dataset.get("publisher", {}).get("@id") != CLINIC_ID:
        failures.append("knowledge graph: Hugging Face Dataset separation mismatch")

    llms = endpoint_data["llms.txt"][1].decode("utf-8", errors="replace")
    ai_text = endpoint_data[".well-known/ai.txt"][1].decode("utf-8", errors="replace")
    for label, text in (("llms.txt", llms), ("ai.txt", ai_text)):
        if PERSON_ID not in text or CLINIC_ID not in text or f"{BASE}#content-table" not in text:
            failures.append(f"{label}: canonical entity or Content Table URI missing")
        if f"{BASE}#person" in text or f"{BASE}#clinic" in text:
            failures.append(f"{label}: legacy entity URI returned")
    if "No separate canonical video watch pages" not in ai_text:
        failures.append("ai.txt: removed watch-page contract missing")

    robots = endpoint_data["robots.txt"][1].decode("utf-8", errors="replace")
    for path in ("sitemap.xml", "image-sitemap.xml"):
        if f"Sitemap: {BASE}{path}" not in robots:
            failures.append(f"robots.txt: missing {path}")
    if "video-sitemap.xml" in robots:
        failures.append("robots.txt: obsolete video sitemap returned")
    video_sitemap_status, _, _, _ = fetch(f"video-sitemap.xml?production-audit={urllib.parse.quote(cache_key)}")
    if video_sitemap_status == 200:
        failures.append("/video-sitemap.xml: obsolete sitemap is still published")

    try:
        sitemap_root = ET.fromstring(endpoint_data["sitemap.xml"][1])
        sitemap_locs = [element.text for element in sitemap_root.findall("{http://www.sitemaps.org/schemas/sitemap/0.9}url/{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
        if sitemap_locs != [BASE]:
            failures.append(f"sitemap.xml: expected only canonical Homepage, found {sitemap_locs}")
    except Exception as error:  # noqa: BLE001
        failures.append(f"sitemap.xml: invalid XML: {error}")

    try:
        image_root = ET.fromstring(endpoint_data["image-sitemap.xml"][1])
        image_locs = image_root.findall("{http://www.sitemaps.org/schemas/sitemap/0.9}url/{http://www.sitemaps.org/schemas/sitemap/0.9}loc")
        if len(image_locs) != 1 or image_locs[0].text != BASE:
            failures.append("image-sitemap.xml: assets are not bound only to canonical Homepage")
    except Exception as error:  # noqa: BLE001
        failures.append(f"image-sitemap.xml: invalid XML: {error}")

    removed_watch_statuses = []
    for slug in VIDEO_SLUGS:
        watch_status, _, _, _ = fetch(f"videos/{slug}/?production-audit={urllib.parse.quote(cache_key)}")
        removed_watch_statuses.append(watch_status)
        if watch_status == 200:
            failures.append(f"removed watch page still returns 200: /videos/{slug}/")

    manifest = parse_json(endpoint_data["site.webmanifest"][1], "site.webmanifest", failures)
    if not manifest.get("name") or manifest.get("start_url") not in ("/", BASE):
        failures.append("site.webmanifest: name or start_url missing")
    if any(shortcut.get("url") == "/#videos" for shortcut in as_list(manifest.get("shortcuts")) if isinstance(shortcut, dict)):
        failures.append("site.webmanifest: obsolete video shortcut returned")

    security_text = endpoint_data[".well-known/security.txt"][1].decode("utf-8", errors="replace")
    if "Contact:" not in security_text or "Expires:" not in security_text:
        failures.append("security.txt: Contact or Expires missing")

    not_found_status, _, not_found_headers, not_found_body = fetch(f"missing-production-audit-{cache_key}.html")
    robots_parser = RobotsMetaParser()
    robots_parser.feed(not_found_body.decode("utf-8", errors="replace"))
    if not_found_status != 404:
        failures.append(f"404: expected 404, got {not_found_status}")
    if "noindex" not in not_found_headers.get("x-robots-tag", "") and not robots_parser.noindex:
        failures.append("404: noindex control missing in header and HTML")

    if mp4_sources:
        video_url = urllib.parse.urljoin(BASE, mp4_sources[0].get("src", ""))
        range_status, _, range_headers, range_body = fetch(video_url, headers={"Range": "bytes=0-1023"})
        if range_status != 206:
            failures.append(f"video range: expected 206, got {range_status}")
        if "bytes" not in range_headers.get("accept-ranges", "") and "bytes" not in range_headers.get("content-range", ""):
            failures.append("video range: byte-range headers missing")
        if not range_body:
            failures.append("video range: empty response")

    report.update({
        "status": "pass" if not failures else "fail",
        "homepageBytes": len(body),
        "htmlIds": len(parser.ids),
        "sections": len(SECTION_IDS),
        "homepageVideos": len(parser.videos),
        "footerGroups": len(parser.footer_groups),
        "footerLinks": len(parser.footer_links),
        "inlineGraphNodes": len(inline_nodes),
        "canonicalGraphNodes": len(canonical_nodes),
        "videoSchemaNodes": len([node for node in canonical_nodes if "VideoObject" in node_types(node)]),
        "watchPagesReturning200": sum(1 for item in removed_watch_statuses if item == 200),
        "canonicalPerson": PERSON_ID,
        "canonicalClinic": CLINIC_ID,
        "graphParityNodes": len(parity_fields),
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
            last_report = {"status": "fail", "stage": 9, "failures": last_failures, "cacheKey": cache_key}
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
