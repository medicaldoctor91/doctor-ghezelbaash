#!/usr/bin/env python3
"""Read-only 1.3.6 regression: all 72 live HTML pages as browser and Googlebot.

Distinguishes substantive crawler drift from byte-only cache variance.
It does not assert indexing guarantees, request Google indexing, or modify the site.
"""
from __future__ import annotations

import concurrent.futures
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import sys
import time
import xml.etree.ElementTree as ET

import requests

ORIGIN = "https://www.ghezelbaash.ir/"
OUT = Path("/tmp/136-crawler-parity-72")
AGENTS = {
    "ordinary": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
    "googlebot": "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2272.96 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
}

class StructuredHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.canonical = []
        self.robots = []
        self.og_urls = []
        self.lang = None
        self.title = []
        self.h1 = []
        self.scripts = []
        self._tag = None
        self._data = []
        self._head = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "html":
            self.lang = a.get("lang")
        if tag == "head":
            self._head = True
        if tag == "link" and "canonical" in (a.get("rel") or "").split():
            self.canonical.append(a.get("href"))
        if tag == "meta":
            if a.get("name", "").lower() == "robots":
                self.robots.append(a.get("content", ""))
            if a.get("property", "").lower() == "og:url":
                self.og_urls.append(a.get("content", ""))
        if tag in ("title", "h1"):
            self._tag = tag
            self._data = []
        if tag == "script" and a.get("type") == "application/ld+json":
            self._tag = "script"
            self._data = []
            self._script_in_head = self._head

    def handle_data(self, data):
        if self._tag is not None:
            self._data.append(data)

    def handle_endtag(self, tag):
        if tag == "head":
            self._head = False
        if self._tag == tag:
            value = "".join(self._data)
            if tag == "title":
                self.title.append(value.strip())
            elif tag == "h1":
                self.h1.append(value.strip())
            elif tag == "script":
                self.scripts.append({"inHead": self._script_in_head, "raw": value})
            self._tag = None
            self._data = []


def fetch(url, agent):
    response = requests.get(
        url, timeout=(12, 55), allow_redirects=False,
        headers={"User-Agent": AGENTS[agent], "Cache-Control": "no-cache", "Accept-Encoding": "identity"},
    )
    return response


def enumerate_pages():
    r = requests.get(ORIGIN + "sitemap.xml", timeout=(12, 45))
    r.raise_for_status()
    root = ET.fromstring(r.content)
    urls = []
    for item in root.findall(".//{*}url"):
        location = item.find("{*}loc")
        if location is not None and location.text:
            urls.append(location.text.strip())
    if len(urls) != 72 or len(set(urls)) != 72 or not all(u.startswith(ORIGIN) for u in urls):
        raise AssertionError(f"Sitemap must contain exactly 72 unique first-party pages: {len(urls)}")
    return urls


def describe(url, kind):
    r = fetch(url, kind)
    d = {
        "status": r.status_code,
        "sha256": hashlib.sha256(r.content).hexdigest(),
        "bytes": len(r.content),
        "contentType": r.headers.get("Content-Type", ""),
        "xRobots": r.headers.get("X-Robots-Tag", ""),
        "location": r.headers.get("Location"),
        "cache": r.headers.get("CF-Cache-Status"),
    }
    if r.status_code != 200 or "text/html" not in d["contentType"].lower():
        return d
    p = StructuredHTML()
    p.feed(r.content.decode("utf-8"))
    kinds = []
    ids = []
    definitions = {}
    schema_errors = []
    for script in p.scripts:
        try:
            parsed = json.loads(script["raw"])
            entities = parsed.get("@graph", [parsed]) if isinstance(parsed, dict) else parsed
            if not isinstance(entities, list):
                raise ValueError("JSON-LD not an object or array of objects")
            kinds.append(len(entities))
            for entity in entities:
                if isinstance(entity, dict) and entity.get("@id"):
                    ids.append(entity["@id"])
                    definitions.setdefault(entity["@id"], []).append(entity)
        except (ValueError, TypeError) as exc:
            schema_errors.append(str(exc)[:180])
    # A second JSON-LD script may legitimately add complementary descriptions
    # to the same entity. It is NOT a duplicate page error by itself.
    duplicates = {}
    for identifier, nodes in definitions.items():
        if len(nodes) < 2:
            continue
        keys = set().union(*(n.keys() for n in nodes))
        differences = sorted(key for key in keys
                             if len({json.dumps(n.get(key), sort_keys=True, ensure_ascii=False)
                                     for n in nodes}) > 1)
        duplicates[identifier] = differences
    d.update(
        repeatedEntityDefinitions=duplicates,
        canonicals=p.canonical, robots=p.robots, ogUrls=p.og_urls,
        lang=p.lang, titles=p.title, h1=p.h1,
        ldScripts=len(p.scripts), ldEntityCounts=kinds, ldIDsSha256=hashlib.sha256(
            json.dumps(ids, separators=(",", ":")).encode()
        ).hexdigest(), ldErrors=schema_errors,
        ldInHead=[s["inHead"] for s in p.scripts],
    )
    return d


def audit_one(url):
    normal = describe(url, "ordinary")
    google = describe(url, "googlebot")
    errors = []
    for agent, data in (("ordinary", normal), ("googlebot", google)):
        if data["status"] != 200 or "text/html" not in data["contentType"].lower():
            errors.append(f"{agent}: non-200 HTML or unsupported Content-Type")
            continue
        if data["canonicals"] != [url]:
            errors.append(f"{agent}: wrong canonical {data['canonicals']}")
        if len(data["h1"]) != 1 or len(data["titles"]) != 1 or not data["lang"]:
            errors.append(f"{agent}: missing/multiple title, H1 or html lang")
        if data["ldScripts"] < 1 or data["ldErrors"]:
            errors.append(f"{agent}: absent or invalid JSON-LD")
        if url == ORIGIN and (data["ldScripts"] != 1 or data["ldInHead"] != [True]):
            errors.append(f"{agent}: homepage must have exactly one JSON-LD graph in HEAD")
        if any("noindex" in x.lower() for x in data["robots"]) or "noindex" in data["xRobots"].lower():
            errors.append(f"{agent}: unexpectedly blocked indexing")
        if data["ogUrls"] and data["ogUrls"] != [url]:
            errors.append(f"{agent}: Open Graph URL does not equal canonical")
    keys = ("canonicals", "robots", "ogUrls", "lang", "titles", "h1", "ldScripts", "ldEntityCounts", "ldIDsSha256", "ldErrors", "repeatedEntityDefinitions")
    differences = [key for key in keys if normal.get(key) != google.get(key)]
    if differences:
        errors.append("Googlebot/ordinary semantic mismatch: " + ", ".join(differences))
    return {"url": url, "normal": normal, "googlebot": google,
            "bytewiseDifferent": normal["sha256"] != google["sha256"], "issues": errors}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    urls = enumerate_pages()
    # Capped concurrency to avoid unnecessary load on the user's clinic website.
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(audit_one, urls))
    normal_graph = fetch(ORIGIN + "graph.jsonld", "ordinary")
    google_graph = fetch(ORIGIN + "graph.jsonld", "googlebot")
    graph = {"ordinary": {"status": normal_graph.status_code, "sha256": hashlib.sha256(normal_graph.content).hexdigest()},
             "googlebot": {"status": google_graph.status_code, "sha256": hashlib.sha256(google_graph.content).hexdigest()}}
    problems = [dict(url=x["url"], errors=x["issues"]) for x in results if x["issues"]]
    if normal_graph.status_code != 200 or google_graph.status_code != 200:
        problems.append({"url": ORIGIN + "graph.jsonld", "errors": ["Graph unavailable for one crawler"]})
    if graph["ordinary"]["sha256"] != graph["googlebot"]["sha256"]:
        problems.append({"url": ORIGIN + "graph.jsonld", "errors": ["Graph bytes differ by crawler identity"]})
    report = {
        "checkedAtUTC": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "readOnly": True,
        "urls": len(urls),
        "problems": problems,
        "bytewiseDifferentPages": [x["url"] for x in results if x["bytewiseDifferent"]],
        "graph": graph,
        "pages": results,
    }
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({"pages": len(urls), "problems": problems,
                      "bytewiseDifferentPages": report["bytewiseDifferentPages"],
                      "graph": graph}, ensure_ascii=False, indent=2), flush=True)
    if problems:
        sys.exit(1)


if __name__ == "__main__":
    main()
