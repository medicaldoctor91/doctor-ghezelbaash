#!/usr/bin/env python3
"""Build reversible HF access derivatives; never edit frozen source resources."""

import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import tempfile

import pyarrow as pa
import pyarrow.parquet as pq

ARROW_VERSION = "25.0.1"
FACT_FIELDS = [
    "subject", "type", "name", "predicate", "value", "object", "object_name",
    "language", "datatype", "provenance", "dataset", "version", "modified",
    "row_id", "value_kind", "value_media_type",
]
QUERY_FIELDS = [
    "row_kind", "query", "intent_family", "language", "query_scope",
    "practice_location", "canonical_subject", "canonical_subject_iri",
    "dataset_iri", "release", "version_doi", "retrieval_policy", "resolution_mode",
    "stable_evidence_refs", "answer_id", "answer_strategy", "service_ids",
    "service_families", "service_types",
]
LIST_FIELDS = {"stable_evidence_refs", "service_ids", "service_families", "service_types"}
OPTIONAL_FIELDS = {"answer_id", "service_types"}
OMITTED = "_source_omitted_fields"
SPECS = [
    ("entity_facts", "entity-facts.csv", "viewer/entity-facts.parquet"),
    ("query_matrix", "query-matrix.jsonl", "viewer/query-matrix.parquet"),
]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def read_facts(raw, release, dataset):
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8"), newline=""), strict=True)
    require(reader.fieldnames == FACT_FIELDS, "Frozen fact columns differ from the supported schema")
    rows = list(reader)
    require(bool(rows), "Fact source is empty")
    for number, row in enumerate(rows, 1):
        require(set(row) == set(FACT_FIELDS) and all(isinstance(value, str) for value in row.values()),
                f"Malformed fact row {number}")
        require(row["version"] == release and row["dataset"] == dataset,
                f"Fact release/dataset identity drift at row {number}")
    require(len({row["row_id"] for row in rows}) == len(rows), "Duplicate fact row_id")
    return rows


def read_queries(raw, release, doi, dataset):
    rows = []
    for number, line in enumerate(raw.decode("utf-8").splitlines(), 1):
        require(bool(line.strip()), f"Blank query source line {number}")
        row = json.loads(line, object_pairs_hook=unique_object)
        require(isinstance(row, dict), f"Non-object query row {number}")
        require(set(row) <= set(QUERY_FIELDS) and set(QUERY_FIELDS) - set(row) <= OPTIONAL_FIELDS,
                f"Query columns differ from the supported schema at row {number}")
        for name, value in row.items():
            valid = (isinstance(value, list) and all(isinstance(item, str) for item in value)) \
                if name in LIST_FIELDS else isinstance(value, str)
            require(valid, f"Query value type drift at row {number}, field {name}")
        require(row["release"] == release and row["version_doi"] == doi and row["dataset_iri"] == dataset,
                f"Query release/DOI/dataset identity drift at row {number}")
        rows.append(row)
    require(bool(rows), "Query source is empty")
    return rows


def restore_queries(rows):
    originals = []
    for source in rows:
        row = dict(source)
        omitted = row.pop(OMITTED)
        require(len(set(omitted)) == len(omitted) and set(omitted) <= OPTIONAL_FIELDS,
                "Invalid omitted-field marker")
        for name in omitted:
            require(row[name] is None, f"Omitted field unexpectedly contains a value: {name}")
            del row[name]
        originals.append(row)
    return originals


def field_descriptor(field):
    return {"name": field.name, "type": "list<string>" if pa.types.is_list(field.type) else "string",
            "nullable": field.nullable}


def encode_table(table):
    table.validate(full=True)
    buffer = pa.BufferOutputStream()
    pq.write_table(table, buffer, compression="zstd", compression_level=3, version="2.6",
                   row_group_size=1000, data_page_version="1.0", write_statistics=True,
                   use_dictionary=True, store_schema=True)
    return buffer.getvalue().to_pybytes()


def build(hub, release, doi, dataset, check=False, expectations_out=None):
    require(pa.__version__ == ARROW_VERSION,
            f"Expected pyarrow {ARROW_VERSION}; install scripts/requirements-hf-viewer.txt")
    require(hub.is_dir(), "Staged HF distribution directory is missing")
    sources = {source: (hub / source).read_bytes() for _, source, _ in SPECS}
    facts = read_facts(sources["entity-facts.csv"], release, dataset)
    queries = read_queries(sources["query-matrix.jsonl"], release, doi, dataset)
    metadata = {
        b"derivative_role": b"reversible-viewer-access-derivative",
        b"release": release.encode(), b"source_version_doi": doi.encode(),
        b"canonical_dataset_iri": dataset.encode(), b"packaging_revision": b"1",
    }
    string_list = pa.list_(pa.field("element", pa.string(), nullable=False))
    fact_schema = pa.schema([pa.field(name, pa.string(), nullable=False) for name in FACT_FIELDS],
                            metadata={**metadata, b"source_sha256": digest(sources["entity-facts.csv"]).encode()})
    query_schema = pa.schema([
        pa.field(name, string_list if name in LIST_FIELDS else pa.string(), nullable=name in OPTIONAL_FIELDS)
        for name in QUERY_FIELDS
    ] + [pa.field(OMITTED, string_list, nullable=False)], metadata={
        **metadata, b"source_sha256": digest(sources["query-matrix.jsonl"]).encode(),
        b"roundtrip_note": b"Remove fields listed by _source_omitted_fields, then remove that helper.",
    })
    normalized = [{**{name: row.get(name) for name in QUERY_FIELDS},
                   OMITTED: [name for name in QUERY_FIELDS if name not in row]} for row in queries]
    tables = {"entity_facts": pa.Table.from_pylist(facts, schema=fact_schema),
              "query_matrix": pa.Table.from_pylist(normalized, schema=query_schema)}
    originals = {"entity_facts": facts, "query_matrix": queries}
    manifest = {
        "schemaVersion": 1, "packagingRevision": 1,
        "role": "reversible-viewer-access-derivatives",
        "release": release, "canonicalDatasetIri": dataset, "zenodoVersionDoi": doi,
        "builder": {"name": "pyarrow", "version": ARROW_VERSION}, "files": {},
    }
    # Complete both round trips before replacing any staged derivative.
    pending = {}
    for config, source, target in SPECS:
        table = tables[config]
        encoded = encode_table(table)
        require(encode_table(table) == encoded, f"Non-deterministic Parquet output: {config}")
        decoded = pq.read_table(pa.BufferReader(encoded))
        require(decoded.schema.equals(table.schema, check_metadata=True), f"Parquet schema drift: {config}")
        restored = restore_queries(decoded.to_pylist()) if config == "query_matrix" else decoded.to_pylist()
        require(restored == originals[config], f"Parquet row/value/order roundtrip failed: {config}")
        manifest["files"][target] = {
            "config": config, "format": "parquet", "bytes": len(encoded), "sha256": digest(encoded),
            "rows": len(originals[config]), "fields": [field_descriptor(field) for field in table.schema],
            "source": {"path": source, "bytes": len(sources[source]), "sha256": digest(sources[source])},
            "roundtrip": "exact-values-list-order-row-order-and-field-presence",
        }
        pending[target] = encoded
    for source, raw in sources.items():
        require((hub / source).read_bytes() == raw, f"Source changed during packaging: {source}")
    pending["viewer/packaging.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
    if check:
        for target, content in pending.items():
            require((hub / target).read_bytes() == content, f"Deterministic viewer derivative drift: {target}")
    for target, content in pending.items():
        if check:
            continue
        destination = hub / target
        destination.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=destination.parent, prefix=".hf-viewer-", delete=False) as stream:
            temporary = Path(stream.name)
            try:
                stream.write(content)
                stream.flush()
                temporary.replace(destination)
            finally:
                temporary.unlink(missing_ok=True)
    if expectations_out is not None:
        expectations_out = expectations_out.resolve()
        require(hub not in expectations_out.parents, "Expectations output must be outside the staged distribution")
        expectations = {"configs": [
            {"name": config, "rows": tables[config].to_pylist(),
             "features": [field_descriptor(field) for field in tables[config].schema],
             "search": {"query": "Ghezelbash"},
             "filter": {"column": "version" if config == "entity_facts" else "release", "value": release}}
            for config, _, _ in SPECS
        ]}
        expectations_out.write_text(json.dumps(expectations, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return manifest


def self_test():
    """Exercise failure paths and source distinctions that schema inference loses."""
    release, doi, dataset = "1.3.3", "10.5281/zenodo.22838416", "https://example.org/#dataset"
    fact = {name: "" for name in FACT_FIELDS}
    fact.update(version=release, dataset=dataset, row_id="001", modified="2026-09-18", value='quoted, "متن"\nline')
    facts_io = io.StringIO(newline="")
    writer = csv.DictWriter(facts_io, fieldnames=FACT_FIELDS)
    writer.writeheader()
    writer.writerow(fact)
    query = {name: ([] if name in LIST_FIELDS else "") for name in QUERY_FIELDS}
    query.update(release=release, version_doi=doi, dataset_iri=dataset, query="پرسش", stable_evidence_refs=["b", "a", "b"])
    del query["answer_id"]
    second = {**query, "answer_id": ""}
    del second["service_types"]
    raw_query = (json.dumps(query, ensure_ascii=False) + "\n" + json.dumps(second, ensure_ascii=False) + "\n").encode()
    with tempfile.TemporaryDirectory(prefix="hf-viewer-test-") as directory:
        hub = Path(directory)
        (hub / "entity-facts.csv").write_bytes(facts_io.getvalue().encode())
        (hub / "query-matrix.jsonl").write_bytes(raw_query)
        first = build(hub, release, doi, dataset)
        before = {path: (hub / path).read_bytes() for path in [*first["files"], "viewer/packaging.json"]}
        require(build(hub, release, doi, dataset) == first, "Packaging metadata is not deterministic")
        require(all((hub / path).read_bytes() == data for path, data in before.items()), "Repeat build byte drift")
        build(hub, release, doi, dataset, check=True)
        changed = hub / "viewer/query-matrix.parquet"
        changed.write_bytes(changed.read_bytes() + b"corruption")
        try:
            build(hub, release, doi, dataset, check=True)
        except ValueError:
            pass
        else:
            raise ValueError("Modified remote derivative was accepted")
        changed.write_bytes(before["viewer/query-matrix.parquet"])
        require(pq.read_table(hub / "viewer/entity-facts.parquet").to_pylist() == [fact], "CSV lexical values were coerced")
        require(restore_queries(pq.read_table(hub / "viewer/query-matrix.parquet").to_pylist()) == [query, second],
                "Optional presence/list ordering was lost")
        for bad, label in [({**query, "answer_id": None}, "explicit null"),
                           ({**query, "service_ids": "wrong"}, "list type"),
                           ({**query, "version_doi": "wrong"}, "DOI"),
                           ({**query, "unknown": "x"}, "unknown column")]:
            try:
                read_queries(json.dumps(bad).encode(), release, doi, dataset)
            except ValueError:
                pass
            else:
                raise ValueError(f"Failure path was accepted: {label}")
        try:
            read_queries(b'{"query":"first","query":"second"}', release, doi, dataset)
        except ValueError:
            pass
        else:
            raise ValueError("Duplicate JSON field was accepted")
    print(json.dumps({"hfViewerBuilderTests": "PASS", "pyarrow": pa.__version__}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--check", action="store_true", help="Rebuild in memory and require exact existing derivative bytes")
    parser.add_argument("--expectations-out", type=Path, help="Write normalized source rows/features outside the distribution")
    parser.add_argument("--hub", type=Path)
    parser.add_argument("--release")
    parser.add_argument("--doi")
    parser.add_argument("--dataset")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not all([args.hub, args.release, args.doi, args.dataset]):
        parser.error("--hub, --release, --doi and --dataset are required")
    manifest = build(args.hub.resolve(strict=True), args.release, args.doi, args.dataset,
                     check=args.check, expectations_out=args.expectations_out)
    print(json.dumps({"hfViewerPackaging": "PASS", "release": args.release,
                      "files": {name: {key: item[key] for key in ["rows", "bytes", "sha256"]}
                                for name, item in manifest["files"].items()}}, indent=2))


if __name__ == "__main__":
    main()
