#!/usr/bin/env python3
from pathlib import Path
import re

def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    n = text.count(old)
    if n != 1:
        raise SystemExit(f"{path}: expected exactly one occurrence, found {n}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")

def regex_once(path, pattern, repl, flags=0):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    out, n = re.subn(pattern, repl, text, count=1, flags=flags)
    if n != 1:
        raise SystemExit(f"{path}: expected exactly one regex replacement, found {n}: {pattern}")
    p.write_text(out, encoding="utf-8")

# Fix the current 1.2.0 human authority surface before the next promotion.
p = Path("src/content-source/100-rc099.html")
text = p.read_text(encoding="utf-8")
for old, new in [
    ("version 1.1.1 release", "version 1.2.0 release"),
    ("published on 11 August 2026", "published on 12 August 2026"),
    ("reviewed on 8 August 2026", "reviewed on 12 August 2026"),
]:
    n = text.count(old)
    if n != 1:
        raise SystemExit(f"100-rc099.html expected exactly one {old!r}, found {n}")
    text = text.replace(old, new, 1)
p.write_text(text, encoding="utf-8")

# Ensure future release promotion repairs lowercase/current-date prose.
replace_once(
    "scripts/promote-release.mjs",
    ".replaceAll(`Version ${old.release}`,`Version ${next.release}`)\n    .replace(/published \\d{1,2} [A-Za-z]+ \\d{4}/,`published ${englishDate}`)",
    ".replaceAll(`Version ${old.release}`,`Version ${next.release}`)\n"
    "    .replace(/version \\d+\\.\\d+\\.\\d+ release(?=<\\/a>,\\s*published on)/,`version ${next.release} release`)\n"
    "    .replace(/reviewed on \\d{1,2} [A-Za-z]+ \\d{4}/,`reviewed on ${englishDate}`)\n"
    "    .replace(/published on \\d{1,2} [A-Za-z]+ \\d{4}/,`published on ${englishDate}`)\n"
    "    .replace(/published \\d{1,2} [A-Za-z]+ \\d{4}/,`published ${englishDate}`)"
)

# Make the ceiling release request-driven instead of hard-coded.
wf = ".github/workflows/ceiling-release.yml"
replace_once(
    wf,
    "      - name: Preflight every mutation capability\n",
    """      - name: Resolve release request
        shell: bash
        run: |
          set -euo pipefail
          node - <<'NODE' >> "$GITHUB_ENV"
          const fs=require('fs');
          const r=JSON.parse(fs.readFileSync('.release/release-request.json','utf8'));
          for(const k of ['targetVersion','releaseDate','currentRecordId','currentVersionDoi','conceptDoi']) if(!r[k]) throw new Error(`Missing release request field ${k}`);
          if(!/^\\d+\\.\\d+\\.\\d+$/.test(r.targetVersion)) throw new Error('Invalid targetVersion');
          if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(r.releaseDate)) throw new Error('Invalid releaseDate');
          if(!/^\\d+$/.test(String(r.currentRecordId))) throw new Error('Invalid currentRecordId');
          if(!/^10\\.5281\\/zenodo\\.\\d+$/.test(r.currentVersionDoi)) throw new Error('Invalid currentVersionDoi');
          if(!/^10\\.5281\\/zenodo\\.\\d+$/.test(r.conceptDoi)) throw new Error('Invalid conceptDoi');
          console.log(`TARGET_VERSION=${r.targetVersion}`);
          console.log(`RELEASE_DATE=${r.releaseDate}`);
          console.log(`CURRENT_RECORD_ID=${r.currentRecordId}`);
          console.log(`CURRENT_VERSION_DOI=${r.currentVersionDoi}`);
          console.log(`CONCEPT_DOI=${r.conceptDoi}`);
          NODE

      - name: Preflight every mutation capability
"""
)
replace_once(wf, "https://zenodo.org/api/deposit/depositions/21892769", "https://zenodo.org/api/deposit/depositions/$CURRENT_RECORD_ID")
replace_once(
    wf,
    """            python scripts/zenodo_release.py reserve \\
              --current-record 21892769 \\
              --current-doi 10.5281/zenodo.21892769 \\
              --concept-doi 10.5281/zenodo.18765168 \\
              --version 1.2.0 \\
              --date 2026-08-12""",
    """            python scripts/zenodo_release.py reserve \\
              --current-record "$CURRENT_RECORD_ID" \\
              --current-doi "$CURRENT_VERSION_DOI" \\
              --concept-doi "$CONCEPT_DOI" \\
              --version "$TARGET_VERSION" \\
              --date "$RELEASE_DATE" """
)
replace_once(
    wf,
    'node scripts/promote-release.mjs --version=1.2.0 --date=2026-08-12 --zenodo-record="$REC" --zenodo-doi="$DOI" --state=published',
    'node scripts/promote-release.mjs --version="$TARGET_VERSION" --date="$RELEASE_DATE" --zenodo-record="$REC" --zenodo-doi="$DOI" --state=published'
)
replace_once(wf, "git diff --cached --quiet || git commit -m 'Release synchronized entity stack v1.2.0'", 'git diff --cached --quiet || git commit -m "Release synchronized entity stack v$TARGET_VERSION"')
replace_once(wf, '--commit-message="Synchronized entity stack v1.2.0"', '--commit-message="Synchronized entity stack v$TARGET_VERSION"')
replace_once(wf, 'git -C .release/huggingface commit -m "Synchronize canonical Core v1.2.0 and preserve governed strong enrichment"', 'git -C .release/huggingface commit -m "Synchronize canonical Core v$TARGET_VERSION and preserve governed strong enrichment"')
replace_once(wf, "git commit -m 'Record verified v1.2.0 cross-platform convergence'", 'git commit -m "Record verified v$TARGET_VERSION cross-platform convergence"')
replace_once(wf, "git tag -a v1.2.0 -m 'Dr. Saeed Ghezelbash entity stack v1.2.0 — verified convergence'", 'git tag -a "v$TARGET_VERSION" -m "Dr. Saeed Ghezelbash entity stack v$TARGET_VERSION — verified convergence"')
replace_once(wf, "git push origin v1.2.0", 'git push origin "v$TARGET_VERSION"')

# Strong physician-first Zenodo metadata.
zen = "scripts/zenodo_release.py"
metadata_replacement = """def metadata(version,date,doi,concept):
    return {
      'upload_type':'dataset',
      'publication_date':date,
      'title':'Dr. Saeed Ghezelbash Public Knowledge Graph',
      'creators':[{'name':'Ghezelbash, Saeed','orcid':'0009-0001-9346-8475'}],
      'description':(
        f'<p><strong>Dr. Saeed Ghezelbash Public Knowledge Graph</strong> — immutable DOI-preserved '
        f'preservation distribution of Version <strong>{version}</strong> of the canonical first-party Dataset '
        f'at <a href="https://www.ghezelbaash.ir/graph.jsonld#dataset">ghezelbaash.ir</a>.</p>'
        '<p>The primary subject, creator and publisher authority is <strong>Dr. Saeed Ghezelbash</strong> '
        '(Wikidata Q140287622; Google Knowledge Graph /g/11nqdfk76c; ORCID 0009-0001-9346-8475; '
        'Iran Medical Council 167430), an aesthetic physician in Kermanshah, Iran. '
        'The supporting clinic is Wikidata Q140288589. The continuing Dataset entity is Wikidata Q140304972.</p>'
        '<p>GitHub is the version-controlled source, Zenodo is the immutable preservation distribution, '
        'and Hugging Face is the secondary AI/ML distribution. These are linked access/distribution layers '
        'and are not identity-equivalent to the physician or to the canonical Dataset IRI.</p>'
      ),
      'access_right':'open',
      'license':'cc-by-4.0',
      'language':'eng',
      'version':version,
      'keywords':[
        'Saeed Ghezelbash','Dr. Saeed Ghezelbash','Mohammad Saeed Ghezelbash',
        'دکتر سعید قزلباش','محمد سعید قزلباش','physician entity','aesthetic physician',
        'Kermanshah','Iran','medical knowledge graph','knowledge graph','knowledge base',
        'entity resolution','JSON-LD','RDF','Schema.org','Wikidata','FAIR data',
        'machine-readable data','question answering','AI retrieval','RAG','Croissant','DCAT'
      ],
      'subjects':[
        {'term':'Saeed Ghezelbash','identifier':'https://www.wikidata.org/entity/Q140287622','scheme':'url'},
        {'term':'Dr. Saeed Ghezelbash Public Knowledge Graph','identifier':'https://www.wikidata.org/entity/Q140304972','scheme':'url'},
        {'term':'Dr. Saeed Ghezelbash Aesthetic Clinic','identifier':'https://www.wikidata.org/entity/Q140288589','scheme':'url'}
      ],
      'notes':(
        f'Canonical Dataset IRI: https://www.ghezelbaash.ir/graph.jsonld#dataset. '
        f'Concept DOI: {concept}. Exact Version DOI: {doi}. '
        'Cryptographic integrity and cross-platform roles are recorded in release-attestation.json and dist-sha256.json.'
      ),
      'related_identifiers':[
        {'identifier':'https://www.ghezelbaash.ir/graph.jsonld#dataset','relation':'isDerivedFrom','resource_type':'dataset'},
        {'identifier':'https://www.ghezelbaash.ir/#doctor-ghezelbaash-structured-data-repository','relation':'isDescribedBy','resource_type':'other'},
        {'identifier':'https://github.com/medicaldoctor91/doctor-ghezelbaash','relation':'isDerivedFrom','resource_type':'software'},
        {'identifier':'https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data','relation':'isReferencedBy','resource_type':'dataset'},
        {'identifier':'https://www.wikidata.org/wiki/Q140304972','relation':'isPartOf','resource_type':'dataset'},
        {'identifier':'https://www.wikidata.org/wiki/Q140287622','relation':'references','resource_type':'other'},
        {'identifier':'https://www.wikidata.org/wiki/Q140288589','relation':'references','resource_type':'other'}
      ],
      'prereserve_doi':True
    }

def reserve"""
regex_once(zen, r"def metadata\(version,date,doi,concept\):\n    return \{.*?\n    \}\n\ndef reserve", metadata_replacement, flags=re.S)

reconcile_replacement = """    for _ in range(30):
        verified=call(token,'GET',f'{BASE}/records/{args.record}')
        md=verified.get('metadata') or {}
        rel={(r.get('identifier'),r.get('relation')) for r in (md.get('related_identifiers') or [])}
        subjects={s.get('identifier') for s in (md.get('subjects') or [])}
        creator=(md.get('creators') or [{}])[0]
        required_rel={
          ('https://www.ghezelbaash.ir/graph.jsonld#dataset','isDerivedFrom'),
          ('https://www.ghezelbaash.ir/#doctor-ghezelbaash-structured-data-repository','isDescribedBy'),
          ('https://github.com/medicaldoctor91/doctor-ghezelbaash','isDerivedFrom'),
          ('https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data','isReferencedBy'),
          ('https://www.wikidata.org/wiki/Q140304972','isPartOf'),
          ('https://www.wikidata.org/wiki/Q140287622','references'),
          ('https://www.wikidata.org/wiki/Q140288589','references'),
        }
        required_subjects={
          'https://www.wikidata.org/entity/Q140287622',
          'https://www.wikidata.org/entity/Q140304972',
          'https://www.wikidata.org/entity/Q140288589',
        }
        if (verified.get('doi')==args.doi and md.get('version')==args.version and
            creator.get('orcid')=='0009-0001-9346-8475' and
            required_rel.issubset(rel) and required_subjects.issubset(subjects) and
            'دکتر سعید قزلباش' in (md.get('keywords') or [])):
            break
        time.sleep(2)
    else:
        raise RuntimeError('Zenodo metadata reconciliation readback failure')
    print(json.dumps({'stage':'ZENODO_METADATA_RECONCILED','recordId':str(args.record),'version':args.version,'physicianWikidata':'Q140287622','huggingFaceRelation':'isReferencedBy','integrity':'PASS'},separators=(',',':')))
"""
regex_once(
    zen,
    r"    for _ in range\(30\):\n        verified=call\(token,'GET',f'\{BASE\}/records/\{args\.record\}'\).*?    print\(json\.dumps\(\{'stage':'ZENODO_METADATA_RECONCILED'.*?\n",
    reconcile_replacement,
    flags=re.S,
)

# Upgrade Hugging Face Dataset Card discovery metadata.
hf = "scripts/prepare-huggingface-distribution.mjs"
replace_once(
    hf,
    "import {cp, mkdir, readFile, readdir, rename, rm, writeFile} from 'node:fs/promises';",
    "import {cp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';"
)
hf_readme_replacement = r"""const readme=`---
pretty_name: Dr. Saeed Ghezelbash Public Knowledge Graph
language:
- fa
- en
- ar
- ckb
license: cc-by-4.0
multilinguality:
- multilingual
source_datasets:
- original
task_categories:
- question-answering
size_categories:
- 1K<n<10K
tags:
- saeed-ghezelbash
- dr-saeed-ghezelbash
- physician-entity
- medical-knowledge-graph
- knowledge-graph
- knowledge-base
- entity-resolution
- json-ld
- rdf
- schema-org
- wikidata
- fair-data
- question-answering
- rag
- ai-retrieval
- aesthetic-medicine
- kermanshah
- iran
- croissant
- dcat
configs:
- config_name: entity_facts
  data_files:
  - split: train
    path: entity-facts.csv
- config_name: positioning_instructions
  data_files:
  - split: train
    path: enrichment/instruction_examples_fa_market_positioning.jsonl
---

# Dr. Saeed Ghezelbash Public Knowledge Graph

This repository is the **secondary AI/ML distribution** of the canonical first-party Dataset at [ghezelbaash.ir](https://www.ghezelbaash.ir/). It is a machine-distribution surface for the physician entity and is **not** an independent factual Source of Truth or an identity-equivalent replacement for the physician or canonical Dataset.

## Physician-first authority topology

- **Primary physician entity / creator / publisher:** Dr. Saeed Ghezelbash — Wikidata \`${release.primaryEntity.wikidata}\`
- **Google Knowledge Graph:** \`${release.primaryEntity.googleKnowledgeGraphId}\`
- **ORCID:** \`${release.dataset.creatorOrcid}\`
- **Iran Medical Council:** \`167430\`
- **Canonical physician IRI:** \`${release.primaryEntity.id}\`
- **Canonical website:** \`${release.canonicalUrl}\`
- **Canonical Dataset IRI:** \`${release.dataset.id}\`
- **Dataset authority entity:** Wikidata \`${release.dataset.wikidata}\`
- **Supporting clinic:** Wikidata \`${release.dataset.supportingClinicWikidata}\`
- **Personal Hugging Face identity:** \`https://huggingface.co/Ghezelbaash\`
- **Distribution namespace:** \`doctor-ghezelbaash\` (supporting publication namespace; not the physician identity)
- **Source/build authority:** \`${release.dataset.github.repository}\`
- **Release:** \`${release.release}\`
- **Zenodo Concept DOI:** \`${z.conceptDoi}\`
- **Exact Zenodo Version DOI:** \`${z.versionDoi}\`

## Two-layer integrity model

1. **Core (repository root):** byte-faithful artifacts from the same canonical website release build, including JSON-LD, RDF, entity facts, answers, provenance, descriptors, hashes and release attestation.
2. **Enrichment:** strong Persian AI-retrieval and market-positioning material that is explicitly labeled **derived, synthetic and non-authoritative**. It can improve retrieval coverage but cannot override Core facts.

\`entity-facts.csv\` and the positioning JSONL are separately declared Dataset Viewer configurations. The root JSON-LD/RDF/VoID/DCAT/Croissant/provenance artifacts describe one physician-first Dataset across complementary machine representations.

## Citation and factual resolution

For physician identity, credentials, clinic facts, release state and clinical factual claims, resolve against the canonical website/graph first. Use the exact Zenodo Version DOI for immutable release citation and the Concept DOI for the continuing Dataset lineage. This Hugging Face repository is the AI-facing distribution layer of that same release, not a separate physician or competing Dataset identity.
`;
await writeFile(path.join(hub,'README.md'),readme);"""
regex_once(
    hf,
    r"const readme=`---\n.*?`;\nawait writeFile\(path\.join\(hub,'README\.md'\),readme\);",
    hf_readme_replacement,
    flags=re.S,
)

# Replace convergence verifier with cache-safe canonical verification.
verifier = r"""import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const release=JSON.parse(await readFile('src/data/release.json','utf8'));
const z=release.dataset.zenodo;
const core=['index.html','graph.jsonld','graph.ttl','entity-facts.csv','answers.txt','knowledge.xml','llms.txt','index.md','llms-full.txt','datapackage.json','linkset.json','void.ttl','dcat.ttl','croissant.json','provenance.jsonld','evidence-snapshot.json','shapes.ttl','artifact-manifest.json'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const fetchBytes=async(url,accept='*/*',{noCache=false}={})=>{
  const headers={Accept:accept,'User-Agent':'doctor-ghezelbaash-convergence-verifier/3.0'};
  if(noCache)headers['Cache-Control']='no-cache';
  const response=await fetch(url,{signal:AbortSignal.timeout(60000),headers});
  if(response.status!==200)throw new Error(`HTTP ${response.status} ${url}`);
  return {response,bytes:Buffer.from(await response.arrayBuffer())};
};
const fetchExpected=async(url,expected,label,attempts=12,options={})=>{
  for(let attempt=1;attempt<=attempts;attempt++){
    const result=await fetchBytes(url,'*/*',options);
    const observed=sha(result.bytes);
    if(observed===expected)return result;
    console.warn(JSON.stringify({stage:'CROSS_PLATFORM_PROPAGATION_WAIT',label,attempt,expected,observed}));
    if(attempt===attempts)throw new Error(`${label} did not converge after ${attempts} attempts`);
    await new Promise(resolve=>setTimeout(resolve,5000));
  }
};

const results=[];
for(const file of core){
  const local=await readFile(`dist/${file}`),expected=sha(local);
  const liveUrl=`${release.canonicalUrl}${file==='index.html'?'':file}`;
  const live=await fetchExpected(liveUrl,expected,`Live canonical ${file}`);
  const separator=liveUrl.includes('?')?'&':'?';
  const liveBypass=await fetchExpected(`${liveUrl}${separator}verify=${Date.now()}`,expected,`Live cache-busted ${file}`,12,{noCache:true});
  const hf=await fetchExpected(`https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data/resolve/main/${file}?download=true&verify=${Date.now()}`,expected,`Hugging Face Core ${file}`,12,{noCache:true});
  const liveText=live.bytes.toString('utf8');
  if(file==='artifact-manifest.json'){
    const manifest=JSON.parse(liveText);
    if(manifest.release!==release.release)throw new Error(`Live canonical artifact-manifest release drift ${manifest.release}/${release.release}`);
    const expectedDigest=`sha-256=:${createHash('sha256').update(local).digest('base64')}:`;
    if(live.response.headers.get('repr-digest')!==expectedDigest)throw new Error('Live artifact-manifest Repr-Digest mismatch');
    if(!String(live.response.headers.get('access-control-expose-headers')).includes('Repr-Digest'))throw new Error('Live artifact-manifest digest is not CORS-exposed');
  }
  if(file==='llms.txt'&&!liveText.includes(`Version ${release.release}`))throw new Error('Live canonical llms.txt release drift');
  if(file==='answers.txt'&&!liveText.includes(`# Release ${release.release}`))throw new Error('Live canonical answers.txt release drift');
  if(z.previousVersion?.versionDoi&&['artifact-manifest.json','llms.txt','answers.txt','knowledge.xml'].includes(file)&&liveText.includes(z.previousVersion.versionDoi))throw new Error(`Historical DOI leaked into live canonical ${file}`);
  results.push({file,sha256:expected,liveCanonical:live.response.status,liveCacheBusted:liveBypass.response.status,huggingFace:hf.response.status});
}

const webmanifest=(await fetchBytes(`${release.canonicalUrl}site.webmanifest`)).bytes.toString();
for(const icon of [...new Set([...webmanifest.matchAll(/"src":\s*"([^"]+)"/g)].map(x=>x[1]))])await fetchBytes(new URL(icon,release.canonicalUrl));

const hfReadme=(await fetchBytes(`https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data/resolve/main/README.md?download=true&verify=${Date.now()}`,'*/*',{noCache:true})).bytes.toString();
for(const token of [release.release,z.versionDoi,'secondary AI/ML distribution','derived',release.primaryEntity.wikidata,release.primaryEntity.googleKnowledgeGraphId,release.dataset.creatorOrcid,'Iran Medical Council','Personal Hugging Face identity'])if(!hfReadme.includes(token))throw new Error(`Hugging Face card lacks ${token}`);

const hfStrategy=(await fetchBytes(`https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data/resolve/main/enrichment/positioning-strategy.json?download=true&verify=${Date.now()}`,'*/*',{noCache:true})).bytes.toString();
const hfKnowledge=(await fetchBytes(`https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data/resolve/main/enrichment/aesthetic_medicine_knowledge_kermanshah_fa.json?download=true&verify=${Date.now()}`,'*/*',{noCache:true})).bytes.toString();
const hfInstructions=(await fetchBytes(`https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data/resolve/main/enrichment/instruction_examples_fa_market_positioning.jsonl?download=true&verify=${Date.now()}`,'*/*',{noCache:true})).bytes.toString();
const hfEnrichment=`${hfStrategy}\n${hfKnowledge}\n${hfInstructions}`;
for(const token of ['maximum_dominant_best_positioning','"canonical_factual_authority": false',z.versionDoi])if(!hfStrategy.includes(token))throw new Error(`Hugging Face strategy lacks ${token}`);
if(!hfEnrichment.includes(release.clinic.placeId))throw new Error(`Hugging Face governed enrichment lacks canonical Place ID ${release.clinic.placeId}`);
for(const forbidden of ['ChIJBTOYDOTt-j8RD-7mAPy6Zas','10.5281/zenodo.18765169','/best-mesotherapy-doctor-kermanshah/','/hifu-therapy-in-kermanshah/'])if(hfEnrichment.includes(forbidden))throw new Error(`Hugging Face drift remains ${forbidden}`);
const retired=await fetch('https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data/resolve/main/enrichment/positioning-evidence.json',{redirect:'manual'});
if(retired.status!==404)throw new Error(`Retired misleading Hugging Face artifact still resolves HTTP ${retired.status}`);

const zenodoResponse=await fetch(`https://zenodo.org/api/records/${z.recordId}`,{headers:{Accept:'application/json','Cache-Control':'no-cache'}});
if(!zenodoResponse.ok)throw new Error(`Zenodo metadata HTTP ${zenodoResponse.status}`);
const zenodo=await zenodoResponse.json();
const md=zenodo.metadata||{};
if(zenodo.doi!==z.versionDoi||md.version!==release.release||md.language!=='eng')throw new Error('Zenodo public metadata drift');
const creator=(md.creators||[])[0]||{};
if(creator.orcid!=='0009-0001-9346-8475')throw new Error('Zenodo creator ORCID drift');
for(const keyword of ['Saeed Ghezelbash','Dr. Saeed Ghezelbash','دکتر سعید قزلباش','physician entity','medical knowledge graph'])if(!(md.keywords||[]).includes(keyword))throw new Error(`Zenodo keyword drift ${keyword}`);
const subjects=new Set((md.subjects||[]).map(x=>x.identifier));
for(const subject of ['https://www.wikidata.org/entity/Q140287622','https://www.wikidata.org/entity/Q140304972','https://www.wikidata.org/entity/Q140288589'])if(!subjects.has(subject))throw new Error(`Zenodo controlled subject drift ${subject}`);
const relations=new Map((md.related_identifiers||[]).map(x=>[x.identifier,x.relation]));
const expectedRelations=new Map([
  [release.dataset.id,'isDerivedFrom'],
  [`${release.canonicalUrl}#doctor-ghezelbaash-structured-data-repository`,'isDescribedBy'],
  [release.dataset.github.repository,'isDerivedFrom'],
  [release.dataset.huggingFace.dataset,'isReferencedBy'],
  ['https://www.wikidata.org/wiki/Q140304972','isPartOf'],
  ['https://www.wikidata.org/wiki/Q140287622','references'],
  ['https://www.wikidata.org/wiki/Q140288589','references'],
]);
for(const [id,rel] of expectedRelations)if(relations.get(id)!==rel)throw new Error(`Zenodo distribution-role relation drift ${id}: ${relations.get(id)}/${rel}`);

const remoteFiles=new Map((zenodo.files||[]).map(x=>[x.key||x.filename,x]));
for(const file of core){
  const row=remoteFiles.get(file);if(!row)throw new Error(`Zenodo file missing ${file}`);
  const url=row.links?.self||row.links?.download||row.links?.content;
  await fetchExpected(url,sha(await readFile(`dist/${file}`)),`Zenodo ${file}`,12,{noCache:true});
}
console.log(JSON.stringify({pass:true,release:release.release,coreFiles:core.length,liveExact:true,liveCanonicalExact:true,liveCacheBustedExact:true,huggingFaceCoreExact:true,huggingFaceAggressiveLayerPreserved:true,huggingFaceAuthoritySeparated:true,zenodoExact:true,manifestIconsResolved:true,results},null,2));
"""
Path("scripts/verify-converged-stack.mjs").write_text(verifier, encoding="utf-8")

# Harden the release contract against production blind spots.
contract = Path("scripts/validate-release-contract.mjs")
text = contract.read_text(encoding="utf-8")
anchor = "if(content.includes('no later release version is asserted')) fail('Obsolete no-later-release assertion remains');\n"
if text.count(anchor) != 1:
    raise SystemExit("validate-release-contract content anchor drift")
insertion = r"""if(content.includes('no later release version is asserted')) fail('Obsolete no-later-release assertion remains');
const englishDate=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${inv.date}T00:00:00Z`));
const visibleReleaseLabels=[...content.matchAll(/version (\d+\.\d+\.\d+) release/gi)].map(x=>x[1]);
if(visibleReleaseLabels.some(x=>x!==R)) fail(`Visible structured-data release label drift: ${visibleReleaseLabels.join(',')}/${R}`);
if(content.includes('reviewed on ')&&!content.includes(`reviewed on ${englishDate}`)) fail(`Visible review-date drift; expected ${englishDate}`);
if(content.includes('published on ')&&!content.includes(`published on ${englishDate}`)) fail(`Visible publication-date drift; expected ${englishDate}`);
const zenodoScript=await readFile('scripts/zenodo_release.py','utf8');
const convergenceScript=await readFile('scripts/verify-converged-stack.mjs','utf8');
const hfPrep=await readFile('scripts/prepare-huggingface-distribution.mjs','utf8');
if(!zenodoScript.includes("'relation':'isReferencedBy'")||!convergenceScript.includes("release.dataset.huggingFace.dataset,'isReferencedBy'")) fail('Zenodo/Hugging Face relation contract is not converged on isReferencedBy');
for(const token of ['liveCanonicalExact:true','Live canonical ${file}','Live cache-busted ${file}'])if(!convergenceScript.includes(token))fail(`Cache-safe convergence verifier missing ${token}`);
for(const token of ['task_categories:','size_categories:','Q140287622','/g/11nqdfk76c','0009-0001-9346-8475','Personal Hugging Face identity'])if(!hfPrep.includes(token))fail(`Hugging Face physician-first discovery metadata missing ${token}`);
"""
contract.write_text(text.replace(anchor, insertion, 1), encoding="utf-8")

# Fail source validation if the release workflow regresses to hard-coded release args.
p = Path("scripts/validate-source.mjs")
text = p.read_text(encoding="utf-8")
anchor = "if(!deployWorkflow.includes('python scripts/configure-cloudflare-edge.py --apply')||!deployWorkflow.includes('--outcome edge-reconciliation.json')||!deployWorkflow.includes('npm run verify:production')||!deployWorkflow.includes('verify-converged-stack.mjs'))fail('Deploy workflow is missing capability-aware edge reconciliation or full cross-platform verification');\n"
if text.count(anchor) != 1:
    raise SystemExit("validate-source deploy anchor drift")
addition = anchor + "for(const token of ['TARGET_VERSION','RELEASE_DATE','CURRENT_RECORD_ID','CURRENT_VERSION_DOI','CONCEPT_DOI'])if(!deployWorkflow.includes(token))fail(`Deploy workflow is not release-request-driven: ${token}`);\nif(/--version(?:=| )1\\.2\\.0|--date(?:=| )2026-08-12|--current-record 21892769/.test(deployWorkflow))fail('Deploy workflow contains hard-coded prior release arguments');\n"
p.write_text(text.replace(anchor, addition, 1), encoding="utf-8")

# Close known valuable historical URL migrations into exact permanent-page sections.
p = Path("public/_redirects")
text = p.read_text(encoding="utf-8")
additions = [
    "/services/ /#aesthetic-treatment-selection 301",
    "/contact/ /#saeed-ghezelbash-clinic-contact-and-location 301",
    "/botox-response-variables/ /#botox 301",
    "/nose-filler-longevity/ /#filler 301",
    "/subcision-kermanshah/ /#acne-pigmentation-and-scars 301",
    "/best-double-chin-surgeon-kermanshah/ /#chin-jawline-and-facial-contouring 301",
    "/category/تزریق-بوتاکس/ /#botox 301",
    "/hifu-therapy-in-kermanshah/ /#aesthetic-treatment-selection 301",
    "/best-mesotherapy-doctor-kermanshah/ /#mesotherapy-prp-skin-rejuvenation-en 301",
]
lines = text.splitlines()
for line in additions:
    if line not in lines:
        text += ("" if text.endswith("\n") else "\n") + line + "\n"
        lines.append(line)
p.write_text(text, encoding="utf-8")

print("FINAL_HARDENING_PATCH_APPLIED")
