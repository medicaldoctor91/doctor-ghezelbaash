#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from rdflib import Graph
from rdflib.compare import isomorphic

ROOT = Path(__file__).resolve().parents[1]
GRAPH_PATH = ROOT / "public" / "graph.jsonld"
TTL_PATH = ROOT / "public" / "graph.ttl"
HEAD_PATH = ROOT / "src" / "data" / "semantic" / "head-graph.min.jsonld"

BASE = "https://www.ghezelbaash.ir/"
DATASET_ID = BASE + "#project-huggingface-dataset"
ARTICLE_ID = BASE + "#evidence-iranmedlabs-interview"
CLINIC_ID = BASE + "#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah"
PERSON_ID = BASE + "#saeed-ghezelbash"
WEBPAGE_ID = BASE + "#webpage"
CATALOG_ID = BASE + "#data-catalog"
PROJECT_ID = BASE + "#doctor-ghezelbaash-structured-data-project"
PRIMARY_DATASET_ID = BASE + "graph.jsonld#dataset"

AUTHOR_ID = BASE + "#person-mehran-mohammadpour-saray"
PUBLISHER_ID = BASE + "#organization-iranmedlabs"
ARTICLE_IMAGE_ID = BASE + "#image-iranmedlabs-interview"

KEEP_IDS = [
  "https://www.ghezelbaash.ir/#identifier-person-google-kgid",
  "https://www.ghezelbaash.ir/#identifier-person-irimc",
  "https://www.ghezelbaash.ir/#identifier-clinic-google-kgid",
  "https://www.ghezelbaash.ir/#identifier-clinic-google-place-id",
  "https://www.ghezelbaash.ir/#identifier-clinic-google-maps-cid",
  "https://www.ghezelbaash.ir/#country-iran",
  "https://www.ghezelbaash.ir/#country-iraq",
  "https://www.ghezelbaash.ir/#city-kermanshah",
  "https://www.ghezelbaash.ir/#city-tehran",
  "https://www.ghezelbaash.ir/#website",
  "https://www.ghezelbaash.ir/#webpage",
  "https://www.ghezelbaash.ir/#irimc-credential-167430",
  "https://www.ghezelbaash.ir/#organization-iran-medical-council",
  "https://www.ghezelbaash.ir/#clinic-postal-address",
  "https://www.ghezelbaash.ir/#online-consultation-contact-point",
  "https://www.ghezelbaash.ir/#aesthetic-revision-and-second-opinion",
  "https://www.ghezelbaash.ir/#aesthetic-revision-and-second-opinion-offer",
  "https://www.ghezelbaash.ir/#saeed-ghezelbash-clinic-role",
  "https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah",
  "https://www.ghezelbaash.ir/#saeed-ghezelbash",
  "https://www.ghezelbaash.ir/#free-online-aesthetic-initial-consultation",
  "https://www.ghezelbaash.ir/#online-consultation-channel",
  "https://www.ghezelbaash.ir/#free-online-aesthetic-initial-consultation-offer",
  "https://www.ghezelbaash.ir/#google-maps-clinic-reputation-current",
  "https://www.ghezelbaash.ir/#video-jalupro-vs-profhilo",
  "https://www.ghezelbaash.ir/#video-subcision-technique",
  "https://www.ghezelbaash.ir/#video-thread-lift-workshop",
  "https://www.ghezelbaash.ir/#video-kurdish-patient-experience",
  "https://www.ghezelbaash.ir/#historical-patient-origin-summary",
  "https://www.ghezelbaash.ir/#observation-clinic-google-rating-current",
  "https://www.ghezelbaash.ir/#observation-clinic-google-review-count-current",
  "https://www.ghezelbaash.ir/#doctor-ghezelbaash-structured-data-project",
  "https://www.ghezelbaash.ir/#data-catalog",
  "https://www.ghezelbaash.ir/#project-huggingface-dataset",
  "https://www.ghezelbaash.ir/graph.jsonld#dataset",
  "https://www.ghezelbaash.ir/graph.jsonld#download",
  "https://www.ghezelbaash.ir/#action-contact-clinic",
  "https://www.ghezelbaash.ir/#action-online-initial-consultation",
  "https://www.ghezelbaash.ir/#action-view-clinic-map",
  "https://www.ghezelbaash.ir/#action-follow-instagram",
  "https://www.ghezelbaash.ir/#clinic-geo",
  "https://www.ghezelbaash.ir/#clinic-opening-hours-sat-thu",
  "https://www.ghezelbaash.ir/#clinic-friday-closed",
  "https://www.ghezelbaash.ir/#aesthetic-medical-consultation",
  "https://www.ghezelbaash.ir/#occupation-physician",
  "https://www.ghezelbaash.ir/#occupation-medical-researcher",
  "https://www.ghezelbaash.ir/#medical-specialty-aesthetic-medicine",
  "https://www.ghezelbaash.ir/#kermanshah-university-of-medical-sciences",
  "https://www.ghezelbaash.ir/#credential-doctor-of-medicine",
  "https://www.ghezelbaash.ir/#identifier-person-minc",
  "https://www.ghezelbaash.ir/#identifier-person-orcid",
  "https://www.ghezelbaash.ir/#identifier-clinic-osm-node",
  "https://www.ghezelbaash.ir/#identifier-clinic-foursquare",
  "https://www.ghezelbaash.ir/#identifier-clinic-huggingface",
  "https://www.ghezelbaash.ir/#identifier-clinic-yandex",
  "https://www.ghezelbaash.ir/#identifier-project-doi",
  "https://www.ghezelbaash.ir/#identifier-person-openalex",
  "https://www.ghezelbaash.ir/#identifier-person-google-scholar",
  "https://www.ghezelbaash.ir/#identifier-person-github",
  "https://www.ghezelbaash.ir/#identifier-person-huggingface",
  "https://www.ghezelbaash.ir/#identifier-person-instagram",
  "https://www.ghezelbaash.ir/#identifier-person-linkedin",
  "https://www.ghezelbaash.ir/#identifier-clinic-neshan",
  "https://www.ghezelbaash.ir/#identifier-clinic-balad",
  "https://www.ghezelbaash.ir/#identifier-presentation-researchgate-320409256",
  "https://www.ghezelbaash.ir/#place-berlin-germany",
  "https://www.ghezelbaash.ir/#image-saeed-ghezelbash-portrait-master",
  "https://www.ghezelbaash.ir/#image-saeed-ghezelbash-clinical-team-master",
  "https://www.ghezelbaash.ir/#image-saeed-ghezelbash-clinical-office-master",
  "https://www.ghezelbaash.ir/#image-doctor-ghezelbaash-clinic-logo",
  "https://www.ghezelbaash.ir/#place-messe-berlin-citycube",
  "https://www.ghezelbaash.ir/graph.ttl#download",
  "https://www.ghezelbaash.ir/#image-saeed-ghezelbash-portrait-square-1200",
  "https://www.ghezelbaash.ir/#image-saeed-ghezelbash-portrait-4x3-1200",
  "https://www.ghezelbaash.ir/#image-saeed-ghezelbash-portrait-16x9-1200",
  "https://www.ghezelbaash.ir/datasets/historical-patient-origin-summary.json#download",
  "https://www.ghezelbaash.ir/doctor.vcf#document",
  "https://www.ghezelbaash.ir/clinic.vcf#document",
  "https://www.ghezelbaash.ir/#identifier-person-wikidata",
  "https://www.ghezelbaash.ir/#identifier-person-wikimedia-commons-category",
  "https://www.ghezelbaash.ir/#identifier-person-semantic-scholar",
  "https://www.ghezelbaash.ir/#identifier-clinic-wikidata",
  "https://www.ghezelbaash.ir/#identifier-project-wikidata",
  "https://www.ghezelbaash.ir/#video-jalupro-vs-profhilo-mp4-encoding",
  "https://www.ghezelbaash.ir/#video-jalupro-vs-profhilo-webm-encoding",
  "https://www.ghezelbaash.ir/#video-subcision-technique-mp4-encoding",
  "https://www.ghezelbaash.ir/#video-subcision-technique-webm-encoding",
  "https://www.ghezelbaash.ir/#video-thread-lift-workshop-mp4-encoding",
  "https://www.ghezelbaash.ir/#video-thread-lift-workshop-webm-encoding",
  "https://www.ghezelbaash.ir/#video-kurdish-patient-experience-mp4-encoding",
  "https://www.ghezelbaash.ir/#video-kurdish-patient-experience-webm-encoding"
]

def node_by_id(nodes: list[dict[str, Any]], node_id: str) -> dict[str, Any]:
    for node in nodes:
        if node.get("@id") == node_id:
            return node
    raise KeyError(f"Missing required node: {node_id}")

def upsert_node(nodes: list[dict[str, Any]], replacement: dict[str, Any]) -> None:
    node_id = replacement["@id"]
    for index, node in enumerate(nodes):
        if node.get("@id") == node_id:
            nodes[index] = replacement
            return
    nodes.append(replacement)

def prune_value(value: Any, keep: set[str]) -> Any:
    if isinstance(value, list):
        pruned = [prune_value(item, keep) for item in value]
        pruned = [item for item in pruned if item is not None]
        return pruned or None
    if isinstance(value, dict):
        ref_id = value.get("@id")
        if ref_id is not None and len(value) == 1:
            return value if ref_id in keep else None
        result: dict[str, Any] = {}
        for key, item in value.items():
            pruned = prune_value(item, keep)
            if pruned is not None:
                result[key] = pruned
        return result or None
    return value

def make_search_head(document: dict[str, Any]) -> dict[str, Any]:
    keep = set(KEEP_IDS)
    full_by_id = {node["@id"]: node for node in document["@graph"] if "@id" in node}
    missing = sorted(keep - full_by_id.keys())
    if missing:
        raise RuntimeError(f"Head Graph keep-list references missing nodes: {missing}")

    nodes: list[dict[str, Any]] = []
    for node_id in KEEP_IDS:
        node = copy.deepcopy(full_by_id[node_id])
        pruned: dict[str, Any] = {}
        for key, value in node.items():
            if key == "subjectOf":
                continue
            item = prune_value(value, keep)
            if item is not None:
                pruned[key] = item

        if node_id == CLINIC_ID:
            pruned.pop("containedInPlace", None)

        types = pruned.get("@type")
        type_set = {types} if isinstance(types, str) else set(types or [])
        if "VideoObject" in type_set:
            pruned.pop("width", None)
            pruned.pop("height", None)

        if node_id in {
            BASE + "#image-saeed-ghezelbash-portrait-master",
            BASE + "#image-saeed-ghezelbash-clinical-team-master",
            BASE + "#image-saeed-ghezelbash-clinical-office-master",
        }:
            pruned.pop("encoding", None)
            pruned.pop("thumbnail", None)

        if node_id == BASE + "#image-doctor-ghezelbaash-clinic-logo":
            pruned.pop("width", None)
            pruned.pop("height", None)

        if "MediaObject" in type_set and node_id.endswith(("-mp4-encoding", "-webm-encoding")):
            for key in ("version", "width", "height", "dateModified", "identifier"):
                pruned.pop(key, None)

        nodes.append(pruned)

    return {"@context": document["@context"], "@graph": nodes}

def type_counter(nodes: list[dict[str, Any]]) -> dict[str, int]:
    result: dict[str, int] = {}
    for node in nodes:
        types = node.get("@type", [])
        if isinstance(types, str):
            types = [types]
        for node_type in types:
            result[node_type] = result.get(node_type, 0) + 1
    return result

def main() -> None:
    document = json.loads(GRAPH_PATH.read_text(encoding="utf-8"))
    nodes = document["@graph"]

    ids = [node.get("@id") for node in nodes if "@id" in node]
    if len(ids) != len(set(ids)):
        raise RuntimeError("Duplicate @id values exist before repair.")

    dataset = node_by_id(nodes, DATASET_ID)
    dataset["description"] = (
        "Machine-readable entity data for Dr. Saeed Ghezelbaash and his physician-owned "
        "aesthetic clinic, published on Hugging Face for entity reconciliation, linked-data "
        "reuse, and structured knowledge discovery."
    )
    dataset["publisher"] = {"@id": PERSON_ID}
    dataset.pop("isPartOf", None)
    dataset["includedInDataCatalog"] = {"@id": CATALOG_ID}
    dataset["isAccessibleForFree"] = True
    dataset["dateModified"] = "2026-08-02"

    article = node_by_id(nodes, ARTICLE_ID)
    article.update({
        "headline": "دکتر سعید قزلباش؛ دروغ بزرگ جوانسازی و فریب زیباجویان",
        "description": (
            "گفت‌وگوی ایران مدلبز با دکتر سعید قزلباش درباره وعده‌های اغراق‌شده "
            "جوانسازی، انتخاب درست بیمار و درمان‌هایی که در برخی شرایط نباید انجام شوند."
        ),
        "image": {"@id": ARTICLE_IMAGE_ID},
        "author": {"@id": AUTHOR_ID},
        "publisher": {"@id": PUBLISHER_ID},
        "datePublished": "2026-06-27T09:14:00+03:30",
    })

    upsert_node(nodes, {
        "@id": AUTHOR_ID,
        "@type": "Person",
        "name": "مهران محمدپور سرای",
        "jobTitle": "کارشناس ارشد روابط عمومی سلامت",
        "url": "https://iranmedlabs.com/author/mehran-saray/",
    })
    upsert_node(nodes, {
        "@id": PUBLISHER_ID,
        "@type": "Organization",
        "name": "ایران مدلبز",
        "alternateName": "IranMedLabs",
        "url": "https://iranmedlabs.com/",
    })
    article_image_url = (
        "https://iranmedlabs.com/wp-content/uploads/2026/06/"
        "Portrait-of-Dr.-Saeed-Qezlbash-a-cosmetic-doctor-in-Kermanshah-700x490.jpg"
    )
    upsert_node(nodes, {
        "@id": ARTICLE_IMAGE_ID,
        "@type": "ImageObject",
        "name": "دکتر سعید قزلباش؛ دروغ بزرگ جوانسازی و فریب زیباجویان",
        "caption": "تصویر شاخص گفت‌وگوی ایران مدلبز با دکتر سعید قزلباش",
        "contentUrl": article_image_url,
        "url": article_image_url,
        "encodingFormat": "image/jpeg",
        "width": 700,
        "height": 490,
        "about": [{"@id": PERSON_ID}, {"@id": CLINIC_ID}],
    })

    clinic = node_by_id(nodes, CLINIC_ID)
    previous_name = clinic.get("name")
    names: list[str] = []
    if isinstance(previous_name, str):
        names.append(previous_name)
    elif isinstance(previous_name, list):
        for item in previous_name:
            if isinstance(item, str):
                names.append(item)
            elif isinstance(item, dict) and isinstance(item.get("@value"), str):
                names.append(item["@value"])

    canonical_clinic_name = "کلینیک زیبایی دکتر سعید قزلباش"
    alternate = clinic.get("alternateName", [])
    if isinstance(alternate, str):
        alternate = [alternate]
    alternate_names = []
    for value in [*names, *alternate]:
        if value != canonical_clinic_name and value not in alternate_names:
            alternate_names.append(value)
    clinic["name"] = canonical_clinic_name
    clinic["alternateName"] = alternate_names

    webpage = node_by_id(nodes, WEBPAGE_ID)
    webpage_types = webpage.get("@type", [])
    if isinstance(webpage_types, str):
        webpage_types = [webpage_types]
    webpage["@type"] = list(dict.fromkeys([*webpage_types, "ProfilePage"]))

    for node_id in (CATALOG_ID, PROJECT_ID, PRIMARY_DATASET_ID):
        node_by_id(nodes, node_id)["dateModified"] = "2026-08-02"

    ids = [node.get("@id") for node in nodes if "@id" in node]
    if len(ids) != len(set(ids)):
        raise RuntimeError("Duplicate @id values exist after repair.")

    compact_json = json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n"
    GRAPH_PATH.write_text(compact_json, encoding="utf-8")

    graph = Graph()
    graph.parse(data=compact_json, format="json-ld", publicID=BASE)
    graph.serialize(destination=str(TTL_PATH), format="turtle", encoding="utf-8")
    ttl_text = TTL_PATH.read_text(encoding="utf-8")
    ttl_text = ttl_text.replace(
        "schema:latitude 3.434012e+01 ;",
        'schema:latitude "34.3401243"^^xsd:double ;',
    ).replace(
        "schema:longitude 4.708518e+01 .",
        'schema:longitude "47.0851778"^^xsd:double .',
    )
    TTL_PATH.write_text(ttl_text, encoding="utf-8")

    ttl_graph = Graph()
    ttl_graph.parse(str(TTL_PATH), format="turtle")
    if not isomorphic(graph, ttl_graph):
        raise RuntimeError("Generated JSON-LD and Turtle graphs are not RDF-isomorphic.")

    head = make_search_head(document)
    head_text = json.dumps(head, ensure_ascii=False, separators=(",", ":")) + "\n"
    if len(head_text.encode("utf-8")) > 120_000:
        raise RuntimeError("Search-facing Head Graph exceeds 120 KB.")
    HEAD_PATH.write_text(head_text, encoding="utf-8")

    counts = type_counter(head["@graph"])
    expected = {
        "ProfilePage": 1,
        "Dataset": 3,
        "VideoObject": 4,
        "ImageObject": 7,
        "Organization": 1,
        "MedicalClinic": 1,
    }
    for node_type, count in expected.items():
        if counts.get(node_type, 0) != count:
            raise RuntimeError(
                f"Unexpected Head Graph {node_type} count: {counts.get(node_type, 0)} != {count}"
            )

    forbidden = ("Article", "ScholarlyArticle", "Event", "Course", "Question", "Answer")
    present_forbidden = {node_type: counts[node_type] for node_type in forbidden if counts.get(node_type)}
    if present_forbidden:
        raise RuntimeError(f"Overbroad rich-result candidates remain inline: {present_forbidden}")

    print(
        "Repaired structured data:",
        f"full_nodes={len(nodes)}",
        f"full_triples={len(graph)}",
        f"head_nodes={len(head['@graph'])}",
        f"head_bytes={len(head_text.encode('utf-8'))}",
    )

if __name__ == "__main__":
    main()
