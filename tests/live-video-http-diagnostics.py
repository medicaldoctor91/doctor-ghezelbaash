#!/usr/bin/env python3
"""Read-only live HTTP crawlability probe for the four canonical video watch pages.

Checks actual HTTP Range, Content-Range, partial Content-Digest and thumbnail
delivery, without downloading any complete video or changing public systems.
"""
from __future__ import annotations
import base64
import hashlib
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit
import requests

root = Path(sys.argv[1] if len(sys.argv)>1 else 'dist')
nodes = json.loads((root / 'graph.jsonld').read_text())['@graph']
videos = [n for n in nodes if 'VideoObject' in (n.get('@type') if isinstance(n.get('@type'),list) else [n.get('@type')])]
assert len(videos)==4, 'The sitemap must retain all four owned videos'
host = 'https://www.ghezelbaash.ir'
results = []
errors = []
for video in videos:
    case = {'id':video['@id'],'url':video['url'],'duration':video['duration']}
    for key in ['url','contentUrl','thumbnailUrl']:
        target=video[key]
        assert urlsplit(target).netloc=='www.ghezelbaash.ir', (key,target)
    try:
        with requests.get(video['url'],timeout=30,headers={'Accept-Encoding':'identity'}) as r:
            case['watchStatus']=r.status_code
            case['watchCanonicalPresent']=f'rel="canonical" href="{video["url"]}"'.encode() in r.content
            assert r.status_code==200, ('Watch page',r.status_code)
            assert case['watchCanonicalPresent'], 'Watch page lacks canonical URL'
        with requests.head(video['contentUrl'],timeout=30,headers={'Accept-Encoding':'identity'}) as r:
            case['headStatus']=r.status_code
            case['headContentType']=r.headers.get('Content-Type','')
            case['headContentLength']=r.headers.get('Content-Length')
            assert r.status_code==200 and 'video/mp4' in case['headContentType'].lower(),('HEAD mp4',r.status_code,case['headContentType'])
        with requests.get(video['contentUrl'],headers={'Range':'bytes=0-63','Accept-Encoding':'identity','Cache-Control':'no-cache'},stream=True,timeout=45) as r:
            case['rangeStatus']=r.status_code
            case['contentRange']=r.headers.get('Content-Range')
            case['rangeContentType']=r.headers.get('Content-Type')
            chunk=r.raw.read(65,decode_content=False)
            assert r.status_code==206,('MP4 Range status',r.status_code)
            assert len(chunk)==64,('MP4 Range length',len(chunk))
            assert case['contentRange'] and case['contentRange'].startswith('bytes 0-63/'),('MP4 Content-Range',case['contentRange'])
            expected='sha-256=:'+base64.b64encode(hashlib.sha256(chunk).digest()).decode()+':'
            case['partialContentDigestValid']=r.headers.get('Content-Digest')==expected
            assert case['partialContentDigestValid'],('MP4 partial Content-Digest',r.headers.get('Content-Digest'))
        with requests.get(video['thumbnailUrl'],stream=True,timeout=30) as r:
            case['thumbnailStatus']=r.status_code
            case['thumbnailContentType']=r.headers.get('Content-Type')
            assert r.status_code==200 and 'image/webp' in (case['thumbnailContentType'] or ''),('Thumbnail',r.status_code,case['thumbnailContentType'])
    except Exception as exc:
        errors.append({'id':video['@id'],'error':type(exc).__name__+': '+str(exc)[:250]})
    results.append(case)

report={'source':'GitHub Actions read-only live HTTP', 'videos':results, 'errors':errors}
Path('/tmp/live-video-http-diagnostics.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
print(json.dumps(report,indent=2,ensure_ascii=False))
if errors:sys.exit(2)
