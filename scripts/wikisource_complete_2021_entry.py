#!/usr/bin/env python3
from pathlib import Path
import json
import time

path = Path(__file__).with_name("wikisource_complete_2021.py")
source = path.read_text(encoding="utf-8")
# Respect normal-account edit cadence. Existing pages on retries are skipped quickly.
source = source.replace("time.sleep(0.4)", 'time.sleep(8.5 if result.get("created") else 0.2)')

ns = {"__name__": "wikisource_complete_2021_module", "__file__": str(path)}
exec(compile(source, str(path), "exec"), ns)

def resilient_api_post(session, url, data):
    payload_data = dict(data)
    payload_data.setdefault("format", "json")
    payload_data.setdefault("formatversion", 2)
    backoffs = [20, 35, 60, 90]
    for attempt in range(len(backoffs) + 1):
        response = session.post(url, data=payload_data, timeout=120)
        response.raise_for_status()
        payload = response.json()
        error = payload.get("error")
        if not error:
            return payload
        if error.get("code") != "ratelimited" or attempt >= len(backoffs):
            ns["fail"]("MediaWiki POST error", error)
        delay = backoffs[attempt]
        print(json.dumps({
            "status": "rate_limited_backoff",
            "attempt": attempt + 1,
            "delay_seconds": delay,
            "api": url,
        }))
        time.sleep(delay)
    ns["fail"]("MediaWiki POST retries exhausted")

ns["api_post"] = resilient_api_post
ns["main"]()
