#!/usr/bin/env python3
import json
from pathlib import Path
p=Path('wikimedia/_tmp-readonly-wikimedia-integrity-audit.json')
d=json.loads(p.read_text(encoding='utf-8'))
pm=d['property_meta']

def fmt(v):
    if isinstance(v,dict): return json.dumps(v,ensure_ascii=False,separators=(',',':'))
    return str(v)

def line_claim(pid,c):
    m=pm.get(pid,{})
    quals=[]
    for qp,qvs in c.get('qualifiers',{}).items():
        ql=pm.get(qp,{}).get('label') or '?'
        quals.append(f"{qp}({ql})="+' | '.join(fmt(x) for x in qvs))
    refs=c.get('references',[])
    refprops=sorted({rp for r in refs for rp in r})
    return f"  {pid} [{m.get('label')}] rank={c.get('rank')} value={fmt(c.get('value'))} | qualifiers={'; '.join(quals) if quals else '-'} | refs={len(refs)} refprops={','.join(refprops) if refprops else '-'}"

out=[]
out.append(f"generated_at_utc={d['generated_at_utc']}")
for q,e in d['entities'].items():
    out += ['',f"=== {q} ===",f"label_en={e['labels'].get('en')}",f"label_fa={e['labels'].get('fa')}",f"description_en={e['descriptions'].get('en')}",f"sitelinks={json.dumps(e['sitelinks'],ensure_ascii=False,sort_keys=True)}"]
    out.append('aliases_en='+json.dumps(e['aliases'].get('en',[]),ensure_ascii=False))
    out.append('aliases_fa='+json.dumps(e['aliases'].get('fa',[]),ensure_ascii=False))
    out.append('STATEMENTS:')
    for pid in sorted(e['claims']):
        for c in e['claims'][pid]: out.append(line_claim(pid,c))
    out.append('CONSTRAINT_CHECK='+json.dumps(e.get('constraint_check'),ensure_ascii=False))

out += ['','=== RELATED ITEMS ===']
for q,e in d['related_items'].items():
    out.append(f"{q} label_en={e['labels'].get('en')} sitelinks={json.dumps(e['sitelinks'],ensure_ascii=False)}")
    for pid in sorted(e['claims']):
        for c in e['claims'][pid]: out.append(line_claim(pid,c))

out += ['','=== PAGES ===']
for k,p in d['pages'].items():
    out.append(f"[{k}] site={p['site']} title={p['title']} pageid={p.get('pageid')} revid={p.get('revid')} parentid={p.get('parentid')} timestamp={p.get('timestamp')} user={p.get('user')} comment={p.get('comment')} wikibase_item={p.get('pageprops',{}).get('wikibase_item')} missing={p.get('missing')}")
    for i,x in enumerate(p.get('excerpts',[])[:8],1):
        x=' '.join(x.replace('\\n',' ').split())
        out.append(f"  EXCERPT{i}: {x[:800]}")

out += ['','=== SUMMARY CHECKS ===']
for k,v in d['summary'].items(): out.append(f"{k}={json.dumps(v,ensure_ascii=False)}")

out += ['','=== PROPERTY DICTIONARY ===']
for pid in sorted(pm):
    m=pm[pid]
    out.append(f"{pid} | {m.get('label')} | datatype={m.get('datatype')} | {m.get('description')}")

Path('wikimedia/_tmp-readonly-wikimedia-integrity-summary.txt').write_text('\n'.join(out)+'\n',encoding='utf-8')
