#!/usr/bin/env python3
import json
import requests

API = "https://en.wikisource.org/w/api.php"
UA = "GhezelbaashWikisourceProbe/1.0 (https://www.ghezelbaash.ir/)"
TITLES = [
    "Author:Dariusz Jemielniak",
    "Wikipedia - Why is the common knowledge resource still neglected by academics?",
    "Index:Wikipedia - Why is the common knowledge resource still neglected by academics.pdf",
]

s = requests.Session()
s.headers.update({"User-Agent": UA})
r = s.get(API, params={
    "action": "query",
    "format": "json",
    "formatversion": 2,
    "titles": "|".join(TITLES),
    "prop": "revisions|info|pageprops",
    "rvprop": "ids|timestamp|content|contentmodel",
    "rvslots": "main",
}, timeout=60)
r.raise_for_status()
data = r.json()
if "error" in data:
    raise SystemExit(json.dumps(data["error"], ensure_ascii=False))

out = []
for p in data.get("query", {}).get("pages", []):
    rev = (p.get("revisions") or [{}])[0]
    slot = rev.get("slots", {}).get("main", {})
    out.append({
        "title": p.get("title"),
        "pageid": p.get("pageid"),
        "contentmodel": slot.get("contentmodel"),
        "wikibase_item": p.get("pageprops", {}).get("wikibase_item"),
        "content": slot.get("content", ""),
    })
print(json.dumps(out, ensure_ascii=False, indent=2))
