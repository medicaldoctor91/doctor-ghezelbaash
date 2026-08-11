from pathlib import Path
import re

# Fix #4: correct canonical raw source, then remove the compatibility rewrite.
p=Path('src/content-source/100-rc099.html')
s=p.read_text(encoding='utf-8')
old='''<dt><strong>Machine discovery guide</strong></dt><dd><a href="/llms.txt" type="text/plain">Compact site, entity and canonical-resource map</a></dd><dd><a href="/artifact-manifest.json" type="application/json">File hashes, structural invariants and production artifact metadata</a></dd><dt><strong>Deterministic build provenance</strong></dt><dd><a href="/knowledge.xml" type="application/xml">XML knowledge base for physician, clinic, intent, media and answer retrieval</a></dd><dt><strong>Hierarchical semantic projection</strong></dt><dd><a href="/entity-facts.csv" type="text/csv">CSV projection of entity, predicate, literal, IRI, language and provenance relationships</a></dd><dt><strong>Flat entity-fact distribution</strong></dt><dd><a href="/answers.txt" type="text/plain">125 canonical questions and concise answers linked to exact page anchors</a></dd><dt><strong>Direct-answer retrieval corpus</strong></dt>'''
new='''<dt><strong>Machine discovery guide</strong></dt><dd><a href="/llms.txt" type="text/plain">Compact site, entity and canonical-resource map</a></dd><dt><strong>Artifact integrity manifest</strong></dt><dd><a href="/artifact-manifest.json" type="application/json">File hashes, structural invariants and production artifact metadata</a></dd><dt><strong>Hierarchical semantic projection</strong></dt><dd><a href="/knowledge.xml" type="application/xml">XML knowledge base for physician, clinic, intent, media and answer retrieval</a></dd><dt><strong>Flat entity-fact distribution</strong></dt><dd><a href="/entity-facts.csv" type="text/csv">CSV projection of entity, predicate, literal, IRI, language and provenance relationships</a></dd><dt><strong>Direct-answer retrieval corpus</strong></dt><dd><a href="/answers.txt" type="text/plain">125 canonical questions and concise answers linked to exact page anchors</a></dd>'''
if s.count(old)!=1: raise SystemExit(f'#4 raw mapping guard failed: {s.count(old)}')
p.write_text(s.replace(old,new),encoding='utf-8')

p=Path('scripts/lib/assemble-content.mjs')
s=p.read_text(encoding='utf-8')
pattern=r'''\nconst machineResourceDefinitionPattern=.*?\nconst canonicalizeMachineResourceDefinitions=content=>\{.*?\n\};\n'''
s,n=re.subn(pattern,'\n',s,count=1,flags=re.S)
if n!=1: raise SystemExit(f'#4 assembler shim guard failed: {n}')
needle='  content=canonicalizeMachineResourceDefinitions(content);\n'
if s.count(needle)!=1: raise SystemExit('#4 assembler invocation guard failed')
p.write_text(s.replace(needle,''),encoding='utf-8')

# Fix #3: derive the final evidence-tier line from the canonical registry at generation time.
p=Path('src/data/templates/llms.template.txt')
s=p.read_text(encoding='utf-8')
stale='- Evidence tiers: Tier A = authoritative identity/medical/academic/local anchors; Tier B = verified professional/distribution profiles; Tier C = supplemental discovery evidence.'
placeholder='{{EVIDENCE_TIER_DECLARATION}}'
if s.count(stale)!=1 or placeholder in s: raise SystemExit('#3 template guard failed')
p.write_text(s.replace(stale,placeholder),encoding='utf-8')

p=Path('scripts/generate-projections.mjs')
s=p.read_text(encoding='utf-8')
anchor="const llmsTemplate=await readFile(path.join(data,'templates/llms.template.txt'),'utf8');\nconst llms=llmsTemplate\n"
if s.count(anchor)!=1: raise SystemExit('#3 generator anchor guard failed')
replacement="""const llmsTemplate=await readFile(path.join(data,'templates/llms.template.txt'),'utf8');
const evidenceTiers=evidenceRegistry.tiers||{};
for(const tier of ['A','B','C']) if(typeof evidenceTiers[tier]!=='string'||!evidenceTiers[tier]) throw new Error(`llms.txt evidence tier ${tier} definition missing from evidence registry`);
const evidenceTierPlaceholder='{{EVIDENCE_TIER_DECLARATION}}';
if(llmsTemplate.split(evidenceTierPlaceholder).length!==2) throw new Error('llms.txt template must contain exactly one evidence-tier placeholder');
const evidenceTierDeclaration=`- Evidence tiers: Tier A = ${evidenceTiers.A}; Tier B = ${evidenceTiers.B}; Tier C = ${evidenceTiers.C}.`;
const llms=llmsTemplate
  .replaceAll(evidenceTierPlaceholder,evidenceTierDeclaration)
"""
p.write_text(s.replace(anchor,replacement),encoding='utf-8')

Path('src/pages/llms.txt.ts').write_text("""import body from '../data/projections/llms.txt?raw';
import { staticResponse } from '../lib/static-endpoint';

export const prerender=true;
export function GET(){return staticResponse(body,'text/plain; charset=utf-8');}
""",encoding='utf-8')
