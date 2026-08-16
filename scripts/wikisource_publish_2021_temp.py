#!/usr/bin/env python3
import os, re, sys, json, html
from xml.etree import ElementTree as ET
import requests

WS_API='https://en.wikisource.org/w/api.php'
WD_API='https://www.wikidata.org/w/api.php'
PMC_XML='https://www.ebi.ac.uk/europepmc/webservices/rest/PMC8469763/fullTextXML'
PMC_URL='https://pmc.ncbi.nlm.nih.gov/articles/PMC8469763/'
DOI='10.3390/healthcare9091169'
WORK_QID='Q140298431'
PERSON_QID='Q140287622'
WORK_TITLE='Individuals with Major Depressive Disorder Report High Scores of Insecure-Avoidant and Insecure-Anxious Attachment Styles, Dissociative Identity Symptoms, and Adult Traumatic Events'
AUTHOR_TITLE='Author:Mohammad Saeed Ghezelbash'
REDIRECT_TITLE='Author:Saeed Ghezelbash'
USERNAME=os.environ['WIKI_USERNAME']
PASSWORD=os.environ['WIKI_BOT_PASSWORD']
UA='Medicaldoctor91WikisourcePublisher/1.0 (policy-clean CC-BY import; https://www.ghezelbaash.ir/)'


def die(msg, detail=None):
    print(json.dumps({'ok':False,'error':msg,'detail':detail},ensure_ascii=False,indent=2))
    sys.exit(1)


def session():
    s=requests.Session(); s.headers['User-Agent']=UA; return s


def api_get(s, api, **p):
    p.update(format='json',formatversion=2)
    r=s.get(api,params=p,timeout=60); r.raise_for_status(); d=r.json()
    if 'error' in d: die('MediaWiki GET failed',d['error'])
    return d


def api_post(s, api, **p):
    p.update(format='json',formatversion=2)
    r=s.post(api,data=p,timeout=90); r.raise_for_status(); d=r.json()
    if 'error' in d: die('MediaWiki POST failed',d['error'])
    return d


def login(api):
    s=session()
    tok=api_get(s,api,action='query',meta='tokens',type='login')['query']['tokens']['logintoken']
    lg=api_post(s,api,action='login',lgname=USERNAME,lgpassword=PASSWORD,lgtoken=tok)
    if lg.get('login',{}).get('result')!='Success': die('Login failed',lg)
    ui=api_get(s,api,action='query',meta='userinfo',uiprop='groups|rights|blockinfo')['query']['userinfo']
    if ui.get('anon') or ui.get('blockedby') or 'edit' not in ui.get('rights',[]): die('Account or runner cannot edit safely',ui)
    return s,ui


def get_page(s,title):
    p=api_get(s,WS_API,action='query',titles=title,prop='info|revisions',rvprop='ids|content',rvslots='main')['query']['pages'][0]
    missing='missing' in p
    content=''
    if not missing and p.get('revisions'):
        content=p['revisions'][0].get('slots',{}).get('main',{}).get('content','')
    return {'missing':missing,'pageid':p.get('pageid'),'revid':p.get('lastrevid'),'content':content}


def csrf(s,api):
    return api_get(s,api,action='query',meta='tokens',type='csrf')['query']['tokens']['csrftoken']


def edit_create(s,title,text,summary):
    before=get_page(s,title)
    if not before['missing']:
        die('Refusing to overwrite existing Wikisource page',{'title':title,'revid':before['revid']})
    res=api_post(s,WS_API,action='edit',title=title,text=text,summary=summary,token=csrf(s,WS_API),assert='user',createonly='1',watchlist='watch',maxlag='5')
    if res.get('edit',{}).get('result')!='Success': die('Wikisource edit did not succeed',res)
    after=get_page(s,title)
    if after['missing']: die('Created page not readable after edit',title)
    return after


def local(tag): return tag.rsplit('}',1)[-1] if '}' in tag else tag

def norm(s): return re.sub(r'\s+',' ',s or '').strip()

def mw_text(s):
    return (s or '').replace('{','&#123;').replace('}','&#125;')


def inline(el):
    out=mw_text(el.text or '')
    for ch in list(el):
        tag=local(ch.tag)
        inner=inline(ch)
        if tag in ('italic','i'):
            piece="''"+inner+"''"
        elif tag in ('bold','b'):
            piece="'''"+inner+"'''"
        elif tag=='sup':
            piece='<sup>'+inner+'</sup>'
        elif tag=='sub':
            piece='<sub>'+inner+'</sub>'
        elif tag=='ext-link':
            href=ch.attrib.get('{http://www.w3.org/1999/xlink}href') or ch.attrib.get('href') or ''
            piece=('['+href+' '+inner+']') if href and inner else (href or inner)
        else:
            piece=inner
        out+=piece+mw_text(ch.tail or '')
    return re.sub(r'[ \t]+',' ',out).strip()


def table_wiki(tw):
    caption_el=tw.find('./caption')
    caption=norm(' '.join(caption_el.itertext())) if caption_el is not None else ''
    table=tw.find('.//table')
    if table is None:
        return "''"+caption+"''" if caption else ''
    lines=['{| class="wikitable"']
    if caption: lines.append('|+ '+mw_text(caption))
    for tr in table.findall('.//tr'):
        cells=[c for c in list(tr) if local(c.tag) in ('th','td')]
        if not cells: continue
        lines.append('|-')
        for c in cells:
            txt=norm(' '.join(c.itertext()))
            lines.append(('! ' if local(c.tag)=='th' else '| ')+mw_text(txt))
    lines.append('|}')
    return '\n'.join(lines)


def block_children(parent,level=2):
    out=[]
    for el in list(parent):
        tag=local(el.tag)
        if tag=='sec':
            title=el.find('./title')
            if title is not None:
                out.append('='*level+' '+inline(title)+' '+'='*level)
            out.extend(block_children(el,min(level+1,6)))
        elif tag=='p':
            txt=inline(el)
            if txt: out.append(txt)
        elif tag=='list':
            for item in el.findall('./list-item'):
                txt=norm(' '.join(item.itertext()))
                if txt: out.append('* '+mw_text(txt))
        elif tag=='table-wrap':
            t=table_wiki(el)
            if t: out.append(t)
        elif tag=='fig':
            label=el.find('./label'); cap=el.find('./caption')
            bits=[]
            if label is not None: bits.append(norm(' '.join(label.itertext())))
            if cap is not None: bits.append(norm(' '.join(cap.itertext())))
            if bits: out.append("''"+mw_text(' '.join(bits))+"'' (["+PMC_URL+" original figure at source])")
        elif tag in ('boxed-text','disp-quote','supplementary-material'):
            txt=norm(' '.join(el.itertext()))
            if txt: out.append(txt)
        elif tag in ('title',):
            continue
        else:
            txt=inline(el)
            if txt and len(txt)>2: out.append(txt)
    return out


def build_work():
    r=requests.get(PMC_XML,headers={'User-Agent':UA},timeout=90); r.raise_for_status()
    root=ET.fromstring(r.content)
    title_el=root.find('.//article-title')
    title=norm(' '.join(title_el.itertext())) if title_el is not None else ''
    if title != WORK_TITLE: die('Source title mismatch',{'got':title})
    license_text=' '.join(root.find('.//license').itertext()) if root.find('.//license') is not None else ''
    if 'Creative Commons Attribution' not in license_text and 'CC BY' not in license_text:
        die('CC BY license not found in JATS source',license_text[:500])
    contribs=[]
    for c in root.findall('.//contrib-group[@content-type="author"]//contrib[@contrib-type="author"]') or root.findall('.//contrib-group//contrib[@contrib-type="author"]'):
        surname=c.find('.//surname'); given=c.find('.//given-names')
        name=norm(((given.text if given is not None else '')+' '+(surname.text if surname is not None else '')).strip())
        if name and name not in contribs: contribs.append(name)
    if not any('Ghezelbash' in x for x in contribs): die('Target author absent from source author list',contribs)
    display=[]
    for n in contribs:
        if 'Ghezelbash' in n:
            display.append('[[Author:Mohammad Saeed Ghezelbash|'+mw_text(n)+']]')
        else:
            display.append(mw_text(n))
    header='''{{header\n | title = %s\n | author-nolink = yes\n | author = %s\n | year = 2021\n | notes = First published in ''Healthcare'', 9(9), 1169. DOI: [https://doi.org/%s %s]. Source text: [https://pmc.ncbi.nlm.nih.gov/articles/PMC8469763/ PubMed Central, PMCID PMC8469763]. The original article states that it is distributed under the Creative Commons Attribution 4.0 International license.\n}}'''%(mw_text(WORK_TITLE),'; '.join(display),DOI,DOI)
    body=root.find('.//body')
    if body is None: die('No article body in JATS')
    parts=[header]+block_children(body,2)
    back=root.find('.//back')
    if back is not None:
        ack=back.find('.//ack')
        if ack is not None:
            txt=norm(' '.join(ack.itertext()))
            if txt: parts.extend(['== Acknowledgments ==',mw_text(txt)])
        refs=back.findall('.//ref-list/ref')
        if refs:
            parts.append('== References ==')
            for ref in refs:
                txt=norm(' '.join(ref.itertext()))
                if txt: parts.append('# '+mw_text(txt))
    parts.append('{{Cc-by-4.0}}')
    text='\n\n'.join(parts).strip()+'\n'
    if len(text)<12000: die('Generated transcription unexpectedly short',len(text))
    if DOI not in text or 'Mohammad Saeed Ghezelbash' not in text: die('Generated transcription missing identity anchors')
    return text,contribs


def set_sitelink(s,qid,title):
    ent=api_get(s,WD_API,action='wbgetentities',ids=qid,props='sitelinks')['entities'][qid]
    existing=ent.get('sitelinks',{}).get('enwikisource')
    if existing:
        if existing.get('title')==title: return {'noop':True,'title':title}
        die('Conflicting existing enwikiSource sitelink',{'qid':qid,'existing':existing})
    res=api_post(s,WD_API,action='wbsetsitelink',id=qid,linksite='enwikisource',linktitle=title,token=csrf(s,WD_API),assert='user',summary='Link existing Wikidata item to its English Wikisource page')
    return {'noop':False,'result':res}


def main():
    ws,wsui=login(WS_API)
    wd,wdui=login(WD_API)
    # Preflight all target titles and sitelinks before any write.
    for t in (WORK_TITLE,AUTHOR_TITLE,REDIRECT_TITLE):
        p=get_page(ws,t)
        if not p['missing']: die('Target already exists; refusing one-shot create',{'title':t,'revid':p['revid']})
    for q in (WORK_QID,PERSON_QID):
        ent=api_get(wd,WD_API,action='wbgetentities',ids=q,props='sitelinks')['entities'][q]
        if ent.get('sitelinks',{}).get('enwikisource'): die('QID already has enwikisource sitelink',{'qid':q,'sitelink':ent['sitelinks']['enwikisource']})
    work_text,authors=build_work()
    work=edit_create(ws,WORK_TITLE,work_text,'Import peer-reviewed 2021 medical research from PubMed Central under its verified CC BY 4.0 license')
    author_text='''{{author\n | firstname = Mohammad Saeed\n | lastname = Ghezelbash\n | last_initial = Gh\n | description = Iranian physician and co-author of peer-reviewed medical research.\n | wikidata = Q140287622\n}}\n\n== Works ==\n* ''[[%s]]'' (2021), with co-authors\n\n{{Cc-by-4.0}}\n{{authority control}}\n'''%WORK_TITLE
    author=edit_create(ws,AUTHOR_TITLE,author_text,'Create author page after hosting a compatible CC BY 4.0 peer-reviewed work')
    redir=edit_create(ws,REDIRECT_TITLE,'#REDIRECT [[Author:Mohammad Saeed Ghezelbash]]\n','Redirect common author name to full published author name')
    work_sl=set_sitelink(wd,WORK_QID,WORK_TITLE)
    person_sl=set_sitelink(wd,PERSON_QID,AUTHOR_TITLE)
    # Verify exact sitelinks and live pages.
    ents=api_get(wd,WD_API,action='wbgetentities',ids=WORK_QID+'|'+PERSON_QID,props='sitelinks')['entities']
    verify={q:ents[q].get('sitelinks',{}).get('enwikisource',{}).get('title') for q in (WORK_QID,PERSON_QID)}
    if verify[WORK_QID]!=WORK_TITLE or verify[PERSON_QID]!=AUTHOR_TITLE: die('Post-write sitelink verification failed',verify)
    print(json.dumps({'ok':True,'authenticated_wikisource_as':wsui.get('name'),'authenticated_wikidata_as':wdui.get('name'),'work':{'pageid':work['pageid'],'revid':work['revid'],'title':WORK_TITLE,'chars':len(work_text)},'author':{'pageid':author['pageid'],'revid':author['revid'],'title':AUTHOR_TITLE},'redirect':{'pageid':redir['pageid'],'revid':redir['revid'],'title':REDIRECT_TITLE},'sitelinks':verify,'source':PMC_URL,'doi':DOI,'authors_found':authors},ensure_ascii=False,indent=2))

if __name__=='__main__': main()
