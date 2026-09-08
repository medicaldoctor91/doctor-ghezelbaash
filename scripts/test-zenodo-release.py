"""Publication safety regressions; all HTTP effects are mocked."""
import copy
import io
import json
import hashlib
import tempfile
import unittest
from pathlib import Path
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


class StagingRecovery(unittest.TestCase):
    def setUp(self):
        self.release = zenodo.load_release()
        z = self.release["dataset"]["zenodo"]
        self.draft_url = f"{zenodo.BASE}/deposit/depositions/{z['recordId']}"
        self.bucket = "https://zenodo.org/api/files/test-bucket"
        self.canonical_metadata = zenodo.canonical_metadata(self.release["release"], self.release["dateModified"], z["versionDoi"], z["conceptDoi"])
        self.draft = {
            "submitted": False,
            "metadata": copy.deepcopy(self.canonical_metadata),
            "links": {"bucket": self.bucket},
        }
        self.draft["metadata"]["prereserve_doi"] = {"doi": z["versionDoi"]}
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        source = Path(directory.name) / "graph.jsonld"
        source.write_bytes(b'{"release":"expected"}')
        self.sources = {source.name: source}
        self.expected = {source.name: hashlib.sha256(source.read_bytes()).hexdigest()}

    def backend(self, initial):
        remote = dict(initial)
        events = []
        def send(token, method, url, body=None, *args, **kwargs):
            events.append((method, url))
            if method == "GET" and url == self.draft_url + "/files":
                return [{"filename": name, "id": name, "links": {"download": self.bucket + "/" + name}} for name in remote]
            if method == "GET" and url.startswith(self.bucket + "/"):
                return remote[url.rsplit("/", 1)[-1]]
            if method == "DELETE" and url.startswith(self.draft_url + "/files/"):
                del remote[url.rsplit("/", 1)[-1]]
                return {}
            if method == "PUT" and url.startswith(self.bucket + "/"):
                remote[url.rsplit("/", 1)[-1]] = body
                return {}
            if method == "PUT" and url == self.draft_url:
                self.draft["metadata"] = json.loads(body)["metadata"]
                self.draft["metadata"]["prereserve_doi"] = {"doi": self.release["dataset"]["zenodo"]["versionDoi"]}
                return self.draft
            raise AssertionError(f"Unexpected request: {method} {url}")
        return remote, events, send

    def run_sync(self, send):
        with patch.object(zenodo, "call", side_effect=send), patch.object(zenodo, "get_deposition", return_value=self.draft), patch.object(zenodo.time, "sleep"), patch("builtins.print"):
            return zenodo.recover_stage(lambda report: zenodo.synchronize_exact_files("secret-must-not-be-logged", self.draft_url, self.bucket, self.sources, report), len(self.sources))

    def run_stage(self, send, read=None):
        with patch.object(zenodo, "call", side_effect=send), patch.object(zenodo, "get_deposition", side_effect=read or (lambda *args: self.draft)), patch.object(zenodo, "exact_sources", return_value=self.sources), patch.dict(zenodo.os.environ, {"SOURCE_COMMIT": "a" * 40}), patch.object(zenodo, "write_state") as ledger, patch.object(zenodo.time, "sleep"), patch("builtins.print"):
            zenodo.stage(SimpleNamespace(version=self.release["release"]), "secret-must-not-be-logged")
        return ledger.call_args.args[1]

    def test_initial_metadata_timeout_recovers_and_skips_already_canonical_put(self):
        remote, events, backend = self.backend({"graph.jsonld": self.sources["graph.jsonld"].read_bytes()})
        reads = 0
        def read(*args):
            nonlocal reads
            reads += 1
            if reads == 1:
                raise zenodo.ZenodoRequestError("detail and collection timed out", True)
            return self.draft
        state = self.run_stage(backend, read)
        self.assertEqual(state["sha256"], self.expected)
        self.assertEqual(state["remoteSha256"], self.expected)
        self.assertEqual(reads, 4)
        self.assertTrue(all(method == "GET" for method, url in events))

    def test_lost_metadata_put_response_is_resolved_by_fresh_readback(self):
        self.draft["metadata"]["description"] = "outdated description"
        remote, events, backend = self.backend({"graph.jsonld": self.sources["graph.jsonld"].read_bytes()})
        def read(*args):
            events.append(("READ_DRAFT", self.draft_url))
            return self.draft
        def send(token, method, url, *args, **kwargs):
            result = backend(token, method, url, *args, **kwargs)
            if method == "PUT" and url == self.draft_url:
                raise zenodo.ZenodoRequestError("response lost after metadata committed", True)
            return result
        state = self.run_stage(send, read)
        self.assertEqual(state["remoteSha256"], self.expected)
        self.assertEqual([event for event in events if event[0] == "PUT"], [("PUT", self.draft_url)])
        put_index = events.index(("PUT", self.draft_url))
        self.assertEqual(events[put_index - 1], ("GET", self.draft_url + "/files"))
        self.assertEqual(events[put_index + 1:put_index + 3], [("READ_DRAFT", self.draft_url), ("GET", self.draft_url + "/files")])

    def test_uncommitted_metadata_put_is_repeated_only_after_fresh_state_reads(self):
        self.draft["metadata"]["description"] = "outdated description"
        remote, events, backend = self.backend({"graph.jsonld": self.sources["graph.jsonld"].read_bytes()})
        failed = False
        def read(*args):
            events.append(("READ_DRAFT", self.draft_url))
            return self.draft
        def send(token, method, url, *args, **kwargs):
            nonlocal failed
            if method == "PUT" and url == self.draft_url and not failed:
                failed = True
                events.append((method, url))
                raise zenodo.ZenodoRequestError("metadata request did not commit", True)
            return backend(token, method, url, *args, **kwargs)
        self.assertEqual(self.run_stage(send, read)["remoteSha256"], self.expected)
        puts = [index for index, event in enumerate(events) if event == ("PUT", self.draft_url)]
        self.assertEqual(len(puts), 2)
        self.assertEqual(events[puts[0] + 1:puts[1]], [("READ_DRAFT", self.draft_url), ("GET", self.draft_url + "/files")])

    def test_final_metadata_readback_timeout_recovers_without_rewriting(self):
        remote, events, backend = self.backend({"graph.jsonld": self.sources["graph.jsonld"].read_bytes()})
        reads = 0
        def read(*args):
            nonlocal reads
            reads += 1
            if reads == 3:
                raise zenodo.ZenodoRequestError("final readback timeout", True)
            return self.draft
        self.assertEqual(self.run_stage(backend, read)["remoteSha256"], self.expected)
        self.assertEqual(reads, 6)
        self.assertTrue(all(method == "GET" for method, url in events))

    def test_persistent_initial_metadata_failure_has_one_bounded_budget(self):
        with patch.object(zenodo, "get_deposition", side_effect=zenodo.ZenodoRequestError("persistent metadata outage", True)) as read, patch.object(zenodo, "call") as send, patch.object(zenodo, "exact_sources", return_value=self.sources), patch.dict(zenodo.os.environ, {"SOURCE_COMMIT": "a" * 40}), patch.object(zenodo, "write_state") as ledger, patch.object(zenodo.time, "sleep") as sleep, patch("builtins.print") as log:
            with self.assertRaisesRegex(RuntimeError, "recovery budget exhausted"):
                zenodo.stage(SimpleNamespace(version=self.release["release"]), "test")
        self.assertEqual(read.call_count, zenodo.STAGE_MAX_ATTEMPTS)
        self.assertEqual(sleep.call_count, zenodo.STAGE_MAX_ATTEMPTS - 1)
        send.assert_not_called()
        ledger.assert_not_called()
        self.assertEqual(json.loads(log.call_args.args[0])["operation"], "read_draft")

    def test_metadata_and_file_failures_share_the_same_attempt_budget(self):
        remote, events, backend = self.backend({"graph.jsonld": b"stale"})
        reads = 0
        def read(*args):
            nonlocal reads
            reads += 1
            if reads == 1:
                raise zenodo.ZenodoRequestError("metadata outage", True)
            return self.draft
        def send(token, method, url, *args, **kwargs):
            result = backend(token, method, url, *args, **kwargs)
            if url == self.bucket + "/graph.jsonld":
                raise zenodo.ZenodoRequestError("file outage", True)
            return result
        with self.assertRaisesRegex(RuntimeError, "recovery budget exhausted"):
            self.run_stage(send, read)
        self.assertEqual(reads, zenodo.STAGE_MAX_ATTEMPTS)
        self.assertEqual(sum(url == self.draft_url + "/files" for method, url in events), zenodo.STAGE_MAX_ATTEMPTS - 1)
        self.assertTrue(all(method == "GET" for method, url in events))

    def test_canonical_metadata_comparison_preserves_authored_nested_values(self):
        doi = self.release["dataset"]["zenodo"]["versionDoi"]
        actual = copy.deepcopy(self.draft["metadata"])
        actual["creators"][0]["affiliation"] = None
        actual["related_identifiers"][0]["scheme"] = "url"
        self.assertTrue(zenodo.canonical_metadata_matches(actual, self.canonical_metadata, doi))
        for field, value in (("license", {"id": "cc-by-4.0"}), ("prereserve_doi", True), ("keywords", list(reversed(actual["keywords"]))), ("creators", [])):
            wrong = copy.deepcopy(actual)
            wrong[field] = value
            self.assertFalse(zenodo.canonical_metadata_matches(wrong, self.canonical_metadata, doi))
        wrong = copy.deepcopy(actual)
        wrong["related_identifiers"][0]["relation"] = "isIdenticalTo"
        self.assertFalse(zenodo.canonical_metadata_matches(wrong, self.canonical_metadata, doi))
        self.assertFalse(zenodo.canonical_metadata_matches(actual, self.canonical_metadata, "10.5281/zenodo.1"))

    def test_lost_delete_response_reconciles_absence_before_upload(self):
        remote, events, backend = self.backend({"graph.jsonld": b"stale"})
        def send(token, method, url, *args, **kwargs):
            result = backend(token, method, url, *args, **kwargs)
            if method == "DELETE":
                raise zenodo.ZenodoRequestError("response lost after delete", True)
            return result
        self.assertEqual(self.run_sync(send), (self.expected, self.expected))
        writes = [method for method, url in events if method != "GET"]
        self.assertEqual(writes, ["DELETE", "PUT"])
        deletion = next(index for index, event in enumerate(events) if event[0] == "DELETE")
        self.assertEqual(events[deletion + 1], ("GET", self.draft_url + "/files"))
        self.assertEqual(remote["graph.jsonld"], self.sources["graph.jsonld"].read_bytes())

    def test_lost_put_response_skips_only_after_downloading_matching_bytes(self):
        remote, events, backend = self.backend({})
        def send(token, method, url, *args, **kwargs):
            result = backend(token, method, url, *args, **kwargs)
            if method == "PUT":
                raise zenodo.ZenodoRequestError("response lost after upload", True)
            return result
        self.assertEqual(self.run_sync(send), (self.expected, self.expected))
        self.assertEqual([method for method, url in events if method != "GET"], ["PUT"])
        upload = next(index for index, event in enumerate(events) if event[0] == "PUT")
        self.assertEqual(events[upload + 1:upload + 3], [("GET", self.draft_url + "/files"), ("GET", self.bucket + "/graph.jsonld")])

    def test_lost_put_with_wrong_remote_bytes_is_not_skipped(self):
        remote, events, backend = self.backend({})
        failed = False
        def send(token, method, url, *args, **kwargs):
            nonlocal failed
            result = backend(token, method, url, *args, **kwargs)
            if method == "PUT" and not failed:
                failed = True
                remote["graph.jsonld"] = b"wrong bytes"
                raise zenodo.ZenodoRequestError("ambiguous upload", True)
            return result
        self.assertEqual(self.run_sync(send), (self.expected, self.expected))
        self.assertEqual([method for method, url in events if method != "GET"], ["PUT", "DELETE", "PUT"])

    def test_final_verification_timeout_recovers_without_reuploading(self):
        remote, events, backend = self.backend({"graph.jsonld": self.sources["graph.jsonld"].read_bytes()})
        downloads = 0
        def send(token, method, url, *args, **kwargs):
            nonlocal downloads
            result = backend(token, method, url, *args, **kwargs)
            if method == "GET" and url == self.bucket + "/graph.jsonld":
                downloads += 1
                if downloads == 2:
                    raise zenodo.ZenodoRequestError("verification timeout", True)
            return result
        self.assertEqual(self.run_sync(send), (self.expected, self.expected))
        self.assertTrue(all(method == "GET" for method, url in events))
        self.assertEqual(downloads, 4)

    def test_final_verification_hash_mismatch_fails_without_retry_or_write(self):
        remote, events, backend = self.backend({"graph.jsonld": self.sources["graph.jsonld"].read_bytes()})
        downloads = 0
        def send(token, method, url, *args, **kwargs):
            nonlocal downloads
            result = backend(token, method, url, *args, **kwargs)
            if method == "GET" and url == self.bucket + "/graph.jsonld":
                downloads += 1
                if downloads == 2:
                    return b"unexpected post-upload mutation"
            return result
        with self.assertRaisesRegex(RuntimeError, "staged SHA-256 mismatch"):
            self.run_sync(send)
        self.assertEqual(downloads, 2)
        self.assertTrue(all(method == "GET" for method, url in events))

    def test_persistent_transient_failure_stops_without_stage_ledger_or_publication(self):
        remote, events, backend = self.backend({"graph.jsonld": b"stale"})
        def send(token, method, url, *args, **kwargs):
            result = backend(token, method, url, *args, **kwargs)
            if method == "GET" and url == self.bucket + "/graph.jsonld":
                raise zenodo.ZenodoRequestError("persistent outage", True)
            return result
        with patch.object(zenodo, "call", side_effect=send), patch.object(zenodo, "get_deposition", return_value=self.draft), patch.object(zenodo, "exact_sources", return_value=self.sources), patch.dict(zenodo.os.environ, {"SOURCE_COMMIT": "a" * 40}), patch.object(zenodo, "write_state") as ledger, patch.object(zenodo.time, "sleep") as sleep, patch("builtins.print") as log:
            with self.assertRaisesRegex(RuntimeError, "recovery budget exhausted"):
                zenodo.stage(SimpleNamespace(version=self.release["release"]), "secret-must-not-be-logged")
        ledger.assert_not_called()
        self.assertEqual(sleep.call_count, zenodo.STAGE_MAX_ATTEMPTS - 1)
        self.assertEqual(sum(url == self.draft_url + "/files" for method, url in events), zenodo.STAGE_MAX_ATTEMPTS)
        self.assertFalse(any(method in ("DELETE", "POST") or (method == "PUT" and url != self.draft_url) for method, url in events))
        entries = [json.loads(call.args[0]) for call in log.call_args_list]
        self.assertEqual(entries[-1]["stage"], "ZENODO_STAGE_STOPPED")
        self.assertEqual(entries[-1]["filename"], "graph.jsonld")
        self.assertTrue(all(call.kwargs.get("flush") is True for call in log.call_args_list))
        self.assertNotIn("secret-must-not-be-logged", str(log.call_args_list))

    def test_recovery_deadline_stops_before_another_inventory_or_write(self):
        with patch.object(zenodo, "get_deposition", side_effect=zenodo.ZenodoRequestError("timeout", True)) as read, patch.object(zenodo.time, "monotonic", side_effect=[0, zenodo.STAGE_RECOVERY_SECONDS]), patch.object(zenodo.time, "sleep") as sleep, patch.object(zenodo, "call") as send, patch("builtins.print"):
            with self.assertRaisesRegex(RuntimeError, "recovery budget exhausted"):
                zenodo.recover_stage(lambda report: zenodo.synchronize_exact_files("test", self.draft_url, self.bucket, self.sources, report), len(self.sources))
        self.assertEqual(read.call_count, 1)
        send.assert_not_called()
        sleep.assert_not_called()

    def test_submitted_draft_cannot_be_mutated_on_reconciliation(self):
        self.draft["submitted"] = True
        with patch.object(zenodo, "get_deposition", return_value=self.draft), patch.object(zenodo, "call") as send, patch("builtins.print"):
            with self.assertRaisesRegex(RuntimeError, "identity/state drift"):
                zenodo.recover_stage(lambda report: zenodo.synchronize_exact_files("test", self.draft_url, self.bucket, self.sources, report), len(self.sources))
        send.assert_not_called()


if __name__ == "__main__":
    unittest.main()
