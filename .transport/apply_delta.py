#!/usr/bin/env python3
from pathlib import Path
import hashlib
import sys

root = Path(sys.argv[1]).resolve()
delta_path = Path(sys.argv[2]).resolve()
data = memoryview(delta_path.read_bytes())
pos = 0

def take(n: int) -> bytes:
    global pos
    if n < 0 or pos + n > len(data):
        raise SystemExit('delta truncated')
    out = bytes(data[pos:pos+n])
    pos += n
    return out

def varint() -> int:
    global pos
    shift = 0
    value = 0
    while True:
        if pos >= len(data) or shift > 63:
            raise SystemExit('invalid varint')
        b = data[pos]
        pos += 1
        value |= (b & 0x7f) << shift
        if not (b & 0x80):
            return value
        shift += 7

if take(4) != b'DLT1':
    raise SystemExit('bad delta magic')

entries = varint()
for _ in range(entries):
    path = take(varint()).decode('utf-8')
    base_path = take(varint()).decode('utf-8')
    expected_sha = take(32)
    expected_size = varint()
    op_count = varint()
    base = (root / base_path).read_bytes() if base_path else b''
    out = bytearray()
    for _ in range(op_count):
        tag = take(1)[0]
        if tag == 0:
            offset = varint()
            length = varint()
            if offset + length > len(base):
                raise SystemExit(f'copy outside base for {path}')
            out += base[offset:offset+length]
        elif tag == 1:
            out += take(varint())
        else:
            raise SystemExit(f'unknown delta opcode {tag}')
    if len(out) != expected_size:
        raise SystemExit(f'size mismatch for {path}: {len(out)} != {expected_size}')
    actual_sha = hashlib.sha256(out).digest()
    if actual_sha != expected_sha:
        raise SystemExit(f'sha256 mismatch for {path}')
    dest = root / path
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(out)

for _ in range(varint()):
    rel = take(varint()).decode('utf-8')
    p = root / rel
    if p.exists():
        p.unlink()

if pos != len(data):
    raise SystemExit(f'trailing delta bytes: {len(data)-pos}')
