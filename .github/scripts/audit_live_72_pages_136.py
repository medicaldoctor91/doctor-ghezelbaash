"""Read-only, bounded audit of every live sitemap page, assets and schema.

This script MUST NOT mutate providers. It records reproducible failures and
a full per-page JSON report for the 1.3.6 pre-publication fix candidate.
"""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urljoin, urlsplit, urlunsplit, urldefrag, unquote
import collections, hashlib, json, os, pathlib, re, time
import xml.etree.ElementTree as ET
import requests
from bs4 import BeautifulSoup

BASE = 'https://www.ghezelbaash.ir/'
BASE_HOST = urlsplit(BASE).hostname
OUT = pathlib.Path('/tmp/site-136-full-audit')
OUT.mkdir(parents=True, exist_ok=True)
S = requests.Session()
S.headers.update({'User-Agent':'GhezelbaashPrePublicationAudit/1.0 (+read-only; technical diagnostics)',
                  'Accept-Encoding':'identity','Cache-Control':'no-cache'})
TIMEOUT = (12, 45)
max_bytes = 8_000_000

def safe(url):
    p=urlsplit(url)
    return p.scheme in ('https','http') and p.hostname in {BASE_HOST, 'ghezelbaash.ir'}

def absolute(u, base):
    url=urljoin(base,u)
    p=urlsplit(url)
    return urlunsplit((p.scheme,p.netloc,p.path,p.query,''))

def fetch(url,kind='page'):
    try:
        with requests.get(url,timeout=TIMEOUT,headers=S.headers,allow_redirects=True,stream=True) as r:
            raw=b''
            for part in r.iter_content(chunk_size=65_536):
                raw+=part
                if len(raw)>max_bytes:
                    raise ValueError('Response exceeded 8 MB inspection limit')
            return {'url':url,'status':r.status_code,'final':r.url,'type':r.headers.get('Content-Type',''),
                    'xrobots':r.headers.get('X-Robots-Tag',''), 'cache':r.headers.get('CF-Cache-Status'),
                    'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),
                    'body':raw if kind=='page' else None}
    except Exception as e:
        return {'url':url,'error':type(e).__name__+': '+str(e)[:190]}

def xml_urls(url):
    result=fetch(url)
    if 'error' in result or result['status']!=200: raise RuntimeError('Cannot fetch sitemap '+repr(result))
    text=requests.get(url,timeout=TIMEOUT).content
    tree=ET.fromstring(text)
    return sorted({el.text.strip() for el in tree.iter() if el.tag.endswith('}loc') and el.text and el.text.strip().startswith(BASE)})

def parse_one(result):
    if 'error' in result:return {**result,'errors':['request_error']}
    d={k:v for k,v in result.items() if k!='body'}
    failures=[]
    if result['status']!=200:failures.append('page_http_'+str(result['status']))
    try:
        html=result['body'].decode('utf-8')
    except Exception as e:
        return {**d,'errors':failures+['invalid_utf8:'+str(e)[:90]]}
    soup=BeautifulSoup(html,'html.parser')
    head=soup.head
    can=head.find('link',rel='canonical') if head else None
    d['canonical']=can.get('href') if can else None
    robots=head.find('meta',attrs={'name':re.compile('^robots$',re.I)}) if head else None
    d['robots']=robots.get('content') if robots else None
    title=soup.title.get_text(' ',strip=True) if soup.title else ''
    d['title']=title
    desc=head.find('meta',attrs={'name':re.compile('^description$',re.I)}) if head else None
    d['description']=desc.get('content') if desc else None
    d['h1']=[e.get_text(' ',strip=True) for e in soup.find_all('h1')]
    lang=soup.html.get('lang') if soup.html else None
    d['lang']=lang
    scripts=soup.find_all('script',attrs={'type':'application/ld+json'})
    d['jsonldCount']=len(scripts)
    d['jsonldNodeCount']=[]
    d['jsonldIDs']=[]
    d['jsonldErrors']=[]
    for script in scripts:
        try:
            obj=json.loads(script.string or script.get_text())
            if not isinstance(obj,dict):raise ValueError('JSON-LD root is not object')
            arr=obj.get('@graph') or [obj]
            d['jsonldNodeCount'].append(len(arr))
            d['jsonldIDs'].extend(n.get('@id') for n in arr if isinstance(n,dict) and isinstance(n.get('@id'),str))
        except Exception as e:d['jsonldErrors'].append(str(e)[:180])
    d['links']=[]
    d['brokenFragments']=[]
    frag_ids={el.get('id') for el in soup.find_all(id=True)}
    frag_ids.update(x.get('name') for x in soup.find_all('a',attrs={'name':True}))
    for el in soup.find_all(['a','area'],href=True):
        href=el['href'].strip()
        if not href or href.startswith(('mailto:','tel:','javascript:','data:','#')): 
            if href.startswith('#') and len(href)>1 and unquote(href[1:]) not in frag_ids:
                d['brokenFragments'].append(href)
            continue
        absurl=absolute(href,result['url'])
        if safe(absurl):d['links'].append(absurl)
    d['assetRefs']=[]
    for el,key in [('img','src'),('script','src'),('link','href'),('video','src'),('source','src')]:
        for node in soup.find_all(el):
            href=node.get(key)
            if href:
                url=absolute(href,result['url'])
                if safe(url):d['assetRefs'].append(url)
    d['links']=sorted(set(d['links']))
    d['assetRefs']=sorted(set(d['assetRefs']))
    if not title:failures.append('missing_title')
    if not desc or not d['description']:failures.append('missing_meta_description')
    if not d['h1']:failures.append('missing_h1')
    if d['canonical']!=result['url']:failures.append('canonical_mismatch')
    if d['robots'] and 'noindex' in d['robots'].lower():failures.append('explicit_noindex')
    if 'noindex' in d['xrobots'].lower():failures.append('header_noindex')
    if d['jsonldErrors']:failures.append('invalid_jsonld')
    if not d['jsonldCount']:failures.append('missing_jsonld')
    if d['brokenFragments']:failures.append('broken_same_page_fragment')
    d['errors']=failures
    return d

sitemap=xml_urls(BASE+'sitemap.xml')
if len(sitemap)!=72:raise RuntimeError(f'Unexpected live sitemap URL count {len(sitemap)} != 72')
result={}
with ThreadPoolExecutor(max_workers=10) as pool:
    for fut in as_completed({pool.submit(fetch,u):u for u in sitemap}):
        doc=parse_one(fut.result())
        result[doc['url']]=doc
pages=[result[u] for u in sitemap]
hrefs=sorted({u for page in pages for u in page.get('links',[]) if safe(u)})
assets=sorted({u for page in pages for u in page.get('assetRefs',[]) if safe(u)})
# bounded resource and internal link HTTP checks; no robots-restricted content bypass.
all_references=sorted(set(hrefs+assets))
if len(all_references)>2500:raise RuntimeError('Unexpectedly excessive local references; audit bounded')
link_result={}
with ThreadPoolExecutor(max_workers=12) as pool:
    futures={pool.submit(fetch,u,'asset'):u for u in all_references}
    for fut in as_completed(futures):
        r=fut.result()
        link_result[r['url']]={k:v for k,v in r.items() if k!='body'}
broken=[r for r in link_result.values() if r.get('status',0)>=400 or r.get('error')]
redirects=[r for r in link_result.values() if r.get('final') and r['final']!=r['url']]
try:
    raw=requests.get(BASE+'robots.txt',timeout=TIMEOUT)
    robots={'status':raw.status_code,'text':raw.text[:20000]}
except Exception as e:robots={'error':str(e)}
machines={}
for path in ('graph.jsonld','sitemap.xml','robots.txt','llms.txt','entity-facts.csv','doi-policy.json','release-provenance.json','integrity-manifest.json'):
    t=fetch(BASE+path,'asset')
    machines[path]={k:v for k,v in t.items() if k!='body'}
    if t.get('status')==200 and path.endswith('.jsonld'):
        t2=requests.get(BASE+path,timeout=TIMEOUT)
        try:
            body=t2.json();machines[path]['graphNodes']=len(body.get('@graph',[]))
        except Exception as e:machines[path]['invalidJsonld']=str(e)[:150]
findings={
 'audit':'1.3.6 live site, read-only, all sitemap pages',
 'collectedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),
 'site':BASE,'sitemapCount':len(sitemap),
 'pageCount':len(pages),
 'pagesWithErrors':sum(bool(p.get('errors')) for p in pages),
 'errorCounters':dict(collections.Counter(x for p in pages for x in p.get('errors',[]))),
 'referenceCount':len(all_references),
 'internalHttpErrors':len(broken),
 'internalRedirects':len(redirects),
 'invalidJsonldPages':sum(bool(p.get('jsonldErrors')) for p in pages),
 'robots':robots,
 'machineResources':machines,
 'brokenReferenceSamples':broken[:60],
 'redirectSamples':redirects[:40],
 'pages':pages,
 'internalHttpResult':link_result,
}
(OUT/'report.json').write_text(json.dumps(findings,indent=2,ensure_ascii=False)+'\n')
(OUT/'summary.json').write_text(json.dumps({k:v for k,v in findings.items() if k not in ('pages','internalHttpResult')},indent=2,ensure_ascii=False)+'\n')
print(json.dumps({
 'pageCount':len(pages),'pagesWithErrors':findings['pagesWithErrors'],'errorCounters':findings['errorCounters'],
 'referenceCount':len(all_references),'badInternalURLs':broken[:20],
 'redirectCount':len(redirects),'machineResources':machines,
},indent=2,ensure_ascii=False),flush=True)
