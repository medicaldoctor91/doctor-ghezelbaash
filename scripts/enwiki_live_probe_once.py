#!/usr/bin/env python3
# one-shot live probe trigger: 2026-08-19
import json
from datetime import datetime, timezone
import requests

API = "https://en.wikipedia.org/w/api.php"
TALK = "Talk:Treatment of bipolar disorder"
ARTICLE = "Treatment of bipolar disorder"
USER = "Medicaldoctor91"
NEEDLES = [
    "COI edit request: update Omega-3 section with 2025 review",
    "10.3390/md23020084",
    "10.4103/2008-7802.182734",
    "27280013",
    "Ghezelbash",
]

s = requests.Session()
s.headers.update({"User-Agent": "GhezelbaashLiveEnwikiProbe/1.0 (https://www.ghezelbaash.ir/)"})

def api(**params):
    params.update(format="json", formatversion=2, curtimestamp=1)
    r = s.get(API, params=params, timeout=60)
    r.raise_for_status()
    d = r.json()
    if "error" in d:
        raise RuntimeError(d["error"])
    return d

def read_page(title, limit):
    d = api(
        action="query", titles=title, prop="info|revisions",
        rvprop="ids|timestamp|user|comment|content", rvslots="main", rvlimit=limit,
    )
    p = d["query"]["pages"][0]
    revs = p.get("revisions", [])
    latest = revs[0] if revs else {}
    text = latest.get("slots", {}).get("main", {}).get("content", "")
    return {
        "server_time": d.get("curtimestamp"),
        "title": p.get("title"),
        "pageid": p.get("pageid"),
        "latest_revid": latest.get("revid"),
        "latest_parentid": latest.get("parentid"),
        "latest_timestamp": latest.get("timestamp"),
        "latest_user": latest.get("user"),
        "latest_comment": latest.get("comment"),
        "contains": {n: n.lower() in text.lower() for n in NEEDLES},
        "history_matches": [
            {
                "revid": r.get("revid"),
                "parentid": r.get("parentid"),
                "timestamp": r.get("timestamp"),
                "user": r.get("user"),
                "comment": r.get("comment"),
                "contains": [n for n in NEEDLES if n.lower() in r.get("slots", {}).get("main", {}).get("content", "").lower()],
            }
            for r in revs
            if any(n.lower() in r.get("slots", {}).get("main", {}).get("content", "").lower() for n in NEEDLES)
        ],
    }

def contribs():
    d = api(
        action="query", list="usercontribs", ucuser=USER,
        ucprop="ids|title|timestamp|comment|flags|tags", uclimit=250,
    )
    return {
        "server_time": d.get("curtimestamp"),
        "items": d.get("query", {}).get("usercontribs", []),
    }

out = {
    "probe_started_utc": datetime.now(timezone.utc).isoformat(),
    "talk": read_page(TALK, 100),
    "article": read_page(ARTICLE, 25),
    "user_contributions": contribs(),
}
print(json.dumps(out, ensure_ascii=False, indent=2, sort_keys=True))
