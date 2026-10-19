"""Inventory every DOI occurrence in tracked source; historical evidence stays historical."""
import json,re,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
p=json.loads((ROOT/'src/canonical/doi-policy.json').read_text())
pattern=re.compile(r'10\.5281/zenodo\.\d+')
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard'],cwd=ROOT,text=True).splitlines()
rows=[]
for name in sorted(set(files)):
    if name.startswith('reports/doi-policy/'):continue
    path=ROOT/name
    if not path.is_file():continue
    try:lines=path.read_text().splitlines()
    except UnicodeDecodeError:continue
    for line,text in enumerate(lines,1):
        for match in pattern.finditer(text):
            doi=match.group()
            role='general' if doi==p['concept']['doi'] else 'current_exact' if doi==p['currentArchive']['doi'] else 'historical'
            scope='historical_evidence_or_fixture' if name.startswith(('reports/','tests/')) else 'source'
            rows.append({'file':name,'line':line,'column':match.start()+1,'doi':doi,'role':role,'scope':scope})
output=ROOT/'reports/doi-policy/source-inventory.json'
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps({'policySource':'src/canonical/doi-policy.json','occurrences':rows},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'filesWithDoi':len({r['file'] for r in rows}),'occurrences':len(rows),'roleCounts':{k:sum(r['role']==k for r in rows) for k in ['general','current_exact','historical']}}))
