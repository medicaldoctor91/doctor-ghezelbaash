"""Read-only Cloudflare delivery inventory; never exports credentials or env vars."""
import json, os, urllib.request, urllib.error
from pathlib import Path
OUT=Path('/tmp/media-delivery-evidence'); OUT.mkdir(exist_ok=True)
account='884d1d90bd1fb6ecca14992c6c60d677'
def read(label,path):
 req=urllib.request.Request('https://api.cloudflare.com/client/v4'+path,headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Accept':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=40) as r: status=r.status; data=json.load(r)
 except urllib.error.HTTPError as e:
  status=e.code
  try:data=json.load(e)
  except Exception:data={'success':False,'errors':[{'message':'non-JSON API response'}]}
 # Never persist project environment variables/config secret values.
 if label=='project' and data.get('success'):
  p=data['result']; data['result']={k:p.get(k) for k in ['name','subdomain','domains','canonical_deployment','latest_deployment']}
 (OUT/(label+'.json')).write_text(json.dumps({'status':status,'data':data},indent=2))
 print(label,'HTTP',status,'success',data.get('success'),'errors',data.get('errors',[]))
 return data
zones=read('zones','/zones?name=ghezelbaash.ir&account.id='+account)
read('project','/accounts/'+account+'/pages/projects/doctor-ghezelbaash')
for zone in zones.get('result',[]) if zones.get('success') else []:
 zid=zone['id']
 for label,suffix in [('cache-rules','/rulesets/phases/http_request_cache_settings/entrypoint'),('page-rules','/pagerules'),('worker-routes','/workers/routes')]:read(label,'/zones/'+zid+suffix)
