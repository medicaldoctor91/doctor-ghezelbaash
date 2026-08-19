#!/usr/bin/env python3
import requests,json,os,re,time,datetime
WD='https://www.wikidata.org/w/api.php'; Q='Q140287622'; HANDLE='ghezelbaash'; CID='UCAiLkR6O3k9aDU9CYSeXPWQ'; CLAIM='Q140287622$46AE2B87-DDDC-4D74-9A60-081F81B20F57'
USER=os.environ['WIKIMEDIA_USERNAME']; PASS=os.environ['WIKIMEDIA_BOT_PASSWORD']
s=requests.Session(); s.headers.update({'User-Agent':'Q140287622-YouTubeFix/1.0 (https://www.ghezelbaash.ir/)'})
def get(**p):
 p.update(format='json',formatversion=2,maxage=0,smaxage=0);r=s.get(WD,params=p,timeout=60);r.raise_for_status();d=r.json()
 if 'error' in d:raise RuntimeError(d['error'])
 return d
def post(**p):
 p.update(format='json',formatversion=2);r=s.post(WD,data=p,timeout=90);r.raise_for_status();d=r.json()
 if 'error' in d:raise RuntimeError(d['error'])
 return d
def login():
 t=get(action='query',meta='tokens',type='login')['query']['tokens']['logintoken'];d=post(action='login',lgname=USER,lgpassword=PASS,lgtoken=t)
 if d.get('login',{}).get('result')!='Success':raise RuntimeError(d)
def csrf():return get(action='query',meta='tokens',type='csrf')['query']['tokens']['csrftoken']
def sval(sn):
 if sn.get('snaktype')!='value':return None
 return sn.get('datavalue',{}).get('value')
def snapshot():
 e=get(action='wbgetentities',ids=Q,props='claims')['entities'][Q]
 handles=[];channels=[];target=None
 for c in e.get('claims',{}).get('P11245',[]):
  v=sval(c['mainsnak']);handles.append(v)
  if c.get('id')==CLAIM:target=c
 for c in e.get('claims',{}).get('P2397',[]):channels.append(sval(c['mainsnak']))
 if target is None:raise RuntimeError('Expected live P11245 claim ID not found')
 if sval(target['mainsnak']).lower()!=HANDLE.lower():raise RuntimeError({'unexpected_handle':sval(target['mainsnak'])})
 quals=[]
 for q in target.get('qualifiers',{}).get('P2397',[]):quals.append(sval(q))
 return e,handles,channels,quals
# Independent source verification against YouTube HTML.
y=s.get('https://www.youtube.com/@ghezelbaash',timeout=45,allow_redirects=True,headers={'User-Agent':'Mozilla/5.0 (compatible; Q140287622-YouTubeFix/1.0)'})
if y.status_code!=200:raise RuntimeError({'youtube_status':y.status_code})
ids=set(re.findall(r'"(?:channelId|externalId)":"(UC[^"]+)"',y.text))
ids.update(re.findall(r'https://www\.youtube\.com/channel/(UC[A-Za-z0-9_-]+)',y.text))
if CID not in ids:raise RuntimeError({'expected_channel_id_not_in_youtube_html':sorted(ids)[:10]})
_,handles,before_channels,before_quals=snapshot(); actions=[]
login(); token=csrf()
# Add stable channel ID as main statement if absent.
if CID not in before_channels:
 d=post(action='wbcreateclaim',entity=Q,property='P2397',snaktype='value',value=json.dumps(CID),summary='Add stable YouTube channel ID verified from the live official channel HTML',token=token,**{'assert':'user'})
 cid_claim=d.get('claim',{}).get('id')
 if not cid_claim:raise RuntimeError(d)
 # Reference the canonical channel URL and retrieval date.
 today=datetime.datetime.now(datetime.timezone.utc).date()
 timev={'time':f'+{today.isoformat()}T00:00:00Z','timezone':0,'before':0,'after':0,'precision':11,'calendarmodel':'http://www.wikidata.org/entity/Q1985727'}
 snaks={
  'P854':[{'snaktype':'value','property':'P854','datavalue':{'value':f'https://www.youtube.com/channel/{CID}','type':'string'}}],
  'P813':[{'snaktype':'value','property':'P813','datavalue':{'value':timev,'type':'time'}}]
 }
 post(action='wbsetreference',statement=cid_claim,snaks=json.dumps(snaks,separators=(',',':')),summary='Reference YouTube channel ID to the canonical live channel URL',token=token,**{'assert':'user'})
 actions.append('created_P2397_main')
# Add stable ID qualifier to mutable handle, satisfying P11245 constraint.
_,_,mid_channels,mid_quals=snapshot()
if CID not in mid_quals:
 d=post(action='wbsetqualifier',claim=CLAIM,property='P2397',snaktype='value',value=json.dumps(CID),summary='Qualify mutable YouTube handle with its stable YouTube channel ID',token=csrf(),**{'assert':'user'})
 if not d.get('claim'):raise RuntimeError(d)
 actions.append('added_P2397_qualifier')
time.sleep(2)
_,after_handles,after_channels,after_quals=snapshot()
if CID not in after_channels or CID not in after_quals:raise RuntimeError({'readback_failed':{'channels':after_channels,'qualifiers':after_quals}})
# Check only relevant constraints after mutation.
cc=get(action='wbcheckconstraints',id=Q).get('wbcheckconstraints',{}).get(Q,{}).get('claims',{})
viol=[]
for p,cs in cc.items():
 for c in cs:
  for r in c.get('mainsnak',{}).get('results',[]) or []:
   viol.append({'property':p,'claim':c.get('id'),'status':r.get('status'),'type':r.get('constraint',{}).get('typeLabel'),'message':r.get('message-html')})
print(json.dumps({'ok':True,'youtube_verified_channel_id':CID,'handles':after_handles,'before_main_P2397':before_channels,'before_handle_P2397_qualifiers':before_quals,'after_main_P2397':after_channels,'after_handle_P2397_qualifiers':after_quals,'actions':actions,'constraint_violations':viol},ensure_ascii=False,indent=2))