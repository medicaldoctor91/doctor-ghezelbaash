#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import requests

API = "https://commons.wikimedia.org/w/api.php"
TITLE = "Category:Saeed Ghezelbash"
OLD = "{{Wikidata Infobox|qid=Q140287622}}"
NEW = "{{Wikidata Infobox|qid=Q140287622|defaultsort=no}}"
USER_AGENT = "Medicaldoctor91CommonsCategoryCleanup/1.0 (https://www.ghezelbaash.ir/)"


def api_get(s, params):
    r = s.get(API, params={**params, "format": "json", "formatversion": 2}, timeout=60)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        raise RuntimeError(json.dumps(data["error"], ensure_ascii=False))
    return data


def api_post(s, data):
    r = s.post(API, data={**data, "format": "json", "formatversion": 2, "maxlag": 5}, timeout=120)
    r.raise_for_status()
    return r.json()


def main():
    username = os.environ["COMMONS_USERNAME"].strip()
    password = os.environ["COMMONS_BOT_PASSWORD"].strip()
    s = requests.Session()
    s.headers["User-Agent"] = USER_AGENT
    lt = api_get(s, {"action": "query", "meta": "tokens", "type": "login"})["query"]["tokens"]["logintoken"]
    auth = api_post(s, {"action": "login", "lgname": username, "lgpassword": password, "lgtoken": lt})
    if auth.get("login", {}).get("result") != "Success":
        raise RuntimeError(json.dumps(auth, ensure_ascii=False))
    csrf = api_get(s, {"action": "query", "meta": "tokens", "type": "csrf"})["query"]["tokens"]["csrftoken"]
    page = api_get(s, {"action": "query", "prop": "revisions", "rvprop": "content|timestamp", "rvslots": "main", "titles": TITLE})["query"]["pages"][0]
    rev = page["revisions"][0]
    text = rev["slots"]["main"]["content"]
    ts = rev["timestamp"]
    if NEW not in text:
        if OLD not in text:
            raise RuntimeError("Expected Wikidata Infobox signature not found")
        text = text.replace(OLD, NEW, 1)
        result = api_post(s, {"action": "edit", "title": TITLE, "text": text, "summary": "Resolve Wikidata Infobox DEFAULTSORT conflict", "token": csrf, "basetimestamp": ts, "nocreate": 1, "assert": "user"})
        if "error" in result:
            raise RuntimeError(json.dumps(result["error"], ensure_ascii=False))
    verify = api_get(s, {"action": "query", "prop": "revisions|categories", "rvprop": "content", "rvslots": "main", "cllimit": "max", "titles": TITLE})["query"]["pages"][0]
    final_text = verify["revisions"][0]["slots"]["main"]["content"]
    cats = {c["title"] for c in verify.get("categories", [])}
    required = ["دکتر سعید قزلباش", "سعید قزلباش", "محمدسعید قزلباش", "Q140287622", "/g/11nqdfk76c", "Q140288589", "/g/11r3rzdtb3", "P1830", "P937"]
    missing = [x for x in required if x not in final_text]
    if missing:
        raise RuntimeError("Identity block verification failed: " + repr(missing))
    if NEW not in final_text:
        raise RuntimeError("defaultsort=no was not persisted")
    if "Category:Pages with DEFAULTSORT conflicts" in cats:
        raise RuntimeError("DEFAULTSORT conflict category is still present")
    print(json.dumps({"ok": True, "category": TITLE, "infobox": NEW, "defaultsort_conflict": False, "categories": sorted(cats)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
