#!/usr/bin/env python3
"""Validate the frozen Astro source, build output, graph topology and CSP."""

from __future__ import annotations

import base64
import hashlib
import json
import re
import sys
from collections import Counter
from datetime import date, datetime
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree as ET

from rdflib import Graph
from rdflib.compare import isomorphic

ROOT = Path.cwd()
DIST = ROOT / "dist"
BASE = "https://www.ghezelbaash.ir/"
DOCTOR = BASE + "#saeed-ghezelbash"
CLINIC = BASE + "#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah"
PORTRAIT = BASE + "#image-saeed-ghezelbash-portrait-master"
TEAM = BASE + "#image-saeed-ghezelbash-clinical-team-master"
OFFICE = BASE + "#image-saeed-ghezelbash-clinical-office-master"
COURSE = BASE + "#advanced-thread-lift-workshop-course"
COURSE_INSTANCE = BASE + "#advanced-thread-lift-workshop-tehran-1403-11"
PRESENTATION = BASE + "#presentation-attachment-style-dissociative-depression-2017"
EVENT = BASE + "#event-wpa-xvii-world-congress-psychiatry-2017"
ARTICLE_2016 = BASE + "#article-omega-3-bipolar-i-2016"
ARTICLE_2021 = BASE + "#article-mdd-attachment-dissociation-trauma-2021"
COUNTRY_IR = BASE + "#country-iran"
COUNTRY_IQ = BASE + "#country-iraq"
DATASET = BASE + "graph.jsonld#dataset"
PROJECT = BASE + "#doctor-ghezelbaash-structured-data-project"
HISTORICAL_DATASET = BASE + "#historical-patient-origin-summary"
HISTORICAL_DOWNLOAD = BASE + "datasets/historical-patient-origin-summary.json#download"
GRAPH_VERSION = "1.2.1"
SCHOLAR_ID = BASE + "#identifier-person-google-scholar"
SCHOLAR_URL = "https://scholar.google.com/citations?user=BcWBirUAAAAJ"
KNOWLEDGE_PANEL_NAME = "Mohammad Saeed Ghezelbash"
VIDEO_UPLOAD_DATES = {
    BASE + "media/videos/education/saeed-ghezelbash-jalupro-vs-profhilo.mp4": "2024-12-18",
    BASE + "media/videos/education/saeed-ghezelbash-subcision-technique.mp4": "2025-01-16",
    BASE + "media/videos/education/saeed-ghezelbash-thread-lift-workshop.mp4": "2025-01-19",
    BASE + "media/videos/testimonials/saeed-ghezelbash-kurdish-patient-review.mp4": "2025-04-23",
}
COMMONS_IMAGE_IDS = {PORTRAIT, TEAM, OFFICE}

errors: list[str] = []


def require(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def read_text(path: str | Path) -> str:
    try:
        return Path(path).read_text(encoding="utf-8")
    except Exception as exc:
        errors.append(f"{path}: cannot read UTF-8 text: {exc}")
        return ""


def load_json(path: str | Path) -> dict:
    try:
        value = json.loads(read_text(path))
        require(isinstance(value, dict), f"{path}: root must be a JSON object")
        return value if isinstance(value, dict) else {}
    except Exception as exc:
        errors.append(f"{path}: invalid JSON: {exc}")
        return {}


def refs(value: object) -> list[str]:
    values = value if isinstance(value, list) else ([] if value is None else [value])
    output: list[str] = []
    for item in values:
        if isinstance(item, dict) and isinstance(item.get("@id"), str):
            output.append(item["@id"])
        elif isinstance(item, str):
            output.append(item)
    return output


def types(node: dict) -> set[str]:
    value = node.get("@type", [])
    return set(value if isinstance(value, list) else [value])


def valid_iso_date(value: object) -> bool:
    if not isinstance(value, str) or not value:
        return False
    try:
        if "T" in value:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed.tzinfo is not None
        date.fromisoformat(value)
        return True
    except ValueError:
        return False


def collect_ids(value: object) -> set[str]:
    found: set[str] = set()
    stack = [value]
    while stack:
        current = stack.pop()
        if isinstance(current, dict):
            identifier = current.get("@id")
            if isinstance(identifier, str):
                found.add(identifier)
            stack.extend(current.values())
        elif isinstance(current, list):
            stack.extend(current)
    return found


class DocumentParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.capture: str | None = None
        self.buffer: list[str] = []
        self.styles: list[str] = []
        self.scripts: list[str] = []
        self.external_scripts: list[str] = []
        self.stylesheets: list[str] = []
        self.ids: list[str] = []
        self.fragments: list[str] = []
        self.style_attrs: list[tuple[str, str]] = []
        self.event_attrs: list[tuple[str, str]] = []
        self.images: list[dict[str, str | None]] = []
        self.videos: list[dict[str, str | None]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = dict(attrs)
        if data.get("id"):
            self.ids.append(str(data["id"]))
        href = str(data.get("href") or "")
        if href.startswith("#"):
            self.fragments.append(href[1:])
        if data.get("style") is not None:
            self.style_attrs.append((tag, str(data["style"])))
        for key, _value in attrs:
            if key.lower().startswith("on"):
                self.event_attrs.append((tag, key))
        if tag == "img":
            self.images.append(data)
        if tag == "video":
            self.videos.append(data)
        if tag == "script" and data.get("src"):
            self.external_scripts.append(str(data["src"]))
        if tag == "link" and str(data.get("rel") or "").lower() == "stylesheet" and data.get("href"):
            self.stylesheets.append(str(data["href"]))
        if tag == "style":
            self.capture = "style"
            self.buffer = []
        elif tag == "script" and not data.get("src"):
            self.capture = "script"
            self.buffer = []

    def handle_data(self, data: str) -> None:
        if self.capture:
            self.buffer.append(data)

    def handle_entityref(self, name: str) -> None:
        if self.capture:
            self.buffer.append("&" + name + ";")

    def handle_charref(self, name: str) -> None:
        if self.capture:
            self.buffer.append("&#" + name + ";")

    def handle_endtag(self, tag: str) -> None:
        if tag == self.capture:
            value = "".join(self.buffer)
            (self.styles if tag == "style" else self.scripts).append(value)
            self.capture = None
            self.buffer = []


required_files = [
    "dist/index.html", "dist/404.html", "src/pages/index.md.ts", "dist/index.md",
    "public/graph.jsonld", "public/graph.ttl",
    "src/data/semantic/head-graph.min.jsonld", "public/_headers", "public/_redirects",
    "public/robots.txt", "public/sitemap.xml", "public/llms.txt", "public/llms-full.txt",
    "public/datasets/historical-patient-origin-summary.json",
    "public/doctor.vcf", "public/clinic.vcf", "public/favicon.svg", "public/favicon.ico",
    "public/favicon-48x48.png", "public/apple-touch-icon.png", "public/site.webmanifest",
    "public/media/images/physician/master/saeed-ghezelbaash-physician-portrait.jpg",
    "public/media/images/physician/master/saeed-ghezelbaash-with-clinical-team.jpg",
    "public/media/images/physician/master/saeed-ghezelbaash-in-clinical-office.jpg",
    "public/media/brand/doctor-ghezelbaash-symbol-512.png",
]
for filename in required_files:
    require(Path(filename).is_file(), f"missing required file: {filename}")

for filename in (
    "graph.jsonld", "graph.ttl", "_headers", "_redirects", "robots.txt", "sitemap.xml",
    "llms.txt", "llms-full.txt", "datasets/historical-patient-origin-summary.json",
    "doctor.vcf", "clinic.vcf", "favicon.svg", "favicon.ico",
    "favicon-48x48.png", "apple-touch-icon.png", "site.webmanifest",
):
    source = ROOT / "public" / filename
    built = DIST / filename
    require(built.is_file(), f"dist is missing public surface: {filename}")
    if source.is_file() and built.is_file():
        require(source.read_bytes() == built.read_bytes(), f"source → dist byte mismatch: {filename}")

identity_hashes = {
    "public/media/images/physician/master/saeed-ghezelbaash-physician-portrait.jpg": "236fe6eb5f3651de15cf72033a372ab027ceb3c84995074aafe6a6e20cf0d484",
    "public/media/images/physician/master/saeed-ghezelbaash-with-clinical-team.jpg": "144576a426ace532ca5b280590c673df2fad830ef8511789990d65538b1345e2",
    "public/media/images/physician/master/saeed-ghezelbaash-in-clinical-office.jpg": "09aa6fefed5c6491f270de999db57264049d567fd68cda7966540ea9e3b45c36",
    "public/media/brand/doctor-ghezelbaash-symbol-512.png": "5490580757998ac37fa310fac84b013f1ce896262e659004a34732f503eb2e02",
}
for filename, expected in identity_hashes.items():
    path = Path(filename)
    if path.is_file():
        require(hashlib.sha256(path.read_bytes()).hexdigest() == expected, f"identity asset hash changed: {filename}")

html = read_text(DIST / "index.html")
html_bytes = len(html.encode("utf-8"))
require(html_bytes < 1_900_000, f"HTML exceeds 1.90 MB safety gate: {html_bytes} bytes")
require('rel="canonical"' in html and BASE in html, "canonical homepage link is missing")
require('/graph.jsonld' in html and 'rel="describedby"' in html, "HTML does not discover graph.jsonld")
require('/graph.ttl' in html and 'rel="describedby"' in html, "HTML does not discover graph.ttl")
require('/llms.txt' in html and 'rel="describedby"' in html, "HTML does not discover llms.txt")
require('/datasets/historical-patient-origin-summary.json' in html and 'type="application/json"' in html, "HTML does not discover the historical Dataset")
require('rel="alternate" type="text/markdown" hreflang="fa-IR" href="https://www.ghezelbaash.ir/index.md"' in html, "HTML does not discover index.md")
require('rel="about" href="https://www.ghezelbaash.ir/#saeed-ghezelbash"' in html, "HTML does not expose the physician about relation")
require('type="application/ld+json"' in html, "inline Head Graph is missing")
require("در حال معاینه بالینی مراجعه‌کننده" not in html, "obsolete Office wording remains in HTML")
require("PresentationDigitalDocument" in html, "2017 presentation type is absent from inline graph")
require('"priceRange":"$$$$"' in html or '"priceRange": "$$$$"' in html, "premium priceRange is absent from inline graph")
require("cloudflareinsights.com" not in html, "Cloudflare Web Analytics script is present in source HTML")
require(all(token not in html for token in ("client:load", "client:visible", "client:idle")), "Astro hydration directive leaked to HTML")

parser = DocumentParser()
parser.feed(html)
counts = Counter(parser.ids)
require(not [item for item, count in counts.items() if count > 1], "duplicate HTML ids found")
require(not (set(parser.fragments) - set(parser.ids)), f"broken internal fragments: {sorted(set(parser.fragments) - set(parser.ids))[:40]}")
require(not parser.external_scripts, f"external scripts found: {parser.external_scripts}")
require(1 <= len(parser.stylesheets) <= 3, f"expected 1-3 generated stylesheets, found: {parser.stylesheets}")
stylesheet_bytes = 0
for href in parser.stylesheets:
    require(bool(re.fullmatch(r"/_astro/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.css", href)), f"stylesheet is not a fingerprinted same-origin Astro asset: {href}")
    stylesheet_path = DIST / href.lstrip("/")
    require(stylesheet_path.is_file(), f"stylesheet is absent from dist: {href}")
    if stylesheet_path.is_file():
        css_bytes = stylesheet_path.read_bytes()
        stylesheet_bytes += len(css_bytes)
        css_text = css_bytes.decode("utf-8", errors="replace")
        require(len(css_bytes) <= 20_000, f"stylesheet exceeds 20 KB raw gate: {href} ({len(css_bytes)} bytes)")
        require("@import" not in css_text, f"stylesheet imports another render-blocking resource: {href}")
        require("http://" not in css_text and "https://" not in css_text, f"stylesheet references a cross-origin resource: {href}")
require(stylesheet_bytes <= 24_000, f"combined generated CSS exceeds 24 KB raw gate: {stylesheet_bytes} bytes")
require(not parser.style_attrs, f"inline style attributes found: {parser.style_attrs[:12]}")
require(not parser.event_attrs, f"inline event attributes found: {parser.event_attrs[:12]}")
require(not [item.get("src") for item in parser.images if not item.get("width") or not item.get("height")], "images without explicit dimensions found")
for video in parser.videos:
    require(video.get("preload") == "none", f"video is not preload=none: {video.get('poster')}")
    require(not video.get("autoplay"), f"autoplay video found: {video.get('poster')}")

headers = read_text("public/_headers")
require("/_astro/*" in headers and "max-age=31536000, immutable" in headers, "generated Astro assets lack immutable cache policy")
require("/index.md\n" in headers and "Content-Type: text/markdown; charset=utf-8" in headers, "index.md header block is missing")
require("X-Robots-Tag: noindex, follow" in headers, "index.md is not excluded from indexing")
require('</index.md>; rel="alternate"; type="text/markdown"; hreflang="fa-IR"' in headers, "homepage Markdown Link header is missing")
require('<https://www.ghezelbaash.ir/#saeed-ghezelbash>; rel="about"' in headers, "homepage physician about Link header is missing")
require('Link: </graph.ttl>; rel="alternate"; type="text/turtle"' in headers, "graph.jsonld alternate Link header is incorrect")
require('Link: </graph.jsonld>; rel="alternate"; type="application/ld+json"' in headers, "graph.ttl alternate Link header is incorrect")
csp_lines = [line.strip().split(":", 1)[1].strip() for line in headers.splitlines() if line.strip().startswith("Content-Security-Policy:")]
require(len(csp_lines) == 1, f"expected one CSP header, found {len(csp_lines)}")
csp = csp_lines[0] if csp_lines else ""
for directive in (
    "default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'",
    "script-src-attr 'none'", "style-src-attr 'none'", "connect-src 'self'",
):
    require(directive in csp, f"CSP misses directive: {directive}")
require("'unsafe-inline'" not in csp and "'unsafe-eval'" not in csp, "CSP contains an unsafe execution source")
require(max((len(line) for line in headers.splitlines()), default=0) < 2_000, "a _headers line exceeds Cloudflare Pages' limit")
for value in parser.styles:
    digest = "'sha256-" + base64.b64encode(hashlib.sha256(value.encode()).digest()).decode() + "'"
    require(digest in csp, f"CSP misses inline style hash: {digest}")
for value in parser.scripts:
    digest = "'sha256-" + base64.b64encode(hashlib.sha256(value.encode()).digest()).decode() + "'"
    require(digest in csp, f"CSP misses inline script/JSON-LD hash: {digest}")

full = load_json("public/graph.jsonld")
head = load_json("src/data/semantic/head-graph.min.jsonld")
require(head.get("@context") == "https://schema.org", "Head Graph context must remain the schema.org URL")
full_nodes = full.get("@graph", []) if isinstance(full.get("@graph"), list) else []
head_nodes = head.get("@graph", []) if isinstance(head.get("@graph"), list) else []
full_ids = [item.get("@id") for item in full_nodes if isinstance(item, dict) and item.get("@id")]
head_ids = [item.get("@id") for item in head_nodes if isinstance(item, dict) and item.get("@id")]
require(len(full_ids) == len(set(full_ids)), "duplicate @id values in Full Graph")
require(len(head_ids) == len(set(head_ids)), "duplicate @id values in Head Graph")
require(set(head_ids) <= set(full_ids), f"Head Graph nodes absent from Full Graph: {sorted(set(head_ids) - set(full_ids))[:30]}")
first_party_head_refs = {identifier for identifier in collect_ids(head_nodes) if identifier.startswith(BASE)}
require(first_party_head_refs <= set(full_ids), f"first-party Head references absent from Full Graph: {sorted(first_party_head_refs - set(full_ids))[:30]}")
full_by = {item["@id"]: item for item in full_nodes if isinstance(item, dict) and item.get("@id")}
head_by = {item["@id"]: item for item in head_nodes if isinstance(item, dict) and item.get("@id")}

for identifier in (DOCTOR, CLINIC, PORTRAIT, TEAM, OFFICE, COURSE, COURSE_INSTANCE, PRESENTATION, EVENT, ARTICLE_2016, ARTICLE_2021, COUNTRY_IR, COUNTRY_IQ, DATASET, SCHOLAR_ID):
    require(identifier in full_by, f"required Full Graph node missing: {identifier}")

doctor = full_by.get(DOCTOR, {})
clinic = full_by.get(CLINIC, {})
require({"Person", "IndividualPhysician"} <= types(doctor), f"doctor types are incomplete: {types(doctor)}")
require(isinstance(doctor.get("alternateName"), list) and doctor["alternateName"] and doctor["alternateName"][0] == KNOWLEDGE_PANEL_NAME, "Full Graph Person.alternateName must begin with the current Google Knowledge Panel name")
require(doctor.get("priceRange") == "$$$$", "doctor priceRange is not $$$$")
require(clinic.get("priceRange") == "$$$$", "clinic priceRange is not $$$$")
require(CLINIC in refs(doctor.get("owns")), "Doctor → owns → Clinic is missing")
require(CLINIC in refs(doctor.get("practicesAt")), "Doctor → practicesAt → Clinic is missing")
require(CLINIC in refs(doctor.get("workLocation")), "Doctor → workLocation → Clinic is missing")
require(DOCTOR in refs(clinic.get("owner")), "Clinic → owner → Doctor is missing")
require(DOCTOR in refs(clinic.get("founder")), "Clinic → founder → Doctor is missing")
require(PORTRAIT in refs(doctor.get("image")), "canonical portrait is absent from Person.image")
require(TEAM not in refs(doctor.get("image")) and OFFICE not in refs(doctor.get("image")), "contextual image is incorrectly a primary Person image")
require(SCHOLAR_ID in refs(doctor.get("identifier")), "Google Scholar identifier is absent from Person.identifier")
require(SCHOLAR_URL in refs(doctor.get("sameAs")), "Google Scholar profile is absent from Person.sameAs")
scholar = full_by.get(SCHOLAR_ID, {})
require(scholar.get("@type") == "PropertyValue", "Google Scholar identifier node is not PropertyValue")
require(scholar.get("propertyID") == "Google Scholar Author ID", "Google Scholar propertyID is incorrect")
require(scholar.get("value") == "BcWBirUAAAAJ" and scholar.get("url") == SCHOLAR_URL, "Google Scholar identifier value or URL is incorrect")
head_doctor = head_by.get(DOCTOR, {})
require(isinstance(head_doctor.get("alternateName"), list) and head_doctor["alternateName"] and head_doctor["alternateName"][0] == KNOWLEDGE_PANEL_NAME, "Head Graph Person.alternateName must begin with the current Google Knowledge Panel name")
require(SCHOLAR_ID in refs(head_doctor.get("identifier")), "Head Graph Person.identifier lacks Google Scholar")
require(SCHOLAR_URL in refs(head_doctor.get("sameAs")), "Head Graph Person.sameAs lacks Google Scholar")
require(head_by.get(SCHOLAR_ID) == scholar, "Head Graph Google Scholar identifier differs from Full Graph")

course = full_by.get(COURSE, {})
instance = full_by.get(COURSE_INSTANCE, {})
require(CLINIC in refs(course.get("provider")), "Course provider is not the clinic")
require(CLINIC in refs(instance.get("provider")), "CourseInstance provider is not the clinic")
require(DOCTOR in refs(instance.get("instructor")), "CourseInstance instructor is not the physician")
require(bool(course.get("description")), "Course description is missing")

event = full_by.get(EVENT, {})
require(event.get("startDate") == "2017-10-08" and event.get("endDate") == "2017-10-12", "WPA XVII event dates are incorrect")
require(bool(refs(event.get("organizer"))), "WPA XVII organizer is missing")
require("eventStatus" not in event, "WPA XVII eventStatus must be omitted for this completed historical event")
for graph_name, nodes in (("Full Graph", full_nodes), ("Head Graph", head_nodes)):
    for node in nodes:
        if isinstance(node, dict):
            require(node.get("eventStatus") != "https://schema.org/EventCompleted", f"{graph_name} {node.get('@id')}: invalid EventCompleted status")
require("PresentationDigitalDocument" in types(full_by.get(PRESENTATION, {})), "2017 congress work is not PresentationDigitalDocument")
for article_id in (ARTICLE_2016, ARTICLE_2021):
    article = full_by.get(article_id, {})
    require("ScholarlyArticle" in types(article), f"{article_id}: not a ScholarlyArticle")
    require(bool(article.get("headline")), f"{article_id}: headline is missing")
    require(valid_iso_date(article.get("datePublished")), f"{article_id}: datePublished is invalid")

require(full_by.get(COUNTRY_IR, {}).get("identifier") == "IR", "Iran country code is not IR")
require(full_by.get(COUNTRY_IQ, {}).get("identifier") == "IQ", "Iraq country code is not IQ")
require(full_by.get(BASE + "#clinic-postal-address", {}).get("addressCountry") == "IR", "clinic addressCountry is not IR")
for image_id in COMMONS_IMAGE_IDS:
    image = full_by.get(image_id, {})
    for property_name in ("contentUrl", "creditText", "copyrightNotice", "license", "acquireLicensePage", "creator", "copyrightHolder"):
        require(bool(image.get(property_name)), f"{image_id}: {property_name} is missing")
for image_id, image in full_by.items():
    if image_id in COMMONS_IMAGE_IDS or "ImageObject" not in types(image) or not image_id.endswith("-master"):
        continue
    for property_name in ("contentUrl", "creator", "copyrightHolder", "copyrightNotice"):
        require(bool(image.get(property_name)), f"{image_id}: {property_name} is missing")
require({DOCTOR, CLINIC} <= set(refs(full_by.get(TEAM, {}).get("about"))), "Team master does not describe both Doctor and Clinic")
require({DOCTOR, CLINIC} <= set(refs(full_by.get(OFFICE, {}).get("about"))), "Office master does not describe both Doctor and Clinic")
formats = {full_by.get(identifier, {}).get("encodingFormat") for identifier in refs(full_by.get(DATASET, {}).get("distribution"))}
require({"application/ld+json", "text/turtle"} <= formats, "Dataset lacks JSON-LD and Turtle distributions")
require(full_by.get(DATASET, {}).get("dateModified") == "2026-07-30", "Full Graph Dataset dateModified is stale")
require(head_by.get(DATASET, {}).get("dateModified") == "2026-07-30", "Head Graph Dataset dateModified is stale")
full_videos = {node.get("contentUrl"): node for node in full_nodes if isinstance(node, dict) and "VideoObject" in types(node) and node.get("contentUrl") in VIDEO_UPLOAD_DATES}
require(set(full_videos) == set(VIDEO_UPLOAD_DATES), f"Full Graph video set differs from canonical mapping: {sorted(full_videos)}")
for content_url, expected_date in VIDEO_UPLOAD_DATES.items():
    video = full_videos.get(content_url, {})
    require(video.get("uploadDate") == expected_date, f"{content_url}: uploadDate is not {expected_date}")
    asset = ROOT / "public" / content_url.removeprefix(BASE)
    require(asset.is_file(), f"VideoObject contentUrl asset is missing: {asset}")
for head_video in (node for node in head_nodes if isinstance(node, dict) and "VideoObject" in types(node)):
    content_url = head_video.get("contentUrl")
    require(content_url in full_videos, f"Head Graph VideoObject is absent from Full Graph: {content_url}")
    full_video = full_videos.get(content_url, {})
    for property_name in ("@id", "contentUrl", "uploadDate", "sameAs"):
        require(head_video.get(property_name) == full_video.get(property_name), f"Head/Full VideoObject mismatch for {content_url}: {property_name}")

markdown_projection = read_text("dist/index.md")
require(bool(markdown_projection.strip()), "dist/index.md is empty")
require('canonical: "https://www.ghezelbaash.ir/"' in markdown_projection, "index.md canonical frontmatter is missing")
require('<h1 id="saeed-ghezelbash">' in markdown_projection, "index.md canonical Person H1 is missing")
require('<span id="saeed-ghezelbash-aesthetic-medicine">' in markdown_projection, "index.md legacy H1 alias is missing")
require(not re.search(r"<script\b|<style\b|application/ld\+json", markdown_projection, re.I), "index.md contains prohibited executable or JSON-LD markup")
source_page = read_text("src/pages/index.md")
source_h2_ids = re.findall(r'<h2\s+id="([^"]+)"', source_page, re.I)
projection_h2_ids = re.findall(r'<h2\s+id="([^"]+)"', markdown_projection, re.I)
require(projection_h2_ids == source_h2_ids, "index.md H2 projection differs from canonical source")

try:
    json_graph = Graph().parse("public/graph.jsonld", format="json-ld")
    ttl_graph = Graph().parse("public/graph.ttl", format="turtle")
    require(isomorphic(json_graph, ttl_graph), f"Full JSON-LD and Turtle are not RDF-isomorphic ({len(json_graph)} vs {len(ttl_graph)} triples)")
except Exception as exc:
    errors.append(f"RDF parse/equivalence failure: {exc}")

redirects = read_text("public/_redirects")
require("/index.html / 301" in redirects, "index.html canonical redirect is missing")
require("/*" not in redirects, "catch-all redirect/rewrite would override native 404 handling")
require(all(path not in redirects for path in ("/services/", "/contact/", "/subcision-kermanshah/")), "legacy WordPress paths entered redirect architecture")
robots = read_text("public/robots.txt")
require("Sitemap: https://www.ghezelbaash.ir/sitemap.xml" in robots, "robots.txt does not advertise the canonical sitemap")
require(not re.search(r"^\s*Disallow:\s*/(?:graph\.jsonld|graph\.ttl)", robots, re.M | re.I), "robots.txt blocks a graph resource")
try:
    namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9", "video": "http://www.google.com/schemas/sitemap-video/1.1"}
    sitemap_root = ET.parse("public/sitemap.xml").getroot()
    locations = [element.text for element in sitemap_root.findall("sm:url/sm:loc", namespace)]
    expected_locations = [BASE, BASE + "graph.jsonld", BASE + "graph.ttl", BASE + "llms.txt", BASE + "datasets/historical-patient-origin-summary.json"]
    require(locations == expected_locations, f"sitemap discovery set differs from the canonical policy: {locations}")
    require(BASE + "index.md" not in locations, "index.md entered sitemap.xml")
    sitemap_video_dates = {}
    for video in sitemap_root.findall("sm:url/video:video", namespace):
        content = video.findtext("video:content_loc", namespaces=namespace)
        publication_date = video.findtext("video:publication_date", namespaces=namespace)
        if content:
            sitemap_video_dates[content] = publication_date
    require(sitemap_video_dates == VIDEO_UPLOAD_DATES, f"video sitemap dates differ from Full Graph: {sitemap_video_dates}")
except Exception as exc:
    errors.append(f"sitemap.xml parse failure: {exc}")

manifest = load_json("public/site.webmanifest")
require(manifest.get("start_url") == "/" and manifest.get("scope") == "/", "manifest root scope/start_url is incorrect")
require("PHOTO" in read_text("public/doctor.vcf") and "saeed-ghezelbaash-physician-portrait.jpg" in read_text("public/doctor.vcf"), "doctor.vcf does not use the canonical portrait")
require("LOGO" in read_text("public/clinic.vcf") and "doctor-ghezelbaash-symbol-512.png" in read_text("public/clinic.vcf").replace("\n ", ""), "clinic.vcf does not use the clinic logo")

def dom_tag_for(fragment: str) -> str | None:
    match = re.search(
        rf'<([A-Za-z][A-Za-z0-9:-]*)\b[^>]*\bid="{re.escape(fragment)}"(?:\s|>)',
        html,
        re.I,
    )
    return match.group(1).lower() if match else None


def header_block(path: str) -> str:
    match = re.search(rf"(?m)^{re.escape(path)}\n((?:  .*(?:\n|$))*)", headers)
    return match.group(1) if match else ""


require(dom_tag_for("saeed-ghezelbash") == "h1", "canonical Person @id fragment is not the H1")
require(dom_tag_for("saeed-ghezelbash-aesthetic-medicine") == "span", "legacy physician H1 alias is missing")
require(dom_tag_for("dr-saeed-ghezelbash-aesthetic-clinic-kermanshah") == "h2", "canonical Clinic @id fragment is not the clinic H2")
require(dom_tag_for("doctor-ghezelbaash-structured-data-project") == "details", "canonical structured-data project @id fragment is not the project container")
require(dom_tag_for("doctor-ghezelbaash-structured-data-repository") == "h2", "structured-data project URL does not target its visible H2")
require(dom_tag_for("doctor-ghezelbaash-structured-data-section") == "span", "legacy structured-data section alias is missing")

project = full_by.get(PROJECT, {})
require(PROJECT in head_by, "structured-data project is absent from Head Graph")
require(clinic.get("url") == CLINIC, "Clinic.url must equal its canonical @id and H2 fragment")
require(project.get("url") == BASE + "#doctor-ghezelbaash-structured-data-repository", "structured-data project URL is not its visible repository H2")
for node in full_nodes:
    if not isinstance(node, dict):
        continue
    target = node.get("url")
    if isinstance(target, str) and target.startswith(BASE + "#"):
        fragment = target.split("#", 1)[1]
        require(fragment in parser.ids, f"Full Graph navigational URL has no DOM target: {target}")

require(DATASET in head_by, "Graph Dataset is absent from Head Graph")
require(full_by.get(DATASET, {}).get("version") == GRAPH_VERSION, "Full Graph version is not the release version")
require(head_by.get(DATASET, {}).get("version") == GRAPH_VERSION, "Head Graph version is not the release version")
for property_name in ("version", "dateModified"):
    require(
        head_by.get(DATASET, {}).get(property_name) == full_by.get(DATASET, {}).get(property_name),
        f"Head/Full Dataset metadata mismatch: {property_name}",
    )

historical = full_by.get(HISTORICAL_DATASET, {})
historical_download = full_by.get(HISTORICAL_DOWNLOAD, {})
require("Dataset" in types(historical), "historical patient-origin node is not Dataset")
require(HISTORICAL_DOWNLOAD in refs(historical.get("distribution")), "historical Dataset lacks its JSON distribution")
require(historical_download.get("contentUrl") == BASE + "datasets/historical-patient-origin-summary.json", "historical DataDownload contentUrl is incorrect")
require(historical_download.get("encodingFormat") == "application/json", "historical DataDownload encodingFormat is incorrect")
require(HISTORICAL_DATASET in refs(full_by.get(PROJECT, {}).get("hasPart")), "structured-data project does not include the historical Dataset")
require(HISTORICAL_DATASET in refs(full_by.get(DATASET, {}).get("hasPart")), "Full Graph Dataset does not include the historical Dataset")
require(HISTORICAL_DATASET in head_by, "historical Dataset is absent from the inline Head Graph")
require(HISTORICAL_DOWNLOAD in head_by, "historical DataDownload is absent from the inline Head Graph")
for property_name in ("@type", "name", "url", "creator", "publisher", "datePublished", "dateModified", "license", "distribution"):
    require(head_by.get(HISTORICAL_DATASET, {}).get(property_name) == historical.get(property_name), f"Head/Full historical Dataset mismatch: {property_name}")
require(historical.get("url") == BASE + "datasets/historical-patient-origin-summary.json", "historical Dataset URL is not its canonical JSON distribution")
require(historical.get("isAccessibleForFree") is True, "historical Dataset is not declared freely accessible")
raw_historical = load_json("public/datasets/historical-patient-origin-summary.json")
require(raw_historical.get("datasetId") == HISTORICAL_DATASET, "raw historical datasetId differs from graph identity")
require(raw_historical.get("dateModified") == "2026-07-30", "raw historical dataset dateModified is stale")
require(raw_historical.get("license") == "https://creativecommons.org/licenses/by/4.0/", "raw historical dataset license is missing")
require(raw_historical.get("creator") == DOCTOR and raw_historical.get("publisher") == DOCTOR, "raw historical dataset attribution differs from Person identity")
require(raw_historical.get("canonicalUrl") == BASE + "datasets/historical-patient-origin-summary.json", "raw historical Dataset canonicalUrl is incorrect")
indexing_policy = str(raw_historical.get("indexingPolicy", ""))
require("index, follow" in indexing_policy and "noindex" not in indexing_policy.lower(), "raw historical Dataset indexing policy is not index, follow")

for path in ("/graph.jsonld", "/graph.ttl", "/llms.txt", "/datasets/historical-patient-origin-summary.json"):
    block = header_block(path)
    require("X-Robots-Tag: index, follow" in block, f"{path} is not explicitly indexable")
    require("noindex" not in block.lower(), f"{path} is accidentally noindex")
for path in ("/index.md", "/llms-full.txt", "/datasets/*.geojson"):
    block = header_block(path)
    require("X-Robots-Tag: noindex, follow" in block, f"{path} is not a noindex, follow projection/distribution")
for path in ("/doctor.vcf", "/clinic.vcf", "/site.webmanifest"):
    require("X-Robots-Tag: noindex" in header_block(path), f"{path} utility resource is indexable")
require('</llms.txt>; rel="describedby"; type="text/plain"' in headers, "homepage HTTP Link header does not discover llms.txt")
require('</datasets/historical-patient-origin-summary.json>; rel="describedby"; type="application/json"' in headers, "homepage HTTP Link header does not discover the historical Dataset")
llms_index = read_text("public/llms.txt")
for marker in ("## Authoritative First-Party Dataset", HISTORICAL_DATASET, BASE + "datasets/historical-patient-origin-summary.json", "independently discoverable, indexable first-party research asset"):
    require(marker in llms_index, f"llms.txt does not promote the historical Dataset: {marker}")
require("supporting distribution" not in llms_index.lower() and "raw historical dataset distributions are intentionally crawlable but noindex" not in llms_index.lower(), "llms.txt still devalues the historical Dataset")

def expected_full_projection(markdown: str) -> str:
    body = re.sub(r"\A---\r?\n[\s\S]*?\r?\n---\r?\n?", "", markdown, count=1)
    body = re.sub(r"<script\b[^>]*>[\s\S]*?</script>", "", body, flags=re.I)
    body = re.sub(r"<style\b[^>]*>[\s\S]*?</style>", "", body, flags=re.I)
    body = re.sub(r"<script\b[^>]*/\s*>", "", body, flags=re.I)
    body = re.sub(r"\s+type=[\"']application/ld\+json[\"']", "", body, flags=re.I)
    body = re.sub(r"\n{3,}", "\n\n", body).strip()
    return (
        "# Dr. Saeed Ghezelbash — Full canonical page export\n\n"
        f"Canonical: {BASE}\n"
        f"About: {DOCTOR}\n"
        f"Source: {BASE}\n"
        "Language: fa-IR\n"
        "Indexing: noindex, follow\n"
        "Purpose: deterministic machine-readable projection of the complete canonical page content\n\n"
        "---\n\n"
        + body
        + "\n"
    )

llms_full = read_text("public/llms-full.txt")
require(bool(llms_full.strip()), "llms-full.txt is empty")
require(llms_full == expected_full_projection(source_page), "llms-full.txt differs from the canonical page projection")
require(not re.search(r"<script\b|<style\b|application/ld\+json", llms_full, re.I), "llms-full.txt contains executable or JSON-LD markup")

if errors:
    for message in errors:
        print("ERROR:", message, file=sys.stderr)
    raise SystemExit(f"{len(errors)} validation error(s)")
print(f"PASS: HTML={html_bytes} bytes, Full={len(full_nodes)} nodes, Head={len(head_nodes)} nodes, RDF={len(json_graph)} triples")
