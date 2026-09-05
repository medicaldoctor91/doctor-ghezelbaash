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
from rdflib import Graph, Literal, Namespace
from rdflib.namespace import RDF, XSD


ROOT = Path(__file__).resolve().parents[1]
SH = Namespace("http://www.w3.org/ns/shacl#")
SCHEMA = Namespace("https://schema.org/")
SITE = Namespace("https://www.ghezelbaash.ir/#")
DCAT = Namespace("http://www.w3.org/ns/dcat#")
SPDX = Namespace("http://spdx.org/rdf/terms#")
PROV = Namespace("http://www.w3.org/ns/prov#")
DCT = Namespace("http://purl.org/dc/terms/")
ASSESSMENT_PREFIX = "https://www.ghezelbaash.ir/provenance.jsonld#assessment-"


def load_graph(path: Path) -> tuple[Graph, str]:
    """Read local inputs; no ontology downloads or inferred type repair."""
    if not path.is_file():
        raise ValueError(f"SHACL input is not a local file: {path}")
    formats = {".jsonld": "json-ld", ".ttl": "turtle"}
    if path.suffix not in formats:
        raise ValueError(f"Unsupported SHACL input format: {path.suffix}")
    payload = path.read_bytes()
    graph = Graph().parse(
        data=payload, format=formats[path.suffix], publicID=path.resolve().as_uri()
    )
    if not graph:
        raise ValueError(f"SHACL input graph is empty: {path}")
    return graph, hashlib.sha256(payload).hexdigest()


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
        help="Local data graph; repeat to validate the union of canonical and descriptor graphs",
    )
    parser.add_argument("--shapes", type=Path, default=ROOT / "src/data/semantic/shapes.ttl")
    parser.add_argument(
        "--report-dir", type=Path,
        help="Write report.ttl, report.txt and summary.json as private validation artifacts",
    )
    parser.add_argument("--self-test", action="store_true", help="Also run semantic mutation tests")
    parser.add_argument(
        "--require-projections", action="store_true",
        help="Require actual DCAT distributions and provenance assessments in the data union",
    )
    args = parser.parse_args()

    paths = args.data or [ROOT / "src/data/semantic/knowledge-graph.jsonld"]
    if len(set(path.resolve() for path in paths)) != len(paths):
        raise ValueError("SHACL data inputs must not repeat a graph")
    data = Graph()
    inputs = []
    for input_path in paths:
        current, input_sha256 = load_graph(input_path)
        data += current
        inputs.append({
            "path": str(input_path),
            "sha256": input_sha256,
            "triples": len(current),
        })
    distribution_count = len(set(data.subjects(RDF.type, DCAT.Distribution)))
    assessment_count = len({
        node for node in data.subjects(RDF.type, PROV.Entity)
        if str(node).startswith(ASSESSMENT_PREFIX)
    })
    if args.require_projections and (not distribution_count or not assessment_count):
        raise ValueError("SHACL requires both DCAT distributions and provenance assessments")
    shapes, shapes_sha256 = load_graph(args.shapes)
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
