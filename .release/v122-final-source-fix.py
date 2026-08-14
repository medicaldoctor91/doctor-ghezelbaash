import subprocess

raw=subprocess.check_output(['git','show','origin/main:.release/v122-final-source-fix-v2.py'],text=True)
old="pat=re.compile(rf'\\b(?:inv|invariants)\\s*\\.\\s*{re.escape(key)}\\b');refs=[]"
new="pat=re.compile(rf'(?<![A-Za-z0-9_.])(?:inv|invariants)\\s*\\.\\s*{re.escape(key)}\\b');refs=[]"
if raw.count(old)!=1:
    raise SystemExit(f'v2 invariant-reference patch anchor drift: {raw.count(old)}')
raw=raw.replace(old,new)

# Canonical answer-corpus header explicitly names medical review; align both generated target and validator.
review_old='# Release ${release.release}; reviewed ${release.medicalReviewedAt};'
review_new='# Release ${release.release}; medically reviewed ${release.medicalReviewedAt};'
if raw.count(review_old)<1:
    raise SystemExit('v2 medical-review header patch anchor drift')
raw=raw.replace(review_old,review_new)

anchor="inv_path=ROOT/'src/data/release-invariants.json';inv=json.loads(inv_path.read_text())"
inject=r'''# Production native-answer integrity must be derived from exact local DIST, never a fixed snapshot count.
p=ROOT/'scripts/verify-production.mjs';vp=p.read_text()
old_answer="const sectionAnswerCount=[...budgetProbe.text.matchAll(/<[a-z0-9:-]+\\b[^>]*\\bclass=[\"']([^\"']+)[\"'][^>]*>/gi)].filter(m=>m[1].split(/\\s+/).includes('section-answer')).length;\nif(sectionAnswerCount<inv.integratedFullAnswerCount||budgetProbe.text.includes('direct-answer-capsules')||budgetProbe.text.includes('data-answer-id=')||budgetProbe.text.includes('id=\"best-doctor-query-matrix\"'))fail(`Production native-answer integration drift ${sectionAnswerCount}/minimum-${inv.integratedFullAnswerCount}`);"
new_answer="const sectionAnswerCount=[...budgetProbe.text.matchAll(/<[a-z0-9:-]+\\b[^>]*\\bclass=[\"']([^\"']+)[\"'][^>]*>/gi)].filter(m=>m[1].split(/\\s+/).includes('section-answer')).length;\nconst localDistHtml=await readFile(path.join(root,'dist/index.html'),'utf8'),expectedSectionAnswerCount=[...localDistHtml.matchAll(/<[a-z0-9:-]+\\b[^>]*\\bclass=[\"']([^\"']+)[\"'][^>]*>/gi)].filter(m=>m[1].split(/\\s+/).includes('section-answer')).length;\nif(sectionAnswerCount!==expectedSectionAnswerCount||budgetProbe.text.includes('direct-answer-capsules')||budgetProbe.text.includes('data-answer-id=')||budgetProbe.text.includes('id=\"best-doctor-query-matrix\"'))fail(`Production native-answer integration drift ${sectionAnswerCount}/expected-${expectedSectionAnswerCount}`);"
if vp.count(old_answer)!=1: raise SystemExit(f'verify-production native-answer anchor drift: {vp.count(old_answer)}')
p.write_text(vp.replace(old_answer,new_answer))
'''
if raw.count(anchor)!=1:
    raise SystemExit(f'v2 invariant injection anchor drift: {raw.count(anchor)}')
raw=raw.replace(anchor,inject+'\n'+anchor)
compile(raw,'v122-final-source-fix-v2.py','exec')
exec(compile(raw,'v122-final-source-fix-v2.py','exec'),{'__name__':'__main__'})
