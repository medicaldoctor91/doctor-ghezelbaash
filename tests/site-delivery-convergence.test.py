"""Regression for canonical-URL Cloudflare Pages cutover convergence.

A transient older edge representation must eventually become the exact new
version. A stale or incorrect public canonical file must NEVER be accepted.
"""
import hashlib
from pathlib import Path
import sys
from unittest import TestCase, main
from unittest.mock import patch
from types import SimpleNamespace

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/".github"/"scripts"))
import coordinated_doi_release as release

def response(body, status=200, cache="HIT"):
    return SimpleNamespace(content=body,status_code=status,
      headers={"CF-Cache-Status":cache,"ETag":'"sample"'})

class CanonicalFileConvergenceTests(TestCase):
    def setUp(self):
        self.good=b'current 1.3.6 export, exact bytes'
        self.expected=hashlib.sha256(self.good).hexdigest()
        self.url="https://www.ghezelbaash.ir/entity-facts.csv"
    def test_correct_canonical_response_succeeds_immediately(self):
        with patch.object(release.requests,"get",return_value=response(self.good,cache="MISS")) as get:
            body,evidence=release.fetch_live_file_after_cutover("entity-facts.csv",self.expected,sleep=lambda _:None)
        self.assertEqual(body,self.good)
        self.assertEqual(evidence["attempt"],1)
        self.assertEqual(evidence["sha256"],self.expected)
        self.assertEqual(get.call_args.args[0],self.url)
        self.assertEqual(get.call_args.kwargs["headers"]["Accept-Encoding"],"identity")
    def test_old_cache_then_current_bytes_succeeds_on_original_path(self):
        with patch.object(release.requests,"get",side_effect=[
             response(b'old site file',cache="HIT"),response(self.good,cache="MISS")
             ]) as get:
            body,evidence=release.fetch_live_file_after_cutover("entity-facts.csv",self.expected,
                 attempts=2,sleep=lambda _:None)
        self.assertEqual(body,self.good)
        self.assertEqual(evidence["attempt"],2)
        self.assertEqual(get.call_count,2)
        self.assertEqual([x.args[0] for x in get.call_args_list],[self.url,self.url])
    def test_persistent_old_cache_is_rejected_and_diagnosed(self):
        with patch.object(release.requests,"get",return_value=response(b'stale')) as get:
            with self.assertRaisesRegex(AssertionError,"did not converge"):
                release.fetch_live_file_after_cutover("entity-facts.csv",self.expected,
                    attempts=3,sleep=lambda _:None)
        self.assertEqual(get.call_count,3)
    def test_http_failure_does_not_count_as_a_valid_checksum(self):
        with patch.object(release.requests,"get",side_effect=[
            response(self.good,status=404),response(self.good,status=200)]):
            body,evidence=release.fetch_live_file_after_cutover("entity-facts.csv",self.expected,
                attempts=2,sleep=lambda _:None)
        self.assertEqual(evidence["attempt"],2)
        self.assertEqual(body,self.good)
    def test_never_accepts_only_a_cache_busted_sibling(self):
        with patch.object(release.requests,"get",side_effect=[
            response(b'old'),response(b'old')]) as get:
            with self.assertRaises(AssertionError):
                release.fetch_live_file_after_cutover("graph.jsonld",self.expected,
                    attempts=2,sleep=lambda _:None)
        for call in get.call_args_list:
            self.assertNotIn("?",call.args[0])
if __name__=="__main__":
    main()
