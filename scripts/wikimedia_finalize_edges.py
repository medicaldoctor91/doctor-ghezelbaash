#!/usr/bin/env python3
import json
import os
import time
import requests

USERNAME = os.environ["WIKIMEDIA_USERNAME"]
PASSWORD = os.environ["WIKIMEDIA_BOT_PASSWORD"]
UA = "GhezelbaashWikimediaFinalize/1.0 (https://www.ghezelbaash.ir/)"
WS = "https://en.wikisource.org/w/api.php"
WD = "https://www.wikidata.org/w/api.php"
COMMONS = "https://commons.wikimedia.org/w/api.php"
PERSON = "Q140287622"
WORK = "Q140298431"
FILE = "Healthcare 2021 9 1169 - Golshani et al.pdf"
AUTHOR = "Author:Mohammad Saeed Ghezelbash"
MAIN = "Individuals with Major Depressive Disorder Report High Scores of Insecure-Avoidant and Insecure-Anxious Attachment Styles, Dissociative Identity Symptoms, and Adult Traumatic Events"


def api_get(s, url, **params):
    params.update(format="json", formatversion=2)
    r=s.get(url,params=params,timeout=60); r.raise_for_status(); d=r.json()
    if "error" in d: raise RuntimeError(d["error"])
    return d

def api_post(s,url,data):
    data=dict(data); data.update(format="json", formatversion=2)
    r=s.post(url,data=data,timeout=90); r.raise_for_status(); d=r.json()
    if "error" in d: raise RuntimeError(d["error"])
    return d

def login(url):
    s=requests.Session(); s.headers.update({"User-Agent":UA})
    tok=api_get(s,url,action="query",meta="tokens",type="login")["query"]["tokens"]["logintoken"]
    d=api_post(s,url,{"action":"login","lgname":USERNAME,"lgpassword":PASSWORD,"lgtoken":tok})
    if d.get("login",{}).get("result")!="Success": raise RuntimeError(d)
    return s

def csrf(s,url): return api_get(s,url,action="query",meta="tokens",type="csrf")["query"]["tokens"]["csrftoken"]

def wd_resolve():
    s=requests.Session(); s.headers.update({"User-Agent":UA})
    d=api_get(s,WD,action="wbgetentities",ids=f"{PERSON}|{WORK}",props="sitelinks")
    ps=d["entities"][PERSON].get("sitelinks",{}).get("enwikisource")
    ws=d["entities"][WORK].get("sitelinks",{}).get("enwikisource")
    if not ps or ps.get("title")!=AUTHOR: raise RuntimeError({"person_sitelink":ps})
    if not ws or ws.get("title")!=MAIN: raise RuntimeError({"work_sitelink":ws})
    # Reverse title resolution directly through the Wikidata repository.
    rd=api_get(s,WD,action="wbgetentities",sites="enwikisource",titles=f"{AUTHOR}|{MAIN}",props="sitelinks")
    resolved=set(rd.get("entities",{}).keys())
    if PERSON not in resolved or WORK not in resolved: raise RuntimeError({"reverse_resolved":sorted(resolved)})
    return {"person":ps,"work":ws,"reverse_resolved":sorted(resolved)}

def purge_ws():
    s=requests.Session(); s.headers.update({"User-Agent":UA})
    d=api_post(s,WS,{"action":"purge","titles":f"{AUTHOR}|{MAIN}","forcelinkupdate":1})
    return d.get("purge",[])

def commons_media_claim():
    s=login(COMMONS)
    p=api_get(s,COMMONS,action="query",titles=f"File:{FILE}",prop="info")["query"]["pages"][0]
    if "missing" in p: raise RuntimeError("existing Commons file missing")
    mid=f"M{p['pageid']}"
    def getvals():
        e=api_get(s,COMMONS,action="wbgetentities",ids=mid,props="claims")["entities"].get(mid,{})
        vals=[]
        for c in e.get("claims",{}).get("P6243",[]):
            try: vals.append(c["mainsnak"]["datavalue"]["value"]["id"])
            except Exception: pass
        return vals
    before=getvals()
    if before and before != [WORK]:
        raise RuntimeError({"unexpected_existing_P6243":before})
    created=False
    if WORK not in before:
        target=json.dumps({"entity-type":"item","id":WORK},separators=(",",":"))
        d=api_post(s,COMMONS,{"action":"wbcreateclaim","entity":mid,"property":"P6243","snaktype":"value","value":target,"summary":"Link this exact article PDF to its existing Wikidata work item; no new entity created","token":csrf(s,COMMONS),"assert":"user"})
        if not d.get("claim"): raise RuntimeError(d)
        created=True
        time.sleep(2)
    after=getvals()
    if WORK not in after: raise RuntimeError({"P6243_readback_failed":after})
    return {"media_id":mid,"before":before,"created":created,"after":after}

result={
    "policy":"EXISTING_ENTITIES_ONLY; NO_PAGE_OR_ITEM_CREATION",
    "wikidata_sitelinks":wd_resolve(),
    "wikisource_purge":purge_ws(),
    "commons_P6243":commons_media_claim(),
}
print(json.dumps({"ok":True,**result},ensure_ascii=False,indent=2,sort_keys=True))
