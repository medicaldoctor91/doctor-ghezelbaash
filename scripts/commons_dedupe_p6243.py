#!/usr/bin/env python3
import json, os, requests

USERNAME=os.environ["WIKIMEDIA_USERNAME"]
PASSWORD=os.environ["WIKIMEDIA_BOT_PASSWORD"]
API="https://commons.wikimedia.org/w/api.php"
FILE="Healthcare 2021 9 1169 - Golshani et al.pdf"
WORK="Q140298431"
UA="GhezelbaashCommonsDedupe/1.0 (https://www.ghezelbaash.ir/)"

s=requests.Session(); s.headers.update({"User-Agent":UA})
def get(**p):
    p.update(format="json",formatversion=2); r=s.get(API,params=p,timeout=60); r.raise_for_status(); d=r.json()
    if "error" in d: raise RuntimeError(d["error"])
    return d
def post(data):
    data=dict(data); data.update(format="json",formatversion=2); r=s.post(API,data=data,timeout=90); r.raise_for_status(); d=r.json()
    if "error" in d: raise RuntimeError(d["error"])
    return d
lt=get(action="query",meta="tokens",type="login")["query"]["tokens"]["logintoken"]
res=post({"action":"login","lgname":USERNAME,"lgpassword":PASSWORD,"lgtoken":lt})
if res.get("login",{}).get("result")!="Success": raise RuntimeError(res)
csrf=lambda: get(action="query",meta="tokens",type="csrf")["query"]["tokens"]["csrftoken"]
p=get(action="query",titles=f"File:{FILE}",prop="info")["query"]["pages"][0]
if "missing" in p: raise RuntimeError("existing file missing")
mid=f"M{p['pageid']}"

def fetch_claims():
    d=get(action="wbgetclaims",entity=mid,property="P6243")
    claims=d.get("claims",{}).get("P6243",[])
    out=[]
    for c in claims:
        try:
            value=c["mainsnak"]["datavalue"]["value"]["id"]
        except Exception:
            value=None
        out.append({"id":c.get("id"),"value":value,"rank":c.get("rank")})
    return out

before=fetch_claims()
unexpected=[c for c in before if c["value"] not in (None,WORK)]
if unexpected: raise RuntimeError({"unexpected_P6243_values":unexpected})
matching=[c for c in before if c["value"]==WORK]
actions=[]
if not matching:
    target=json.dumps({"entity-type":"item","id":WORK},separators=(",",":"))
    d=post({"action":"wbcreateclaim","entity":mid,"property":"P6243","snaktype":"value","value":target,"summary":"Restore the single digital-representation edge to existing work Q140298431","token":csrf(),"assert":"user"})
    actions.append({"created":d.get("claim",{}).get("id")})
elif len(matching)>1:
    # Preserve the oldest returned statement; remove only exact duplicate statements to the same existing work.
    remove=[c["id"] for c in matching[1:] if c.get("id")]
    if remove:
        d=post({"action":"wbremoveclaims","claim":"|".join(remove),"summary":"Remove duplicate P6243 statements; preserve one canonical edge to Q140298431","token":csrf(),"assert":"user"})
        actions.append({"removed_duplicate_claim_ids":remove})

after=fetch_claims()
matching_after=[c for c in after if c["value"]==WORK]
if len(matching_after)!=1: raise RuntimeError({"expected_exactly_one_P6243":after})
print(json.dumps({"ok":True,"policy":"EXACTLY_ONE_P6243; NO_ENTITY_CREATION","media_id":mid,"before":before,"actions":actions,"after":after},ensure_ascii=False,indent=2,sort_keys=True))
