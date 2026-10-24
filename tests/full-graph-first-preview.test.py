"""Safety checks for the isolated full-graph experiment and exact rollback."""
import copy
from html.parser import HTMLParser
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.github/scripts'))
import full_graph_first_preview as preview

FROZEN = Path(os.environ.get('FULL_GRAPH_FROZEN_ROOT', '/tmp/schema-distribution-correction'))


class Scripts(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.active = []
        self.ids = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        if tag == 'script' and attrs.get('type') == 'application/ld+json':
            self.current = {'id': attrs.get('id'), 'text': ''}
            self.active.append(self.current)

    def handle_data(self, text):
        if self.current is not None:
            self.current['text'] += text

    def handle_endtag(self, tag):
        if tag == 'script':
            self.current = None


class FullGraphPreviewTests(unittest.TestCase):
    def state(self):
        return {'project': 'doctor-ghezelbaash', 'productionBranch': 'main',
                'deploymentId': preview.BASE_DEPLOYMENT, 'sourceCommit': preview.BASE_SOURCE,
                'deploymentBranch': 'main', 'stage': 'success',
                'globalGitDeploymentsEnabled': False, 'automaticProductionDeployments': False,
                'automaticPreviewSetting': 'none'}

    def test_any_production_identity_or_auto_deployment_change_stops_experiment(self):
        baseline = self.state()
        preview.require_baseline(baseline)
        for key, value in [('sourceCommit', 'a' * 40), ('deploymentId', 'other'),
                           ('deploymentBranch', preview.BRANCH), ('stage', 'failure'),
                           ('globalGitDeploymentsEnabled', True),
                           ('automaticProductionDeployments', True), ('automaticPreviewSetting', 'all')]:
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                preview.require_baseline({**baseline, key: value})

    def test_after_guard_rejects_changed_public_bytes_even_with_same_deployment(self):
        baseline = {**self.state(), 'publicHomeSHA256': 'a' * 64, 'publicProvenanceSHA256': 'b' * 64}
        preview.require_baseline(copy.deepcopy(baseline), baseline)
        with self.assertRaisesRegex(RuntimeError, 'changed during experiment'):
            preview.require_baseline({**baseline, 'publicHomeSHA256': 'c' * 64}, baseline)

    def test_full_graph_only_is_active_and_complete_before_body(self):
        website = FROZEN / 'website'
        home = (website / 'index.html').read_bytes()
        canonical = (website / 'graph.jsonld').read_bytes()
        candidate, report = preview.graph_first(home, canonical)
        parsed = Scripts()
        parsed.feed(candidate.decode())
        self.assertEqual(len(parsed.active), 1)
        actual = json.loads(parsed.active[0]['text'])
        self.assertEqual(actual, json.loads(canonical))
        self.assertEqual(len(actual['@graph']), 1600)
        self.assertNotIn('canonical-entity-graph', parsed.ids)
        self.assertLess(report['endIncludingHeaderReserve'], 2_000_000)
        self.assertLess(report['completeGraphEndByte'], candidate.index(b'<body'))
        # The original body is compared as exact bytes, including reader code.
        original_full = preview.named_script(home, 'canonical-entity-graph', 'application/json')
        self.assertEqual(home[home.index(b'<body'):].replace(original_full[0], b'', 1),
                         candidate[candidate.index(b'<body'):])

    def test_only_home_changes_and_control_is_exact_current_home(self):
        with tempfile.TemporaryDirectory() as temporary:
            work = Path(temporary)
            with patch.object(preview, 'WORK', work), patch.object(preview, 'EVIDENCE', work / 'evidence'), \
                 patch.object(preview.pages, 'api', side_effect=AssertionError('Preparation must be offline')):
                preview.prepare(FROZEN, 'experiment')
            baseline = FROZEN / 'website'
            output = work / 'website'
            self.assertEqual((output / 'control/index.html').read_bytes(), (baseline / 'index.html').read_bytes())
            self.assertNotEqual((output / 'index.html').read_bytes(), (baseline / 'index.html').read_bytes())
            others = [path for path in baseline.rglob('*') if path.is_file() and path.name != 'index.html']
            self.assertEqual(len(others), 187)
            for source in others:
                self.assertEqual(source.read_bytes(), (output / source.relative_to(baseline)).read_bytes())

    def test_restore_is_exact_frozen_website_with_no_experimental_control_route(self):
        with tempfile.TemporaryDirectory() as temporary:
            work = Path(temporary)
            with patch.object(preview, 'WORK', work), patch.object(preview, 'EVIDENCE', work / 'evidence'), \
                 patch.object(preview.pages, 'api', side_effect=AssertionError('Restore preparation must be offline')):
                preview.prepare(FROZEN, 'restore')
            self.assertEqual(preview.inventory(work / 'website'), preview.inventory(FROZEN / 'website'))
            self.assertFalse((work / 'website/control').exists())

    def test_modified_frozen_manifest_is_rejected_before_preparation(self):
        with tempfile.TemporaryDirectory() as temporary:
            frozen = Path(temporary)
            (frozen / 'frozen-sha256.json').write_text('{}')
            with self.assertRaisesRegex(RuntimeError, 'Frozen manifest differs'):
                preview.prepare(frozen, 'experiment')


if __name__ == '__main__':
    unittest.main()
