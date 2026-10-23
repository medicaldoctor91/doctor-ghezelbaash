"""Exact public-file fallback preserves baseline integrity and final ZIP gates."""
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock
from urllib.parse import parse_qs, unquote, urlsplit
import zipfile

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.github/scripts'))
from kaggle_baseline import prepare_baseline, public_baseline_state, verify_exact_public_files

HF = 'a' * 40
SOURCE = 'b' * 40
OWNER = {'version': 28, 'status': 'ready'}
PUBLIC = {'currentVersionNumber': 27, 'versions': [{'versionNumber': 28, 'status': 'Ready'}]}


def failure(status, message='No gcs url found'):
    response = requests.Response()
    response.status_code = status
    response._content = json.dumps({'code': status, 'message': message}).encode()
    return requests.HTTPError(response=response)


def fixture(*, version=28, hf=HF, source=SOURCE, zip_available=False):
    bodies = {'data.txt': b'frozen data\n', 'viewer/table.parquet': b'PAR1example'}
    manifest = {'desired_kaggle_version': version, 'upstream_revision': hf, 'website_source_commit': source,
                'original_files': [{'path': n, 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()} for n, b in bodies.items()]}
    bodies['kaggle-manifest.json'] = json.dumps(manifest).encode()
    bodies['checksums.sha256'] = ''.join(hashlib.sha256(b).hexdigest() + '  ' + n + '\n' for n, b in sorted(bodies.items())).encode()
    listing = [{'name': n, 'totalBytes': len(b)} for n, b in bodies.items()]
    def read(url):
        parsed = urlsplit(url)
        params = parse_qs(parsed.query)
        assert params['datasetVersionNumber'] == ['28']
        if '/list/' in parsed.path:
            if params.get('pageToken') == ['second']:
                return Mock(json=lambda: {'datasetFiles': listing[2:], 'nextPageToken': ''})
            return Mock(json=lambda: {'datasetFiles': listing[:2], 'nextPageToken': 'second'})
        suffix = parsed.path.split('/download/owner/dataset', 1)[1]
        if not suffix:
            if not zip_available:
                raise failure(404)
            out = io.BytesIO()
            with zipfile.ZipFile(out, 'w') as zipped:
                for n, b in bodies.items():
                    zipped.writestr(n, b)
            return Mock(content=out.getvalue())
        name = unquote(suffix.lstrip('/'))
        assert params['raw'] == ['true']
        if name not in bodies:
            raise failure(404, 'File missing')
        return Mock(content=bodies[name])
    return bodies, listing, Mock(side_effect=read)


def extract(archive, target):
    with zipfile.ZipFile(archive) as zipped:
        zipped.extractall(target)


class Baseline(unittest.TestCase):
    def run_prepare(self, folder, read):
        return prepare_baseline(folder, 'owner/dataset', 28, HF, SOURCE, read, extract,
                                public_baseline_state(OWNER, PUBLIC, 28))

    def test_complete_paginated_public_files_pass_and_pending_receipt_is_truthful(self):
        bodies, _, read = fixture()
        with tempfile.TemporaryDirectory() as folder:
            evidence = self.run_prepare(folder, read)
            self.assertEqual(evidence['publicFilesVerified'], len(bodies))
            self.assertEqual(evidence['packageChecksumsVerified'], len(bodies) - 1)
            self.assertTrue(evidence['completeFileListing'])
            self.assertFalse(evidence['bundlePublic'])
            self.assertTrue(evidence['publicDefaultPending'])
            self.assertFalse(evidence['fullPublicBaselineVerified'])
            self.assertEqual(evidence['exactBundleError'], 'No gcs url found')
            self.assertEqual(json.loads((Path(folder) / 'baseline-publication-evidence.json').read_text()), evidence)
            self.assertTrue(any('pageToken=second' in c.args[0] for c in read.call_args_list))
            self.assertTrue(any('viewer%2Ftable.parquet' in c.args[0] for c in read.call_args_list))

    def test_available_zip_remains_the_first_choice(self):
        _, _, read = fixture(zip_available=True)
        with tempfile.TemporaryDirectory() as folder:
            evidence = self.run_prepare(folder, read)
        self.assertTrue(evidence['bundlePublic'])
        self.assertEqual(evidence['method'], 'public-exact-version-zip')
        self.assertEqual(read.call_count, 1)

    def test_authorization_rate_limit_and_server_errors_never_fall_back(self):
        for status in [401, 403, 429, 500]:
            read = Mock(side_effect=failure(status))
            with self.subTest(status=status), tempfile.TemporaryDirectory() as folder, self.assertRaises(requests.HTTPError):
                self.run_prepare(folder, read)
            self.assertEqual(read.call_count, 1)

    def test_unrelated_404_never_falls_back(self):
        read = Mock(side_effect=failure(404, 'Not found'))
        with tempfile.TemporaryDirectory() as folder, self.assertRaises(requests.HTTPError):
            self.run_prepare(folder, read)
        self.assertEqual(read.call_count, 1)

    def test_bad_zip_never_falls_back(self):
        read = Mock(return_value=Mock(content=b'not a ZIP'))
        with tempfile.TemporaryDirectory() as folder, self.assertRaises(zipfile.BadZipFile):
            self.run_prepare(folder, read)
        self.assertEqual(read.call_count, 1)

    def test_truncated_file_listing_fails_coverage(self):
        _, listing, read = fixture()
        listing[:] = [item for item in listing if item['name'] != 'data.txt']
        with tempfile.TemporaryDirectory() as folder, self.assertRaisesRegex(AssertionError, 'coverage'):
            self.run_prepare(folder, read)

    def test_missing_listed_file_blocks_without_a_second_fallback(self):
        bodies, _, read = fixture()
        del bodies['data.txt']
        with tempfile.TemporaryDirectory() as folder, self.assertRaises(requests.HTTPError):
            self.run_prepare(folder, read)

    def test_actual_file_hash_mismatch_blocks(self):
        bodies, _, read = fixture()
        bodies['data.txt'] = b'changed row\n'
        with tempfile.TemporaryDirectory() as folder, self.assertRaisesRegex(AssertionError, 'checksum differs'):
            self.run_prepare(folder, read)

    def test_wrong_version_hf_and_source_bindings_block(self):
        for changes, message in [({'version': 27}, 'Wrong Kaggle baseline version'),
                                 ({'hf': 'c' * 40}, 'Wrong Kaggle baseline HF revision'),
                                 ({'source': 'c' * 40}, 'Wrong Kaggle baseline website source')]:
            _, _, read = fixture(**changes)
            with self.subTest(changes=changes), tempfile.TemporaryDirectory() as folder, self.assertRaisesRegex(AssertionError, message):
                self.run_prepare(folder, read)

    def test_unsafe_listed_path_blocks(self):
        _, listing, read = fixture()
        listing[0]['name'] = '../escape'
        with tempfile.TemporaryDirectory() as folder, self.assertRaisesRegex(AssertionError, 'Unsafe'):
            self.run_prepare(folder, read)

    def test_unexpected_owner_default_or_public_version_blocks(self):
        for owner, public in [({'version': 28, 'status': 'processing'}, PUBLIC),
                              (OWNER, {**PUBLIC, 'currentVersionNumber': 26}),
                              (OWNER, {**PUBLIC, 'versions': [{'versionNumber': 28, 'status': 'Processing'}]}),
                              (OWNER, {**PUBLIC, 'versions': PUBLIC['versions'] + [{'versionNumber': 29, 'status': 'Ready'}]})]:
            with self.subTest(owner=owner, public=public), self.assertRaises(AssertionError):
                public_baseline_state(owner, public, 28)

    def test_final_publication_zip_gate_remains_strict(self):
        import coordinated_doi_release as release
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            release.dump(root / 'release-plan.json', {'kaggleVersion': 29})
            from unittest.mock import patch
            with patch.object(release, 'get', return_value=Mock(json=lambda: PUBLIC)):
                with self.assertRaisesRegex(AssertionError, 'public default has not converged'):
                    release.verify_kaggle(root)

    def test_exact_public_files_match_every_frozen_hash_without_requesting_a_bundle(self):
        bodies, _, read = fixture()
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder);frozen = root / 'frozen';frozen.mkdir()
            for name, body in bodies.items():
                path = frozen / name;path.parent.mkdir(parents=True, exist_ok=True);path.write_bytes(body)
            proof = verify_exact_public_files(root / 'live', 'owner/dataset', 28, frozen, read)
            self.assertEqual(proof['filesSha256Matched'], len(bodies))
            self.assertEqual(proof['packageChecksumsVerified'], len(bodies) - 1)
            self.assertTrue(all('/list/' in c.args[0] or 'raw=true' in c.args[0] for c in read.call_args_list))
            bodies['data.txt'] = b'changed row\n'
            with self.assertRaisesRegex(AssertionError, 'hash differs'):
                verify_exact_public_files(root / 'changed', 'owner/dataset', 28, frozen, read)

    def test_exact_public_manifest_must_have_requested_version(self):
        bodies, _, read = fixture(version=27)
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder);frozen = root / 'frozen';frozen.mkdir()
            for name, body in bodies.items():
                path = frozen / name;path.parent.mkdir(parents=True, exist_ok=True);path.write_bytes(body)
            with self.assertRaisesRegex(AssertionError, 'Wrong exact-version manifest'):
                verify_exact_public_files(root / 'live', 'owner/dataset', 28, frozen, read)


if __name__ == '__main__':
    unittest.main()
