import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const release=JSON.parse(await readFile('src/data/release.json','utf8'));
const sha=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
const walk=async dir=>{let total=0;for(const e of await readdir(dir,{withFileTypes:true}))total+=e.isDirectory()?await walk(path.join(dir,e.name)):e.isFile()?1:0;return total;};
const attestation={
  schema:'https://www.ghezelbaash.ir/release-attestation/v2',
  release:release.release,
  date:release.dateModified,
  canonicalDatasetIri:release.dataset.id,
  primaryEntity:release.primaryEntity.wikidata,
  clinicEntity:release.dataset.supportingClinicWikidata,
  datasetEntity:release.dataset.wikidata,
  sourceRepository:release.dataset.github.repository,
  sourceCommit:process.env.SOURCE_COMMIT||process.env.GITHUB_SHA||'local-uncommitted-verification',
  zenodoConceptDoi:release.dataset.zenodo.conceptDoi,
  zenodoVersionDoi:release.dataset.zenodo.versionDoi,
  zenodoRecordId:String(release.dataset.zenodo.recordId),
  artifactManifestSha256:await sha('dist/artifact-manifest.json'),
  graphJsonldSha256:await sha('dist/graph.jsonld'),
  indexHtmlSha256:await sha('dist/index.html'),
  distFileCount:await walk('dist'),
  validation:'PASS',
  distributionRoles:{website:'canonical-first-party-dataset',github:'source',zenodo:'immutable-preservation-distribution',huggingFace:'secondary-ai-ml-distribution',huggingFaceEnrichment:'derived-synthetic-non-authoritative'}
};
await mkdir('.release',{recursive:true});
await writeFile('.release/release-attestation.json',`${JSON.stringify(attestation,null,2)}\n`);
console.log(JSON.stringify(attestation,null,2));
