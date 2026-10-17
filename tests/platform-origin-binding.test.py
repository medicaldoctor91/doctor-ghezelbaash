from pathlib import Path
import unittest

class WebsiteOriginBindingTests(unittest.TestCase):
    def test_placeholder(self):
        self.assertTrue(Path('.').exists())

if __name__ == '__main__':
    unittest.main()
