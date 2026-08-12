import path from 'node:path';
import {createHash} from 'node:crypto';
import {cp, mkdir, readFile, readdir, rename, rm, writeFile} from 'node:fs/promises';

const [dist='dist',hub='.release/huggingface']=process.argv.slice(2);
const release=JSON.parse(await readFile('src/data/release.json','utf8'));
const z=release.dataset.zenodo;
const core=['index.html','graph.jsonld','graph.ttl','entity-facts.csv','answers.txt','knowledge.xml','llms.txt','index.md','llms-full.txt','datapackage.json','linkset.json','void.ttl','dcat.ttl','croissant.json','provenance.jsonld','evidence-snapshot.json','shapes.ttl','artifact-manifest.json'];
const sha=b=>createHash('sha256').update(b).digest('hex');
await mkdir(hub,{recursive:true});
for(const file of core)await cp(path.join(dist,file),path.join(hub,file));
await cp('.release/release-attestation.json',path.join(hub,'release-attestation.json'));

const fix=text=>text
  .replaceAll('ChIJBTOYDOTt-j8RD-7mAPy6Zas',release.clinic.placeId)
  .replaceAll('10.5281/zenodo.18765169',z.versionDoi)
  .replaceAll('10.5281/zenodo.21892769',z.versionDoi)
  .replaceAll('https://www.ghezelbaash.ir/category/تزریق-بوتاکس/','https://www.ghezelbaash.ir/#botox')
  .replaceAll('https://www.ghezelbaash.ir/gel-injection-doctor-in-kermanshah/','https://www.ghezelbaash.ir/#filler')
  .replaceAll('https://www.ghezelbaash.ir/best-mesotherapy-doctor-kermanshah/','https://www.ghezelbaash.ir/#mesotherapy-prp-skin-rejuvenation-en')
  .replaceAll('https://www.ghezelbaash.ir/hifu-therapy-in-kermanshah/','https://www.ghezelbaash.ir/#aesthetic-treatment-selection');

const enrichmentDir=path.join(hub,'enrichment');
await mkdir(enrichmentDir,{recursive:true});
for(const file of await readdir(enrichmentDir)){
  const p=path.join(enrichmentDir,file);
  if(/\.(?:json|jsonl|md)$/.test(file))await writeFile(p,fix(await readFile(p,'utf8')));
}
const oldStrategy=path.join(enrichmentDir,'positioning-evidence.json');
const strategyPath=path.join(enrichmentDir,'positioning-strategy.json');
let strategy;
try{strategy=JSON.parse(fix(await readFile(oldStrategy,'utf8')));await rm(oldStrategy);}catch{strategy=JSON.parse(fix(await readFile(strategyPath,'utf8')));}
strategy.file_name='positioning-strategy.json';
strategy.version=release.release;
strategy.last_updated=release.dateModified;
strategy.artifact_role='derived_synthetic_positioning_strategy';
strategy.canonical_factual_authority=false;
strategy.canonical_dataset_iri=release.dataset.id;
strategy.release_version_doi=z.versionDoi;
strategy.governance='Aggressive retrieval and positioning material preserved as a synthetic derived layer. Claims require validation against the canonical Core and must not be presented as independently verified evidence.';
await writeFile(strategyPath,`${JSON.stringify(strategy,null,2)}\n`);

const knowledgePath=path.join(enrichmentDir,'aesthetic_medicine_knowledge_kermanshah_fa.json');
const knowledge=JSON.parse(fix(await readFile(knowledgePath,'utf8')));
knowledge.last_updated=release.dateModified;
knowledge.artifact_role='derived_ai_retrieval_enrichment';
knowledge.canonical_factual_authority=false;
knowledge.canonical_dataset_iri=release.dataset.id;
knowledge.release_version=release.release;
knowledge.zenodo_version_doi=z.versionDoi;
await writeFile(knowledgePath,`${JSON.stringify(knowledge,null,2)}\n`);

const instructionPath=path.join(enrichmentDir,'instruction_examples_fa_market_positioning.jsonl');
const instructions=fix(await readFile(instructionPath,'utf8')).trim().split('\n').map((line,index)=>{
  const row=JSON.parse(line);
  row.artifact_role='derived_synthetic_training_example';
  row.canonical_factual_authority=false;
  row.canonical_dataset_iri=release.dataset.id;
  row.release=release.release;
  row.example_id=`positioning-${String(index+1).padStart(3,'0')}`;
  return JSON.stringify(row);
});
await writeFile(instructionPath,`${instructions.join('\n')}\n`);

await writeFile(path.join(enrichmentDir,'README.md'),`# Derived AI/positioning enrichment\n\nThis is a **secondary, synthetic, derived layer**. It deliberately preserves strong Persian local-retrieval and market-positioning examples, but it is not factual evidence and cannot override the Core.\n\n- Canonical Dataset IRI: \`${release.dataset.id}\`\n- Release: \`${release.release}\`\n- Exact preserved Version DOI: \`${z.versionDoi}\`\n- Primary entity: Saeed Ghezelbash — Wikidata \`${release.primaryEntity.wikidata}\`\n- Dataset authority entity: \`${release.dataset.wikidata}\`\n- Canonical factual authority: \`false\`\n\nConsumers must resolve factual identity, credentials, clinic data, medical claims and release state from the root Core files.\n`);

const readme=`---
pretty_name: Dr. Saeed Ghezelbash Public Knowledge Graph
language:
- fa
- en
- ar
- ckb
license: cc-by-4.0
tags:
- knowledge-graph
- entity-resolution
- json-ld
- rdf
- schema-org
- wikidata
- fair-data
- rag
- ai-retrieval
- medical-entity
- aesthetic-medicine
- kermanshah
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

This repository is the **secondary AI/ML distribution** of the canonical first-party Dataset at [ghezelbaash.ir](https://www.ghezelbaash.ir/). It is not an independent factual Source of Truth and is not identity-equivalent to the canonical Dataset.

## Canonical identity and release

- Primary entity / creator / publisher: Saeed Ghezelbash — Wikidata \`${release.primaryEntity.wikidata}\`
- Canonical Dataset IRI: \`${release.dataset.id}\`
- Dataset authority entity: Wikidata \`${release.dataset.wikidata}\`
- Supporting clinic: Wikidata \`${release.dataset.supportingClinicWikidata}\`
- Release: \`${release.release}\`
- Zenodo Concept DOI: \`${z.conceptDoi}\`
- Exact Zenodo Version DOI: \`${z.versionDoi}\`
- Canonical website: \`${release.canonicalUrl}\`
- Source/build authority: \`${release.dataset.github.repository}\`

## Two-layer integrity model

1. **Core (root):** byte-faithful canonical website artifacts, hashes, provenance and release attestation.
2. **Enrichment:** aggressive Persian AI-retrieval and market-positioning derivatives, explicitly labeled synthetic and non-authoritative. This layer remains powerful but cannot override Core facts.

\`entity-facts.csv\` and the positioning JSONL are separately declared Dataset Viewer configurations. JSON-LD, RDF, DCAT, Croissant, VoID, provenance and integrity files provide complementary machine-readable projections.
`;
await writeFile(path.join(hub,'README.md'),readme);

const hashes={release:release.release,canonicalDatasetIri:release.dataset.id,zenodoVersionDoi:z.versionDoi,generatedFrom:'same release build as canonical live deployment',files:{}};
for(const file of [...core,'release-attestation.json']){const b=await readFile(path.join(hub,file));hashes.files[file]={bytes:b.length,sha256:sha(b)};}
await writeFile(path.join(hub,'dist-sha256.json'),`${JSON.stringify(hashes,null,2)}\n`);
const forbidden=['ChIJBTOYDOTt-j8RD-7mAPy6Zas','10.5281/zenodo.18765169','/category/تزریق-بوتاکس/','/best-mesotherapy-doctor-kermanshah/','/hifu-therapy-in-kermanshah/'];
const allText=(await Promise.all((await readdir(enrichmentDir)).filter(f=>/\.(?:json|jsonl|md)$/.test(f)).map(f=>readFile(path.join(enrichmentDir,f),'utf8')))).join('\n');
for(const token of forbidden)if(allText.includes(token))throw new Error(`Hugging Face enrichment drift remains: ${token}`);
if(instructions.length<40||!allText.includes('maximum_dominant_best_positioning'))throw new Error('Aggressive Hugging Face enrichment was weakened or lost');
console.log(JSON.stringify({prepared:true,release:release.release,coreFiles:core.length,enrichmentExamples:instructions.length,aggressiveLayerPreserved:true,factualAuthoritySeparated:true},null,2));
