#!/usr/bin/env python3
import json, os, time, requests

WD='https://www.wikidata.org/w/api.php'
UA='GhezelbaashWikidataClinicRepair/1.0 (https://www.ghezelbaash.ir/)'
USER=os.environ['WIKIMEDIA_USERNAME']
PASS=os.environ['WIKIMEDIA_BOT_PASSWORD']
CLINIC='Q140288589'; PERSON='Q140287622'
OLD_GENERIC_POSITION='Q256688'
POSITION_CLASS='Q4164871'; DIRECTOR='Q1162163'; GOOGLE_KG='Q648625'
SOURCE='https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah'
DATE='+2026-08-20T00:00:00Z'
CLINIC_NAMED='Dr. Saeed Ghezelbash Aesthetic Clinic — کلینیک زیبایی دکتر سعید قزلباش'
ROLE_NAMED='Director / Manager / مدیر'
PERSON_NAMED='Dr. Saeed Ghezelbash — دکتر سعید قزلباش'
POSITION_LABEL='director of Dr. Saeed Ghezelbash Aesthetic Clinic'
POSITION_LABEL_FA='مدیر کلینیک زیبایی دکتر سعید قزلباش'

s=requests.Session(); s.headers.update({'User-Agent':UA})
def get(**p):
    p.update(format='json',formatversion=2)
    r=s.get(WD,params=p,timeout=60); r.raise_for_status(); d=r.json()
    if 'error' in d: raise RuntimeError(d['error'])
    return d

def post(**p):
    p.update(format='json',formatversion=2)
    r=s.post(WD,data=p,timeout=90); r.raise_for_status(); d=r.json()
    if 'error' in d: raise RuntimeError(d['error'])
    return d

lt=get(action='query',meta='tokens',type='login')['query']['tokens']['logintoken']
lr=post(action='login',lgname=USER,lgpassword=PASS,lgtoken=lt)
if lr.get('login',{}).get('result')!='Success': raise RuntimeError(lr)
csrf=get(action='query',meta='tokens',type='csrf')['query']['tokens']['csrftoken']

def ent(qids):
    return get(action='wbgetentities',ids='|'.join(qids),props='labels|descriptions|claims')['entities']
def item_json(q): return json.dumps({'entity-type':'item','numeric-id':int(q[1:]),'id':q},separators=(',',':'))
def string_json(x): return json.dumps(x,ensure_ascii=False,separators=(',',':'))
def time_snak():
    return {'snaktype':'value','property':'P813','datavalue':{'value':{'time':DATE,'timezone':0,'before':0,'after':0,'precision':11,'calendarmodel':'http://www.wikidata.org/entity/Q1985727'},'type':'time'},'datatype':'time'}
def item_snak(prop,q):
    return {'snaktype':'value','property':prop,'datavalue':{'value':{'entity-type':'item','numeric-id':int(q[1:]),'id':q},'type':'wikibase-entityid'},'datatype':'wikibase-item'}
def str_snak(prop,x):
    return {'snaktype':'value','property':prop,'datavalue':{'value':x,'type':'string'},'datatype':'string'}
def url_snak(url):
    return {'snaktype':'value','property':'P854','datavalue':{'value':url,'type':'string'},'datatype':'url'}
def extid_snak(prop,x):
    return {'snaktype':'value','property':prop,'datavalue':{'value':x,'type':'string'},'datatype':'external-id'}

def create_claim(entity,prop,value,summary):
    d=post(action='wbcreateclaim',entity=entity,property=prop,snaktype='value',value=value,summary=summary,token=csrf,**{'assert':'user'})
    return d['claim']['id']
def set_qual(guid,prop,value):
    post(action='wbsetqualifier',claim=guid,property=prop,snaktype='value',value=string_json(value),token=csrf,**{'assert':'user'})
def set_ref(guid,snaks,summary):
    payload={k:v for k,v in snaks.items()}
    post(action='wbsetreference',statement=guid,snaks=json.dumps(payload,ensure_ascii=False,separators=(',',':')),summary=summary,token=csrf,**{'assert':'user'})
def source_ref(guid,summary):
    set_ref(guid,{'P854':[url_snak(SOURCE)],'P813':[time_snak()]},summary)

def claim_values(e,prop):
    out=[]
    for c in e.get('claims',{}).get(prop,[]):
        try: out.append((c['id'],c['mainsnak']['datavalue']['value']['id']))
        except Exception: pass
    return out

def ensure_item_claim(q,prop,target,summary,subj_named=None,obj_named=None,reference=True):
    e=ent([q])[q]
    matches=[g for g,v in claim_values(e,prop) if v==target]
    if len(matches)>1: raise RuntimeError({'duplicate_claim':q,'property':prop,'target':target,'guids':matches})
    if matches: return matches[0],False
    g=create_claim(q,prop,item_json(target),summary)
    if subj_named: set_qual(g,'P1810',subj_named)
    if obj_named: set_qual(g,'P1932',obj_named)
    if reference: source_ref(g,summary+'; cite clinic identity block')
    return g,True

before=ent([CLINIC,PERSON])
clinic_before=before[CLINIC]; person_before=before[PERSON]
p2388=claim_values(clinic_before,'P2388')
if len(p2388)!=1:
    raise RuntimeError({'expected_single_clinic_P2388':p2388})
old_guid,old_value=p2388[0]
if old_value!=OLD_GENERIC_POSITION:
    # Allow idempotent rerun only if this is already a specific position pointing back to clinic.
    candidate=ent([old_value])[old_value]
    if CLINIC not in [v for _,v in claim_values(candidate,'P2389')]:
        raise RuntimeError({'unexpected_existing_clinic_P2388':p2388})
    POS=old_value; created_position=False
else:
    # Reuse an exact existing structural position if a prior partial run created one.
    sr=get(action='wbsearchentities',search=POSITION_LABEL,language='en',type='item',limit=10)
    POS=None
    for r in sr.get('search',[]):
        q=r['id']; ce=ent([q])[q]
        if CLINIC in [v for _,v in claim_values(ce,'P2389')]: POS=q; break
    if POS is None:
        data={'labels':{'en':{'language':'en','value':POSITION_LABEL},'fa':{'language':'fa','value':POSITION_LABEL_FA}},
              'descriptions':{'en':{'language':'en','value':'director position of Dr. Saeed Ghezelbash Aesthetic Clinic in Kermanshah'},
                              'fa':{'language':'fa','value':'سمت مدیریت کلینیک زیبایی دکتر سعید قزلباش در کرمانشاه'}}}
        cr=post(action='wbeditentity',new='item',data=json.dumps(data,ensure_ascii=False,separators=(',',':')),summary='Create structurally needed organization-specific director position',token=csrf,**{'assert':'user'})
        POS=cr['entity']['id']; created_position=True
    else: created_position=False

# Position ontology and inverse edges.
ensure_item_claim(POS,'P31',POSITION_CLASS,'Model this entity as a position',reference=False)
ensure_item_claim(POS,'P279',DIRECTOR,'Classify the specific office under director',reference=False)
pos_p2389,_=ensure_item_claim(POS,'P2389',CLINIC,'Link the director position to the organization it directs',ROLE_NAMED,CLINIC_NAMED,True)
pos_p1308,_=ensure_item_claim(POS,'P1308',PERSON,'Link the specific director position to its current holder',ROLE_NAMED,PERSON_NAMED,True)

# Replace generic clinic head-position value with specific position, preserving exact source wording via subject/object named-as.
clinic_now=ent([CLINIC])[CLINIC]
current=claim_values(clinic_now,'P2388')
if len(current)==1 and current[0][1]==OLD_GENERIC_POSITION:
    post(action='wbremoveclaims',claim=current[0][0],summary='Replace generic medical-director class with organization-specific director position',token=csrf,**{'assert':'user'})
    new_p2388=create_claim(CLINIC,'P2388',item_json(POS),'Use organization-specific director position so inverse modeling is exact')
    set_qual(new_p2388,'P1810',CLINIC_NAMED)
    set_qual(new_p2388,'P1932',ROLE_NAMED)
    source_ref(new_p2388,'Source exact clinic and director wording')
elif len(current)==1 and current[0][1]==POS:
    new_p2388=current[0][0]
else:
    raise RuntimeError({'unexpected_P2388_during_replace':current,'position':POS})

# Add the matching person-side position held edge and inverse holder edge already exists on position.
p39_guid,_=ensure_item_claim(PERSON,'P39',POS,'Add current director position held at the clinic',PERSON_NAMED,ROLE_NAMED,True)

# Rebuild clinic Google KG reference using structured source metadata, removing the warning-prone search URL reference.
clinic_now=ent([CLINIC])[CLINIC]
kg=clinic_now.get('claims',{}).get('P2671',[])
if len(kg)!=1: raise RuntimeError({'expected_single_clinic_P2671':len(kg)})
kgc=kg[0]; kgid=kgc['mainsnak']['datavalue']['value']
if kgid!='/g/11r3rzdtb3': raise RuntimeError({'unexpected_clinic_kgid':kgid})
hashes=[r.get('hash') for r in kgc.get('references',[]) if r.get('hash')]
if hashes:
    post(action='wbremovereferences',statement=kgc['id'],references='|'.join(hashes),summary='Replace Google search URL reference with structured Knowledge Graph provenance',token=csrf,**{'assert':'user'})
set_ref(kgc['id'],{'P248':[item_snak('P248',GOOGLE_KG)],'P2671':[extid_snak('P2671',kgid)],'P813':[time_snak()]},'Use structured Google Knowledge Graph provenance')

time.sleep(2)
# Post-write verification.
after=ent([CLINIC,PERSON,POS])
cl=after[CLINIC]; pe=after[PERSON]; po=after[POS]
cv=claim_values(cl,'P2388'); pv=claim_values(po,'P2389'); hv=claim_values(po,'P1308'); p39=claim_values(pe,'P39')
if cv!=[(new_p2388,POS)]: raise RuntimeError({'clinic_P2388_verify':cv,'expected':POS})
if CLINIC not in [v for _,v in pv]: raise RuntimeError({'position_P2389_verify':pv})
if PERSON not in [v for _,v in hv]: raise RuntimeError({'position_P1308_verify':hv})
if POS not in [v for _,v in p39]: raise RuntimeError({'person_P39_verify':p39})

# Verify named-as direction on the clinic statement.
claim_obj=next(c for c in cl['claims']['P2388'] if c['id']==new_p2388)
def qvals(c,p):
    return [x.get('datavalue',{}).get('value') for x in c.get('qualifiers',{}).get(p,[])]
if qvals(claim_obj,'P1810') != [CLINIC_NAMED]: raise RuntimeError({'P1810_verify':qvals(claim_obj,'P1810')})
if qvals(claim_obj,'P1932') != [ROLE_NAMED]: raise RuntimeError({'P1932_verify':qvals(claim_obj,'P1932')})

kgc2=after[CLINIC]['claims']['P2671'][0]
refs=kgc2.get('references',[])
if len(refs)!=1: raise RuntimeError({'kg_reference_count':len(refs)})
props=set(refs[0].get('snaks',{}))
if props != {'P248','P2671','P813'}: raise RuntimeError({'kg_reference_props':sorted(props)})

# The Hugging Face organization ID is intentionally preserved: it is live/correct; current P12201 regex disallows hyphens upstream.
hf=after[CLINIC].get('claims',{}).get('P12201',[])
if len(hf)!=1 or hf[0]['mainsnak']['datavalue']['value']!='doctor-ghezelbaash': raise RuntimeError('Hugging Face ID drifted unexpectedly')

print(json.dumps({'ok':True,'specific_position':POS,'created_position':created_position,
 'clinic_P2388':new_p2388,'position_P2389':pos_p2389,'position_P1308':pos_p1308,'person_P39':p39_guid,
 'named_as':{'clinic_subject_P1810':CLINIC_NAMED,'position_object_P1932':ROLE_NAMED},
 'google_kg_reference_properties':sorted(props),
 'hugging_face':{'value':'doctor-ghezelbaash','kept':True,'note':'valid live handle; Wikidata P12201 format constraint currently rejects hyphenated handles'},
 'verified':{'inverse_clinic_position':True,'inverse_person_holder':True,'subject_object_named_as_direction':True,'google_kg_reference_rebuilt':True}},ensure_ascii=False,indent=2))
