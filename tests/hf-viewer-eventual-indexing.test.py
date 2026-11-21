"""Fail-closed regression for HF Dataset Viewer eventual-consistency backoff."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / ".github/scripts"))
from mutable_platform_release import fresh_viewer_reads

URL = ("https://datasets-server.huggingface.co/search?"
       "dataset=doctor-ghezelbaash%2Fdr-saeid-ghezelbaash-entity-data"
       "&config=entity_facts&split=train&query=Patient")


class Reply:
    def __init__(self, status, code=None):
        self.status_code = status
        self.headers = {"Content-Type": "application/json"}
        if code:
            self.headers["x-error-code"] = code
        self.content = b'{"error":"the dataset index is loading"}' if status >= 400 else b'{"rows":[{"row_idx":0}]}'
        self.url = URL
        self.ok = status < 400

    def raise_for_status(self):
        if not self.ok:
            raise requests.HTTPError(f"{self.status_code} API response", response=self)


class ViewerReadTests(unittest.TestCase):
    def test_response_not_ready_is_retried_per_endpoint_and_evidence_retained(self):
        with tempfile.TemporaryDirectory() as directory:
            calls = [Reply(500, "ResponseNotReady"),
                     Reply(500, "ResponseNotReady"), Reply(200)]
            pauses = []
            with patch("mutable_platform_release.requests.get", side_effect=calls) as get, \
                 patch("mutable_platform_release.time.time_ns", side_effect=[101, 102, 103]):
                fetch = fresh_viewer_reads(directory, lambda url: None, max_attempts=4, sleeper=pauses.append)
                reply = fetch(URL)
            self.assertIs(reply, calls[2])
            self.assertEqual(get.call_count, 3)
            self.assertEqual(pauses, [2, 4])
            folder = Path(directory) / "viewer-response-evidence"
            metadata = [json.loads(p.read_text()) for p in folder.glob("*.json")]
            self.assertEqual(len(metadata), 3)
            self.assertEqual([r["status"] for r in sorted(metadata, key=lambda d: d["attempt"])],
                             [500, 500, 200])
            self.assertTrue(all(r["sha256"] for r in metadata))
            self.assertEqual(len(list(folder.glob("*.body"))), 3)
            for args in get.call_args_list:
                self.assertEqual(args.kwargs["params"].keys(), {"live_audit"})
                self.assertIn("no-cache", args.kwargs["headers"]["Cache-Control"])

    def test_unexpected_server_error_is_not_masked_or_retried(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch("mutable_platform_release.requests.get", return_value=Reply(500)) as get:
                fetch = fresh_viewer_reads(directory, lambda url: None, sleeper=lambda _: self.fail("Unexpected sleep"))
                with self.assertRaises(requests.HTTPError):
                    fetch(URL)
                get.assert_called_once()

    def test_bad_request_is_not_retried(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch("mutable_platform_release.requests.get", return_value=Reply(422)) as get:
                with self.assertRaises(requests.HTTPError):
                    fresh_viewer_reads(directory, lambda url: None, sleeper=lambda _: self.fail("Unexpected sleep"))(URL)
                get.assert_called_once()

    def test_transient_gateway_errors_are_bounded_and_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch("mutable_platform_release.requests.get",
                       side_effect=[Reply(502), Reply(503), Reply(504)]) as get:
                pauses = []
                fn = fresh_viewer_reads(directory, lambda url: None, max_attempts=3, sleeper=pauses.append)
                with self.assertRaises(requests.HTTPError):
                    fn(URL)
                self.assertEqual(get.call_count, 3)
                self.assertEqual(pauses, [2, 4])
                self.assertEqual(len(list((Path(directory) / "viewer-response-evidence").glob("*.json"))), 3)

    def test_plain_hub_and_site_requests_unchanged(self):
        sentinel = object()
        original = Mock(return_value=sentinel)
        with tempfile.TemporaryDirectory() as directory:
            with patch("mutable_platform_release.requests.get") as get:
                fn = fresh_viewer_reads(directory, original)
                url = "https://www.ghezelbaash.ir/graph.jsonld"
                self.assertIs(fn(url), sentinel)
                original.assert_called_once_with(url)
                get.assert_not_called()

    def test_rejects_unbounded_retry_configuration(self):
        with self.assertRaises(AssertionError):
            fresh_viewer_reads("/tmp/no-such-frozen-release", lambda _: None, max_attempts=0)
        with self.assertRaises(AssertionError):
            fresh_viewer_reads("/tmp/no-such-frozen-release", lambda _: None, max_attempts=200)


if __name__ == "__main__":
    unittest.main(verbosity=2)
