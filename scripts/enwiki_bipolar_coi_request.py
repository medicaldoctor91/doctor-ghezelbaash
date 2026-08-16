#!/usr/bin/env python3
import json
import os
import re
import requests

USERNAME = os.environ["WIKIMEDIA_USERNAME"]
PASSWORD = os.environ["WIKIMEDIA_BOT_PASSWORD"]
API = "https://en.wikipedia.org/w/api.php"
ARTICLE = "Treatment of bipolar disorder"
TALK = "Talk:Treatment of bipolar disorder"
SECTION_TITLE = "COI edit request: update Omega-3 evidence with recent secondary sources"
UA = "GhezelbaashEnwikiCOIRequest/1.1 (https://www.ghezelbaash.ir/)"
META_DOI = "10.1111/bdi.13115"
REVIEW_DOI = "10.3390/md23020084"
TRIAL_DOI = "10.4103/2008-7802.182734"

s = requests.Session()
s.headers.update({"User-Agent": UA})


def get(**params):
    params.update(format="json", formatversion=2)
    r = s.get(API, params=params, timeout=60)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        raise RuntimeError(data["error"])
    return data


def post(data):
    data = dict(data)
    data.update(format="json", formatversion=2)
    r = s.post(API, data=data, timeout=90)
    r.raise_for_status()
    payload = r.json()
    if "error" in payload:
        raise RuntimeError(payload["error"])
    return payload


def login():
    token = get(action="query", meta="tokens", type="login")["query"]["tokens"]["logintoken"]
    result = post({
        "action": "login",
        "lgname": USERNAME,
        "lgpassword": PASSWORD,
        "lgtoken": token,
    })
    if result.get("login", {}).get("result") != "Success":
        raise RuntimeError(result)
    return get(action="query", meta="userinfo", uiprop="groups|rights|blockinfo")["query"]["userinfo"]


def csrf():
    return get(action="query", meta="tokens", type="csrf")["query"]["tokens"]["csrftoken"]


def page(title):
    data = get(
        action="query",
        titles=title,
        prop="info|revisions",
        rvprop="ids|timestamp|sha1|content",
        rvslots="main",
        curtimestamp=1,
    )
    p = data["query"]["pages"][0]
    rev = (p.get("revisions") or [{}])[0]
    slot = rev.get("slots", {}).get("main", {})
    return {
        "missing": "missing" in p,
        "pageid": p.get("pageid"),
        "revid": rev.get("revid"),
        "timestamp": rev.get("timestamp"),
        "content": slot.get("content", ""),
        "server_time": data.get("curtimestamp"),
    }


ui = login()
article = page(ARTICLE)
talk = page(TALK)
if article["missing"] or talk["missing"]:
    raise RuntimeError("required page missing")

# Refuse duplicate requests or self-reposts.
for needle in (
    META_DOI,
    REVIEW_DOI,
    TRIAL_DOI,
    "Ghezelbash",
    "update Omega-3 evidence with recent secondary sources",
):
    if needle.lower() in talk["content"].lower():
        raise RuntimeError({"duplicate_request_guard": needle, "talk_revid": talk["revid"]})

# Refuse to post if an uninvolved editor already incorporated any of the proposed newer sources.
if META_DOI.lower() in article["content"].lower() or REVIEW_DOI.lower() in article["content"].lower() or TRIAL_DOI.lower() in article["content"].lower():
    raise RuntimeError({"article_already_updated": True, "article_revid": article["revid"]})

# Confirm the exact target remains materially unchanged before asking for review.
match = re.search(
    r"(?ms)^===\s*Omega-3 fatty acids\s*===\s*(.*?)(?=^===|^==[^=]|\Z)",
    article["content"],
)
if not match or "A 2008 [[Cochrane Collaboration|Cochrane]] systematic review" not in match.group(1):
    raise RuntimeError({"target_section_changed": True, "article_revid": article["revid"]})

meta_cite = (
    '<ref name="Kishi2021">{{cite journal '
    '|last1=Kishi |first1=Taro |last2=Sakuma |first2=Kenji |last3=Okuya |first3=Makoto '
    '|last4=Ikeda |first4=Masashi |last5=Iwata |first5=Nakao '
    '|title=Omega-3 fatty acids for treating residual depressive symptoms in adult patients with bipolar disorder: '
    'A systematic review and meta-analysis of double-blind randomized, placebo-controlled trials '
    '|journal=Bipolar Disorders |year=2021 |volume=23 |issue=7 |pages=730–731 '
    '|doi=10.1111/bdi.13115 |pmid=34228881}}</ref>'
)
review_cite = (
    '<ref name="Psara2025">{{cite journal '
    '|last1=Psara |first1=Evmorfia |last2=Papadopoulou |first2=Sousana K. '
    '|last3=Mentzelou |first3=Maria |last4=Voulgaridou |first4=Gavriela '
    '|last5=Vorvolakos |first5=Theophanis |last6=Apostolou |first6=Thomas '
    '|last7=Giaginis |first7=Constantinos '
    '|title=Omega-3 Fatty Acids for the Treatment of Bipolar Disorder Symptoms: A Narrative Review of the Current Clinical Evidence '
    '|journal=Marine Drugs |year=2025 |volume=23 |issue=2 |page=84 '
    '|doi=10.3390/md23020084 |pmid=39997208 |pmc=11857698}}</ref>'
)
trial_cite = (
    '<ref>{{cite journal '
    '|last1=Shakeri |first1=Jalal |last2=Khanegi |first2=Maryam |last3=Golshani |first3=Sanobar '
    '|last4=Farnia |first4=Vahid |last5=Tatari |first5=Faeze |last6=Alikhani |first6=Mostafa '
    '|last7=Nooripour |first7=Roghih |last8=Ghezelbash |first8=Mohammad Saeed '
    '|title=Effects of Omega-3 Supplement in the Treatment of Patients with Bipolar I Disorder '
    '|journal=International Journal of Preventive Medicine |year=2016 |volume=7 |page=77 '
    '|doi=10.4103/2008-7802.182734 |pmid=27280013 |pmc=4882968}}</ref>'
)

proposed = (
    "[[Omega-3 fatty acid|Omega-3 fatty acids]] have been studied as adjunctive treatments for bipolar disorder, "
    "but the evidence remains mixed. A 2021 systematic review and meta-analysis of double-blind randomized, "
    "placebo-controlled trials reported that adjunctive omega-3 may improve residual depressive symptoms in adults "
    "with bipolar disorder. " + meta_cite + " A 2025 narrative review of the broader clinical literature described "
    "the findings as conflicting and heterogeneous with respect to dose, treatment duration, formulation, study design, "
    "and patient populations, and called for larger, long-term randomized double-blind controlled trials before firm "
    "conclusions are drawn. " + review_cite + "\n\n"
    "Among the double-blind randomized trials summarized in the 2025 review was a 2016 study of 100 patients with "
    "bipolar I disorder. Participants received 1,000 mg/day of omega-3 or placebo for three months in addition to "
    "standard treatment; the trial reported lower Young Mania Rating Scale scores in the omega-3 group. The 2025 "
    "review also noted limitations including dietary differences, absence of blood omega-3 measurements, and outcome "
    "assessment only at the beginning and end of the study. <ref name=\"Psara2025\" />" + trial_cite
)

request = f'''{{{{edit COI}}}}

I am requesting independent review of an update to the [[{ARTICLE}#Omega-3 fatty acids|Omega-3 fatty acids]] subsection. The current subsection still centers its evidence summary on a 2008 Cochrane review and also contains a consumer-oriented paragraph sourced to WebMD. More recent secondary literature is available, including a 2021 systematic review/meta-analysis in ''Bipolar Disorders'' and a 2025 narrative review focused on clinical omega-3 evidence in bipolar disorder.

''' + f'''\'\'\'COI disclosure:\'\'\' I am [[User:{USERNAME}|{USERNAME}]] (Mohammad Saeed Ghezelbash), a co-author of the 2016 Shakeri et al. randomized trial summarized by the 2025 review. I therefore am not editing the article directly and ask an uninvolved editor to assess both the sourcing and due weight of the proposal.

''' + f'''\'\'\'Suggested change:\'\'\' Replace the current Omega-3 subsection with the following concise evidence-focused text. The general efficacy summary is based on two independent secondary sources; my co-authored primary study is included only as a specifically identified trial already discussed and limitation-contextualized by the 2025 secondary review.

<blockquote>{proposed}</blockquote>

''' + f'''\'\'\'Rationale:\'\'\' This would replace an older, partly consumer-sourced subsection with a more current evidence synthesis. The 2016 trial is not used to establish a general treatment recommendation; its result and limitations are presented together and anchored to the independent 2025 review. If an uninvolved editor considers the trial-specific sentence undue, I would support implementing the secondary-source summary without that sentence rather than retaining the current outdated wording.

Current article revision checked before this request: [[Special:Permalink/{article["revid"]}|{article["revid"]}]]. ~~~~'''

result = post({
    "action": "edit",
    "title": TALK,
    "section": "new",
    "sectiontitle": SECTION_TITLE,
    "text": request,
    "summary": "COI disclosed: request independent review of Omega-3 subsection using recent secondary sources",
    "token": csrf(),
    "assert": "user",
    "watchlist": "watch",
    "basetimestamp": talk["timestamp"],
    "starttimestamp": talk["server_time"],
})
edit = result.get("edit", {})
if edit.get("result") != "Success":
    raise RuntimeError(result)

after = page(TALK)
for needle in (META_DOI, REVIEW_DOI, TRIAL_DOI, "Ghezelbash", SECTION_TITLE):
    if needle.lower() not in after["content"].lower():
        raise RuntimeError({"readback_missing": needle})

print(json.dumps({
    "ok": True,
    "mode": "TALK_PAGE_COI_REQUEST_ONLY",
    "article_untouched": True,
    "article_revid": article["revid"],
    "talk_oldrevid": edit.get("oldrevid"),
    "talk_newrevid": edit.get("newrevid"),
    "section_title": SECTION_TITLE,
    "authenticated_as": ui.get("name"),
    "coi_disclosed": True,
    "sources": {
        "secondary_meta_analysis_doi": META_DOI,
        "secondary_review_doi": REVIEW_DOI,
        "primary_trial_doi": TRIAL_DOI,
    },
}, ensure_ascii=False, indent=2, sort_keys=True))
