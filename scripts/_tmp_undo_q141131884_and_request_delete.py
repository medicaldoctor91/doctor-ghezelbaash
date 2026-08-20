#!/usr/bin/env python3
import json, os, requests, time

WD='https://www.wikidata.org/w/api.php'
UA='GhezelbaashWikidataUndo/1.0 (https://www.ghezelbaash.ir/)'
USER=os.environ['WIKIMEDIA_USERNAME']
PASS=os.environ['WIKIMEDIA_BOT_PASSWORD']
TARGET='Q141131884'
CLINIC='Q140288589'
PERSON='Q140287622'
RFD='Wikidata:Requests for deletions'

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
ui=get(action='query',meta='userinfo',uiprop='groups|rights')['query']['userinfo']
rights=set(ui.get('rights',[]))
csrf=get(action='query',meta='tokens',type='csrf')['query']['tokens']['csrftoken']

def entities(ids):
    return get(action='wbgetentities',ids='|'.join(ids),props='labels|descriptions|claims|sitelinks')['entities']

def item_value(c):
    try:
        v=c['mainsnak']['datavalue']['value']
        return v.get('id') if isinstance(v,dict) else None
    except Exception:
        return None

def claims_pointing_to(e,target):
    out=[]
    for prop,claims in e.get('claims',{}).items():
        for c in claims:
            if item_value(c)==target:
                out.append((prop,c['id']))
    return out

before=entities([CLINIC,PERSON,TARGET])
# Safety: the direct manager relation must already exist before removing the erroneous intermediary links.
direct=[]
for c in before[CLINIC].get('claims',{}).get('P1037',[]):
    if item_value(c)==PERSON:
        direct.append(c['id'])
if not direct:
    raise RuntimeError('Refusing to unlink intermediary: direct clinic P1037 -> person relation is missing')

removed=[]
for q in [CLINIC,PERSON]:
    refs=claims_pointing_to(before[q],TARGET)
    for prop,guid in refs:
        # Only links introduced by the mistaken position model are expected. Fail on unexpected properties.
        if (q==CLINIC and prop!='P2388') or (q==PERSON and prop!='P39'):
            raise RuntimeError({'unexpected_incoming_target_link':q,'property':prop,'guid':guid})
        post(action='wbremoveclaims',claim=guid,
             summary='Undo erroneous link to unnecessary self-created office item Q141131884; keep direct clinic-to-person manager relation',
             token=csrf,**{'assert':'user'})
        removed.append({'entity':q,'property':prop,'guid':guid})

# Verify core entities no longer point to the erroneous item and direct P1037 remains.
time.sleep(1)
after=entities([CLINIC,PERSON,TARGET])
for q in [CLINIC,PERSON]:
    leftovers=claims_pointing_to(after[q],TARGET)
    if leftovers:
        raise RuntimeError({'target_links_still_present':q,'links':leftovers})
direct_after=[c['id'] for c in after[CLINIC].get('claims',{}).get('P1037',[]) if item_value(c)==PERSON]
if not direct_after:
    raise RuntimeError('Direct clinic P1037 -> person relation disappeared unexpectedly')

# Do not blank the item before deletion; Wikidata RfD guidance explicitly says not to do that.
# Delete directly only if this account actually has delete rights; otherwise file the official RfD.
deleted=False
rfd_added=False
rfd_already=False
delete_error=None

if 'delete' in rights:
    try:
        post(action='delete',title=TARGET,reason='Self-created unnecessary intermediary office item; clinic already has direct P1037 director/manager relation to Q140287622',token=csrf,**{'assert':'user'})
        deleted=True
    except Exception as ex:
        delete_error=repr(ex)

if not deleted:
    # Check whether this exact item is already nominated, then add a fresh section if not.
    page=get(action='query',titles=RFD,prop='revisions',rvprop='content',rvslots='main')['query']['pages'][0]
    content=''
    if 'missing' not in page and page.get('revisions'):
        content=page['revisions'][0].get('slots',{}).get('main',{}).get('content','')
    if TARGET in content:
        rfd_already=True
    else:
        text=(
            '{{Q+|Q141131884}} — I created this item in error as an unnecessary intermediary office/position item. '
            'The clinic {{Q|Q140288589}} already has the direct and semantically appropriate '
            '{{P|P1037}} → {{Q|Q140287622}} director/manager relation. '
            'This self-created intermediary has no sitelinks and no independent notability; the erroneous incoming links from the clinic and person have been removed. '
            'I am the creator/primary contributor and request deletion. ~~~~'
        )
        post(action='edit',title=RFD,section='new',sectiontitle=TARGET,text=text,
             summary='Request deletion of self-created unnecessary item Q141131884',
             token=csrf,**{'assert':'user'})
        rfd_added=True

print(json.dumps({
    'ok':True,
    'authenticated_as':ui.get('name'),
    'has_delete_right':('delete' in rights),
    'removed_incoming_links':removed,
    'direct_P1037_to_person_preserved':bool(direct_after),
    'target_sitelinks':after[TARGET].get('sitelinks',{}),
    'deleted_directly':deleted,
    'delete_error':delete_error,
    'rfd_added':rfd_added,
    'rfd_already_present':rfd_already
},ensure_ascii=False,indent=2))
