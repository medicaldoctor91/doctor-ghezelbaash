#!/usr/bin/env python3
from __future__ import annotations

import json
import requests

import commons_strengthen_team_category_v2 as hardened

publisher = hardened.publisher


def main() -> None:
    publisher.validate_wikidata()
    session = requests.Session()
    session.headers["User-Agent"] = publisher.USER_AGENT
    result = publisher.verify(session)
    print(json.dumps({"ok": True, "mode": "read-only-final-audit", **result}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
