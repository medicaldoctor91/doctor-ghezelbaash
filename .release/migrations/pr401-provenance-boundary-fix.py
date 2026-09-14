#!/usr/bin/env python3
from __future__ import annotations
import base64
import hashlib
import subprocess
import zlib

BASE = "e4096a497fa686c053755f05c1354eb164e11440"
PATCH_SHA256 = "5c18e45518f5389035906f236b9674c67c2176b63e8664eea1560e640200e164"
PATCH_ZLIB_BASE64 = "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"
EXPECTED = {
    "src/lib/canonical-graph-facts.mjs",
    "src/lib/canonical-authority.mjs",
    "scripts/test-canonical-authority.mjs",
}

def run(*args: str, input_bytes: bytes | None = None) -> str:
    p = subprocess.run(args, input=input_bytes, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if p.returncode:
        raise SystemExit(p.stderr.decode("utf-8", "replace") or p.stdout.decode("utf-8", "replace"))
    return p.stdout.decode().strip()

parent = run("git", "rev-parse", "HEAD^")
if parent != BASE:
    raise SystemExit(f"Unexpected setup parent: {parent}")
patch = zlib.decompress(base64.b64decode(PATCH_ZLIB_BASE64))
if hashlib.sha256(patch).hexdigest() != PATCH_SHA256:
    raise SystemExit("Embedded patch digest mismatch")
run("git", "apply", "--check", "-", input_bytes=patch)
run("git", "apply", "-", input_bytes=patch)
changed = set(run("git", "diff", "--name-only").splitlines())
if changed != EXPECTED:
    raise SystemExit(f"Fix scope drift: {sorted(changed)}")
print(f"PR401_PROVENANCE_BOUNDARY_FIX_PASS files={len(changed)} sha256={PATCH_SHA256}")
