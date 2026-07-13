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
HUGGING_FACE_PROFILE = "https://huggingface.co/Ghezelbaash"
HUGGING_FACE_DATASET = "https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data"
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
PERSON_SAME_AS = {
    "https://membersearch.irimc.org/member/profile?id=9efaaf28-52ff-49ad-8d45-be6e48c4fa3e",
    "https://orcid.org/0009-0001-9346-8475",
    "https://www.wikidata.org/entity/Q140287622",
    "https://www.ncbi.nlm.nih.gov/myncbi/saeed.ghezelbash.1/bibliography/public/",
    "https://github.com/medicaldoctor91/doctor-ghezelbaash",
    "https://github.com/Medicaldoctor91",
    "https://www.pinterest.com/qezelbaash/",
    "https://about.me/ghezelbaash",
    "https://linktr.ee/Doctor.ghezelbaash",
    HUGGING_FACE_PROFILE,
    "https://x.com/Qezelbaash",
}
CLINIC_SAME_AS = {
    "https://www.instagram.com/doctor.ghezelbaash/",
    "https://www.linkedin.com/in/saeed-ghezelbash-93310a96",
    "https://www.facebook.com/Ghezelbaash/",
}
HEAD_ME_LINKS = {
    "https://orcid.org/0009-0001-9346-8475",
    "https://www.instagram.com/doctor.ghezelbaash/",
    "https://www.linkedin.com/in/saeed-ghezelbash-93310a96",
    "https://www.facebook.com/Ghezelbaash/",
    "https://www.pinterest.com/qezelbaash/",
    HUGGING_FACE_PROFILE,
}
REQUIRED_IDENTIFIERS = {
    ("IRIMC", "167430"),
    ("ORCID", "0009-0001-9346-8475"),
    ("Wikidata", "Q140287622"),
    ("MINC", "CAMD-0224-1997"),
    ("NCBI Bibliography", "saeed.ghezelbash.1"),
}


def as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def node_types(node: dict[str, Any] | None) -> set[str]:
    return {str(item) for item in as_list((node or {}).get("@type"))}


def fetch(path_or_url: str, *, headers: dict[str, str] | None = None, timeout: int = 45) -> tuple[int, str, dict[str, str], bytes]:
    url = path_or_url if path_or_url.startswith("http") else urllib.parse.urljoin(BASE, path_or_url.lstrip("/"))
    request = urllib.request.Request(url, headers={
        "User-Agent": "GhezelbaashProductionAudit/3.0",
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
        self.fragment_hrefs: list[str] = []
        self.hrefs: list[str] = []
        self.rel_me: list[str] = []
        self.canonicals: list[str] = []
        self.stylesheets: list[str] = []
        self.images: list[dict[str, str]] = []
        self.videos: list[dict[str, str]] = []
        self.sources: list[dict[str, str]] = []
        self.sections: list[str] = []
        self.h1_count = 0
        self.quiet_best: list[dict[str, str]] = []
        self.quiet_best_items = 0
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
        if tag == "a":
            href = data.get("href", "")
            self.hrefs.append(href)
            if href.startswith("#"):
                self.fragment_hrefs.append(href[1:])
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
        if "quiet-best__item" in classes:
            self.quiet_best_items += 1
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


def parse_page_jsonld(parser: PageParser, label: str, failures: list[str]) -> list[dict[str, Any]]:
    if len(parser.ldjson) != 1:
        failures.append(f"{label}: expected one inline JSON-LD block, found {len(parser.ldjson)}")
        return []
    try:
        value = json.loads(parser.ldjson[0])
        return value.get("@graph", []) if isinstance(value, dict) else []
    except Exception as error:  # noqa: BLE001
        failures.append(f"{label}: invalid inline JSON-LD: {error}")
        return []


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
    for key, expected in {"content-language": "fa-IR", "x-content-type-options": "nosniff", "x-frame-options": "DENY"}.items():
        if expected.lower() not in headers.get(key, "").lower():
            failures.append(f"homepage: missing or invalid {key}")
    if "max-age=" not in headers.get("strict-transport-security", ""):
        failures.append("homepage: HSTS header missing")
    if "describedby" not in headers.get("link", "") or "knowledge-graph.jsonld" not in headers.get("link", ""):
        failures.append("homepage: HTTP Link describedby header missing")

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
    if set(parser.rel_me) != HEAD_ME_LINKS:
        failures.append(f"homepage: rel=me set mismatch {sorted(parser.rel_me)}")
    if len(parser.quiet_best) != 1 or "open" in parser.quiet_best[0]:
        failures.append("homepage: best-doctor wrapper must exist once and stay closed")
    if parser.quiet_best_items != 20:
        failures.append(f"homepage: expected 20 best-doctor answers, found {parser.quiet_best_items}")
    if parser.article_flow != 1 or parser.guide_cards != 0:
        failures.append("homepage: continuous article contract failed")
    if any(item in parser.sections for item in ("videos", "clinic", "doctor", "decision-model")):
        failures.append("homepage: standalone media or artificial section returned")
    if len(parser.videos) != 12:
        failures.append(f"homepage: expected 12 contextual videos, found {len(parser.videos)}")
    for index, video in enumerate(parser.videos, start=1):
        if video.get("preload") != "none" or not video.get("poster") or not video.get("width") or not video.get("height"):
            failures.append(f"homepage: video {index} lacks preload/poster/dimensions")
    mp4_sources = [item for item in parser.sources if item.get("type") == "video/mp4"]
    if len(mp4_sources) != 12:
        failures.append(f"homepage: expected 12 MP4 sources, found {len(mp4_sources)}")
    if any(re.match(r"^/videos/[^/]+/$", href) for href in parser.hrefs):
        failures.append("homepage: removed video watch-page link returned")
    if parser.contextual_images < 11:
        failures.append(f"homepage: contextual images unexpectedly low: {parser.contextual_images}")

    inline_nodes = parse_page_jsonld(parser, "homepage", failures)
    inline_by_id = {node.get("@id"): node for node in inline_nodes if isinstance(node, dict) and node.get("@id")}
    if len(inline_nodes) > 60:
        failures.append(f"inline graph too broad: {len(inline_nodes)} nodes")
    if any(node_types(node) & {"VideoObject", "Clip", "ScholarlyArticle"} for node in inline_nodes):
        failures.append("homepage inline graph contains video, clip, or research nodes")

    person = inline_by_id.get(f"{SITE_ID}#person", {})
    clinic = inline_by_id.get(f"{SITE_ID}#clinic", {})
    page = inline_by_id.get(f"{SITE_ID}#webpage", {})
    article = inline_by_id.get(f"{SITE_ID}#article", {})
    if not PERSON_SAME_AS.issubset(set(as_list(person.get("sameAs")))):
        failures.append("inline Person sameAs is incomplete")
    if HUGGING_FACE_DATASET in set(as_list(person.get("sameAs"))):
        failures.append("inline Person.sameAs incorrectly contains Hugging Face Dataset")
    if CLINIC_SAME_AS & set(as_list(person.get("sameAs"))):
        failures.append("inline Person sameAs contains clinic social URLs")
    if not CLINIC_SAME_AS.issubset(set(as_list(clinic.get("sameAs")))):
        failures.append("inline Clinic sameAs is incomplete")
    identifiers = {(item.get("propertyID"), item.get("value")) for item in as_list(person.get("identifier")) if isinstance(item, dict)}
    if not REQUIRED_IDENTIFIERS.issubset(identifiers):
        failures.append("inline Person identifiers are incomplete")
    if any(key == "Hugging Face Profile" for key, _ in identifiers):
        failures.append("inline Person incorrectly models Hugging Face as identifier")
    if clinic.get("address", {}).get("postalCode") != "6714657412":
        failures.append("inline clinic postalCode is incorrect")
    if not {"MedicalWebPage", "ProfilePage"}.issubset(node_types(page)):
        failures.append(f"inline homepage types incomplete: {sorted(node_types(page))}")
    if page.get("mainEntity", {}).get("@id") != f"{SITE_ID}#person":
        failures.append("inline page mainEntity is not Person")
    if person.get("worksFor", {}).get("@id") != f"{SITE_ID}#clinic" or clinic.get("employee", {}).get("@id") != f"{SITE_ID}#person":
        failures.append("inline doctor-clinic relationship is incomplete")
    for key in ("datePublished", "dateModified"):
        if not RFC3339.match(str(article.get(key, ""))):
            failures.append(f"inline Article {key} lacks timezone-aware RFC3339 value")

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

    video_sitemap_status, _, _, _ = fetch("video-sitemap.xml")
    if video_sitemap_status == 200:
        failures.append("/video-sitemap.xml: obsolete sitemap is still published")

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
    canonical_person = canonical_by_id.get(f"{SITE_ID}#person", {})
    canonical_clinic = canonical_by_id.get(f"{SITE_ID}#clinic", {})
    canonical_page = canonical_by_id.get(f"{SITE_ID}#webpage", {})
    dataset = canonical_by_id.get(HUGGING_FACE_DATASET, {})
    if not PERSON_SAME_AS.issubset(set(as_list(canonical_person.get("sameAs")))):
        failures.append("knowledge graph: Person sameAs is incomplete")
    if HUGGING_FACE_DATASET in set(as_list(canonical_person.get("sameAs"))):
        failures.append("knowledge graph: Dataset leaked into Person.sameAs")
    if not CLINIC_SAME_AS.issubset(set(as_list(canonical_clinic.get("sameAs")))):
        failures.append("knowledge graph: Clinic sameAs is incomplete")
    if not {"MedicalWebPage", "ProfilePage"}.issubset(node_types(canonical_page)):
        failures.append("knowledge graph: homepage ProfilePage type missing")
    if any(node_types(node) & {"VideoObject", "Clip"} for node in canonical_nodes):
        failures.append("knowledge graph: video entities returned in single-page architecture")
    if "Dataset" not in node_types(dataset):
        failures.append("knowledge graph: Hugging Face Dataset node missing")
    if dataset.get("creator", {}).get("@id") != f"{SITE_ID}#person":
        failures.append("knowledge graph: Hugging Face Dataset.creator mismatch")
    if dataset.get("publisher", {}).get("@id") != f"{SITE_ID}#clinic":
        failures.append("knowledge graph: Hugging Face Dataset.publisher mismatch")
    dataset_about = {item.get("@id") for item in as_list(dataset.get("about")) if isinstance(item, dict)}
    if not {f"{SITE_ID}#person", f"{SITE_ID}#clinic"}.issubset(dataset_about):
        failures.append("knowledge graph: Hugging Face Dataset.about incomplete")

    llms = endpoint_data["llms.txt"][1].decode("utf-8", errors="replace")
    for token in ("CAMD-0224-1997", "Hugging Face profile", "Published Hugging Face dataset", "closed-by-default"):
        if token not in llms:
            failures.append(f"llms.txt: missing {token}")
    robots = endpoint_data["robots.txt"][1].decode("utf-8", errors="replace")
    for path in ("sitemap.xml", "image-sitemap.xml"):
        if f"Sitemap: {BASE}{path}" not in robots:
            failures.append(f"robots.txt: missing {path}")
    if "video-sitemap.xml" in robots:
        failures.append("robots.txt: obsolete video sitemap returned")

    try:
        sitemap_root = ET.fromstring(endpoint_data["sitemap.xml"][1])
        sitemap_locs = [element.text for element in sitemap_root.findall("{http://www.sitemaps.org/schemas/sitemap/0.9}url/{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
        if sitemap_locs != [BASE]:
            failures.append(f"sitemap.xml: expected only canonical homepage, found {sitemap_locs}")
    except Exception as error:  # noqa: BLE001
        failures.append(f"sitemap.xml: invalid XML: {error}")

    try:
        image_root = ET.fromstring(endpoint_data["image-sitemap.xml"][1])
        image_items = image_root.findall(".//{http://www.google.com/schemas/sitemap-image/1.1}image")
        image_locs = image_root.findall("{http://www.sitemaps.org/schemas/sitemap/0.9}url/{http://www.sitemaps.org/schemas/sitemap/0.9}loc")
        if len(image_locs) != 1 or image_locs[0].text != BASE:
            failures.append("image-sitemap.xml: visual assets must belong only to homepage")
        if len(image_items) < 13:
            failures.append(f"image-sitemap.xml: too few images ({len(image_items)})")
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

    ai_text = endpoint_data[".well-known/ai.txt"][1].decode("utf-8", errors="replace")
    for token in ("Canonical page types: MedicalWebPage, ProfilePage", "Hugging Face profile:", "Published dataset:", "No separate canonical video watch pages"):
        if token not in ai_text:
            failures.append(f"ai.txt: missing {token}")
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

    report.update({
        "status": "pass" if not failures else "fail",
        "homepageBytes": len(body),
        "htmlIds": len(parser.ids),
        "homepageVideos": len(parser.videos),
        "contextualImages": parser.contextual_images,
        "bestDoctorAnswers": parser.quiet_best_items,
        "bestDoctorWrapper": "closed" if parser.quiet_best and "open" not in parser.quiet_best[0] else "invalid",
        "inlineGraphNodes": len(inline_nodes),
        "canonicalGraphNodes": len(canonical_nodes),
        "videoSchemaNodes": 0,
        "watchPagesReturning200": sum(1 for item in removed_watch_statuses if item == 200),
        "huggingFace": {
            "profileInPersonSameAs": HUGGING_FACE_PROFILE in set(as_list(canonical_person.get("sameAs"))),
            "profileInHeadRelMe": HUGGING_FACE_PROFILE in set(parser.rel_me),
            "datasetSeparate": "Dataset" in node_types(dataset),
            "datasetCreator": dataset.get("creator", {}).get("@id"),
            "datasetPublisher": dataset.get("publisher", {}).get("@id"),
        },
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
