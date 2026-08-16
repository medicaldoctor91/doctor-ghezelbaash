#!/usr/bin/env python3
import json, os, re, requests

USERNAME=os.environ["WIKIMEDIA_USERNAME"]
PASSWORD=os.environ["WIKIMEDIA_BOT_PASSWORD"]
API="https://en.wikipedia.org/w/api.php"
ARTICLE="Treatment of bipolar disorder"
TALK="Talk:Treatment of bipolar disorder"
SECTION_TITLE="COI edit request: update Omega-3 section with 2025 review"
UA="GhezelbaashEnwikiCOIRequest/1.0 (https://www.ghezelbaash.ir/)"
REVIEW_DOI="10.3390/md23020084"
TRIAL_DOI="10.4103/2008-7802.182734"

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

def login():
    lt=get(action="query",meta="tokens",type="login")["query"]["tokens"]["logintoken"]
    d=post({"action":"login","lgname":USERNAME,"lgpassword":PASSWORD,"lgtoken":lt})
    if d.get("login",{}).get("result")!="Success": raise RuntimeError(d)
    ui=get(action="query",meta="userinfo",uiprop="groups|rights|blockinfo")["query"]["userinfo"]
    return ui

def csrf(): return get(action="query",meta="tokens",type="csrf")["query"]["tokens"]["csrftoken"]
def page(title):
    d=get(action="query",titles=title,prop="info|revisions",rvprop="ids|timestamp|sha1|content",rvslots="main",curtimestamp=1)
    p=d["query"]["pages"][0]; rev=(p.get("revisions") or [{}])[0]; slot=rev.get("slots",{}).get("main",{})
    return {"missing":"missing" in p,"pageid":p.get("pageid"),"revid":rev.get("revid"),"timestamp":rev.get("timestamp"),"content":slot.get("content","") ,"server_time":d.get("curtimestamp")}

ui=login()
article=page(ARTICLE); talk=page(TALK)
if article["missing"] or talk["missing"]: raise RuntimeError("required page missing")
# Hard duplicate guard: do not post if this source/request has already appeared on the talk page.
for needle in (REVIEW_DOI,TRIAL_DOI,"Ghezelbash","update Omega-3 section with 2025 review"):
    if needle.lower() in talk["content"].lower():
        raise RuntimeError({"duplicate_request_guard":needle,"talk_revid":talk["revid"]})
# Also refuse if the article already contains the proposed sources; an independent editor may have acted meanwhile.
if REVIEW_DOI.lower() in article["content"].lower() or TRIAL_DOI.lower() in article["content"].lower():
    raise RuntimeError({"article_already_updated":True,"article_revid":article["revid"]})
# Confirm target section still has the old 2008-centered wording.
m=re.search(r"(?ms)^===\s*Omega-3 fatty acids\s*===\s*(.*?)(?=^===|^==[^=]|\Z)",article["content"])
if not m or "A 2008 [[Cochrane Collaboration|Cochrane]] systematic review" not in m.group(1):
    raise RuntimeError({"target_section_changed":True,"article_revid":article["revid"]})

review_cite="<ref name=\"Psara2025\">{{cite journal |last1=Psara |first1=Evmorfia |last2=Papadopoulou |first2=Sousana K. |last3=Mentzelou |first3=Maria |last4=Voulgaridou |first4=Gavriela |last5=Vorvolakos |first5=Theophanis |last6=Apostolou |first6=Thomas |last7=Giaginis |first7=Constantinos |title=Omega-3 Fatty Acids for the Treatment of Bipolar Disorder Symptoms: A Narrative Review of the Current Clinical Evidence |journal=Marine Drugs |year=2025 |volume=23 |issue=2 |page=84 |doi=10.3390/md23020084 |pmid=39997208 |pmc=11857698}}</ref>"
trial_cite="<ref>{{cite journal |last1=Shakeri |first1=Jalal |last2=Khanegi |first2=Maryam |last3=Golshani |first3=Sanobar |last4=Farnia |first4=Vahid |last5=Tatari |first5=Faeze |last6=Alikhani |first6=Mostafa |last7=Nooripour |first7=Roghih |last8=Ghezelbash |first8=Mohammad Saeed |title=Effects of Omega-3 Supplement in the Treatment of Patients with Bipolar I Disorder |journal=International Journal of Preventive Medicine |year=2016 |volume=7 |page=77 |doi=10.4103/2008-7802.182734 |pmid=27280013 |pmc=4882968}}</ref>"
proposed=(
"[[Omega-3 fatty acid|Omega-3 fatty acids]] have been studied as adjunctive treatments for bipolar disorder. "
"A 2025 narrative review of clinical studies concluded that the evidence is promising but conflicting, with substantial heterogeneity in dosage, treatment duration, formulation, study design, and study populations; the authors called for larger, long-term randomized double-blind controlled trials before firm conclusions can be drawn. " + review_cite + "\n\n"
"The review included a 2016 double-blind randomized trial of 100 patients with bipolar I disorder in which 1,000 mg/day of omega-3 for three months, added to standard treatment, was associated with lower Young Mania Rating Scale scores than placebo. The review also noted limitations of that trial, including dietary differences, no measurement of blood omega-3 levels, and outcome assessment only at the beginning and end of the study." + "<ref name=\"Psara2025\" />" + trial_cite
)
request=f'''{{{{edit COI}}}}

''' + \
f'''\n\nI am requesting an independent review of an update to the [[{ARTICLE}#Omega-3 fatty acids|Omega-3 fatty acids]] subsection. The current subsection still centers its evidence summary on a 2008 Cochrane review. A 2025 review focused specifically on omega-3 clinical evidence in bipolar disorder is now available and is a secondary medical source.\n\n''' + \
f'''\'\'\'COI disclosure:\'\'\' I am [[User:{USERNAME}|{USERNAME}]] (Mohammad Saeed Ghezelbash), a co-author of the 2016 Shakeri et al. randomized trial discussed by the 2025 review. Because of that relationship, I am not editing the article directly and am asking an uninvolved editor to assess the proposal.\n\n''' + \
f'''\'\'\'Suggested change:\'\'\' Replace the first two paragraphs of the current Omega-3 subsection with the following; the existing third paragraph about dietary sources can remain unchanged.\n\n<blockquote>{proposed}</blockquote>\n\n''' + \
f'''\'\'\'Why this is preferable:\'\'\' The principal efficacy statement is sourced to the 2025 secondary review. The 2016 primary trial is cited only alongside the review for the specific study details that the review itself discusses, not as the basis for a general efficacy conclusion. Current article revision checked before this request: [[Special:Permalink/{article["revid"]}|{article["revid"]}]]. ~~~~'''

result=post({
 "action":"edit","title":TALK,"section":"new","sectiontitle":SECTION_TITLE,"text":request,
 "summary":"COI disclosed: request independent review of Omega-3 subsection using 2025 secondary review",
 "token":csrf(),"assert":"user","watchlist":"watch","basetimestamp":talk["timestamp"],"starttimestamp":talk["server_time"]
})
edit=result.get("edit",{})
if edit.get("result")!="Success": raise RuntimeError(result)
# Readback duplicate guard/result.
after=page(TALK)
for needle in (REVIEW_DOI,TRIAL_DOI,"Ghezelbash",SECTION_TITLE):
    if needle.lower() not in after["content"].lower(): raise RuntimeError({"readback_missing":needle})
print(json.dumps({"ok":True,"mode":"TALK_PAGE_COI_REQUEST_ONLY","article_untouched":True,"article_revid":article["revid"],"talk_oldrevid":edit.get("oldrevid"),"talk_newrevid":edit.get("newrevid"),"section_title":SECTION_TITLE,"authenticated_as":ui.get("name"),"coi_disclosed":True,"sources":{"secondary_review_doi":REVIEW_DOI,"primary_trial_doi":TRIAL_DOI}},ensure_ascii=False,indent=2,sort_keys=True))
