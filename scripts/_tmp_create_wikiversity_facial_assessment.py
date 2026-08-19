import os, json, time, requests

USER=os.environ['WIKIMEDIA_USERNAME']
PASS=os.environ['WIKIMEDIA_BOT_PASSWORD']
VAPI='https://en.wikiversity.org/w/api.php'
WAPI='https://www.wikidata.org/w/api.php'
TITLE='Facial assessment before aesthetic botulinum toxin treatment'
PERSON='Q140287622'
AUTHOR_ROLE='Q482980'
UA='GhezelbaashWikiversityResource/1.1 (https://www.ghezelbaash.ir/)'

TEXT=r"""{{Medical disclaimer}}

'''Facial assessment before aesthetic botulinum toxin treatment''' is an open learning resource about structured pre-treatment assessment in facial aesthetic practice. It focuses on clinical reasoning before treatment rather than on injection coordinates, fixed dosing recipes, or product-conversion rules. The central principle is that aesthetic botulinum neurotoxin type A (BoNT-A) treatment should follow an individualized assessment of the person, the face at rest and in motion, interacting facial muscle groups, baseline asymmetries, treatment goals, and relevant risk factors.<ref name="sundaram2016">[https://pubmed.ncbi.nlm.nih.gov/26910696/ Sundaram H, et al. Global Aesthetics Consensus: Botulinum Toxin Type A—Evidence-Based Review, Emerging Concepts, and Consensus Recommendations for Aesthetic Use, Including Updates on Complications. ''Plastic and Reconstructive Surgery''. 2016;137(3):518e–529e. doi:10.1097/01.PRS.0000475758.63709.23.]</ref><ref name="integrative2022">[https://pubmed.ncbi.nlm.nih.gov/36322138/ Integrative Assessment for Optimizing Aesthetic Outcomes When Treating Glabellar Lines With Botulinum Toxin Type A: An Appreciation of the Role of the Frontalis. ''Aesthetic Surgery Journal''. 2023;43(3):NP181–NP194. doi:10.1093/asj/sjac267.]</ref>

This resource is intended for advanced learners and healthcare professionals studying facial aesthetics. It does not replace supervised clinical training, local regulation, current product labeling, informed consent, or individualized professional judgment.

== Learning objectives ==
After working through this resource, a learner should be able to:
* distinguish a '''facial assessment''' from a simple wrinkle count;
* explain why observation at both '''rest and animation''' matters;
* recognize that muscles act as an interacting system rather than isolated targets;
* identify baseline features that may influence aesthetic interpretation, including brow position, eyelid characteristics, facial asymmetry, soft-tissue support, and habitual compensatory activity;
* structure a patient-centered history around goals, prior treatments, prior adverse effects, and expectations;
* explain why standardized photographs, expressions, and documentation are useful before treatment;
* identify circumstances in which treatment should be deferred pending further evaluation, clarification, or referral;
* separate assessment principles from product-specific dosing and injection technique.

== 1. Start with the person, not an injection map ==
Aesthetic assessment begins by clarifying what the person is seeking to change and why. A line that is visually prominent to a clinician may not be the patient's principal concern, while a subtler feature may be highly important to that patient. Consensus work in facial aesthetics emphasizes patient-centered goals, realistic expectations, and an individualized treatment journey rather than a standardized procedural template.<ref name="journey2024">[https://pubmed.ncbi.nlm.nih.gov/38327550/ Philipp-Dormston WG, et al. The Patient Journey in Facial Aesthetics: Findings from a European Consensus Meeting on Improving the Quality of Life for Patients Receiving Botulinum Toxin Injections. ''Clinical, Cosmetic and Investigational Dermatology''. 2024;17:329–337. doi:10.2147/CCID.S446891.]</ref>

A useful opening assessment explores:
* the patient's own description of the concern;
* whether the goal is softening movement, changing a line visible at rest, altering a contour, or changing how an expression is perceived;
* the degree of movement the patient wishes to retain;
* prior aesthetic procedures and whether previous results were satisfactory;
* prior unexpected weakness, asymmetry, eyelid or brow change, smile change, swallowing difficulty, or other adverse effects;
* time course of prior BoNT-A exposure and, where known, the product used;
* expectations about onset, duration, symmetry, and the possibility that one modality may not address every component of the concern.

The consultation should also make room for psychosocial context. Body dysmorphic disorder (BDD) is relevant to aesthetic settings, and validated screening instruments exist; however, screening is not the same as making a psychiatric diagnosis. The purpose of recognizing concerning patterns is to improve patient selection and support appropriate referral rather than to label a patient casually.<ref name="bdd2023">[https://pubmed.ncbi.nlm.nih.gov/36878447/ Body dysmorphic disorder: A critical appraisal of diagnostic, screening, and assessment tools. 2023.]</ref><ref name="bddpath2024">[https://pubmed.ncbi.nlm.nih.gov/38216141/ An Evidence-based Pathway for Body Dysmorphic Disorder in Facial Aesthetics. 2024.]</ref>

== 2. Review medical context and treatment suitability ==
Pre-treatment assessment should include a relevant medical and medication history. Exact contraindications and warnings differ by product and jurisdiction, so the current locally approved prescribing information should be consulted rather than relying on a generic checklist.

Areas commonly reviewed before aesthetic BoNT-A treatment include:
* previous hypersensitivity or adverse reaction to a botulinum toxin preparation or formulation component;
* infection or active inflammatory process at a proposed treatment site;
* known neuromuscular disease or symptoms suggesting impaired neuromuscular transmission;
* medicines that may alter neuromuscular transmission, and medicines or supplements relevant to bleeding or bruising risk;
* previous facial surgery, trauma, nerve injury, facial palsy, synkinesis, or other conditions that alter baseline movement;
* pregnancy or lactation, with decisions guided by current evidence, product labeling, local rules, and clinical context rather than assumptions;
* previous treatment elsewhere when product, dose, timing, or injected areas are uncertain.

A recent review of upper-face botulinum toxin practice reiterates that patient evaluation and selection are critical and that understanding anatomy is central to complication prevention.<ref name="upperthird2025">[https://pubmed.ncbi.nlm.nih.gov/40368730/ Botulinum Toxin Use in the Upper Third of the Face. 2025. doi:10.1016/j.otc.2025.02.003.]</ref>

== 3. Observe the face at rest first ==
Assessment at rest establishes the baseline against which dynamic change will be interpreted. Important observations include:
* brow height, shape, and right-left difference;
* upper-eyelid show, dermatochalasis, and apparent or true eyelid/brow ptosis;
* forehead line pattern and whether lines are visible without active frontalis contraction;
* glabellar line depth at rest;
* periorbital line pattern and lower-eyelid position;
* nasal, perioral, chin, jawline, and platysmal asymmetries where those regions are relevant;
* facial proportions, soft-tissue volume, skin quality, and skeletal support that may contribute to a static appearance not primarily driven by muscle activity.

The purpose is not to classify every minor asymmetry as abnormal. Normal faces are asymmetric. The practical question is whether an asymmetry is likely to affect treatment planning, expectation-setting, or interpretation of the result.

== 4. Reassess during standardized animation ==
Static inspection alone cannot reveal how the facial muscle system behaves. Multiple consensus publications recommend evaluating the face both at rest and during animation.<ref name="samcep2023">[https://pubmed.ncbi.nlm.nih.gov/37408173/ SAMCEP Society consensus on the treatment of upper facial lines with botulinum neurotoxin type A: A tailored approach. 2023.]</ref>

Depending on the area being studied, standardized movements may include:
* maximal eyebrow elevation;
* frowning or drawing the brows medially;
* gentle and maximal eye closure;
* spontaneous and posed smiling;
* nasal scrunching;
* lip pursing and other perioral movements;
* chin contraction;
* jaw clenching when masseter activity is relevant;
* platysmal activation when lower-face or neck dynamics are relevant.

The learner should watch for '''sequence, strength, recruitment, compensation, and asymmetry''', not just the final wrinkle pattern. Repeating the same expression can help distinguish a reproducible movement pattern from a transient or poorly understood instruction.

== 5. Think in functional muscle groups ==
Facial muscles interact mechanically and visually. Weakening one component can change the relative dominance of another. This is particularly important in the upper face, where brow position reflects the balance between the frontalis and brow-depressing muscle groups. An integrative assessment of the forehead, glabella, brow, and eyelids therefore provides more information than treating each region as an isolated rectangle.<ref name="integrative2022" />

Questions for the upper face include:
* Is the frontalis contributing to habitual compensation for a low brow or upper-eyelid heaviness?
* Is frontalis recruitment symmetric?
* Does one brow elevate earlier or farther than the other?
* Is the patient's desired brow shape compatible with baseline anatomy and muscle recruitment?
* Are glabellar lines primarily dynamic, or is there a substantial static component?
* Does maximal smiling change lower-eyelid or lateral canthal behavior in a way that should be documented?

The same relational principle applies beyond the upper face. Lower-face movement involves multiple elevators, depressors, sphincters, and stabilizers with roles in expression and oral competence. Lower-face treatment is generally considered more anatomically demanding and should not be reduced to isolated line chasing.<ref name="lowerface2017">[https://pubmed.ncbi.nlm.nih.gov/28841604/ de Maio M, et al. Facial Assessment and Injection Guide for Botulinum Toxin and Injectable Hyaluronic Acid Fillers: Focus on the Lower Face. ''Plastic and Reconstructive Surgery''. 2017;140(3):393e–404e. doi:10.1097/PRS.0000000000003646.]</ref>

== 6. Identify compensation before modifying it ==
A muscle can be active because it is the primary source of an unwanted expression, because it is compensating for another structural or functional feature, or both. Examples include:
* persistent frontalis activity helping maintain brow position;
* asymmetric frontalis recruitment compensating for baseline brow asymmetry;
* altered smile mechanics after dental, neurologic, surgical, or traumatic change;
* asymmetric lower-face recruitment associated with previous facial nerve dysfunction;
* platysmal or chin recruitment that becomes more visible when another movement pattern changes.

A pre-treatment record should distinguish what is visible '''before''' treatment from what emerges after the balance of forces changes.

== 7. Separate dynamic and static components ==
BoNT-A changes neuromuscular activity; it does not directly restore lost volume, alter bone structure, or erase every static crease. The relative contributions of movement, skin quality, soft-tissue volume, ligamentous support, and skeletal anatomy should therefore be considered before deciding what a realistic outcome would look like.

This distinction supports more accurate counseling:
* a predominantly dynamic line may change differently from a deeply etched static line;
* a contour concern may involve volume or structural factors in addition to muscle activity;
* a perceived asymmetry may persist because it is partly skeletal or soft-tissue based;
* the optimal endpoint may be '''controlled movement''' rather than maximal immobility.

== 8. Use standardized documentation ==
Good baseline documentation improves communication, follow-up comparison, and interpretation of unexpected outcomes. With appropriate consent and privacy safeguards, standardized photography can include:
* frontal face at rest;
* oblique or lateral views when relevant;
* standardized maximal expressions corresponding to the regions being assessed;
* consistent camera distance, head position, lighting, and facial instruction when feasible.

Clinical notes can record:
* principal patient goals in the patient's own words;
* relevant history and previous treatment experience;
* baseline asymmetries;
* key findings at rest and in motion;
* discussion of limitations and alternatives;
* the agreed treatment objective rather than only the planned procedure.

== 9. A compact pre-treatment assessment framework ==
The following mnemonic is a learning aid, not a validated clinical instrument.

{| class="wikitable"
! Domain !! Questions
|-
| '''G — Goals''' || What does the patient want to change? What movement do they want to preserve?
|-
| '''H — History''' || Previous BoNT-A, adverse effects, surgery, neurologic history, medications, relevant health context?
|-
| '''R — Rest''' || Baseline brow, eyelid, lines, asymmetry, skin/soft-tissue/skeletal context?
|-
| '''A — Animation''' || What changes with standardized expression? Which muscles recruit, compensate, or differ side to side?
|-
| '''P — Proportions and relationships''' || How do adjacent regions and opposing muscle groups interact?
|-
| '''H — Harm reduction''' || Are there reasons to defer, seek more information, refer, or use a different strategy?
|-
| '''D — Documentation''' || Are goals, photographs, asymmetries, consent discussion, and baseline findings recorded?
|}

== 10. Worked reasoning examples ==
These examples illustrate assessment logic only and intentionally omit injection points and doses.

=== Example A: forehead lines with low resting brow ===
A patient requests complete removal of forehead movement. At rest, the brow sits relatively low and the frontalis is mildly active even before the patient is asked to raise the eyebrows. During animation, frontalis recruitment is strong and appears to contribute to maintaining brow position.

'''Learning point:''' the forehead should not be interpreted in isolation. Baseline brow position, eyelid characteristics, and compensatory frontalis activity should be documented and discussed before any decision about modifying movement.<ref name="integrative2022" />

=== Example B: asymmetric glabellar recruitment ===
At rest, the brows are mildly asymmetric. During frowning, one side recruits earlier and more strongly. The patient had not noticed the asymmetry before the consultation.

'''Learning point:''' documenting pre-existing asymmetry is essential. Symmetry of treatment does not necessarily mean identical treatment of inherently asymmetric anatomy, and a post-treatment difference should be interpreted against the pre-treatment baseline.

=== Example C: dissatisfaction with a previous “frozen” result ===
A patient reports that a previous treatment reduced lines but made facial expression feel unnatural. Their new goal is softer movement rather than maximal line elimination.

'''Learning point:''' outcome quality is partly defined by the patient's goal. A technically visible reduction in movement is not automatically equivalent to patient satisfaction.<ref name="journey2024" />

== 11. What this resource deliberately does not provide ==
This learning resource does '''not''' provide:
* fixed injection coordinates;
* universal doses;
* conversion ratios between BoNT-A products;
* instructions for unlicensed practice;
* a substitute for anatomy training, supervised procedural education, or product-specific prescribing information.

Different BoNT-A preparations are not simply interchangeable by a universal unit-conversion rule, and published consensus recommendations repeatedly emphasize individualized anatomy and product-specific practice.<ref name="abobot2012">[https://pubmed.ncbi.nlm.nih.gov/22941910/ Current aesthetic use of abobotulinumtoxinA in clinical practice: an evidence-based consensus review. 2012.]</ref>

== 12. Self-assessment questions ==
# Why can strong resting frontalis activity be clinically meaningful before aesthetic treatment?
# What information is added by observing a face during animation rather than only at rest?
# Give three examples of baseline asymmetry that should be documented.
# Why should a static etched line not automatically be interpreted as a pure muscle-activity problem?
# What is the difference between BDD screening and diagnosing BDD?
# Why is a patient goal such as “retain natural movement” clinically relevant to assessment?
# Why should product-specific contraindications and warnings be checked in current local labeling?

== 13. Suggested learning activity ==
Using standardized, consented photographs or a teaching model, create a one-page assessment note containing:
# the stated aesthetic goal;
# observations at rest;
# observations during two or more standardized expressions;
# a description of any right-left difference;
# an explanation of at least one interacting muscle relationship;
# one factor that could limit the expected result;
# one reason treatment might need to be deferred or additional information obtained.

The exercise is complete when another learner can understand the baseline facial pattern without being told an injection plan.

== Evidence overview ==
The assessment model in this resource is consistent with recurring themes across consensus statements and reviews: individualized treatment, evaluation at rest and animation, attention to functional anatomy and interacting muscle groups, patient-centered goals, and structured follow-up.<ref name="sundaram2016" /><ref name="samcep2023" /><ref name="journey2024" /> A 2026 systematic review of upper-face aesthetic BoNT-A studies also reported substantial heterogeneity across clinical outcomes and emphasized the need for stronger evidence-driven standardization of outcome assessment.<ref name="meta2026">[https://pubmed.ncbi.nlm.nih.gov/41508559/ Cosmetic Botulinum Toxin A Injections to the Upper Face: A Systematic Review and Meta-Analysis of Clinical Studies. 2026.]</ref>

== Related learning resources ==
* [[Botulinum toxin in aesthetic medicine]]
* [[School:Medicine]]
* [[Wikiversity:Medical disclaimer]]

== Author and provenance ==
This resource was developed by [[d:Q140287622|Saeed Ghezelbash]] as an openly licensed Wikiversity learning resource. It synthesizes published literature for educational use and is intended to remain open to collaborative improvement. The author attribution describes contribution to this learning resource and does not imply that Wikiversity endorses any individual, clinic, product, or treatment approach.

== References ==
<references />

[[Category:Medicine]]
[[Category:Learning resources]]
"""

def login(api):
    s=requests.Session(); s.headers.update({'User-Agent':UA})
    def get(**p):
        p.update(format='json',formatversion=2)
        r=s.get(api,params=p,timeout=60); r.raise_for_status(); d=r.json()
        if 'error' in d: raise RuntimeError(d['error'])
        return d
    def post(**p):
        p.update(format='json',formatversion=2)
        r=s.post(api,data=p,timeout=90); r.raise_for_status(); d=r.json()
        if 'error' in d: raise RuntimeError(d['error'])
        return d
    lt=get(action='query',meta='tokens',type='login')['query']['tokens']['logintoken']
    lr=post(action='login',lgname=USER,lgpassword=PASS,lgtoken=lt)
    if lr.get('login',{}).get('result')!='Success': raise RuntimeError(lr)
    return s,get,post

def item_value(q):
    return json.dumps({'entity-type':'item','numeric-id':int(q[1:]),'id':q})

def mono(text,lang='en'):
    return json.dumps({'text':text,'language':lang},ensure_ascii=False)

def same_item(c,qid):
    v=c.get('mainsnak',{}).get('datavalue',{}).get('value')
    return isinstance(v,dict) and v.get('id')==qid

sv,gv,pv=login(VAPI)
page=gv(action='query',titles=TITLE,prop='info|pageprops|revisions',inprop='url',rvprop='ids|timestamp|user|comment|content',rvslots='main',rvlimit=1)['query']['pages'][0]
created_page=False
if page.get('missing'):
    token=gv(action='query',meta='tokens',type='csrf')['query']['tokens']['csrftoken']
    er=pv(action='edit',title=TITLE,text=TEXT,createonly=1,token=token,summary='Create evidence-based learning resource on structured facial assessment before aesthetic botulinum toxin treatment')
    if er.get('edit',{}).get('result')!='Success': raise RuntimeError(er)
    created_page=True
    time.sleep(3)
else:
    content=((page.get('revisions') or [{}])[0].get('slots',{}).get('main',{}).get('content',''))
    if '[[d:Q140287622|Saeed Ghezelbash]]' not in content or 'A compact pre-treatment assessment framework' not in content:
        raise RuntimeError('Existing page does not match this resource; refusing to overwrite')

pv(action='purge',titles=TITLE,forcelinkupdate=1)
time.sleep(2)
page=gv(action='query',titles=TITLE,prop='info|pageprops|revisions',inprop='url',rvprop='ids|timestamp|user|comment|content',rvslots='main',rvlimit=1)['query']['pages'][0]
rev=(page.get('revisions') or [{}])[0]
page_url=page.get('fullurl'); rev_ts=rev.get('timestamp')
if not page_url or not rev_ts: raise RuntimeError('Missing page URL or revision timestamp')
y,m,d=map(int,rev_ts[:10].split('-'))
time_value={'time':f'+{y:04d}-{m:02d}-{d:02d}T00:00:00Z','timezone':0,'before':0,'after':0,'precision':11,'calendarmodel':'http://www.wikidata.org/entity/Q1985727'}

sw,gw,pw=login(WAPI)
wdtoken=gw(action='query',meta='tokens',type='csrf')['query']['tokens']['csrftoken']
lookup=gw(action='wbgetentities',sites='enwikiversity',titles=TITLE,props='info|sitelinks|claims|labels|descriptions')
existing=[(q,e) for q,e in lookup.get('entities',{}).items() if q!='-1' and not e.get('missing')]
created_item=False
if existing:
    qid=existing[0][0]
else:
    data={
        'labels':{'en':{'language':'en','value':TITLE}},
        'descriptions':{'en':{'language':'en','value':'Wikiversity learning resource on structured facial assessment before aesthetic botulinum toxin treatment'}},
        'aliases':{'en':[{'language':'en','value':'Facial assessment before aesthetic BoNT-A treatment'},{'language':'en','value':'Pre-treatment facial assessment for aesthetic botulinum toxin'}]},
        'sitelinks':{'enwikiversity':{'site':'enwikiversity','title':TITLE,'badges':[]}}
    }
    cr=pw(action='wbeditentity',new='item',data=json.dumps(data,ensure_ascii=False),token=wdtoken,summary='Create item for Wikiversity open educational resource')
    qid=cr.get('entity',{}).get('id')
    if not qid: raise RuntimeError(cr)
    created_item=True
    time.sleep(2)

retrieved=time_value

def add_reference(guid,url):
    snaks={
        'P854':[{'snaktype':'value','property':'P854','datavalue':{'value':url,'type':'string'}}],
        'P813':[{'snaktype':'value','property':'P813','datavalue':{'value':retrieved,'type':'time'}}]
    }
    rr=pw(action='wbsetreference',statement=guid,snaks=json.dumps(snaks),token=wdtoken,summary='Add source reference')
    if not rr.get('reference'): raise RuntimeError(rr)

def ensure_claim(prop,value,kind='item',ref_url=None,qualifiers=None):
    ent=gw(action='wbgetentities',ids=qid,props='claims')['entities'][qid]
    claims=ent.get('claims',{}).get(prop,[])
    found=None
    for c in claims:
        v=c.get('mainsnak',{}).get('datavalue',{}).get('value')
        if kind=='item' and isinstance(v,dict) and v.get('id')==value:
            found=c
        elif kind=='mono' and isinstance(v,dict) and v.get('text')==value and v.get('language')=='en':
            found=c
        elif kind=='time' and isinstance(v,dict) and v.get('time')==value['time']:
            found=c
    if found:
        return found['id']
    payload=item_value(value) if kind=='item' else mono(value) if kind=='mono' else json.dumps(value)
    cr=pw(action='wbcreateclaim',entity=qid,property=prop,snaktype='value',value=payload,token=wdtoken,summary=f'Add {prop} to Wikiversity learning resource')
    claim=cr.get('claim')
    if not claim: raise RuntimeError(cr)
    guid=claim['id']
    for qp,qkind,qval in (qualifiers or []):
        qpayload=item_value(qval) if qkind=='item' else json.dumps(qval)
        qr=pw(action='wbsetqualifier',claim=guid,property=qp,snaktype='value',value=qpayload,token=wdtoken,summary='Add qualifier')
        if not qr.get('claim'): raise RuntimeError(qr)
    if ref_url: add_reference(guid,ref_url)
    return guid

ensure_claim('P31','Q116781','item',page_url)
ensure_claim('P31','Q386724','item',page_url)
ensure_claim('P1476',TITLE,'mono',page_url)
ensure_claim('P50',PERSON,'item',page_url,qualifiers=[('P1545','string','1')])
ensure_claim('P407','Q1860','item',page_url)
ensure_claim('P275','Q18199165','item','https://foundation.wikimedia.org/wiki/Terms_of_Use')
ensure_claim('P921','Q4095199','item',page_url)
ensure_claim('P921','Q3332453','item',page_url)
ensure_claim('P577',time_value,'time',page_url)

person=gw(action='wbgetentities',ids=PERSON,props='claims')['entities'][PERSON]
back=None
for c in person.get('claims',{}).get('P3919',[]):
    if same_item(c,qid): back=c
if not back:
    cr=pw(action='wbcreateclaim',entity=PERSON,property='P3919',snaktype='value',value=item_value(qid),token=wdtoken,summary='Add contribution to Wikiversity facial assessment learning resource')
    back=cr.get('claim')
    if not back: raise RuntimeError(cr)
    qr=pw(action='wbsetqualifier',claim=back['id'],property='P2868',snaktype='value',value=item_value(AUTHOR_ROLE),token=wdtoken,summary='Qualify contribution role as author')
    if not qr.get('claim'): raise RuntimeError(qr)
    add_reference(back['id'],page_url)
else:
    roles=[]
    for sn in back.get('qualifiers',{}).get('P2868',[]):
        v=sn.get('datavalue',{}).get('value',{})
        if isinstance(v,dict): roles.append(v.get('id'))
    if AUTHOR_ROLE not in roles:
        qr=pw(action='wbsetqualifier',claim=back['id'],property='P2868',snaktype='value',value=item_value(AUTHOR_ROLE),token=wdtoken,summary='Qualify contribution role as author')
        if not qr.get('claim'): raise RuntimeError(qr)

# Propagate and verify
time.sleep(4)
pv(action='purge',titles=TITLE,forcelinkupdate=1)
time.sleep(2)
page2=gv(action='query',titles=TITLE,prop='info|pageprops|revisions',inprop='url',rvprop='ids|timestamp|user|comment|content',rvslots='main',rvlimit=1)['query']['pages'][0]
ent=gw(action='wbgetentities',ids=qid,props='claims|sitelinks|labels|descriptions')['entities'][qid]
person2=gw(action='wbgetentities',ids=PERSON,props='claims')['entities'][PERSON]

def ids(prop):
    out=[]
    for c in ent.get('claims',{}).get(prop,[]):
        v=c.get('mainsnak',{}).get('datavalue',{}).get('value')
        out.append(v.get('id') if isinstance(v,dict) and 'id' in v else v)
    return out

backedges=[]
for c in person2.get('claims',{}).get('P3919',[]):
    if same_item(c,qid):
        roles=[]
        for sn in c.get('qualifiers',{}).get('P2868',[]):
            v=sn.get('datavalue',{}).get('value',{})
            roles.append(v.get('id') if isinstance(v,dict) else v)
        backedges.append({'guid':c.get('id'),'roles':roles,'references':len(c.get('references',[]))})

content=((page2.get('revisions') or [{}])[0].get('slots',{}).get('main',{}).get('content',''))
checks={
    'page_exists':not page2.get('missing',False),
    'page_substantial':len(content)>9000,
    'page_disclaimer':'{{Medical disclaimer}}' in content,
    'page_author_link':'[[d:Q140287622|Saeed Ghezelbash]]' in content,
    'wikibase_item':(page2.get('pageprops') or {}).get('wikibase_item')==qid,
    'sitelink':ent.get('sitelinks',{}).get('enwikiversity',{}).get('title')==TITLE,
    'p31_oer':'Q116781' in ids('P31'),
    'p31_work':'Q386724' in ids('P31'),
    'author_forward':PERSON in ids('P50'),
    'language':'Q1860' in ids('P407'),
    'license':'Q18199165' in ids('P275'),
    'bont_topic':'Q4095199' in ids('P921'),
    'aesthetic_topic':'Q3332453' in ids('P921'),
    'person_back_edge':len(backedges)==1 and AUTHOR_ROLE in backedges[0]['roles']
}
out={'ok':all(checks.values()),'title':TITLE,'pageid':page2.get('pageid'),'page_url':page2.get('fullurl'),'page_revision':(page2.get('revisions') or [{}])[0].get('revid'),'qid':qid,'wikidata_url':'https://www.wikidata.org/wiki/'+qid,'created_page':created_page,'created_item':created_item,'checks':checks,'backedges':backedges,'content_length':len(content)}
print(json.dumps(out,ensure_ascii=False,indent=2))
if not out['ok']: raise RuntimeError(out)
