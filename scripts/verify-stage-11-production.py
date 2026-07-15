#!/usr/bin/env python3
import argparse
import json
import re
import ssl
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen

SITE = "https://www.ghezelbaash.ir"
OUTPUT = Path("production-audit")
EXPECTED_H1 = "دکتر سعید قزلباش؛ پزشک زیبایی، پوست و مو در کرمانشاه"
PERSON_ID = 'id="mohammad-saeed-ghezelbash"'
CLINIC_ID = 'id="dr-saeed-ghezelbash-aesthetic-clinic"'


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(url: str, *, redirect: bool = True, method: str = "GET"):
    headers = {
        "User-Agent": "Ghezelbaash-Stage11-Production-Verifier/1.0",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Accept": "text/html,application/ld+json;q=0.9,*/*;q=0.8",
    }
    req = Request(url, headers=headers, method=method)
    opener = build_opener() if redirect else build_opener(NoRedirect)
    try:
        with opener.open(req, timeout=30, context=ssl.create_default_context()) if hasattr(opener, "open") and False else opener.open(req, timeout=30) as response:
            return response.status, dict(response.headers.items()), response.read()
    except HTTPError as error:
        return error.code, dict(error.headers.items()), error.read()


def header(headers, name):
    target = name.lower()
    for key, value in headers.items():
        if key.lower() == target:
            return value
    return ""


def verify_once(commit: str):
    cache = f"stage11={commit}-{int(time.time())}"
    status, headers, body = request(f"{SITE}/?{cache}")
    html = body.decode("utf-8", errors="replace")
    checks = {
        "homepageStatus200": status == 200,
        "cloudflareEdge": bool(header(headers, "cf-ray")) and "cloudflare" in header(headers, "server").lower(),
        "productionIndexable": "noindex" not in header(headers, "x-robots-tag").lower(),
        "hsts": bool(header(headers, "strict-transport-security")),
        "csp": bool(header(headers, "content-security-policy")),
        "nosniff": header(headers, "x-content-type-options").lower() == "nosniff",
        "canonicalH1": EXPECTED_H1 in html,
        "canonicalPerson": PERSON_ID in html,
        "canonicalClinic": CLINIC_ID in html,
        "canonicalLink": '<link rel="canonical" href="https://www.ghezelbaash.ir/">' in html,
        "localIntentList": 'id="local-service-intent-answers"' in html,
        "nationalIntentList": 'id="national-aesthetic-authority-answers"' in html,
        "unifiedMedicalDomain": "یک Knowledge Domain؛ نه منوی فروش" in html,
        "deferredPosterMarkers": html.count("data-deferred-poster") == 12,
        "noInitialRealPoster": re.search(r'<video\b[^>]*\sposter="/videos/thumbnails/', html, re.I) is None,
        "ratingVisible": 'data-rating-value="5"' in html and 'data-rating-count="163"' in html,
    }

    redirect_status, redirect_headers, _ = request(f"{SITE}/index.html", redirect=False)
    checks["indexRedirect301"] = redirect_status == 301 and header(redirect_headers, "location") in ("/", SITE + "/")

    missing_status, missing_headers, missing_body = request(f"{SITE}/missing-stage11-{commit}-{int(time.time())}")
    missing_html = missing_body.decode("utf-8", errors="replace")
    checks.update({
        "missingStatus404": missing_status == 404,
        "missingNoindex": 'content="noindex,follow"' in missing_html,
        "missingNoCanonical": re.search(r'<link\b[^>]*rel="canonical"', missing_html, re.I) is None,
        "missingRecovery": "این نشانی به جایی نمی‌رسد" in missing_html and missing_html.count('href="/#') >= 5,
    })

    graph_status, graph_headers, graph_body = request(f"{SITE}/knowledge-graph.jsonld?{cache}")
    try:
        graph = json.loads(graph_body.decode("utf-8"))
    except json.JSONDecodeError:
        graph = {}
    nodes = {node.get("@id"): node for node in graph.get("@graph", []) if isinstance(node, dict) and node.get("@id")}
    person = nodes.get(f"{SITE}/#mohammad-saeed-ghezelbash", {})
    clinic = nodes.get(f"{SITE}/#dr-saeed-ghezelbash-aesthetic-clinic", {})
    checks.update({
        "graphStatus200": graph_status == 200,
        "graphContentType": header(graph_headers, "content-type").lower().startswith("application/ld+json"),
        "graphDepth": len(nodes) > 500,
        "personType": person.get("@type") == "Person",
        "personNoRating": "aggregateRating" not in person,
        "clinicType": "MedicalClinic" in (clinic.get("@type") if isinstance(clinic.get("@type"), list) else [clinic.get("@type")]),
        "clinicRating": clinic.get("aggregateRating", {}).get("ratingValue") == 5 and clinic.get("aggregateRating", {}).get("ratingCount") == 163,
    })

    logo_status, logo_headers, _ = request(f"{SITE}/assets/brand/doctor-hand-syringe-logo-192.png", method="HEAD")
    checks["immutableLogoCache"] = logo_status == 200 and "max-age=31536000" in header(logo_headers, "cache-control") and "immutable" in header(logo_headers, "cache-control")

    evidence = {
        "commit": commit,
        "site": SITE + "/",
        "verifiedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "checks": checks,
        "passed": sum(1 for value in checks.values() if value),
        "total": len(checks),
        "status": "pass" if all(checks.values()) else "fail",
        "homepageHeaders": headers,
        "redirect": {"status": redirect_status, "location": header(redirect_headers, "location")},
        "notFound": {"status": missing_status, "headers": missing_headers},
        "graph": {"status": graph_status, "nodes": len(nodes), "contentType": header(graph_headers, "content-type")},
        "logoCacheControl": header(logo_headers, "cache-control"),
    }
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "stage-11-production.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUTPUT / "stage-11-home.html").write_text(html, encoding="utf-8")
    (OUTPUT / "stage-11-404.html").write_text(missing_html, encoding="utf-8")
    return evidence


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", required=True)
    parser.add_argument("--attempts", type=int, default=12)
    parser.add_argument("--delay", type=int, default=20)
    args = parser.parse_args()
    last = None
    for attempt in range(1, args.attempts + 1):
        try:
            last = verify_once(args.commit)
        except (URLError, TimeoutError, ssl.SSLError) as error:
            last = {"status": "fail", "attempt": attempt, "error": str(error)}
        print(json.dumps({"attempt": attempt, **last}, ensure_ascii=False, indent=2))
        if last.get("status") == "pass":
            return 0
        if attempt < args.attempts:
            time.sleep(args.delay)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
