import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('doi_validation',ROOT/'.github/scripts/doi_validation.py')
validator=importlib.util.module_from_spec(spec);spec.loader.exec_module(validator)


class Roles(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        graph=subprocess.check_output(['node','--input-type=module','-e',"import {SOURCE} from './src/canonical/source.mjs';console.log(JSON.stringify(SOURCE.graph));"],cwd=ROOT)
        (self.root/'graph.jsonld').write_bytes(graph)

    def tearDown(self):self.temp.cleanup()

    def test_historical_doi_cannot_be_used_as_current_query_archive(self):
        (self.root/'query-matrix.jsonl').write_text(json.dumps({'archive_version_doi':'10.5281/zenodo.22838416'})+'\n')
        with self.assertRaisesRegex(AssertionError,'historical DOI used as current'):validator.validate_policy(self.root)

    def test_public_introduction_must_not_omit_concept(self):
        (self.root/'README.md').write_text('Current DOI: '+validator.POLICY['currentArchive']['url'])
        with self.assertRaisesRegex(AssertionError,'missing public Concept DOI'):validator.validate_policy(self.root)

    def test_role_qualified_current_and_historical_references_are_accepted(self):
        (self.root/'query-matrix.jsonl').write_text(json.dumps({'archive_version_doi':validator.POLICY['currentArchive']['doi'],'historical_release_doi':'10.5281/zenodo.22131441'})+'\n')
        self.assertEqual(validator.validate_policy(self.root)['status'],'PASS')


if __name__=='__main__':unittest.main()
