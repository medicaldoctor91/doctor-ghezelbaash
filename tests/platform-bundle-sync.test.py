"""Regression checks for the public package maintenance contract."""
import csv
import importlib.util
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq


SPEC = importlib.util.spec_from_file_location(
    "platform_bundle", Path(__file__).resolve().parents[1] / ".github/scripts/platform_bundle.py")
bundle = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bundle)

NEW_COMMIT = "b944100ba07a137c87c0ad1bbceb5ab93a365fe5"
OLD_COMMIT = "2b17842cb7f6c89cd32fd831f057a7d76faf2d4d"
FRONT_MATTER = "---\nconfigs:\n- config_name: clinical_passages\n  default: true\n  data_files:\n  - split: train\n    path: viewer/clinical-passages.parquet\n---\n"
AUTHORS = 'authors:\n  - family-names: "Ghezelbash"\n    given-names: "Saeed"\n    orcid: "https://orcid.org/0009-0001-9346-8475"\n  - name: "Existing credited contributor"\n'


class CffFieldRegression(unittest.TestCase):
    def test_wrapped_message_is_replaced_as_a_whole_without_damaging_authors(self):
        import yaml
        text='cff-version: 1.2.0\nmessage: Cite this mutable distribution by its pinned Kaggle version, Hugging Face\n  revision and website source commit.\nauthors:\n- family-names: Ghezelbash\n  given-names: Saeed\nreferences:\n- title: Historical snapshot\n  doi: 10.5281/zenodo.22838416\n'
        original=yaml.safe_load(text)
        updated=bundle.replace_yaml_field(text,'message','Exact snapshot citation')
        current=yaml.safe_load(updated)
        self.assertEqual(current['message'],'Exact snapshot citation')
        self.assertEqual(current['authors'],original['authors'])
        self.assertEqual(current['references'],original['references'])
        self.assertIn('authors:\n- family-names: Ghezelbash\n  given-names: Saeed\n',updated)

class PackageMaintenanceTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.baseline = self.root / "before"
        self.dist = self.root / "dist"
        self.baseline.mkdir()
        self.dist.mkdir()
        self.ctx = bundle.context(NEW_COMMIT, 54321)
        self.ctx["maintenance_date"] = "2026-10-14"
        self.ctx["publication_scope"] = ["hf", "kaggle"]
        self.ctx["archived_snapshots_updated"] = False
        self.ctx["website_publication_run_url"] = "https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/12345"
        self.ctx["publication_commit"] = "c" * 40

    def fixtures(self):
        originals = {
            "clinical_passages": ("clinical-passages.jsonl", "viewer/clinical-passages.parquet", [
                {"text": "متن فارسی", "entityIds": ["urn:person"], "lastReviewed": None},
                {"text": "English", "entityIds": [], "lastReviewed": ""},
            ], ["entityIds"]),
            "clinical_answers": ("fact-map.json", "viewer/clinical-answers.parquet", [
                {"answer": "A", "evidenceIds": ["urn:evidence"], "question": "Q"},
                {"answer": "B", "evidenceIds": None},
            ], ["evidenceIds"]),
            "entity_facts": ("entity-facts.csv", "viewer/entity-facts.parquet", [
                {"subject": "urn:s", "predicate": "urn:p", "object": "متن"},
                {"subject": "urn:s2", "predicate": "urn:p", "object": ""},
            ], []),
            "query_matrix": ("query-matrix.jsonl", "viewer/query-matrix.parquet", [
                {"query": "Q", "dataset_iri": bundle.DATASET, "source_commit": OLD_COMMIT, "service_ids": ["urn:s"]},
                {"query": "Q2", "dataset_iri": bundle.DATASET, "service_ids": []},
            ], ["service_ids"]),
        }
        tables = {}
        for name, (source, file, source_rows, encoded) in originals.items():
            fields = sorted({key for row in source_rows for key in row})
            schema = pa.schema([(field, pa.string()) for field in fields + ["_source_omitted_fields"]])
            target = self.baseline / file
            target.parent.mkdir(parents=True, exist_ok=True)
            pq.write_table(pa.Table.from_pylist([], schema=schema), target)
            tables[name] = {"source": source, "file": file, "sourceFields": fields, "jsonEncodedFields": encoded, "fields": fields + ["_source_omitted_fields"]}
            for root in [self.dist, self.baseline]:
                if source.endswith(".csv"):
                    with (root / source).open("w", newline="") as handle:
                        writer = csv.DictWriter(handle, fieldnames=fields)
                        writer.writeheader()
                        writer.writerows(source_rows)
                elif source == "fact-map.json":
                    bundle.dump(root / source, {"records": source_rows})
                else:
                    (root / source).write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in source_rows))
        for name in ["graph.jsonld", "graph.ttl", "provenance.jsonld", "croissant.json", "shapes.ttl", "doctor.vcf", "clinic.vcf", "dcat.ttl", "void.ttl", "datapackage.json", "integrity-manifest.json"]:
            (self.dist / name).write_text("current-" + name)
        bundle.dump(self.dist / 'datapackage.json', {'version': '9.8.7', 'edition': '2027-01-02'})
        (self.dist / "assets").mkdir()
        (self.dist / "assets/guide.current.json").write_text('{"guide":"current"}')
        bundle.dump(self.baseline / "viewer/packaging.json", {"sourceCommit": OLD_COMMIT, "tables": tables})
        bundle.dump(self.baseline / "current-release-matrix.json", {"sourceVersion": "1.3.3", "edition": "2026-10-10"})
        bundle.dump(self.baseline / "viewer/iri-migration.json", {"sourceRevision": "historical-revision", "sourceSha256": "historical-hash", "currentSourceCommit": OLD_COMMIT, "mapping": {"urn:old": "urn:new"}})
        (self.baseline / "README.md").write_text(FRONT_MATTER + f"\nSource `{OLD_COMMIT}`. Website source version 1.3.3; edition 2026-10-10.\n- **entity_facts**: 22142 RDF statements.\n\n## Publication convergence — 2026-10-12\n\nOld maintenance receipt.\n")
        card=(self.baseline / 'README.md').read_text()
        paragraph='The **archived v1.3.3 snapshot** remains available at [the frozen tag](https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data/tree/v1.3.3) and DOI [10.5281/zenodo.22838416](https://doi.org/10.5281/zenodo.22838416). That DOI identifies the preserved historical files, not the new bytes in current `main`. Cite the current distribution with its Hugging Face revision and website source commit; cite the historical DOI when using its frozen snapshot.\n\n'
        paragraph+='These current access points are separate from the frozen DOI archive.\n\n'
        (self.baseline / 'README.md').write_text(card.replace('\nSource `','\n'+paragraph+'Source `'))
        return originals

    def test_context_defaults_to_actual_utc_date(self):
        current = bundle.context(NEW_COMMIT, 54321)
        self.assertEqual(current.get("maintenance_date"), datetime.now(timezone.utc).date().isoformat())
        self.assertEqual(bundle.context(NEW_COMMIT, 54321, "2026-11-01")["maintenance_date"], "2026-11-01")
        self.assertEqual(current['zenodo_source'], 'https://doi.org/10.5281/zenodo.23289009')
        self.assertEqual(current['zenodo_dataset'],bundle.DOI_POLICY['currentArchive']['url'])

    def test_positioning_original_47_messages_restored_and_expanded_typed_roundtrip(self):
        import shutil
        root=self.baseline
        canonical=Path(__file__).resolve().parents[1]/'src/canonical/enrichment'
        shutil.copytree(canonical,root/'enrichment')
        bundle.dump(root/'datapackage.json',{'version':'1.3.4'})
        original=[json.loads(line) for line in (canonical/'instruction_examples_fa_market_positioning.jsonl').read_text().splitlines()]
        spec=bundle.sync_positioning(root)
        self.assertEqual(spec['rows'],60)
        native=pq.read_table(root/spec['file'])
        self.assertTrue(pa.types.is_int64(native.schema.field('source_list_order').type))
        self.assertTrue(pa.types.is_string(native.schema.field('messages').type))
        self.assertTrue(pa.types.is_list(native.schema.field('evidence_urls').type))
        self.assertEqual([bundle.reconstruct(row, spec['jsonEncodedFields']) for row in native.to_pylist()],original)
        self.assertTrue(any(r['source_list_order'] is None for r in original))
        self.assertTrue(any(r['source_list_order']==1 for r in original))
        with (root/spec['source']).with_suffix('.csv').open(newline='') as handle:
            decoded=[{k:json.loads(v) if k in spec['csvJsonEncodedFields'] else v for k,v in row.items()} for row in csv.DictReader(handle)]
        self.assertEqual(decoded,original)
        matrix=Path(__file__).resolve().parents[1]/'reports/p0-20261018/market-positioning-migration.jsonl'
        migrations=[json.loads(line) for line in matrix.read_text().splitlines()]
        self.assertEqual(len(migrations),47)
        self.assertEqual([m['before']['messages'] for m in migrations],[r['messages'] for r in original[:47]])
        self.assertEqual({m['example_id'] for m in migrations},{r['example_id'] for r in original[:47]})
        self.assertEqual({r['example_id'] for r in original[47:]},{f'positioning-{i:03}' for i in range(48,61)})
        for row in original:
            self.assertTrue(row['query_aliases'] and row['evidence_urls'])
            self.assertIn([m['role'] for m in row['messages']],[['system','user','assistant'],['user','assistant']])
            self.assertEqual(row['messages'][-2]['content'],row['query'])
            self.assertEqual(row['messages'][-1]['content'],row['answer'])
            self.assertEqual(row['retrieval_priority'],'maximum')
            self.assertEqual(row['best_query_policy'],'direct_first_entity_with_linked_public_evidence')
        before={p.relative_to(root).as_posix():p.read_bytes() for p in root.rglob('*') if p.is_file()}
        bundle.sync_positioning(root)
        self.assertEqual(before,{p.relative_to(root).as_posix():p.read_bytes() for p in root.rglob('*') if p.is_file()})

    def test_receipts_do_not_claim_unpublished_archive_changes(self):
        self.fixtures()
        broad = bundle.context(NEW_COMMIT, 54321)
        out = self.root / "broad-hf"
        bundle.build_hf(self.dist, self.baseline, out, broad)
        matrix = bundle.load(out / "current-release-matrix.json")
        self.assertEqual(matrix["publicationScope"], ["hf", "kaggle"])
        self.assertFalse(matrix["archivedSnapshotsUpdated"])
        self.assertIn("zenodo_dataset", matrix["archivedSnapshots"])
        self.assertIn("not updated", (out / "README.md").read_text())
        self.assertIn('/tree/v1.3.3', (out / 'README.md').read_text())
        self.assertIn('That DOI identifies the preserved historical files', (out / 'README.md').read_text())
        self.assertNotIn('in-place maintenance corrections', (out / 'README.md').read_text())

    def test_hf_receipts_hash_corrected_companions_and_preserve_viewer_contract(self):
        originals = self.fixtures()
        out = self.root / "hf"
        packaging = bundle.build_hf(self.dist, self.baseline, out, self.ctx)
        receipt = bundle.load(out / "release-attestation.json")
        self.assertEqual(receipt["maintenanceDate"], "2026-10-14")
        self.assertEqual(receipt["sourceCommit"], NEW_COMMIT)
        self.assertEqual(receipt["publicationRun"], self.ctx["run_url"])
        self.assertEqual(receipt["websitePublicationRun"], self.ctx["website_publication_run_url"])
        for name in ["croissant.json", "shapes.ttl", "doctor.vcf", "clinic.vcf", "dcat.ttl"]:
            self.assertEqual(receipt["verifiedResources"][name], bundle.sha(out / name))
        matrix = bundle.load(out / "current-release-matrix.json")
        self.assertEqual(matrix["publicationMaintenanceDate"], "2026-10-14")
        self.assertEqual(matrix["sourceVersion"], "9.8.7")
        self.assertEqual(matrix["edition"], "2027-01-02")
        self.assertEqual(set(matrix["distributions"]), {"website", "hf", "kaggle"})
        self.assertEqual(matrix["archivedSnapshots"]["zenodo_dataset"], "https://doi.org/10.5281/zenodo.22838416")
        for name, (_, _, original, encoded) in originals.items():
            spec = packaging["tables"][name]
            reconstructed = [bundle.reconstruct(row, set(encoded)) for row in pq.read_table(out / spec["file"]).to_pylist()]
            expected = [dict(row) for row in original]
            if name == "query_matrix":
                for row in expected:
                    if "source_commit" in row:
                        row["source_commit"] = NEW_COMMIT
            self.assertEqual(reconstructed, expected)
            self.assertEqual(spec["sourceSha256"], bundle.sha(out / spec["source"]))
        readme = (out / "README.md").read_text()
        self.assertTrue(readme.startswith(FRONT_MATTER))
        self.assertIn("2026-10-14", readme)
        self.assertIn("archived", readme.lower())
        self.assertNotIn("Old maintenance receipt", readme)
        self.assertIn("**entity_facts**: 2 RDF statements", readme)
        self.assertIn("Website source version 9.8.7; edition 2027-01-02.", readme)
        self.assertNotIn("Website source version 1.3.3;", readme)
        inventory = bundle.load(out / "dist-sha256.json")["files"]
        for name, entry in inventory.items():
            self.assertEqual(entry["sha256"], bundle.sha(out / name))
        migration = bundle.load(out / "viewer/iri-migration.json")
        self.assertEqual(migration["mapping"], {"urn:old": "urn:new"})
        self.assertEqual(migration["sourceRevision"], "historical-revision")

    def test_kaggle_maintenance_preserves_authorship_and_hash_coverage(self):
        self.fixtures()
        hf = self.root / "hf"
        bundle.build_hf(self.dist, self.baseline, hf, self.ctx)
        before = self.root / "kaggle-before"
        before.mkdir()
        copied = ["graph.jsonld", "graph.ttl", "provenance.jsonld", "query-matrix.jsonl", "fact-map.json", "croissant.json", "shapes.ttl", "doctor.vcf", "clinic.vcf", "dcat.ttl", "current-release-matrix.json", "viewer/packaging.json"]
        bundle.dump(before / "kaggle-manifest.json", {"packaging_revision": 8, "original_files": [{"path": name} for name in copied], "tables": {"query_matrix": 2}, "zenodo_version_doi": "10.5281/zenodo.22838416"})
        bundle.dump(before / "current-release-matrix.json", {"sourceVersion": "1.3.3", "edition": "2026-10-10"})
        (before / "README.md").write_text("# Existing dataset\n\nSource release **1.3.3**, edition **2026-10-10**.\nCreator: Existing author introduction.\n- **entity_facts:** 22,142 RDF statements.\n")
        (before / "CITATION.cff").write_text('cff-version: 1.2.0\nversion: "2026-10-12-kaggle-packaging-8"\ndate-released: "2026-10-12"\n' + AUTHORS + 'repository-code: "old"\nurl: "old"\n')
        # The current exact reference must lose its old reserved/unpublished title;
        # historical DOI labels and credited authors remain untouched.
        with (before / "CITATION.cff").open('a') as citation:
            citation.write('references:\n  - type: dataset\n    title: "Reserved unpublished archive binding '+bundle.DOI_POLICY['currentArchive']['packagingVersion']+'"\n    doi: '+bundle.DOI_POLICY['currentArchive']['doi']+'\n  - type: dataset\n    title: "Historical 1.3.3 snapshot"\n    doi: 10.5281/zenodo.22838416\n')
        spec = bundle.load(hf / "viewer/packaging.json")["tables"]["query_matrix"]
        with (before / "query-matrix.csv").open("w", newline="") as handle:
            csv.DictWriter(handle, fieldnames=spec["fields"]).writeheader()
        (before / "starter.ipynb").write_text('{"cells":[]}')
        out = self.root / "kaggle"
        bundle.build_kaggle(hf, before, out, self.ctx, 9, "d" * 40)
        manifest = bundle.load(out / "kaggle-manifest.json")
        self.assertEqual(manifest["packaging_date"], "2026-10-14")
        self.assertEqual(manifest["packaging_revision"], 9)
        self.assertEqual(manifest["source_release"], "9.8.7")
        self.assertEqual(manifest["edition"], "2027-01-02")
        self.assertEqual({item["path"] for item in manifest["original_files"]}, set(copied) | {"frictionless-datapackage.json", "release-attestation.json"})
        self.assertFalse((out / "datapackage.json").exists())
        self.assertEqual((out / "frictionless-datapackage.json").read_bytes(), (hf / "datapackage.json").read_bytes())
        self.assertEqual(manifest["tables"], {name: spec["rows"] for name, spec in bundle.load(hf / "viewer/packaging.json")["tables"].items()})
        self.assertEqual(manifest["frictionless_descriptor"]["sha256"], bundle.sha(hf / "datapackage.json"))
        self.assertIn("frictionless-datapackage.json", manifest["kaggle_payload_note"])
        self.assertEqual(manifest["package_publication_run_url"], self.ctx["run_url"])
        self.assertEqual(manifest["website_release_run_url"], self.ctx["website_publication_run_url"])
        self.assertEqual((out / "release-attestation.json").read_bytes(), (hf / "release-attestation.json").read_bytes())
        self.assertNotIn("integrity-manifest.json", {p.name for p in out.iterdir()})
        citation = (out / "CITATION.cff").read_text()
        self.assertIn(AUTHORS, citation)
        import yaml
        parsed=yaml.safe_load(citation)
        exact=next(r for r in parsed['references'] if r.get('doi')==bundle.DOI_POLICY['currentArchive']['doi'])
        self.assertEqual(exact['title'],'Exact reproducible snapshot '+bundle.DOI_POLICY['currentArchive']['packagingVersion'])
        self.assertEqual(next(r for r in parsed['references'] if r.get('doi')=='10.5281/zenodo.22838416')['title'],'Historical 1.3.3 snapshot')
        self.assertIn('version: '+json.dumps(bundle.DOI_POLICY['currentArchive']['packagingVersion']), citation)
        self.assertIn('date-released: "2026-10-14"', citation)
        readme = (out / "README.md").read_text()
        self.assertIn("Creator: Existing author introduction.", readme)
        self.assertIn("2026-10-14", readme)
        self.assertIn("archived", readme.lower())
        self.assertNotIn("latest corrected source", readme)
        self.assertIn("**entity_facts:** 2 RDF statements", readme)
        self.assertIn("Source release **9.8.7**, edition **2027-01-02**.", readme)
        self.assertNotIn("Source release **1.3.3**", readme)
        self.assertIn("`frictionless-datapackage.json`", readme)
        self.assertEqual((out / "starter.ipynb").read_text(), '{"cells":[]}')
        checksums = dict(line.split("  ", 1)[::-1] for line in (out / "checksums.sha256").read_text().splitlines())
        self.assertEqual(set(checksums), {p.relative_to(out).as_posix() for p in out.rglob("*") if p.is_file() and p.name != "checksums.sha256"})
        for name, digest in checksums.items():
            self.assertEqual(digest, bundle.sha(out / name))


if __name__ == "__main__":
    unittest.main()
