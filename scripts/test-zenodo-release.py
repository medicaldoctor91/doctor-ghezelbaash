"""Publication safety regressions; all HTTP effects are mocked."""
import copy
import io
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from urllib.error import HTTPError

import zenodo_release as zenodo


def response(value):
    result = io.BytesIO(json.dumps(value).encode())
    result.status = 200
    return result


def http_error(status):
    return HTTPError("https://zenodo.org/api/test", status, "test", {}, io.BytesIO(b"test"))


class PublicationSafety(unittest.TestCase):
    def setUp(self):
        self.release = zenodo.load_release()
        self.record = "987654321"
        self.row = {
            "id": int(self.record),
            "conceptrecid": self.release["dataset"]["zenodo"]["conceptDoi"].rsplit(".", 1)[-1],
            "metadata": {
                "title": self.release["dataset"]["name"],
                "creators": [{"orcid": self.release["primaryEntity"]["orcid"]}],
                "prereserve_doi": {"doi": f"10.5281/zenodo.{self.record}"},
            },
        }

    def test_transient_read_retries_and_recovers(self):
        with patch.object(zenodo.request, "urlopen", side_effect=[http_error(504), response({"id": 1})]) as send, patch.object(zenodo.time, "sleep") as sleep:
            self.assertEqual(zenodo.call("test", "GET", "https://zenodo.org/api/test"), {"id": 1})
        self.assertEqual(send.call_count, 2)
        self.assertEqual(sleep.call_count, 1)

    def test_ambiguous_publish_is_never_blindly_retried(self):
        with patch.object(zenodo.request, "urlopen", side_effect=http_error(504)) as send:
            with self.assertRaises(zenodo.ZenodoRequestError):
                zenodo.call("test", "POST", "https://zenodo.org/api/test")
        self.assertEqual(send.call_count, 1)

    def test_auth_failure_is_not_retried(self):
        with patch.object(zenodo.request, "urlopen", side_effect=http_error(403)) as send:
            with self.assertRaises(zenodo.ZenodoRequestError) as caught:
                zenodo.call("test", "GET", "https://zenodo.org/api/test")
        self.assertFalse(caught.exception.transient)
        self.assertEqual(send.call_count, 1)

    def test_foreign_api_link_cannot_receive_token(self):
        with patch.object(zenodo.request, "urlopen") as send:
            with self.assertRaises(RuntimeError):
                zenodo.call("test", "GET", "https://example.org/api/test")
        send.assert_not_called()

    def test_collection_fallback_requires_exact_identity(self):
        with patch.object(zenodo, "call", side_effect=[zenodo.ZenodoRequestError("timeout", True), [self.row]]):
            self.assertEqual(zenodo.get_deposition("test", self.record), self.row)
        for field in ("id", "conceptrecid"):
            wrong = copy.deepcopy(self.row)
            wrong[field] = "1"
            with patch.object(zenodo, "call", return_value=wrong):
                with self.assertRaises(RuntimeError):
                    zenodo.get_deposition("test", self.record)
        wrong = copy.deepcopy(self.row)
        wrong["metadata"]["prereserve_doi"]["doi"] = "10.5281/zenodo.1"
        with patch.object(zenodo, "call", side_effect=[zenodo.ZenodoRequestError("timeout", True), [wrong]]):
            with self.assertRaises(RuntimeError):
                zenodo.get_deposition("test", self.record)

    def test_auth_failure_cannot_trigger_collection_fallback(self):
        with patch.object(zenodo, "call", side_effect=zenodo.ZenodoRequestError("forbidden")) as send:
            with self.assertRaises(zenodo.ZenodoRequestError):
                zenodo.get_deposition("test", self.record)
        self.assertEqual(send.call_count, 1)

    def test_unregistered_latest_publication_blocks_reservation(self):
        history = self.release["dataset"]["zenodo"]["releaseHistory"]
        baseline = max(history, key=lambda item: tuple(map(int, item["release"].split("."))))
        current = {
            "doi": self.release["dataset"]["zenodo"]["versionDoi"],
            "conceptdoi": self.release["dataset"]["zenodo"]["conceptDoi"],
            "metadata": {"version": self.release["release"]},
        }
        published = {
            "id": baseline["recordId"], "doi": baseline["versionDoi"],
            "conceptdoi": current["conceptdoi"],
            "links": {"latest": "https://zenodo.org/api/records/1/versions/latest"},
            "metadata": {
                "version": baseline["release"], "publication_date": baseline["publicationDate"],
                "title": self.release["dataset"]["name"],
                "creators": self.row["metadata"]["creators"],
            },
        }
        latest = copy.deepcopy(published)
        latest["id"] = "123"
        args = SimpleNamespace(current_record=self.release["dataset"]["zenodo"]["recordId"], current_doi=current["doi"], current_version=self.release["release"], concept_doi=current["conceptdoi"], version="999.0.0")
        with patch.object(zenodo, "call", side_effect=[current, published, latest]) as send:
            with self.assertRaisesRegex(RuntimeError, "not reconciled"):
                zenodo.reserve(args, "test")
        self.assertTrue(all(call.args[1] == "GET" for call in send.call_args_list))

    def test_retry_after_is_bounded(self):
        self.assertEqual(zenodo.retry_delay("100000", 1), 30)
        self.assertEqual(zenodo.retry_delay("invalid", 2), 4)


if __name__ == "__main__":
    unittest.main()
