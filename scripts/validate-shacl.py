"""Optional, offline SHACL validation of the published graph/DCAT/provenance union.

Run with Python containing pyshacl==0.30.1, for example an isolated venv.
The Node build compiles shapes; this command performs actual SHACL validation.
"""
import argparse
import json
from importlib.metadata import version
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dist", default="dist", help="Published distribution directory")
    parser.add_argument("--generated", action="store_true", help="Validate generated artifacts before materialization")
    parser.add_argument("--report", default=".generated/shacl-validation.json")
    parser.add_argument("--regression-checks", action="store_true", help="Also reject identity, evidence, calendar, FAQ and checksum mutations")
    args = parser.parse_args()
    try:
        from rdflib import Graph, Namespace, URIRef, Literal
        from rdflib.namespace import RDF
        from pyshacl import validate
    except ImportError as error:
        parser.error("Use an isolated Python environment containing pyshacl==0.30.1: " + str(error))

    base = Path.cwd()
    dist = base / args.dist
    if args.generated:
        files = [(base / ".generated/semantic/knowledge-graph.ttl", "turtle"),
                 (base / ".generated/projections/dcat.ttl", "turtle"),
                 (base / ".generated/projections/provenance.jsonld", "json-ld")]
        shape_file = base / ".generated/semantic/shapes.ttl"
    else:
        files = [(dist / "graph.ttl", "turtle"), (dist / "dcat.ttl", "turtle"),
                 (dist / "provenance.jsonld", "json-ld")]
        shape_file = dist / "shapes.ttl"
    data = Graph()
    for file, syntax in files:
        data.parse(file, format=syntax)
    shapes = Graph().parse(shape_file, format="turtle")
    settings = dict(shacl_graph=shapes, inference="none", advanced=True,
                    meta_shacl=True, abort_on_first=False, allow_infos=False, allow_warnings=False)
    conforms, results, text = validate(data, **settings)
    SH = Namespace("http://www.w3.org/ns/shacl#")
    report = {"schemaVersion": 1, "conforms": bool(conforms), "validator": "pyshacl", "validatorVersion": version("pyshacl"), "rdfParserVersion": version("rdflib"),
              "inference": "none", "metaShacl": True, "dataFiles": [str(file.relative_to(base)) for file, _ in files],
              "shapesFile": str(shape_file.relative_to(base)), "dataTriples": len(data), "shapeTriples": len(shapes),
              "violations": [{"focus": str(results.value(node, SH.focusNode)),
                              "shape": str(results.value(node, SH.sourceShape)),
                              "path": str(results.value(node, SH.resultPath) or ""),
                              "message": str(results.value(node, SH.resultMessage) or "")}
                             for node in results.subjects(RDF.type, SH.ValidationResult)], "regressionChecks": []}
    if args.regression_checks and conforms:
        SC = Namespace("https://schema.org/")
        EX = Namespace("https://www.ghezelbaash.ir/")
        SPDX = Namespace("http://spdx.org/rdf/terms#")
        PHYSICIAN = URIRef("https://www.ghezelbaash.ir/#saeed-ghezelbash")
        mutations = [
            ("home must own ProfilePage", (EX.webpage, RDF.type, SC.ProfilePage), None),
            ("persistent physician URL must be home", (PHYSICIAN, SC.url, None), (PHYSICIAN, SC.url, PHYSICIAN)),
            ("authored skill evidence must remain present", (PHYSICIAN, SC.skills, None), None),
            ("calendar dates require RDF datatype", (EX.webpage, SC.dateModified, None), (EX.webpage, SC.dateModified, Literal("2026-10-03"))),
            ("melasma answer must keep its actual subject", (EX["acne-pigmentation-and-scars#answer-melasma-recurrence-and-multimodal-treatment"], SC.about, None), (EX["acne-pigmentation-and-scars#answer-melasma-recurrence-and-multimodal-treatment"], SC.about, EX["procedure-thread-lift"])),
            ("measured graph distribution requires checksum", (EX["graph.jsonld/download"], SPDX.checksum, None), None),
        ]
        for label, removed, added in mutations:
            changed = Graph()
            for triple in data:
                changed.add(triple)
            changed.remove(removed)
            if added:
                changed.add(added)
            passes, _, _ = validate(changed, **settings)
            report["regressionChecks"].append({"name": label, "rejected": not bool(passes)})
    report["ok"] = report["conforms"] and all(check["rejected"] for check in report["regressionChecks"])
    output = base / args.report
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    output.with_suffix(".txt").write_text(text)
    print(json.dumps({"conforms": report["conforms"], "dataTriples": len(data), "shapeTriples": len(shapes),
                      "violations": len(report["violations"]), "regressionChecks": report["regressionChecks"], "report": args.report}))
    raise SystemExit(0 if report["ok"] else 1)


if __name__ == "__main__":
    main()
