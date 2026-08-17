#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).with_name("wikimedia_publish_2021.py")
source = path.read_text(encoding="utf-8")
source = source.replace('assert="user",', '**{"assert": "user"},')
code = compile(source, str(path), "exec")
exec(code, {"__name__": "__main__", "__file__": str(path)})
