#!/usr/bin/env python3
"""Read-only technical crawl parity for Google's six excluded URLs and source graph.

Tests Google's documented technical prerequisites without claiming to know or
control Google's discretionary indexing decision. Never uses an indexing API.
"""
import hashlib
import html
import json
import re
import sys
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin,urlparse

import requests

ROOT='https://www.ghezelbaash.ir/'
PAGES=(
  'buccal-fat-removal-facial-fullness-assessment',
  'mesobotox-and-borderline-treatments',
  'submental-liposuction-for-fat-dominant-fullness',
  'video-saeed-ghezelbash-kurdish-patient-review',
  'video-saeed-ghezelbash-subcision-technique',
  'video-saeed-ghezelbash-thread-lift-workshop',
)
WATCH=set(PAGES[3:])
AGENTS={
  'plain':'Mozilla/5.0 (compatible; 1.3.6-technical-readonly-audit/1.0)',
  'googlebot':'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2272.96 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
}
class SiteDoc(HTMLParser):
  def __init__(self):
    super().__init__(convert_charrefs=True)
    self.canonicals=[];self.metas=[];self.video_tags=[];self.ld=[];self.script=None
  def handle_starttag(self,tag,attrs):
    a=dict(attrs)
    if tag=='link' and 'canonical' in a.get('rel','').split():self.canonicals.append(a.get('href'))
    if tag=='meta':self.metas.append(a)
    if tag=='video':self.video_tags.append(a)
    if tag=='script' and a.get('type')=='application/ld+json':self.script=[]
  def handle_data(self,data):
    if self.script is not None:self.script.append(data)
  def handle_endtag(self,tag):
    if tag=='script' and self.script is not None:
      self.ld.append(''.join(self.script));self.script=None

def nodes(doc):
  if isinstance(doc,dict):return doc.get('@graph', [doc])
  return doc if isinstance(doc,list) else []

def parse_page(content):
  d=SiteDoc();d.feed(content.decode('utf8'))
  data=[]
  for raw in d.ld:data.extend(nodes(json.loads(raw)))
  return d,data

def fetch(session,url,agent):
  r=session.get(url,headers={'User-Agent':AGENTS[agent],'Cache-Control':'no-cache','Accept-Encoding':'identity'},
                timeout=(12,60),allow_redirects=False)
  return r

def main():
  session=requests.Session()
  report={'readOnly':True,'collectedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),
          'checked':list(PAGES),'pages':{},'issues':[]}
  for slug in PAGES:
    url=ROOT+slug
    observations={}
    for agent in AGENTS:
      r=fetch(session,url,agent)
      observation={'status':r.status_code,'type':r.headers.get('Content-Type'),
                   'xRobots':r.headers.get('X-Robots-Tag'),'location':r.headers.get('Location'),
                   'bytes':len(r.content),'sha256':hashlib.sha256(r.content).hexdigest()}
      if r.status_code==200 and 'text/html' in r.headers.get('Content-Type',''):
        try:
          doc,ld=parse_page(r.content)
          observation.update(canonicals=doc.canonicals,
            robots=[x.get('content') for x in doc.metas if x.get('name','').lower()=='robots'],
            videoElements=len(doc.video_tags),
            videoPosters=[x.get('poster') for x in doc.video_tags],
            videoLdCount=sum('VideoObject' in ([n.get('@type')] if isinstance(n.get('@type'),str) else n.get('@type',[])) for n in ld))
        except (ValueError,UnicodeDecodeError) as e:
          report['issues'].append({'url':url,'agent':agent,'issue':'JSON-LD/HTML parse error','error':str(e)[:150]})
      observations[agent]=observation
      if r.status_code!=200:
        report['issues'].append({'url':url,'agent':agent,'issue':'non-200 canonical HTML','status':r.status_code})
      if 'noindex' in ((r.headers.get('X-Robots-Tag') or '').lower()+str(observation.get('robots',[])).lower()):
        report['issues'].append({'url':url,'agent':agent,'issue':'indexing blocked'})
      if observation.get('canonicals')!=[url]:
        report['issues'].append({'url':url,'agent':agent,'issue':'canonical drift','observed':observation.get('canonicals')})
      if slug in WATCH and (observation.get('videoElements',0)<1 or observation.get('videoLdCount',0)<1):
        report['issues'].append({'url':url,'agent':agent,'issue':'no primary player or VideoObject in HTML'})
    report['pages'][slug]=observations
    if observations['plain'].get('canonicals')!=observations['googlebot'].get('canonicals'):
      report['issues'].append({'url':url,'issue':'Googlebot/plain canonical mismatch'})
  for agent in AGENTS:
    r=fetch(session,ROOT+'graph.jsonld',agent)
    report.setdefault('graph',{})[agent]={
      'status':r.status_code,'type':r.headers.get('Content-Type'),'bytes':len(r.content),
      'sha256':hashlib.sha256(r.content).hexdigest(),'xRobots':r.headers.get('X-Robots-Tag')}
    if r.status_code!=200 or not r.headers.get('Content-Type','').lower().startswith('application/ld+json'):
      report['issues'].append({'url':ROOT+'graph.jsonld','agent':agent,'issue':'graph not machine-readable'})
  out=Path('/tmp/googlebot-video-136');out.mkdir(exist_ok=True)
  (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
  print(json.dumps({'checked':len(PAGES),'videoWatch':len(WATCH),'graph':report.get('graph'),'issues':report['issues']},ensure_ascii=False,indent=2),flush=True)
  if report['issues']:sys.exit(1)

if __name__=='__main__':main()
