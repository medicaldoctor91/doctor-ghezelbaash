#!/usr/bin/env python3
"""Validate canonical identity and solo-practice invariants on the built dist."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

PERSON = "https://www.ghezelbaash.ir/#saeed-ghezelbash"
CLINIC = "https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah"
DATASET = "https://www.ghezelbaash.ir/graph.jsonld/dataset"
OLD_DATASET = "https://www.ghezelbaash.ir/graph.jsonld#dataset"
OPENALEX = "A5146521397"
OLD_OPENALEX = "A5064828898"
QID = "Q140287622"
ORCID = "0009-0001-9346-8475"
PERSON_KG = "/g/11nqdfk76c"
IRIMC = "167430"
CLINIC_KG = "/g/11r3rzdtb3"
CLINIC_CID = "12350483144643112463"
CLINIC_PLACE = "ChIJBT0YDOTt-j8RD-7mAPy6Zas"
CLINIC_OSM = "13530287096"

TEXT_SUFFIXES = {
    ".html", ".json", ".jsonld", ".ttl", ".txt", ".xml", ".csv",
    ".md", ".vcf", ".yaml", ".yml", ".rdf", ".nt",
}


def values(value):
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def ref_ids(value):
    result = []
    for entry in values(value):
        if isinstance(entry, str):
            result.append(entry)
        elif isinstance(entry, dict) and isinstance(entry.get("@id"), str):
            result.append(entry["@id"])
    return result


def text_files(root: Path):
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.suffix.lower() in TEXT_SUFFIXES:
            yield path, path.read_text(encoding="utf-8", errors="strict")


def identity_bundle(nodes_by_id, node):
    """Serialize only identity-bearing fields, excluding topical Wikidata links."""
    identifier_nodes = []
    for ref in ref_ids(node.get("identifier")):
        identifier_nodes.append(nodes_by_id.get(ref, {"@id": ref}))
    payload = {
        "sameAs": values(node.get("sameAs")),
        "identifier": identifier_nodes,
    }
    return json.dumps(payload, ensure_ascii=False, sort_keys=True)


def assert_exact_domain_id(text: str, pattern: str, expected: str, label: str):
    found = set(re.findall(pattern, text))
    if found != {expected}:
        raise AssertionError(f"{label} drift: expected only {expected!r}, found {sorted(found)!r}")


def validate(root: Path):
    root = root.resolve()
    if not (root / "graph.jsonld").is_file() or not (root / "index.html").is_file():
        raise AssertionError(f"built dist is incomplete: {root}")

    files = list(text_files(root))
    combined = "\n".join(text for _, text in files)

    # Historical identifiers are allowed in archived releases, not in the current site build.
    assert OLD_OPENALEX not in combined, f"stale OpenAlex ID remains in {root}"
    assert OLD_DATASET not in combined, f"historical Dataset IRI remains in {root}"

    dataset_forms = set(re.findall(r"https://www\.ghezelbaash\.ir/graph\.jsonld(?:#dataset|/dataset)", combined))
    assert dataset_forms == {DATASET}, f"Dataset IRI drift: {sorted(dataset_forms)!r}"

    required_projection_markers = {
        "graph.jsonld": [DATASET, OPENALEX, QID, ORCID],
        "entity-facts.csv": [DATASET, OPENALEX],
        "llms.txt": [DATASET, OPENALEX, QID, ORCID],
        "index.html": [OPENALEX, QID, ORCID],
    }
    for name, markers in required_projection_markers.items():
        body = (root / name).read_text(encoding="utf-8")
        for marker in markers:
            assert marker in body, f"{name} missing canonical marker {marker}"

    graph = json.loads((root / "graph.jsonld").read_text(encoding="utf-8"))
    nodes = graph.get("@graph")
    assert isinstance(nodes, list), "graph.jsonld must contain @graph"
    by_id = {node.get("@id"): node for node in nodes if isinstance(node, dict) and node.get("@id")}
    person = by_id.get(PERSON)
    clinic = by_id.get(CLINIC)
    assert person is not None, "canonical physician node missing"
    assert clinic is not None, "canonical clinic/practice node missing"

    # Scope uniqueness to sameAs and identifier PropertyValues. The physician also
    # links to many legitimate topical Wikidata entities elsewhere in the graph.
    person_identity = identity_bundle(by_id, person)
    clinic_identity = identity_bundle(by_id, clinic)

    assert_exact_domain_id(person_identity, r"wikidata\.org/(?:wiki|entity)/(Q\d+)", QID, "Wikidata person QID")
    assert_exact_domain_id(person_identity, r"orcid\.org/([0-9X-]{19})", ORCID, "ORCID")
    assert_exact_domain_id(person_identity, r"openalex\.org/(A\d+)", OPENALEX, "OpenAlex person ID")
    assert PERSON_KG in person_identity, "person Google KG ID missing"
    assert IRIMC in person_identity, "IRIMC code missing"

    for expected, label in [
        (CLINIC_KG, "clinic Google KG ID"),
        (CLINIC_CID, "clinic Google Maps CID"),
        (CLINIC_PLACE, "clinic Google Place ID"),
        (CLINIC_OSM, "clinic OpenStreetMap node ID"),
    ]:
        assert expected in clinic_identity, f"{label} missing"

    # The practice remains a distinct place/practice entity, but not an independent
    # multi-provider MedicalClinic employing or directing the physician.
    clinic_types = {str(v) for v in values(clinic.get("@type"))}
    assert "MedicalClinic" not in clinic_types and "https://schema.org/MedicalClinic" not in clinic_types, clinic_types
    assert any(v.endswith("PhysiciansOffice") for v in clinic_types), f"PhysiciansOffice type missing: {clinic_types}"
    assert not ref_ids(person.get("worksFor")), "physician must not workFor the dependent practice"
    assert CLINIC not in ref_ids(person.get("affiliation")), "practice must not be a physician affiliation"
    assert not ref_ids(clinic.get("employee")), "practice must not employ the physician"
    assert CLINIC in ref_ids(person.get("owns")), "physician ownership edge missing"
    assert CLINIC in ref_ids(person.get("practicesAt")), "physician practicesAt edge missing"
    assert PERSON in ref_ids(clinic.get("owner")), "practice owner edge missing"
    assert PERSON in ref_ids(clinic.get("founder")), "practice founder edge missing"

    html = (root / "index.html").read_text(encoding="utf-8")
    assert "Medical Director / مدیر پزشکی" not in html, "legacy clinic Medical Director row remains visible"
    for marker in ["Founder / بنیان‌گذار", "Owner / مالک", "Operator / گرداننده", "Physician / پزشک"]:
        assert marker in html, f"visible solo-practice fact missing: {marker}"

    return {
        "text_files_checked": len(files),
        "dataset_iri": DATASET,
        "openalex": OPENALEX,
        "person_qid": QID,
        "orcid": ORCID,
        "person_google_kg": PERSON_KG,
        "irimc": IRIMC,
        "clinic_google_kg": CLINIC_KG,
        "clinic_cid": CLINIC_CID,
        "clinic_place_id": CLINIC_PLACE,
        "clinic_osm_node": CLINIC_OSM,
        "solo_practice": True,
    }


if __name__ == "__main__":
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "dist")
    print(json.dumps(validate(target), ensure_ascii=False, sort_keys=True))
