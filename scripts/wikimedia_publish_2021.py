#!/usr/bin/env python3
import hashlib
import json
import os
import sys
from urllib.parse import quote

import requests

USERNAME = os.environ["WIKIMEDIA_USERNAME"]
PASSWORD = os.environ["WIKIMEDIA_BOT_PASSWORD"]
UA = "GhezelbaashWikimediaPublisher/1.0 (https://www.ghezelbaash.ir/)"

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
WIKISOURCE_API = "https://en.wikisource.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"

PERSON_QID = "Q140287622"
WORK_QID = "Q140298431"
DOI = "10.3390/HEALTHCARE9091169"
PMID = "34574943"
LICENSE_QID = "Q20007257"  # Creative Commons Attribution 4.0 International

FILE_NAME = "Healthcare 2021 9 1169 - Golshani et al.pdf"
INDEX_TITLE = f"Index:{FILE_NAME}"
INDEX_URL = "https://en.wikisource.org/wiki/" + INDEX_TITLE.replace(" ", "_")
ARTICLE_TITLE = "Individuals with Major Depressive Disorder Report High Scores of Insecure-Avoidant and Insecure-Anxious Attachment Styles, Dissociative Identity Symptoms, and Adult Traumatic Events"

PDF_SOURCES = [
    "https://www.zora.uzh.ch/id/eprint/214964/1/healthcare-09-01169-v3.pdf",
    "https://europepmc.org/articles/PMC8469763?pdf=render",
    "https://www.mdpi.com/2227-9032/9/9/1169/pdf?version=1631163994",
]


def die(message, details=None):
    out = {"ok": False, "error": message}
    if details is not None:
        out["details"] = details
    print(json.dumps(out, ensure_ascii=False, indent=2))
    raise SystemExit(1)


def session():
    s = requests.Session()
    s.headers.update({"User-Agent": UA})
    return s


def api_get(s, url, **params):
    params.setdefault("format", "json")
    params.setdefault("formatversion", "2")
    r = s.get(url, params=params, timeout=45)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        die("MediaWiki GET failed", data["error"])
    return data


def api_post(s, url, assert_user=False, **data):
    if assert_user:
        data.setdefault("assert", "user")
    data.setdefault("format", "json")
    data.setdefault("formatversion", "2")
    r = s.post(url, data=data, timeout=90)
    r.raise_for_status()
    payload = r.json()
    if "error" in payload:
        die("MediaWiki POST failed", payload["error"])
    return payload


def login(url):
    s = session()
    token = api_get(s, url, action="query", meta="tokens", type="login")["query"]["tokens"]["logintoken"]
    result = api_post(s, url, action="login", lgname=USERNAME, lgpassword=PASSWORD, lgtoken=token)
    if result.get("login", {}).get("result") != "Success":
        die("MediaWiki login failed", {"url": url, "result": result})
    info = api_get(s, url, action="query", meta="userinfo", uiprop="groups|rights")["query"]["userinfo"]
    if info.get("anon"):
        die("Authenticated session became anonymous", {"url": url})
    return s, info


def csrf(s, url):
    return api_get(s, url, action="query", meta="tokens", type="csrf")["query"]["tokens"]["csrftoken"]


def get_page(s, url, title, extra_prop=""):
    prop = "info|revisions"
    if extra_prop:
        prop += "|" + extra_prop
    data = api_get(s, url, action="query", titles=title, prop=prop, rvprop="ids|timestamp|sha1|content", rvslots="main", curtimestamp="1")
    pages = data.get("query", {}).get("pages", [])
    if len(pages) != 1:
        die("Unexpected page lookup", {"title": title, "data": data})
    return pages[0], data.get("curtimestamp")


def search(s, url, query, namespace, limit=20):
    data = api_get(s, url, action="query", list="search", srsearch=query, srnamespace=namespace, srlimit=limit, srprop="")
    return [{"title": x.get("title"), "pageid": x.get("pageid")} for x in data.get("query", {}).get("search", [])]


def work_entity(s):
    data = api_get(s, WIKIDATA_API, action="wbgetentities", ids=WORK_QID, props="labels|claims|sitelinks", languages="en")
    e = data.get("entities", {}).get(WORK_QID)
    if not e or e.get("missing") is not None:
        die("Existing scholarly Wikidata item not found", {"qid": WORK_QID})
    claims = e.get("claims", {})

    def values(pid):
        out = []
        for claim in claims.get(pid, []):
            try:
                out.append(claim["mainsnak"]["datavalue"]["value"])
            except Exception:
                pass
        return out

    dois = [str(x).upper() for x in values("P356")]
    pmids = [str(x) for x in values("P698")]
    authors = [x.get("id") for x in values("P50") if isinstance(x, dict)]
    if DOI.upper() not in dois or PMID not in pmids or PERSON_QID not in authors:
        die("Wikidata identity guard failed; refusing all writes", {"qid": WORK_QID, "doi": dois, "pmid": pmids, "authors": authors})
    return e


def download_pdf():
    errors = []
    s = session()
    for url in PDF_SOURCES:
        try:
            r = s.get(url, timeout=90, allow_redirects=True)
            r.raise_for_status()
            blob = r.content
            ctype = (r.headers.get("content-type") or "").lower()
            if len(blob) < 100_000 or not blob.startswith(b"%PDF"):
                raise ValueError(f"not a usable PDF: bytes={len(blob)} content-type={ctype}")
            return blob, url, hashlib.sha256(blob).hexdigest()
        except Exception as exc:
            errors.append({"url": url, "error": str(exc)})
    die("Could not download authoritative PDF", errors)


def upload_commons(s, blob, download_url):
    exact, _ = get_page(s, COMMONS_API, f"File:{FILE_NAME}", "imageinfo")
    exact_exists = "missing" not in exact
    doi_hits = search(s, COMMONS_API, DOI, 6, 20)
    title_hits = search(s, COMMONS_API, '"' + ARTICLE_TITLE + '"', 6, 20)
    relevant_hits = [x for x in (doi_hits + title_hits) if x.get("title") != f"File:{FILE_NAME}"]
    if relevant_hits:
        die("Commons duplicate guard found another plausible file", relevant_hits)

    if exact_exists:
        return {"created": False, "pageid": exact.get("pageid"), "title": exact.get("title")}

    description = f"""=={{{{int:filedesc}}}}==
{{{{Information
|description={{{{en|1={ARTICLE_TITLE}. Peer-reviewed scholarly article published in ''Healthcare'' 9(9), article 1169. DOI: 10.3390/healthcare9091169; PMID: 34574943; Wikidata: [[d:{WORK_QID}|{WORK_QID}]].}}}}
|date=2021-09-06
|source=[https://doi.org/10.3390/healthcare9091169 Publisher record] (PDF retrieved from {download_url})
|author=Sanobar Golshani; Seyed Sepehr Hashemian; Ali Firoozabadi; Kimia Firoozabadi; Kenneth M. Dürsteler; [[d:{PERSON_QID}|Mohammad Saeed Ghezelbash]]; others as credited in the article
|permission={{{{Cc-by-4.0}}}}
|other versions=
}}}}

=={{{{int:license-header}}}}==
{{{{Cc-by-4.0}}}}

[[Category:Major depressive disorder]]
[[Category:Scientific papers]]
[[Category:Saeed Ghezelbash]]
"""
    token = csrf(s, COMMONS_API)
    data = {
        "action": "upload",
        "filename": FILE_NAME,
        "text": description,
        "comment": "Upload openly licensed peer-reviewed article (CC BY 4.0); linked to existing Wikidata item Q140298431",
        "token": token,
        "assert": "user",
        "watchlist": "watch",
        "format": "json",
        "formatversion": "2",
    }
    files = {"file": (FILE_NAME, blob, "application/pdf")}
    r = s.post(COMMONS_API, data=data, files=files, timeout=180)
    r.raise_for_status()
    result = r.json()
    if "error" in result:
        die("Commons upload failed", result["error"])
    up = result.get("upload", {})
    if up.get("result") != "Success":
        die("Commons upload did not succeed", result)
    page, _ = get_page(s, COMMONS_API, f"File:{FILE_NAME}", "imageinfo")
    if "missing" in page:
        die("Commons file missing after successful upload")
    return {"created": True, "pageid": page.get("pageid"), "title": page.get("title")}


def create_index(s):
    page, server_time = get_page(s, WIKISOURCE_API, INDEX_TITLE)
    if "missing" not in page:
        return {"created": False, "pageid": page.get("pageid"), "revid": (page.get("revisions") or [{}])[0].get("revid")}

    # This is an Index workspace page only. It does not create a new Wikidata item.
    text = f"""{{{{Proofreadpage index template
|Type=Article
|Title={ARTICLE_TITLE}
|Language=en
|Author=Sanobar Golshani; Seyed Sepehr Hashemian; Ali Firoozabadi; Kimia Firoozabadi; Kenneth M. Dürsteler; [[Author:Mohammad Saeed Ghezelbash|Mohammad Saeed Ghezelbash]]; et al.
|Publisher=MDPI
|Location=Basel, Switzerland
|Year=2021
|Source=pdf
|Image=1
|Progress=C
|Transclusion=no
|Pages=<pagelist />
|Remarks=Peer-reviewed open-access scholarly article. DOI: 10.3390/healthcare9091169. PMID: 34574943. Existing Wikidata item: [[d:{WORK_QID}|{WORK_QID}]]. Original license: CC BY 4.0.
|DOI=10.3390/healthcare9091169
}}}}
"""
    token = csrf(s, WIKISOURCE_API)
    result = api_post(
        s,
        WIKISOURCE_API,
        action="edit",
        title=INDEX_TITLE,
        text=text,
        summary="Create scan-backed Index for CC BY 4.0 peer-reviewed article; existing Wikidata item Q140298431",
        token=token,
        createonly="1",
        assert_user=True,
        watchlist="watch",
        starttimestamp=server_time,
    )
    edit = result.get("edit", {})
    if edit.get("result") != "Success":
        die("Wikisource Index creation failed", result)
    after, _ = get_page(s, WIKISOURCE_API, INDEX_TITLE)
    if "missing" in after:
        die("Wikisource Index missing after creation")
    return {"created": True, "pageid": after.get("pageid"), "revid": (after.get("revisions") or [{}])[0].get("revid")}


def claim_value(claim):
    try:
        return claim["mainsnak"]["datavalue"]["value"]
    except Exception:
        return None


def add_claim_if_absent(s, entity_id, pid, value, kind):
    data = api_get(s, WIKIDATA_API, action="wbgetentities", ids=entity_id, props="claims")
    claims = data["entities"][entity_id].get("claims", {}).get(pid, [])
    existing = [claim_value(x) for x in claims]

    def same(v):
        if kind == "item":
            return isinstance(v, dict) and v.get("id") == value
        return str(v) == str(value)

    if any(same(v) for v in existing):
        return {"created": False, "existing": True}

    token = csrf(s, WIKIDATA_API)
    if kind == "item":
        target = json.dumps({"entity-type": "item", "id": value}, separators=(",", ":"))
    else:
        target = json.dumps(value, ensure_ascii=False)
    result = api_post(
        s,
        WIKIDATA_API,
        action="wbcreateclaim",
        entity=entity_id,
        property=pid,
        snaktype="value",
        value=target,
        summary=f"Link existing scholarly item to its openly licensed Wikimedia source ({pid})",
        token=token,
        assert_user=True,
        bot="1",
    )
    if not result.get("claim"):
        die("Wikidata claim creation failed", {"entity": entity_id, "property": pid, "result": result})
    return {"created": True, "claim_id": result["claim"].get("id")}


def add_media_info_link(s, pageid):
    media_id = f"M{pageid}"
    data = api_get(s, COMMONS_API, action="wbgetentities", ids=media_id, props="claims")
    entity = data.get("entities", {}).get(media_id, {})
    existing = []
    for c in entity.get("claims", {}).get("P6243", []):
        try:
            existing.append(c["mainsnak"]["datavalue"]["value"].get("id"))
        except Exception:
            pass
    if WORK_QID in existing:
        return {"created": False, "media_id": media_id}
    token = csrf(s, COMMONS_API)
    target = json.dumps({"entity-type": "item", "id": WORK_QID}, separators=(",", ":"))
    result = api_post(
        s,
        COMMONS_API,
        action="wbcreateclaim",
        entity=media_id,
        property="P6243",
        snaktype="value",
        value=target,
        summary="Link digital representation to existing scholarly article item Q140298431",
        token=token,
        assert_user=True,
        bot="1",
    )
    if not result.get("claim"):
        die("Commons MediaInfo P6243 creation failed", result)
    return {"created": True, "media_id": media_id, "claim_id": result["claim"].get("id")}


def main():
    commons, commons_user = login(COMMONS_API)
    wikisource, wikisource_user = login(WIKISOURCE_API)
    wikidata, wikidata_user = login(WIKIDATA_API)

    # Absolute duplicate/identity guard: validate the EXISTING scholarly item before any write.
    work_entity(wikidata)

    blob, pdf_url, pdf_sha256 = download_pdf()
    commons_result = upload_commons(commons, blob, pdf_url)
    index_result = create_index(wikisource)

    wd_results = {
        "license_P275": add_claim_if_absent(wikidata, WORK_QID, "P275", LICENSE_QID, "item"),
        "document_file_P996": add_claim_if_absent(wikidata, WORK_QID, "P996", FILE_NAME, "string"),
        "wikisource_index_P1957": add_claim_if_absent(wikidata, WORK_QID, "P1957", INDEX_URL, "string"),
    }
    sdc_result = add_media_info_link(commons, commons_result["pageid"])

    # Final readback: no new scholarly item creation is possible anywhere in this script.
    final_entity = work_entity(wikidata)
    final_index, _ = get_page(wikisource, WIKISOURCE_API, INDEX_TITLE)
    final_file, _ = get_page(commons, COMMONS_API, f"File:{FILE_NAME}", "imageinfo")

    print(json.dumps({
        "ok": True,
        "duplicate_policy": "NO_NEW_WIKIDATA_ITEMS; existing Q140298431 only",
        "authenticated_as": {
            "commons": commons_user.get("name"),
            "wikisource": wikisource_user.get("name"),
            "wikidata": wikidata_user.get("name"),
        },
        "pdf": {"source": pdf_url, "sha256": pdf_sha256, "bytes": len(blob)},
        "commons": {**commons_result, "url": "https://commons.wikimedia.org/wiki/File:" + quote(FILE_NAME.replace(" ", "_"))},
        "wikisource": {**index_result, "title": INDEX_TITLE, "url": INDEX_URL},
        "wikidata": {"qid": WORK_QID, "url": f"https://www.wikidata.org/wiki/{WORK_QID}", "changes": wd_results},
        "commons_sdc": sdc_result,
        "verified": {
            "file_exists": "missing" not in final_file,
            "index_exists": "missing" not in final_index,
            "existing_work_item_still_resolves": final_entity.get("id") == WORK_QID,
        },
    }, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
