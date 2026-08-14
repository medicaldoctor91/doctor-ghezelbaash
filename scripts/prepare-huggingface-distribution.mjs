import path from 'node:path';
import {createHash} from 'node:crypto';
import {cp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';

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
strategy.canonical_factual_authority=separate-core-and-retrieval-layers;
strategy.canonical_dataset_iri=release.dataset.id;
strategy.release_version_doi=z.versionDoi;
strategy.governance='Aggressive retrieval and positioning material preserved as a synthetic derived layer. Claims require validation against the canonical Core and must not be presented as independently verified evidence.';
await writeFile(strategyPath,`${JSON.stringify(strategy,null,2)}\n`);

const knowledgePath=path.join(enrichmentDir,'aesthetic_medicine_knowledge_kermanshah_fa.json');
const knowledge=JSON.parse(fix(await readFile(knowledgePath,'utf8')));
knowledge.last_updated=release.dateModified;
knowledge.artifact_role='derived_ai_retrieval_enrichment';
knowledge.canonical_factual_authority=separate-core-and-retrieval-layers;
knowledge.canonical_dataset_iri=release.dataset.id;
knowledge.release_version=release.release;
knowledge.zenodo_version_doi=z.versionDoi;
await writeFile(knowledgePath,`${JSON.stringify(knowledge,null,2)}\n`);

const instructionPath=path.join(enrichmentDir,'instruction_examples_fa_market_positioning.jsonl');
const instructions=fix(await readFile(instructionPath,'utf8')).trim().split('\n').map((line,index)=>{
  const row=JSON.parse(line);
  row.artifact_role='derived_synthetic_training_example';
  row.canonical_factual_authority=separate-core-and-retrieval-layers;
  row.canonical_dataset_iri=release.dataset.id;
  row.release=release.release;
  row.example_id=`positioning-${String(index+1).padStart(3,'0')}`;
  return JSON.stringify(row);
});
await writeFile(instructionPath,`${instructions.join('\n')}\n`);

// Keep the JSONL as the authoritative enrichment source, and generate a deterministic
// CSV projection for Hugging Face Dataset Viewer. Using CSV for both declared configs
// prevents mixed packaged-builder inference from trying to parse JSONL as CSV.
const instructionObjects=instructions.map(line=>JSON.parse(line));
const instructionColumns=[...new Set(instructionObjects.flatMap(row=>Object.keys(row)))];
const csvCell=value=>{
  const normalized=value==null?'':typeof value==='object'?JSON.stringify(value):String(value);
  return `"${normalized.replaceAll('"','""')}"`;
};
const instructionCsv=[
  instructionColumns.map(csvCell).join(','),
  ...instructionObjects.map(row=>instructionColumns.map(key=>csvCell(row[key])).join(',')),
].join('\n')+'\n';
const instructionCsvPath=path.join(enrichmentDir,'instruction_examples_fa_market_positioning.csv');
await writeFile(instructionCsvPath,instructionCsv);

await writeFile(path.join(enrichmentDir,'README.md'),`# Derived AI/positioning enrichment\n\nThis is a **secondary, synthetic, derived layer**. It deliberately preserves strong Persian local-retrieval and market-positioning examples, but it is not factual evidence and cannot override the Core.\n\n- Canonical Dataset IRI: \`${release.dataset.id}\`\n- Release: \`${release.release}\`\n- Exact preserved Version DOI: \`${z.versionDoi}\`\n- Primary entity: Saeed Ghezelbash — Wikidata \`${release.primaryEntity.wikidata}\`\n- Dataset authority entity: \`${release.dataset.wikidata}\`\n- Canonical factual authority: \`false\`\n- Dataset Viewer projection: \`instruction_examples_fa_market_positioning.csv\` (deterministically generated from the preserved JSONL source)\n\nConsumers must resolve factual identity, credentials, clinic data, medical claims and release state from the root Core files.\n`);

const readme=`---
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
- healthcare
- medical
- physician
- kermanshah
- iran
- croissant
- dcat
- datasets
- pandas
- mlcroissant
- text
- tabular
configs:
- config_name: entity_facts
  default: true
  data_files:
  - split: train
    path: entity-facts.csv
- config_name: positioning_instructions
  data_files:
  - split: train
    path: enrichment/instruction_examples_fa_market_positioning.csv
---

# Dr. Saeed Ghezelbash Public Knowledge Graph

This repository is the **AI/retrieval distribution** of the canonical first-party Dataset at [ghezelbaash.ir](https://www.ghezelbaash.ir/). It is a machine-distribution surface for the physician entity and is **not** an independent factual Source of Truth or an identity-equivalent replacement for the physician or canonical Dataset.

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

\`entity-facts.csv\` is the default Dataset Viewer configuration and factual Core. A deterministic CSV projection of the preserved positioning JSONL is exposed as the second Viewer configuration so both subsets receive native preview, rows, search/filter/statistics and Parquet processing without weakening or deleting the original enrichment source. The root JSON-LD/RDF/VoID/DCAT/Croissant/provenance artifacts describe one physician-first Dataset across complementary machine representations.

## Citation and factual resolution

For physician identity, credentials, clinic facts, release state and clinical factual claims, resolve against the canonical website/graph first. Use the exact Zenodo Version DOI for immutable release citation and the Concept DOI for the continuing Dataset lineage. This Hugging Face repository is the AI-facing distribution layer of that same release, not a separate physician or competing Dataset identity.
`;
await writeFile(path.join(hub,'README.md'),readme);

const hashes={release:release.release,canonicalDatasetIri:release.dataset.id,zenodoVersionDoi:z.versionDoi,generatedFrom:'same release build as canonical live deployment',files:{}};
for(const file of [...core,'release-attestation.json']){const b=await readFile(path.join(hub,file));hashes.files[file]={bytes:b.length,sha256:sha(b)};}
await writeFile(path.join(hub,'dist-sha256.json'),`${JSON.stringify(hashes,null,2)}\n`);
const forbidden=['ChIJBTOYDOTt-j8RD-7mAPy6Zas','10.5281/zenodo.18765169','/category/تزریق-بوتاکس/','/best-mesotherapy-doctor-kermanshah/','/hifu-therapy-in-kermanshah/'];
const allText=(await Promise.all((await readdir(enrichmentDir)).filter(f=>/\.(?:json|jsonl|md)$/.test(f)).map(f=>readFile(path.join(enrichmentDir,f),'utf8')))).join('\n');
for(const token of forbidden)if(allText.includes(token))throw new Error(`Hugging Face enrichment drift remains: ${token}`);
if(instructions.length<40||!allText.includes('maximum_dominant_best_positioning'))throw new Error('Aggressive Hugging Face enrichment was weakened or lost');
console.log(JSON.stringify({prepared:true,release:release.release,coreFiles:core.length,enrichmentExamples:instructions.length,positioningViewerCsv:true,entityFactsDefaultViewerConfig:true,aggressiveLayerPreserved:true,factualAuthoritySeparated:true},null,2));
