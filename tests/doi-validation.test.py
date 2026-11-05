import importlib.util
import copy
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import sys
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'.github/scripts'))
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


class HistoricalBoundedHome(unittest.TestCase):
    """Historical bytes keep their own renderer; new candidates stay strict."""
    @classmethod
    def setUpClass(cls):
        import browser_projection as projection
        cls.projection=projection
        contract=projection.HISTORICAL_BOUNDED_PROJECTION
        cls.policy=json.loads((ROOT/'tests/fixtures/doi-policy-published-23474664.json').read_text())
        cls.policy['currentArchive'].update(
            sourceCommit=contract['scientificSource'], originalScientificSourceCommit=contract['scientificSource'],
            deliverySourceCommit=contract['deliverySource'],
            sourceCommitReference='release-provenance.json#/originalScientificSourceCommit',
            meaning='Same DOI and scientific edition; minor technical schema/delivery correction with preserved prior bytes in upstream/.')
        cls.policy['archiveMutationPolicy']='Scientific contents, DOI and edition remain unchanged. This explicitly recorded minor technical correction preserves the prior archive ZIP and public record in upstream/ and repairs schema delivery, distribution bindings and complete website preservation. Future scientific changes require a new version.'
        # Reconstruct canonical input from the same trusted historical source.
        # This fixture makes no network request and depends on no current SOURCE
        # fields, clinical text or public-provider response.
        with tempfile.TemporaryDirectory(prefix='historical-canonical-fixture-') as folder:
            stage=Path(folder)
            for name in ['src/canonical/source.mjs','src/canonical/doi-policy.json','src/lib/doi-policy.mjs']:
                target=stage/name;target.parent.mkdir(parents=True,exist_ok=True)
                target.write_bytes(subprocess.check_output(['git','show',contract['deliverySource']+':'+name],cwd=ROOT))
            env={**os.environ,'ARCHIVE_SOURCE_COMMIT':contract['scientificSource'],'PREPARE_RESERVED_DOI':''}
            env.pop('RELEASE_PLAN_PATH',None)
            script="import {pathToFileURL} from 'node:url';const {SOURCE}=await import(pathToFileURL(process.argv[1]));process.stdout.write(JSON.stringify(SOURCE.graph));"
            cls.graph=json.loads(subprocess.check_output(['node','--input-type=module','-e',script,str(stage/'src/canonical/source.mjs')],cwd=ROOT,env=env))
        cls.search=projection.expected_historical_home_search_projection(cls.graph,cls.policy)
        cls.current_graph=json.loads(subprocess.check_output(['node','--input-type=module','-e',
            "import {SOURCE} from './src/canonical/source.mjs';process.stdout.write(JSON.stringify(SOURCE.graph));"],cwd=ROOT))
        cls.current_search=projection.expected_home_search_projection(cls.current_graph)

    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        (self.root/'graph.jsonld').write_text(json.dumps(self.graph,ensure_ascii=False))

    def tearDown(self):self.temp.cleanup()

    def html(self,search=None,canonical=None):
        def encode(value):return json.dumps(value,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
        return ('<!doctype html><html><head><script id="schema-core-mainentity" type="application/ld+json">'+
                encode(self.search if search is None else search)+'</script></head><body><p>Historical visible content</p>'+
                '<script id="canonical-entity-graph" type="application/json">'+
                encode(self.graph if canonical is None else canonical)+'</script></body></html>').encode()

    def validate(self,search=None,canonical=None,policy=None):
        search=self.search if search is None else search
        return self.projection.validate_home_projection(self.root/'graph.jsonld',[search],self.html(search,canonical),
            allow_legacy_full_graph=True,historical_policy=self.policy if policy is None else policy)

    def test_captured_old_bounded_projection_and_full_inert_graph_are_valid(self):
        result=self.validate()
        self.assertTrue(result['completeCanonicalGraph'])
        self.assertEqual(result['canonicalNodes'],len(self.graph['@graph']))
        self.assertEqual(result['historicalProjectionDeliverySource'],self.policy['currentArchive']['deliverySourceCommit'])

    def test_historical_bounded_projection_is_not_accepted_as_current(self):
        with self.assertRaisesRegex(AssertionError,'canonical search projection'):
            self.projection.validate_home_projection(self.root/'graph.jsonld',[self.search],self.html())

    def test_search_dob_and_entity_mutations_cannot_use_the_old_contract(self):
        for kind in ['dob','identity']:
            search=copy.deepcopy(self.search)
            person=next(node for node in search['@graph'] if node['@id'].endswith('/#saeed-ghezelbash'))
            if kind=='dob':person['birthDate']='1900-01-01'
            else:person['@id']='https://www.ghezelbaash.ir/#another-person'
            with self.subTest(kind=kind),self.assertRaises(AssertionError):self.validate(search=search)

    def test_canonical_mutation_cannot_hide_in_historical_inert_json(self):
        canonical=copy.deepcopy(self.graph)
        next(node for node in canonical['@graph'] if node['@id'].endswith('/#saeed-ghezelbash'))['description']='Changed canonical biography'
        with self.assertRaisesRegex(AssertionError,'canonical graph differs'):self.validate(canonical=canonical)

    def test_changed_historical_source_policy_or_projector_fails_closed(self):
        for key in ['sourceCommit','deliverySourceCommit','packagingVersion']:
            policy=copy.deepcopy(self.policy);policy['currentArchive'][key]='changed'
            with self.subTest(key=key),self.assertRaisesRegex(AssertionError,'captured historical projection policy'):
                self.validate(policy=policy)
        with patch.object(self.projection.subprocess,'check_output',return_value=b'changed historical module'):
            with self.assertRaisesRegex(AssertionError,'projector bytes differ'):self.validate()

    def test_historical_graph_must_use_the_captured_archive_source_binding(self):
        graph=copy.deepcopy(self.graph)
        identifier=next(node for node in graph['@graph'] if node['@id'].endswith('/identifier-dataset-zenodo-current-archive'))
        identifier['value']='10.5281/zenodo.23965042'
        (self.root/'graph.jsonld').write_text(json.dumps(graph,ensure_ascii=False))
        with self.assertRaisesRegex(AssertionError,'archive binding differs'):self.validate(canonical=graph)

    def test_new_record_with_legacy_flag_still_uses_strict_current_projection(self):
        (self.root/'graph.jsonld').write_text(json.dumps(self.current_graph,ensure_ascii=False))
        result=self.validate(search=self.current_search,canonical=self.current_graph,policy=validator.POLICY)
        self.assertEqual(result['status'],'PASS')
        self.assertNotIn('historicalProjectionDeliverySource',result)
        with self.assertRaises(AssertionError):
            self.validate(search=self.search,canonical=self.current_graph,policy=validator.POLICY)

    def test_captured_renderer_requires_an_explicit_archive_context(self):
        with self.assertRaisesRegex(AssertionError,'explicit archive context'):
            self.projection.validate_home_projection(self.root/'graph.jsonld',[self.search],self.html(),historical_policy=self.policy)


if __name__=='__main__':unittest.main()
