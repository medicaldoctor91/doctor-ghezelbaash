#!/usr/bin/env python3
import json
import requests

API = "https://commons.wikimedia.org/w/api.php"
CATEGORY = "Category:Saeed Ghezelbash"

s = requests.Session()
s.headers["User-Agent"] = "Medicaldoctor91CommonsLiveAudit/1.0 (https://www.ghezelbaash.ir/)"

members = []
cmcontinue = None
while True:
    params = {
        "action": "query",
        "list": "categorymembers",
        "cmtitle": CATEGORY,
        "cmlimit": "500",
        "cmtype": "file|subcat|page",
        "format": "json",
        "formatversion": "2",
    }
    if cmcontinue:
        params["cmcontinue"] = cmcontinue
    r = s.get(API, params=params, timeout=60)
    r.raise_for_status()
    data = r.json()
    members.extend(data.get("query", {}).get("categorymembers", []))
    cmcontinue = data.get("continue", {}).get("cmcontinue")
    if not cmcontinue:
        break

print(json.dumps({
    "ok": True,
    "category": CATEGORY,
    "count": len(members),
    "members": [{"ns": m.get("ns"), "title": m.get("title")} for m in members],
}, ensure_ascii=False, indent=2))
