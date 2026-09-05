#!/usr/bin/env python3
"""Validate canonical RDF with the complete, pinned SHACL engine."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from importlib.metadata import version
from pathlib import Path

from pyshacl import validate
from rdflib import Graph, Literal, Namespace, URIRef
from rdflib.namespace import RDF, XSD


ROOT = Path(__file__).resolve().parents[1]
SH = Namespace("http://www.w3.org/ns/shacl#")
SCHEMA = Namespace("https://schema.org/")
SITE = Namespace("https://www.ghezelbaash.ir/#")
DCAT = Namespace("http://www.w3.org/ns/dcat#")
SPDX = Namespace("http://spdx.org/rdf/terms#")
PROV = Namespace("http://www.w3.org/ns/prov#")
DCT = Namespace("http://purl.org/dc/terms/")
VOID = Namespace("http://rdfs.org/ns/void#")
CR = Namespace("http://mlcommons.org/croissant/")
ASSESSMENT_PREFIX = "https://www.ghezelbaash.ir/provenance.jsonld#assessment-"
DATA_ROLES = frozenset({"canonical", "dcat", "provenance", "void", "croissant"})
RDF_MEDIA_FORMATS = {"application/ld+json": "json-ld", "text/turtle": "turtle"}


def rdf_resources(registry_path: Path) -> list[dict]:
    """The publication registry owns RDF roles and parser selection, not suffixes."""
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    resources = []
    for resource in registry["resources"]:
        rdf = resource.get("rdf")
        expected_format = RDF_MEDIA_FORMATS.get(resource["mediaType"])
        if expected_format and not rdf:
            raise ValueError(f"RDF resource lacks its validation role: {resource['path']}")
        if not rdf:
            continue
        if rdf.get("role") not in DATA_ROLES | {"serialization", "shapes"}:
            raise ValueError(f"Unknown RDF validation role: {resource['path']}")
        if not expected_format or rdf.get("format") != expected_format:
            raise ValueError(f"RDF parser disagrees with media type: {resource['path']}")
        resources.append(resource)
    for role in DATA_ROLES | {"shapes"}:
        if sum(resource["rdf"]["role"] == role for resource in resources) != 1:
            raise ValueError(f"SHACL registry requires exactly one {role} resource")
    by_path = {resource["path"]: resource for resource in resources}
    for resource in resources:
        if resource["rdf"]["role"] == "serialization":
            canonical = by_path.get(resource["rdf"].get("isomorphicWith"))
            if not canonical or canonical["rdf"]["role"] != "canonical":
                raise ValueError(f"RDF serialization lacks its canonical counterpart: {resource['path']}")
    return resources


def resource_path(resource: dict, dist_dir: Path | None) -> Path:
    return dist_dir / resource["path"] if dist_dir else ROOT / resource["source"]


def data_inputs(resources: list[dict], paths: list[Path] | None,
                dist_dir: Path | None, require_projections: bool) -> list[tuple[Path, dict]]:
    """An explicit CLI subset cannot silently weaken complete projection coverage."""
    available = {
        resource_path(resource, dist_dir).resolve(): resource
        for resource in resources if resource["rdf"]["role"] in DATA_ROLES
    }
    selected_paths = paths or [
        path for path, resource in available.items()
        if require_projections or resource["rdf"]["role"] == "canonical"
    ]
    if len(set(path.resolve() for path in selected_paths)) != len(selected_paths):
        raise ValueError("SHACL data inputs must not repeat a graph")
    selected = []
    for path in selected_paths:
        resource = available.get(path.resolve())
        if not resource:
            raise ValueError(f"SHACL input is not a registered RDF data resource: {path}")
        selected.append((path, resource))
    roles = {resource["rdf"]["role"] for _, resource in selected}
    if require_projections and roles != DATA_ROLES:
        raise ValueError(f"SHACL data coverage is missing: {', '.join(sorted(DATA_ROLES - roles))}")
    return selected


def load_graph(path: Path, rdf_format: str) -> tuple[Graph, str]:
    """Read local inputs; no ontology downloads or inferred type repair."""
    if not path.is_file():
        raise ValueError(f"SHACL input is not a local file: {path}")
    if rdf_format not in RDF_MEDIA_FORMATS.values():
        raise ValueError(f"Unsupported SHACL parser: {rdf_format}")
    payload = path.read_bytes()
    graph = Graph().parse(
        data=payload, format=rdf_format, publicID=path.resolve().as_uri()
    )
    if not graph:
        raise ValueError(f"SHACL input graph is empty: {path}")
    return graph, hashlib.sha256(payload).hexdigest()


def validate_projection_presence(graph: Graph, resource: dict) -> None:
    """Check each input carries its own semantic role before combining the graphs."""
    role = resource["rdf"]["role"]
    if role == "canonical":
        present = any(graph.subjects(RDF.type, SCHEMA.Dataset))
    elif role == "dcat":
        present = any(graph.subjects(RDF.type, DCAT.Distribution))
    elif role == "provenance":
        present = any(str(node).startswith(ASSESSMENT_PREFIX)
                      for node in graph.subjects(RDF.type, PROV.Entity))
    elif role == "void":
        present = any(any(graph.objects(node, VOID.dataDump))
                      for node in graph.subjects(RDF.type, VOID.Dataset))
    elif role == "croissant":
        present = any(graph.subjects(RDF.type, CR.RecordSet)) and any(
            str(profile) == resource["profileIri"]
            for node in graph.subjects(RDF.type, SCHEMA.Dataset)
            for profile in graph.objects(node, DCT.conformsTo)
        )
    else:
        raise ValueError(f"SHACL non-data role cannot enter the union: {role}")
    if not present:
        raise ValueError(f"SHACL resource does not contain its {role} projection: {resource['path']}")


def validate_graph(data: Graph, shapes: Graph) -> tuple[bool, Graph, str]:
    conforms, report, report_text = validate(
        data_graph=data,
        shacl_graph=shapes,
        inference="none",
        meta_shacl=True,
        abort_on_first=False,
        allow_infos=False,
        allow_warnings=False,
        do_owl_imports=False,
        advanced=False,
        js=False,
        inplace=False,
    )
    if not isinstance(report, Graph):
        raise RuntimeError(f"SHACL engine failed to produce a report graph: {report}")
    return bool(conforms), report, report_text


def mutation_tests(data: Graph, shapes: Graph) -> list[dict[str, str]]:
    """Reject semantic defects against the same graph union used by the gate."""
    source = SITE["project-github-source"]
    if (source, RDF.type, SCHEMA.SoftwareSourceCode) not in data:
        raise AssertionError("GitHub source mutation fixture is missing")
    if (source, RDF.type, SCHEMA.DataDownload) in data:
        raise AssertionError("GitHub source mutation already exists in baseline")

    treatments = sorted(
        (condition, treatment)
        for condition in data.subjects(RDF.type, SCHEMA.MedicalCondition)
        for treatment in data.objects(condition, SCHEMA.possibleTreatment)
        if (treatment, RDF.type, SCHEMA.MedicalTherapy) in data
    )
    if not treatments:
        raise AssertionError("Medical treatment class mutation fixture is missing")
    condition, treatment = treatments[0]

    cases = [
        (
            "sh:not rejects a repository typed as a data download",
            source,
            SH.NotConstraintComponent,
            (source, RDF.type, SCHEMA.DataDownload),
            True,
        ),
        (
            "sh:class rejects an untyped possible treatment",
            condition,
            SH.ClassConstraintComponent,
            (treatment, RDF.type, SCHEMA.MedicalTherapy),
            False,
        ),
    ]
    # Release-history entries are Datasets too. Mutate the exact target of
    # the canonical contract rather than whichever Dataset RDF iteration yields.
    dataset = shapes.value(SITE.CanonicalDatasetRoleShape, SH.targetNode)
    if (
        not isinstance(dataset, URIRef)
        or (dataset, RDF.type, SCHEMA.Dataset) not in data
        or not any(data.objects(dataset, SCHEMA.url))
    ):
        raise AssertionError("Dataset landing-page mutation fixture is missing")
    cases.extend([
        (
            "Dataset landing pages require a URL in the full graph union",
            dataset,
            SH.MinCountConstraintComponent,
            (dataset, SCHEMA.url, None),
            False,
        ),
        (
            "Dataset landing pages reject another destination",
            dataset,
            SH.InConstraintComponent,
            (dataset, SCHEMA.url, URIRef("https://example.test/unrelated-dataset")),
            True,
        ),
        (
            "Dataset landing pages reject language-tagged URL strings",
            dataset,
            SH.InConstraintComponent,
            (dataset, SCHEMA.url, Literal("https://www.ghezelbaash.ir/", lang="en")),
            True,
        ),
    ])
    birth_date = data.value(SITE["saeed-ghezelbash"], SCHEMA.birthDate)
    if not isinstance(birth_date, Literal) or birth_date.datatype != XSD.date:
        raise AssertionError("Typed physician birth-date mutation fixture is missing")
    untyped_date = Literal(str(birth_date))
    cases.append((
        "calendar values reject an untyped string",
        untyped_date,
        SH.OrConstraintComponent,
        (SITE["saeed-ghezelbash"], SCHEMA.birthDate, untyped_date),
        True,
    ))
    melasma_question = SITE["question-melasma-recurrence-and-multimodal-treatment"]
    cases.append((
        "the melasma question requires its actual treatment subject",
        melasma_question,
        SH.HasValueConstraintComponent,
        (melasma_question, SCHEMA.about, SITE["procedure-melasma-treatment"]),
        False,
    ))
    categorized = sorted(data.subject_objects(SCHEMA.category))
    if not categorized:
        raise AssertionError("Service-category mutation fixture is missing")
    service, category = categorized[0]
    cases.append((
        "service categories must resolve to defined terms",
        service,
        SH.ClassConstraintComponent,
        (category, RDF.type, SCHEMA.DefinedTerm),
        False,
    ))
    unrelated_term = next(
        term for term in sorted(data.subjects(RDF.type, SCHEMA.DefinedTerm))
        if (service, DCT.subject, term) not in data
    )
    cases.append((
        "service categories cannot add an undocumented subject",
        service,
        SH.SPARQLConstraintComponent,
        (service, SCHEMA.category, unrelated_term),
        True,
    ))

    distributions = sorted(data.subjects(RDF.type, DCAT.Distribution))
    if distributions:
        distribution = distributions[0]
        media_type = data.value(distribution, DCAT.mediaType)
        checksum = data.value(distribution, SPDX.checksum)
        checksum_value = data.value(checksum, SPDX.checksumValue)
        cases.extend([
            (
                "DCAT media types reject literal substitutes for IRIs",
                distribution,
                SH.NodeKindConstraintComponent,
                (distribution, DCAT.mediaType, Literal(str(media_type))),
                True,
            ),
            (
                "distribution checksums require hexBinary values",
                checksum,
                SH.DatatypeConstraintComponent,
                (checksum, SPDX.checksumValue, Literal(str(checksum_value))),
                True,
            ),
        ])
    assessments = sorted(
        node for node in data.subjects(RDF.type, PROV.Entity)
        if str(node).startswith(ASSESSMENT_PREFIX)
    )
    if assessments:
        assessment = assessments[0]
        cases.extend([
            (
                "evidence observation dates cannot become source modification dates",
                assessment,
                SH.OrConstraintComponent,
                (assessment, SCHEMA.dateModified, Literal("2026-08-07", datatype=XSD.date)),
                True,
            ),
            (
                "evidence tiers cannot introduce an unregistered additional type",
                assessment,
                SH.OrConstraintComponent,
                (assessment, SCHEMA.additionalType, SITE.EvidenceTierA),
                True,
            ),
            (
                "assessment about must identify the assessed source",
                assessment,
                SH.OrConstraintComponent,
                (assessment, SCHEMA.about, SITE["saeed-ghezelbash"]),
                True,
            ),
        ])
        role = next(
            value for value in data.objects(assessment, SCHEMA.additionalProperty)
            if (value, SCHEMA.propertyID, Literal("Evidence role")) in data
        )
        cases.append((
            "assessment roles reject unknown classifications",
            assessment,
            SH.OrConstraintComponent,
            (role, SCHEMA.value, Literal("unverified-corroboration")),
            True,
        ))
        observation = next(
            (node for node in data.subjects(SCHEMA.propertyID, Literal("Evidence observation date"))),
            None,
        )
        if observation is not None:
            cases.append((
                "evidence observation dates reject untyped strings",
                observation,
                SH.OrConstraintComponent,
                (observation, SCHEMA.value, Literal("2026-08-07")),
                True,
            ))
    results = []
    for name, focus, component, triple, add in cases:
        mutated = Graph()
        for original in data:
            mutated.add(original)
        if add:
            mutated.add(triple)
        else:
            mutated.remove(triple)
        conforms, report, _ = validate_graph(mutated, shapes)
        matching_results = [
            result
            for result in report.subjects(SH.sourceConstraintComponent, component)
            if (result, SH.focusNode, focus) in report
        ]
        if conforms or not matching_results:
            raise AssertionError(f"SHACL mutation was not rejected by {component}: {name}")
        results.append({"test": name, "constraintComponent": str(component), "status": "PASS"})
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data", type=Path, action="append",
        help="Registered local data graph; an explicit subset must still satisfy required coverage",
    )
    parser.add_argument("--registry", type=Path, default=ROOT / "src/data/machine-resources.json")
    parser.add_argument("--dist-dir", type=Path, help="Read registered artifacts from this Dist directory")
    parser.add_argument("--shapes", type=Path, help="Local SHACL shapes; defaults to the registered source or Dist artifact")
    parser.add_argument(
        "--report-dir", type=Path,
        help="Write report.ttl, report.txt and summary.json as private validation artifacts",
    )
    parser.add_argument("--self-test", action="store_true", help="Also run semantic mutation tests")
    parser.add_argument(
        "--require-projections", action="store_true",
        help="Require canonical, DCAT, provenance, VoID and Croissant data from the registry",
    )
    args = parser.parse_args()

    resources = rdf_resources(args.registry)
    selected = data_inputs(resources, args.data, args.dist_dir, args.require_projections)
    data = Graph()
    inputs = []
    for input_path, resource in selected:
        current, input_sha256 = load_graph(input_path, resource["rdf"]["format"])
        validate_projection_presence(current, resource)
        data += current
        inputs.append({
            "path": str(input_path),
            "resource": resource["path"],
            "role": resource["rdf"]["role"],
            "format": resource["rdf"]["format"],
            "sha256": input_sha256,
            "triples": len(current),
        })
    distribution_count = len(set(data.subjects(RDF.type, DCAT.Distribution)))
    assessment_count = len({
        node for node in data.subjects(RDF.type, PROV.Entity)
        if str(node).startswith(ASSESSMENT_PREFIX)
    })
    shapes_resource = next(resource for resource in resources if resource["rdf"]["role"] == "shapes")
    shapes_path = args.shapes or resource_path(shapes_resource, args.dist_dir)
    shapes, shapes_sha256 = load_graph(shapes_path, shapes_resource["rdf"]["format"])
    if not any(shapes.subjects(RDF.type, SH.NodeShape)):
        raise ValueError("SHACL shapes contain no NodeShape")
    conforms, report, report_text = validate_graph(data, shapes)
    summary = {
        "stage": "SHACL_VALIDATION",
        "engine": "pyshacl",
        "engineVersion": version("pyshacl"),
        "inference": "none",
        "metaShacl": True,
        "conforms": conforms,
        "dataInputs": inputs,
        "distributionCount": distribution_count,
        "assessmentCount": assessment_count,
        "shapesSha256": shapes_sha256,
        "nodeShapes": len(set(shapes.subjects(RDF.type, SH.NodeShape))),
        "dataTriples": len(data),
        "shapeTriples": len(shapes),
        "validationResults": len(set(report.subjects(RDF.type, SH.ValidationResult))),
    }
    # Preserve the engine's report even if a subsequent mutation test fails.
    if args.report_dir:
        args.report_dir.mkdir(parents=True, exist_ok=True)
        report.serialize(destination=args.report_dir / "report.ttl", format="turtle")
        (args.report_dir / "report.txt").write_text(report_text, encoding="utf-8")
        (args.report_dir / "summary.json").write_text(
            json.dumps(summary, indent=2) + "\n", encoding="utf-8"
        )
    if not conforms:
        print(json.dumps(summary, indent=2))
        print(report_text, file=sys.stderr)
        return 1
    if args.self_test:
        summary["mutationTests"] = mutation_tests(data, shapes)
        if args.report_dir:
            (args.report_dir / "summary.json").write_text(
                json.dumps(summary, indent=2) + "\n", encoding="utf-8"
            )
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"SHACL validation failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
