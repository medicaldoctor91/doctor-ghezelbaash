#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys


def main() -> int:
    command = [sys.executable, "scripts/audit-production.py", *sys.argv[1:]]
    return subprocess.call(command)


if __name__ == "__main__":
    raise SystemExit(main())
