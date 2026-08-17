#!/usr/bin/env python3
import re
import pywikibot

ARTICLE = "Treatment of bipolar disorder"
TALK = "Talk:Treatment of bipolar disorder"
SECTION_TITLE = "COI edit request: update Omega-3 evidence with recent secondary sources"
META_DOI = "10.1111/bdi.13115"
REVIEW_DOI = "10.3390/md23020084"
TRIAL_DOI = "10.4103/2008-7802.182734"
EXPECTED_USER = "Medicaldoctor91"

site = pywikibot.Site("en", "wikipedia")
site.login()
username = site.user()
if username != EXPECTED_USER:
    raise RuntimeError(f"Refusing to edit as unexpected account: {username!r}")

article = pywikibot.Page(site, ARTICLE)
talk = pywikibot.Page(site, TALK)
if not article.exists() or not talk.exists():
    raise RuntimeError("Required page missing")

article_text = article.text
talk_text = talk.text

# Hard duplicate guard: never create a second request.
for needle in (
    META_DOI,
    REVIEW_DOI,
    TRIAL_DOI,
    "Ghezelbash",
    "update Omega-3 evidence with recent secondary sources",
):
    if needle.lower() in talk_text.lower():
        raise RuntimeError(f"Duplicate request guard triggered by: {needle}")

# Refuse if an independent editor has already updated the article with any proposed source.
if any(doi.lower() in article_text.lower() for doi in (META_DOI, REVIEW_DOI, TRIAL_DOI)):
    raise RuntimeError("Article already contains one of the proposed sources; refusing stale request")

match = re.search(
    r"(?ms)^===\s*Omega-3 fatty acids\s*===\s*(.*?)(?=^===|^==[^=]|\Z)",
    article_text,
)
if not match or "A 2008 [[Cochrane Collaboration|Cochrane]] systematic review" not in match.group(1):
    raise RuntimeError("Target Omega-3 subsection changed; refusing stale request")

article_revid = article.latest_revision_id

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

''' + f'''\'\'\'COI disclosure:\'\'\' I am [[User:{EXPECTED_USER}|{EXPECTED_USER}]] (Mohammad Saeed Ghezelbash), a co-author of the 2016 Shakeri et al. randomized trial summarized by the 2025 review. I therefore am not editing the article directly and ask an uninvolved editor to assess both the sourcing and due weight of the proposal.

''' + f'''\'\'\'Suggested change:\'\'\' Replace the current Omega-3 subsection with the following concise evidence-focused text. The general efficacy summary is based on two independent secondary sources; my co-authored primary study is included only as a specifically identified trial already discussed and limitation-contextualized by the 2025 secondary review.

<blockquote>{proposed}</blockquote>

''' + f'''\'\'\'Rationale:\'\'\' This would replace an older, partly consumer-sourced subsection with a more current evidence synthesis. The 2016 trial is not used to establish a general treatment recommendation; its result and limitations are presented together and anchored to the independent 2025 review. If an uninvolved editor considers the trial-specific sentence undue, I would support implementing the secondary-source summary without that sentence rather than retaining the current outdated wording.

Current article revision checked before this request: [[Special:Permalink/{article_revid}|{article_revid}]]. ~~~~'''

new_section = f"\n\n== {SECTION_TITLE} ==\n{request}\n"
talk.text = talk_text.rstrip() + new_section
summary = "COI disclosed: request independent review of Omega-3 subsection using recent secondary sources"
talk.save(summary=summary, minor=False, botflag=False, watch="watch")

# Read back and prove success.
talk.get(force=True)
for needle in (META_DOI, REVIEW_DOI, TRIAL_DOI, "Ghezelbash", SECTION_TITLE):
    if needle.lower() not in talk.text.lower():
        raise RuntimeError(f"Readback verification failed for: {needle}")

print("SUCCESS")
print("Article untouched:", ARTICLE)
print("Talk page updated:", TALK)
print("Authenticated as:", username)
print("New talk revision:", talk.latest_revision_id)
