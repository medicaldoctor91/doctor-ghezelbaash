"""Exercise publication transport boundaries without contacting external accounts."""
import importlib.util
import pathlib
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / '.github/scripts'))
import platform_publish as publication


class PublicationTransportTests(unittest.TestCase):
    def test_download_retries_temporary_404_without_publishing(self):
        class Handler(BaseHTTPRequestHandler):
            reads = 0
            def do_GET(self):
                Handler.reads += 1
                self.send_response(404 if Handler.reads < 3 else 200)
                self.end_headers()
                self.wfile.write(b'not ready' if Handler.reads < 3 else b'exact payload')
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            result = publication.download_bytes(f'http://127.0.0.1:{server.server_port}/version/12', attempts=3, delay=0)
            self.assertEqual(result, b'exact payload')
            self.assertEqual(Handler.reads, 3)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_large_source_upload_uses_streaming_and_a_trusted_bucket(self):
        command = publication.bucket_upload_command('/tmp/source.zip', 'https://zenodo.org/api/files/bucket/source.zip', 'test-token')
        self.assertIn('--upload-file', command)
        self.assertIn('--retry-all-errors', command)
        self.assertEqual(command[command.index('--max-time') + 1], '600')
        with self.assertRaises(ValueError):
            publication.bucket_upload_command('/tmp/source.zip', 'https://example.org/source.zip', 'test-token')


if __name__ == '__main__':
    unittest.main()
