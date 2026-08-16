#!/usr/bin/env python3
import json, os, re, requests

USERNAME=os.environ["WIKIMEDIA_USERNAME"]
PASSWORD=os.environ["WIKIMEDIA_BOT_PASSWORD"]
API="https://en.wikipedia.org/w/api.php"
ARTICLE="Treatment of bipolar disorder"
TALK="Talk:Treatment of bipolar disorder"
UA="GhezelbaashEnwikiPreflight/1.0 (https://www.ghezelbaash.ir/)"
NEEDLES=["Ghezelbash","10.4103/2008-7802.182734","10.3390/md23020084","39997208","27280013","Shakeri"]

s=requests.Session(); s.headers.update({"User-Agent":UA})
def get(**p):
    p.update(format="json",formatversion=2)
    r=s.get(API,params=p,timeout=60); r.raise_for_status(); d=r.json()
    if "error" in d: raise RuntimeError(d["error"])
    return d

def post(data):
    data=dict(data); data.update(format="json",formatversion=2)
    r=s.post(API,data=data,timeout=90); r.raise_for_status(); d=r.json()
    if "error" in d: raise RuntimeError(d["error"])
    return d

lt=get(action="query",meta="tokens",type="login")["query"]["tokens"]["logintoken"]
login=post({"action":"login","lgname":USERNAME,"lgpassword":PASSWORD,"lgtoken":lt})
if login.get("login",{}).get("result")!="Success": raise RuntimeError(login)
userinfo=get(action="query",meta="userinfo",uiprop="groups|rights|blockinfo|editcount|registration")["query"]["userinfo"]

def page(title):
    d=get(action="query",titles=title,prop="info|revisions",rvprop="ids|timestamp|sha1|content",rvslots="main",curtimestamp=1)
    p=d["query"]["pages"][0]
    rev=(p.get("revisions") or [{}])[0]; slot=rev.get("slots",{}).get("main",{})
    return {"title":p.get("title"),"missing":"missing" in p,"pageid":p.get("pageid"),"revid":rev.get("revid"),"timestamp":rev.get("timestamp"),"sha1":rev.get("sha1"),"content":slot.get("content","")} 

article=page(ARTICLE); talk=page(TALK)
if article["missing"]: raise RuntimeError("article missing")
text=article["content"]
m=re.search(r"(?ms)^===\s*Omega-3 fatty acids\s*===\s*(.*?)(?=^===|^==[^=]|\Z)",text)
omega=m.group(1).strip() if m else None
if omega is None: raise RuntimeError("Omega-3 section not found")
report={
 "ok":True,
 "mode":"READ_ONLY_PREFLIGHT",
 "authenticated_as":userinfo.get("name"),
 "userinfo":{"groups":userinfo.get("groups",[]),"editcount":userinfo.get("editcount"),"registration":userinfo.get("registration"),"blockedby":userinfo.get("blockedby"),"blockreason":userinfo.get("blockreason")},
 "article":{"pageid":article["pageid"],"revid":article["revid"],"timestamp":article["timestamp"],"sha1":article["sha1"],"omega3_source":omega,"contains":{n:n.lower() in text.lower() for n in NEEDLES}},
 "talk":{"missing":talk["missing"],"pageid":talk["pageid"],"revid":talk["revid"],"timestamp":talk["timestamp"],"contains":{n:n.lower() in talk["content"].lower() for n in NEEDLES},"pending_edit_coi":("{{edit COI".lower() in talk["content"].lower() or "{{edit coi".lower() in talk["content"].lower())}
}
print(json.dumps(report,ensure_ascii=False,indent=2,sort_keys=True))
