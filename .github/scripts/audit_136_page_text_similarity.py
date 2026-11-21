#!/usr/bin/env python3
"""Read-only, near-duplicate audit of published 72-page corpus.

Extract authored medical-guide article text rather than shared menu, machine
schemas or the intentionally large homepage graph. Shingle similarity is a
diagnostic, not proof of Google indexing decisions.
"""
import collections
import concurrent.futures
import json
import re
import time
import unicodedata
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import requests

BASE="https://www.ghezelbaash.ir/"
FOCUS=[
 "buccal-fat-removal-facial-fullness-assessment",
 "mesobotox-and-borderline-treatments",
 "submental-liposuction-for-fat-dominant-fullness",
 "video-saeed-ghezelbash-kurdish-patient-review",
 "video-saeed-ghezelbash-subcision-technique",
 "video-saeed-ghezelbash-thread-lift-workshop",
]
class CorpusParser(HTMLParser):
 def __init__(self):
  super().__init__(convert_charrefs=True);self.article_depth=0;self.ignore=0;self.parts=[];self.lang=''
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='html':self.lang=a.get('lang','')
  if tag=='article' and 'medical-guide' in a.get('class','').split():
   self.article_depth+=1
  elif self.article_depth and tag not in {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}:self.article_depth+=1
  if tag in ('script','style','template','noscript'):self.ignore+=1
 def handle_endtag(self,tag):
  if tag in ('script','style','template','noscript') and self.ignore:self.ignore-=1
  if self.article_depth:self.article_depth-=1
 def handle_data(self,text):
  if self.article_depth and not self.ignore and text.strip():self.parts.append(text.strip())
def fetch(url):
 r=requests.get(url,headers={'Cache-Control':'no-cache','Accept-Encoding':'identity'},timeout=(12,55))
 r.raise_for_status()
 p=CorpusParser();p.feed(r.content.decode('utf-8'))
 text=' '.join(p.parts)
 tokens=[]
 for token in re.split('[^\\u0600-\\u06FFa-zA-Z0-9_]+',unicodedata.normalize('NFKC',text).lower()):
  if token:tokens.append(token)
 return {'url':url,'lang':p.lang,'words':len(tokens),'uniqueTerms':len(set(tokens)),'textChars':len(text),
         'shingles':set(tuple(tokens[i:i+5]) for i in range(max(0,len(tokens)-4)))}
def jac(a,b):
 if not a or not b:return 0.0
 return len(a & b)/len(a | b)
def main():
 root=ET.fromstring(requests.get(BASE+'sitemap.xml',timeout=60).content)
 urls=[n.text for n in root.findall('.//{*}loc') if n.text and urlsplit(n.text).netloc=='www.ghezelbaash.ir']
 urls=list(dict.fromkeys(urls))
 assert len(urls)==72,('Unexpected approved canonical sitemap count',len(urls))
 targets=[u for u in urls if u!=BASE]
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  items=list(pool.map(fetch,targets))
 assert len(items)==71
 pairs=[]
 for i,x in enumerate(items):
  for y in items[i+1:]:
   if x['lang'].split('-')[0]!=y['lang'].split('-')[0]:continue
   score=jac(x['shingles'],y['shingles'])
   pairs.append({'first':x['url'].replace(BASE,''),
                 'second':y['url'].replace(BASE,''),
                 'jaccard5':round(score,5),'minWords':min(x['words'],y['words'])})
 per=[]
 for x in items:
  scores=sorted(({'with':y['url'].replace(BASE,''),'score':round(jac(x['shingles'],y['shingles']),5)}
      for y in items if y is not x and x['lang'].split('-')[0]==y['lang'].split('-')[0]),key=lambda t:-t['score'])
  per.append({'url':x['url'],'lang':x['lang'],'words':x['words'],'uniqueTerms':x['uniqueTerms'],
              'textChars':x['textChars'],'mostSimilar':scores[:3]})
 suspicious=[p for p in pairs if p['jaccard5']>=0.60]
 top=sorted(pairs,key=lambda x:-x['jaccard5'])[:25]
 report={'checkedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),
         'readOnly':True,'focus':FOCUS,'pages':len(items),'nearDuplicatesThreshold':0.6,
         'nearDuplicatePairs':suspicious,'topPairs':top,'perPage':per,
         'focusPages':[x for x in per if x['url'].split('/')[-1] in FOCUS]}
 out=Path('/tmp/index-content-136');out.mkdir(parents=True,exist_ok=True)
 (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 print(json.dumps({'pages':len(items),'nearDuplicatePairs':len(suspicious),'topPairs':top[:10],
                   'focus':report['focusPages']},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
