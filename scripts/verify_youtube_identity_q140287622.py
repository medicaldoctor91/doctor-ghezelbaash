#!/usr/bin/env python3
import requests,re,json,datetime
UA='Mozilla/5.0 (compatible; Q140287622-IdentityVerifier/1.0; +https://www.ghezelbaash.ir/)'
s=requests.Session(); s.headers.update({'User-Agent':UA,'Accept-Language':'en-US,en;q=0.9','Cache-Control':'no-cache'})
handles=['ghezelbaash','Doctor.ghezelbaash']
out={'audit_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'handles':{}}
for h in handles:
    url=f'https://www.youtube.com/@{h}'
    try:
        r=s.get(url,timeout=30,allow_redirects=True)
        text=r.text
        ids=[]
        for pat in [r'"channelId":"(UC[^"]+)"',r'"externalId":"(UC[^"]+)"',r'https://www\.youtube\.com/channel/(UC[A-Za-z0-9_-]+)']:
            ids += re.findall(pat,text)
        canonical=None
        m=re.search(r'<link rel="canonical" href="([^"]+)"',text)
        if m: canonical=m.group(1)
        title=None
        m=re.search(r'<meta property="og:title" content="([^"]+)"',text)
        if m:title=m.group(1)
        vanity=[]
        for pat in [r'"vanityChannelUrl":"([^"]+)"',r'"canonicalBaseUrl":"([^"]+)"']:
            vanity += re.findall(pat,text)
        out['handles'][h]={'requested':url,'status':r.status_code,'final_url':r.url,'canonical':canonical,'title':title,'channel_ids':sorted(set(ids)),'vanity_urls':sorted(set(vanity)),'html_length':len(text)}
    except Exception as e:
        out['handles'][h]={'requested':url,'error':repr(e)}
print(json.dumps(out,ensure_ascii=False,indent=2,sort_keys=True))
