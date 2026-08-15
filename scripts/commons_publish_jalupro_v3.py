#!/usr/bin/env python3
from __future__ import annotations

import hashlib
from pathlib import Path

import commons_publish_jalupro_v2 as publisher


def mediawiki_sha1_hex(path: Path) -> str:
    h = hashlib.sha1()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


publisher.file_sha1_base36 = mediawiki_sha1_hex

if __name__ == "__main__":
    publisher.main()
