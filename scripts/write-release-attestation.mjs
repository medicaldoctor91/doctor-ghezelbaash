import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const git=(args,options={})=>execFileSync('git',args,{cwd:root,encoding:'utf8',...options}).trim();
const headCommit=git(['rev-parse','HEAD']);
if(!/^[0-9a-f]{40}$/.test(headCommit))throw new Error('HEAD is not an exact 40-character source commit');
const requestedCommit=(process.env.SOURCE_COMMIT||process.env.GITHUB_SHA||'').trim();
if(requestedCommit&&requestedCommit!==headCommit)throw new Error(`Release source commit mismatch: requested ${requestedCommit}, HEAD ${headCommit}`);
if(git(['status','--porcelain=v1','--untracked-files=all']))throw new Error('Release attestation requires a clean tracked and untracked source worktree');

const release=JSON.parse(await readFile('src/data/release.json','utf8'));
const sha=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
const walk=async dir=>{let total=0;for(const entry of await readdir(dir,{withFileTypes:true}))total+=entry.isDirectory()?await walk(path.join(dir,entry.name)):entry.isFile()?1:0;return total};
const zenodo=release.dataset.zenodo;
const attestation={
  schema:'https://www.ghezelbaash.ir/release-attestation/v3',
  release:release.release,
  releasePublishedAt:release.dateModified,
  medicalReviewedAt:release.medicalReviewedAt,
  canonicalDatasetIri:release.dataset.id,
  primaryEntity:release.primaryEntity.wikidata,
  clinicEntity:release.dataset.supportingClinicWikidata,
  sourceRepository:release.dataset.github.repository,
  sourceCommit:headCommit,
  zenodoConceptDoi:zenodo.conceptDoi,
  zenodoVersionDoi:zenodo.versionDoi,
  zenodoRecordId:String(zenodo.recordId),
  releaseHistory:zenodo.releaseHistory,
  artifactManifestSha256:await sha('dist/artifact-manifest.json'),
  graphJsonldSha256:await sha('dist/graph.jsonld'),
  graphTurtleSha256:await sha('dist/graph.ttl'),
  indexHtmlSha256:await sha('dist/index.html'),
  queryMatrixSha256:await sha('dist/query-matrix.jsonl'),
  currentReleaseMatrixSha256:await sha('dist/current-release-matrix.json'),
  distFileCount:await walk('dist'),
  validation:'PASS',
  distributionRoles:{
    website:'canonical-first-party-dataset',
    github:'version-controlled-source',
    zenodo:'immutable-doi-preservation',
    huggingFace:'ai-retrieval-distribution',
    huggingFaceCore:'release-faithful-core',
    huggingFaceQueryMatrix:'maximum-retrieval-positioning',
    liveObservations:'mutable-clinic-reputation-overlay',
  },
};

await mkdir('.release/runtime',{recursive:true});
await writeFile('.release/runtime/release-attestation.json',`${JSON.stringify(attestation,null,2)}\n`,{mode:0o644});
console.log(JSON.stringify(attestation,null,2));
