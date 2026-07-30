#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import json
import re
from pathlib import Path

from rdflib import Graph

ROOT = Path.cwd()
HOME = "https://www.ghezelbaash.ir/"
DOCTOR = HOME + "#saeed-ghezelbash"
SCHOLAR_ID = HOME + "#identifier-person-google-scholar"
SCHOLAR_URL = "https://scholar.google.com/citations?user=BcWBirUAAAAJ"
EVENT_COMPLETED = "https://schema.org/EventCompleted"
VIDEO_UPLOAD_DATES = {
    HOME + "media/videos/education/saeed-ghezelbash-jalupro-vs-profhilo.mp4": "2024-12-18",
    HOME + "media/videos/education/saeed-ghezelbash-subcision-technique.mp4": "2025-01-16",
    HOME + "media/videos/education/saeed-ghezelbash-thread-lift-workshop.mp4": "2025-01-19",
    HOME + "media/videos/testimonials/saeed-ghezelbash-kurdish-patient-review.mp4": "2025-04-23",
}


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def graph_nodes(document: dict) -> list[dict]:
    nodes = document.get("@graph")
    if not isinstance(nodes, list):
        raise RuntimeError("JSON-LD @graph is missing")
    return [node for node in nodes if isinstance(node, dict)]


def node_types(node: dict) -> set[str]:
    value = node.get("@type", [])
    return set(value if isinstance(value, list) else [value])


def ensure_ref(node: dict, prop: str, identifier: str) -> None:
    current = node.get(prop)
    values = current if isinstance(current, list) else ([] if current is None else [current])
    if not any(isinstance(item, dict) and item.get("@id") == identifier for item in values):
        values.append({"@id": identifier})
    node[prop] = values


def ensure_string(node: dict, prop: str, value: str) -> None:
    current = node.get(prop)
    values = current if isinstance(current, list) else ([] if current is None else [current])
    if value not in values:
        values.append(value)
    node[prop] = values


def insert_after(nodes: list[dict], after_id: str, new_node: dict) -> None:
    if any(node.get("@id") == new_node["@id"] for node in nodes):
        return
    for index, node in enumerate(nodes):
        if node.get("@id") == after_id:
            nodes.insert(index + 1, new_node)
            return
    nodes.append(new_node)


def update_json_graph(path: str, *, is_head: bool) -> str:
    document = json.loads(read(path))
    nodes = graph_nodes(document)
    by_id = {node.get("@id"): node for node in nodes if node.get("@id")}

    for node in nodes:
        if node.get("eventStatus") == EVENT_COMPLETED:
            del node["eventStatus"]

    doctor = by_id.get(DOCTOR)
    if not doctor:
        raise RuntimeError(f"{path}: canonical physician node is missing")
    ensure_ref(doctor, "identifier", SCHOLAR_ID)
    ensure_string(doctor, "sameAs", SCHOLAR_URL)

    scholar = {
        "@id": SCHOLAR_ID,
        "@type": "PropertyValue",
        "propertyID": "Google Scholar Author ID",
        "value": "BcWBirUAAAAJ",
        "url": SCHOLAR_URL,
    }
    insert_after(nodes, HOME + "#identifier-person-openalex", scholar)

    matched: set[str] = set()
    for node in nodes:
        if "VideoObject" not in node_types(node):
            continue
        content_url = node.get("contentUrl")
        if content_url in VIDEO_UPLOAD_DATES:
            node["uploadDate"] = VIDEO_UPLOAD_DATES[content_url]
            matched.add(content_url)

    expected = {HOME + "media/videos/education/saeed-ghezelbash-thread-lift-workshop.mp4"} if is_head else set(VIDEO_UPLOAD_DATES)
    if matched != expected:
        raise RuntimeError(f"{path}: VideoObject mapping mismatch: expected {sorted(expected)}, found {sorted(matched)}")

    result = json.dumps(document, ensure_ascii=False, separators=(",", ":"))
    write(path, result)
    return result


def regenerate_turtle(json_text: str) -> None:
    graph = Graph().parse(data=json_text, format="json-ld")
    turtle = graph.serialize(format="turtle")
    if isinstance(turtle, bytes):
        turtle = turtle.decode("utf-8")
    nt = graph.serialize(format="nt")
    if isinstance(nt, bytes):
        nt = nt.decode("utf-8")
    canonical_nt = "\n".join(sorted(line for line in nt.splitlines() if line.strip())) + "\n"
    header = (
        "# Derived losslessly from https://www.ghezelbaash.ir/graph.jsonld\n"
        f"# Source SHA-256: {hashlib.sha256(json_text.encode('utf-8')).hexdigest()}\n"
        f"# RDF triples: {len(graph)}\n"
        f"# Canonical sorted N-Triples SHA-256: {hashlib.sha256(canonical_nt.encode('utf-8')).hexdigest()}\n\n"
    )
    write("public/graph.ttl", header + turtle.lstrip())


def update_sitemap() -> None:
    sitemap = read("public/sitemap.xml")
    sitemap = re.sub(r"<lastmod>[^<]+</lastmod>", "<lastmod>2026-07-30</lastmod>", sitemap, count=1)
    for content_url, publication_date in VIDEO_UPLOAD_DATES.items():
        escaped = re.escape(content_url)
        pattern = rf"(<video:content_loc>{escaped}</video:content_loc>)(?:\s*<video:publication_date>[^<]+</video:publication_date>)?"
        replacement = rf"\1\n      <video:publication_date>{publication_date}</video:publication_date>"
        sitemap, count = re.subn(pattern, replacement, sitemap)
        if count != 1:
            raise RuntimeError(f"sitemap mapping failed for {content_url}: {count}")
    write("public/sitemap.xml", sitemap)


def update_headers(head_graph_text: str) -> None:
    headers = read("public/_headers")
    root_link = (
        '  Link: </graph.jsonld>; rel="describedby"; type="application/ld+json", '
        '</graph.ttl>; rel="describedby"; type="text/turtle", '
        '</index.md>; rel="alternate"; type="text/markdown"; hreflang="fa-IR", '
        '<https://www.ghezelbaash.ir/#saeed-ghezelbash>; rel="about"'
    )
    headers, count = re.subn(r"(?m)^  Link: </graph\.jsonld>; rel=\"describedby\".*$", root_link, headers, count=1)
    if count != 1:
        raise RuntimeError("root Link header was not found")

    headers = re.sub(
        r'(?m)^  Link: </graph\.ttl>; rel="alternate"; type="text/turtle".*$',
        '  Link: </graph.ttl>; rel="alternate"; type="text/turtle"',
        headers,
        count=1,
    )
    headers = re.sub(
        r'(?m)^  Link: </graph\.jsonld>; rel="alternate"; type="application/ld\+json".*$',
        '  Link: </graph.jsonld>; rel="alternate"; type="application/ld+json"',
        headers,
        count=1,
    )

    if not re.search(r"(?m)^/index\.md$", headers):
        index_block = (
            "\n/index.md\n"
            "  Content-Type: text/markdown; charset=utf-8\n"
            "  X-Robots-Tag: noindex, follow\n"
            "  X-Content-Type-Options: nosniff\n"
            "  Link: <https://www.ghezelbaash.ir/>; rel=\"canonical\"\n"
            "  Access-Control-Allow-Origin: *\n"
        )
        marker = "\n/graph.jsonld\n"
        if marker not in headers:
            raise RuntimeError("graph.jsonld header block marker is missing")
        headers = headers.replace(marker, index_block + marker, 1)

    graph_hash = "'sha256-" + base64.b64encode(hashlib.sha256(head_graph_text.encode("utf-8")).digest()).decode("ascii") + "'"
    headers, count = re.subn(
        r"(script-src 'self')(?: 'sha256-[A-Za-z0-9+/=]+')*(;)",
        rf"\1 {graph_hash}\2",
        headers,
        count=1,
    )
    if count != 1:
        raise RuntimeError("CSP script-src could not be updated")
    write("public/_headers", headers)


def update_llms() -> None:
    llms = read("public/llms.txt")
    projection = "- [Markdown page projection](https://www.ghezelbaash.ir/index.md): Deterministic non-canonical Markdown projection of the canonical single-page website; excluded from search indexing."
    if projection not in llms:
        anchor = "- [Full LLM-readable page export](https://www.ghezelbaash.ir/llms-full.txt): Deterministic machine-oriented rendering of the complete canonical page content."
        if anchor not in llms:
            raise RuntimeError("llms.txt canonical source anchor is missing")
        llms = llms.replace(anchor, anchor + "\n" + projection, 1)
    scholar = "- [Google Scholar](https://scholar.google.com/citations?user=BcWBirUAAAAJ): Google Scholar author profile for Dr. Saeed Ghezelbash."
    if scholar not in llms:
        anchor = "- [OpenAlex](https://openalex.org/A5064828898): Research author identity."
        if anchor not in llms:
            raise RuntimeError("llms.txt OpenAlex anchor is missing")
        llms = llms.replace(anchor, anchor + "\n" + scholar, 1)
    write("public/llms.txt", llms)


def create_markdown_endpoint() -> None:
    endpoint = r'''import source from './index.md?raw';

export const prerender = true;

const HOME = 'https://www.ghezelbaash.ir/';
const PERSON = `${HOME}#saeed-ghezelbash`;

function projection(markdown: string): string {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) throw new Error('src/pages/index.md frontmatter is missing');
  const title = match[1].match(/^title:\s*["']?(.*?)["']?\s*$/m)?.[1];
  if (!title) throw new Error('src/pages/index.md title is missing');
  const body = markdown
    .slice(match[0].length)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*\/\s*>/gi, '')
    .replace(/\s+type=["']application\/ld\+json["']/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!/<h1\s+id=/i.test(body)) throw new Error('Markdown projection is missing the canonical H1');
  return `---\ntitle: ${JSON.stringify(title)}\ncanonical: "${HOME}"\nlang: "fa-IR"\nabout: "${PERSON}"\nsource: "${HOME}"\nrobots: "noindex, follow"\n---\n\n${body}\n`;
}

export function GET(): Response {
  return new Response(projection(source), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Robots-Tag': 'noindex, follow',
    },
  });
}
'''
    write("src/pages/index.md.ts", endpoint)


def update_package() -> None:
    package = json.loads(read("package.json"))
    scripts = package.get("scripts", {})
    scripts.pop("prepare:semantic", None)
    scripts.pop("prebuild", None)
    write("package.json", json.dumps(package, ensure_ascii=False, indent=2) + "\n")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"validator patch anchor missing: {label}")
    return text.replace(old, new, 1)


def update_validator() -> None:
    path = ".github/scripts/validate_source.py"
    value = read(path)
    value = replace_once(
        value,
        'DATASET = BASE + "graph.jsonld#dataset"\nCOMMONS_IMAGE_IDS = {PORTRAIT, TEAM, OFFICE}\n',
        'DATASET = BASE + "graph.jsonld#dataset"\nSCHOLAR_ID = BASE + "#identifier-person-google-scholar"\nSCHOLAR_URL = "https://scholar.google.com/citations?user=BcWBirUAAAAJ"\nVIDEO_UPLOAD_DATES = {\n    BASE + "media/videos/education/saeed-ghezelbash-jalupro-vs-profhilo.mp4": "2024-12-18",\n    BASE + "media/videos/education/saeed-ghezelbash-subcision-technique.mp4": "2025-01-16",\n    BASE + "media/videos/education/saeed-ghezelbash-thread-lift-workshop.mp4": "2025-01-19",\n    BASE + "media/videos/testimonials/saeed-ghezelbash-kurdish-patient-review.mp4": "2025-04-23",\n}\nCOMMONS_IMAGE_IDS = {PORTRAIT, TEAM, OFFICE}\n',
        "constants",
    )
    value = replace_once(
        value,
        '    "dist/index.html", "dist/404.html", "public/index.md", "dist/index.md",\n',
        '    "dist/index.html", "dist/404.html", "src/pages/index.md.ts", "dist/index.md",\n',
        "required index route",
    )
    value = replace_once(
        value,
        '    "index.md", "graph.jsonld", "graph.ttl", "_headers", "_redirects", "robots.txt", "sitemap.xml",\n',
        '    "graph.jsonld", "graph.ttl", "_headers", "_redirects", "robots.txt", "sitemap.xml",\n',
        "source-dist loop",
    )
    value = replace_once(
        value,
        'full_by = {item["@id"]: item for item in full_nodes if isinstance(item, dict) and item.get("@id")}\n\nfor identifier in (DOCTOR, CLINIC, PORTRAIT, TEAM, OFFICE, COURSE, COURSE_INSTANCE, PRESENTATION, EVENT, ARTICLE_2016, ARTICLE_2021, COUNTRY_IR, COUNTRY_IQ, DATASET):\n',
        'full_by = {item["@id"]: item for item in full_nodes if isinstance(item, dict) and item.get("@id")}\nhead_by = {item["@id"]: item for item in head_nodes if isinstance(item, dict) and item.get("@id")}\n\nfor identifier in (DOCTOR, CLINIC, PORTRAIT, TEAM, OFFICE, COURSE, COURSE_INSTANCE, PRESENTATION, EVENT, ARTICLE_2016, ARTICLE_2021, COUNTRY_IR, COUNTRY_IQ, DATASET, SCHOLAR_ID):\n',
        "graph maps",
    )
    value = replace_once(
        value,
        'require(TEAM not in refs(doctor.get("image")) and OFFICE not in refs(doctor.get("image")), "contextual image is incorrectly a primary Person image")\n\ncourse = full_by.get(COURSE, {})\n',
        'require(TEAM not in refs(doctor.get("image")) and OFFICE not in refs(doctor.get("image")), "contextual image is incorrectly a primary Person image")\nrequire(SCHOLAR_ID in refs(doctor.get("identifier")), "Google Scholar identifier is absent from Person.identifier")\nrequire(SCHOLAR_URL in refs(doctor.get("sameAs")), "Google Scholar profile is absent from Person.sameAs")\nscholar = full_by.get(SCHOLAR_ID, {})\nrequire(scholar.get("@type") == "PropertyValue", "Google Scholar identifier node is not PropertyValue")\nrequire(scholar.get("propertyID") == "Google Scholar Author ID", "Google Scholar propertyID is incorrect")\nrequire(scholar.get("value") == "BcWBirUAAAAJ" and scholar.get("url") == SCHOLAR_URL, "Google Scholar identifier value or URL is incorrect")\nhead_doctor = head_by.get(DOCTOR, {})\nrequire(SCHOLAR_ID in refs(head_doctor.get("identifier")), "Head Graph Person.identifier lacks Google Scholar")\nrequire(SCHOLAR_URL in refs(head_doctor.get("sameAs")), "Head Graph Person.sameAs lacks Google Scholar")\nrequire(head_by.get(SCHOLAR_ID) == scholar, "Head Graph Google Scholar identifier differs from Full Graph")\n\ncourse = full_by.get(COURSE, {})\n',
        "scholar validation",
    )
    value = replace_once(
        value,
        'for node in full_nodes:\n    if isinstance(node, dict):\n        require(node.get("eventStatus") != "https://schema.org/EventCompleted", f"{node.get(\'@id\')}: invalid EventCompleted status")\nrequire("PresentationDigitalDocument" in types(full_by.get(PRESENTATION, {})), "2017 congress work is not PresentationDigitalDocument")\n',
        'for graph_name, nodes in (("Full Graph", full_nodes), ("Head Graph", head_nodes)):\n    for node in nodes:\n        if isinstance(node, dict):\n            require(node.get("eventStatus") != "https://schema.org/EventCompleted", f"{graph_name} {node.get(\'@id\')}: invalid EventCompleted status")\nrequire("PresentationDigitalDocument" in types(full_by.get(PRESENTATION, {})), "2017 congress work is not PresentationDigitalDocument")\n',
        "event validation",
    )
    value = replace_once(
        value,
        'formats = {full_by.get(identifier, {}).get("encodingFormat") for identifier in refs(full_by.get(DATASET, {}).get("distribution"))}\nrequire({"application/ld+json", "text/turtle"} <= formats, "Dataset lacks JSON-LD and Turtle distributions")\n\nmarkdown_projection = read_text("public/index.md")\n',
        'formats = {full_by.get(identifier, {}).get("encodingFormat") for identifier in refs(full_by.get(DATASET, {}).get("distribution"))}\nrequire({"application/ld+json", "text/turtle"} <= formats, "Dataset lacks JSON-LD and Turtle distributions")\nfull_videos = {node.get("contentUrl"): node for node in full_nodes if isinstance(node, dict) and "VideoObject" in types(node) and node.get("contentUrl") in VIDEO_UPLOAD_DATES}\nrequire(set(full_videos) == set(VIDEO_UPLOAD_DATES), f"Full Graph video set differs from canonical mapping: {sorted(full_videos)}")\nfor content_url, expected_date in VIDEO_UPLOAD_DATES.items():\n    video = full_videos.get(content_url, {})\n    require(video.get("uploadDate") == expected_date, f"{content_url}: uploadDate is not {expected_date}")\n    asset = ROOT / "public" / content_url.removeprefix(BASE)\n    require(asset.is_file(), f"VideoObject contentUrl asset is missing: {asset}")\nfor head_video in (node for node in head_nodes if isinstance(node, dict) and "VideoObject" in types(node)):\n    content_url = head_video.get("contentUrl")\n    require(content_url in full_videos, f"Head Graph VideoObject is absent from Full Graph: {content_url}")\n    full_video = full_videos.get(content_url, {})\n    for property_name in ("@id", "contentUrl", "uploadDate", "sameAs"):\n        require(head_video.get(property_name) == full_video.get(property_name), f"Head/Full VideoObject mismatch for {content_url}: {property_name}")\n\nmarkdown_projection = read_text("dist/index.md")\n',
        "video and markdown validation",
    )
    value = replace_once(
        value,
        '    namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}\n    locations = [element.text for element in ET.parse("public/sitemap.xml").getroot().findall("sm:url/sm:loc", namespace)]\n    require(locations == [BASE], f"sitemap must contain exactly the canonical homepage, found: {locations}")\n    require(BASE + "index.md" not in locations, "index.md entered sitemap.xml")\n',
        '    namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9", "video": "http://www.google.com/schemas/sitemap-video/1.1"}\n    sitemap_root = ET.parse("public/sitemap.xml").getroot()\n    locations = [element.text for element in sitemap_root.findall("sm:url/sm:loc", namespace)]\n    require(locations == [BASE], f"sitemap must contain exactly the canonical homepage, found: {locations}")\n    require(BASE + "index.md" not in locations, "index.md entered sitemap.xml")\n    sitemap_video_dates = {}\n    for video in sitemap_root.findall("sm:url/video:video", namespace):\n        content = video.findtext("video:content_loc", namespaces=namespace)\n        publication_date = video.findtext("video:publication_date", namespaces=namespace)\n        if content:\n            sitemap_video_dates[content] = publication_date\n    require(sitemap_video_dates == VIDEO_UPLOAD_DATES, f"video sitemap dates differ from Full Graph: {sitemap_video_dates}")\n',
        "sitemap validation",
    )
    write(path, value)


full_json = update_json_graph("public/graph.jsonld", is_head=False)
head_json = update_json_graph("src/data/semantic/head-graph.min.jsonld", is_head=True)
regenerate_turtle(full_json)
update_sitemap()
update_headers(head_json)
update_llms()
create_markdown_endpoint()
update_package()
update_validator()

# Remove the two patch layers introduced by PR 105 and this one-shot migration itself.
for obsolete in (
    "scripts/prepare-semantic-artifacts.mjs",
    "scripts/validate-semantic-hardening.mjs",
    "scripts/_apply_clean_graph_repair.py",
    ".github/workflows/apply-clean-graph-repair.yml",
):
    target = ROOT / obsolete
    if target.exists():
        target.unlink()

print("Clean graph repair applied; temporary migration and patch layers removed.")
