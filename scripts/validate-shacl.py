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
from rdflib import Graph, Namespace
from rdflib.namespace import RDF


ROOT = Path(__file__).resolve().parents[1]
SH = Namespace("http://www.w3.org/ns/shacl#")
SCHEMA = Namespace("https://schema.org/")
SITE = Namespace("https://www.ghezelbaash.ir/#")


def load_graph(path: Path) -> Graph:
    """Read local inputs; no ontology downloads or inferred type repair."""
    if not path.is_file():
        raise ValueError(f"SHACL input is not a local file: {path}")
    formats = {".jsonld": "json-ld", ".ttl": "turtle"}
    if path.suffix not in formats:
        raise ValueError(f"Unsupported SHACL input format: {path.suffix}")
    graph = Graph().parse(path, format=formats[path.suffix])
    if not graph:
        raise ValueError(f"SHACL input graph is empty: {path}")
    return graph


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
    """Prove the existing nested sh:not and sh:class constraints execute."""
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
        "--data", type=Path, default=ROOT / "src/data/semantic/knowledge-graph.jsonld"
    )
    parser.add_argument("--shapes", type=Path, default=ROOT / "src/data/semantic/shapes.ttl")
    parser.add_argument(
        "--report-dir", type=Path,
        help="Write report.ttl, report.txt and summary.json as private validation artifacts",
    )
    parser.add_argument("--self-test", action="store_true", help="Also run semantic mutation tests")
    args = parser.parse_args()

    data = load_graph(args.data)
    shapes = load_graph(args.shapes)
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
        "dataSha256": hashlib.sha256(args.data.read_bytes()).hexdigest(),
        "shapesSha256": hashlib.sha256(args.shapes.read_bytes()).hexdigest(),
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
