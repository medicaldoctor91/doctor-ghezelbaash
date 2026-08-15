#!/usr/bin/env python3
from __future__ import annotations

import json
import requests

API = "https://commons.wikimedia.org/w/api.php"
MID = "M196320111"
FILE = "File:Saeed-Ghezelbaash-with-clinical-team.jpg"
CATEGORY = "Category:Saeed Ghezelbash"

s = requests.Session()
s.headers["User-Agent"] = "Medicaldoctor91CommonsInspector/1.0 (https://www.ghezelbaash.ir/)"


def get(params):
    r = s.get(API, params={**params, "format": "json", "formatversion": 2}, timeout=60)
    r.raise_for_status()
    return r.json()

entity = get({"action": "wbgetentities", "ids": MID, "props": "labels|claims"}).get("entities", {}).get(MID, {})
pages = get({
    "action": "query",
    "prop": "revisions|categories",
    "rvprop": "content",
    "rvslots": "main",
    "cllimit": "max",
    "titles": f"{FILE}|{CATEGORY}",
}).get("query", {}).get("pages", [])

claims = entity.get("claims", {})
interesting = {p: claims.get(p, []) for p in ["P180", "P170", "P1071", "P3931", "P7482"]}

print(json.dumps({
    "mid": MID,
    "labels": entity.get("labels", {}),
    "claim_properties": sorted(claims.keys()),
    "interesting_claims": interesting,
    "pages": [{
        "title": p.get("title"),
        "categories": [c.get("title") for c in p.get("categories", [])],
        "wikitext": p.get("revisions", [{}])[0].get("slots", {}).get("main", {}).get("content", ""),
    } for p in pages],
}, ensure_ascii=False, indent=2))
