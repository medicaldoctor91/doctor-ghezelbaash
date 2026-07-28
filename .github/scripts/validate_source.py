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
    "dist/index.html", "dist/404.html", "public/graph.jsonld", "public/graph.ttl",
    "src/data/semantic/head-graph.min.jsonld", "public/_headers", "public/_redirects",
    "public/robots.txt", "public/sitemap.xml", "public/llms.txt", "public/llms-full.txt",
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
    "llms.txt", "llms-full.txt", "doctor.vcf", "clinic.vcf", "favicon.svg", "favicon.ico",
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
require(not parser.stylesheets, f"render-blocking external stylesheets found: {parser.stylesheets}")
require(not parser.style_attrs, f"inline style attributes found: {parser.style_attrs[:12]}")
require(not parser.event_attrs, f"inline event attributes found: {parser.event_attrs[:12]}")
require(not [item.get("src") for item in parser.images if not item.get("width") or not item.get("height")], "images without explicit dimensions found")
for video in parser.videos:
    require(video.get("preload") == "none", f"video is not preload=none: {video.get('poster')}")
    require(not video.get("autoplay"), f"autoplay video found: {video.get('poster')}")

headers = read_text("public/_headers")
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

for identifier in (DOCTOR, CLINIC, PORTRAIT, TEAM, OFFICE, COURSE, COURSE_INSTANCE, PRESENTATION, EVENT, ARTICLE_2016, ARTICLE_2021, COUNTRY_IR, COUNTRY_IQ, DATASET):
    require(identifier in full_by, f"required Full Graph node missing: {identifier}")

doctor = full_by.get(DOCTOR, {})
clinic = full_by.get(CLINIC, {})
require({"Person", "IndividualPhysician"} <= types(doctor), f"doctor types are incomplete: {types(doctor)}")
require(doctor.get("priceRange") == "$$$$", "doctor priceRange is not $$$$")
require(clinic.get("priceRange") == "$$$$", "clinic priceRange is not $$$$")
require(CLINIC in refs(doctor.get("owns")), "Doctor → owns → Clinic is missing")
require(CLINIC in refs(doctor.get("practicesAt")), "Doctor → practicesAt → Clinic is missing")
require(CLINIC in refs(doctor.get("workLocation")), "Doctor → workLocation → Clinic is missing")
require(DOCTOR in refs(clinic.get("owner")), "Clinic → owner → Doctor is missing")
require(DOCTOR in refs(clinic.get("founder")), "Clinic → founder → Doctor is missing")
require(PORTRAIT in refs(doctor.get("image")), "canonical portrait is absent from Person.image")
require(TEAM not in refs(doctor.get("image")) and OFFICE not in refs(doctor.get("image")), "contextual image is incorrectly a primary Person image")

course = full_by.get(COURSE, {})
instance = full_by.get(COURSE_INSTANCE, {})
require(CLINIC in refs(course.get("provider")), "Course provider is not the clinic")
require(CLINIC in refs(instance.get("provider")), "CourseInstance provider is not the clinic")
require(DOCTOR in refs(instance.get("instructor")), "CourseInstance instructor is not the physician")
require(bool(course.get("description")), "Course description is missing")

event = full_by.get(EVENT, {})
require(event.get("startDate") == "2017-10-08" and event.get("endDate") == "2017-10-12", "WPA XVII event dates are incorrect")
require(bool(refs(event.get("organizer"))), "WPA XVII organizer is missing")
require(event.get("eventStatus") == "https://schema.org/EventCompleted", "WPA XVII eventStatus is not EventCompleted")
require("PresentationDigitalDocument" in types(full_by.get(PRESENTATION, {})), "2017 congress work is not PresentationDigitalDocument")
for article_id in (ARTICLE_2016, ARTICLE_2021):
    article = full_by.get(article_id, {})
    require("ScholarlyArticle" in types(article), f"{article_id}: not a ScholarlyArticle")
    require(bool(article.get("headline")), f"{article_id}: headline is missing")
    require(valid_iso_date(article.get("datePublished")), f"{article_id}: datePublished is invalid")

require(full_by.get(COUNTRY_IR, {}).get("identifier") == "IR", "Iran country code is not IR")
require(full_by.get(COUNTRY_IQ, {}).get("identifier") == "IQ", "Iraq country code is not IQ")
require(full_by.get(BASE + "#clinic-postal-address", {}).get("addressCountry") == "IR", "clinic addressCountry is not IR")
for image_id in (PORTRAIT, TEAM, OFFICE):
    image = full_by.get(image_id, {})
    for property_name in ("contentUrl", "creditText", "copyrightNotice", "license", "acquireLicensePage", "creator", "copyrightHolder"):
        require(bool(image.get(property_name)), f"{image_id}: {property_name} is missing")
require({DOCTOR, CLINIC} <= set(refs(full_by.get(TEAM, {}).get("about"))), "Team master does not describe both Doctor and Clinic")
require({DOCTOR, CLINIC} <= set(refs(full_by.get(OFFICE, {}).get("about"))), "Office master does not describe both Doctor and Clinic")
formats = {full_by.get(identifier, {}).get("encodingFormat") for identifier in refs(full_by.get(DATASET, {}).get("distribution"))}
require({"application/ld+json", "text/turtle"} <= formats, "Dataset lacks JSON-LD and Turtle distributions")

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
    namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    locations = [element.text for element in ET.parse("public/sitemap.xml").getroot().findall("sm:url/sm:loc", namespace)]
    require(locations == [BASE], f"sitemap must contain exactly the canonical homepage, found: {locations}")
except Exception as exc:
    errors.append(f"sitemap.xml parse failure: {exc}")

manifest = load_json("public/site.webmanifest")
require(manifest.get("start_url") == "/" and manifest.get("scope") == "/", "manifest root scope/start_url is incorrect")
require("PHOTO" in read_text("public/doctor.vcf") and "saeed-ghezelbaash-physician-portrait.jpg" in read_text("public/doctor.vcf"), "doctor.vcf does not use the canonical portrait")
require("LOGO" in read_text("public/clinic.vcf") and "doctor-ghezelbaash-symbol-512.png" in read_text("public/clinic.vcf").replace("\n ", ""), "clinic.vcf does not use the clinic logo")

if errors:
    for message in errors:
        print("ERROR:", message, file=sys.stderr)
    raise SystemExit(f"{len(errors)} validation error(s)")
print(f"PASS: HTML={html_bytes} bytes, Full={len(full_nodes)} nodes, Head={len(head_nodes)} nodes, RDF={len(json_graph)} triples")
