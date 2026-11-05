import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SOURCE, AUTHORED_BODY} from '../src/canonical/source.mjs';

const concept = 'https://doi.org/10.5281/zenodo.18765168';
const archive = SOURCE.doiPolicy.currentArchive;
const exact = archive.url;
const datasetIri = 'https://www.ghezelbaash.ir/graph.jsonld/dataset';
const cwd = new URL('..', import.meta.url);

// These subprocesses exercise the standalone resolver with fixture SHAs. A
// real reserved-edition plan must continue to enforce exact reviewed M in the
// calling process; it is intentionally excluded from these isolated fixtures.
const standaloneEnv = values => {
  const env = {...process.env,...values};
  delete env.RELEASE_PLAN_PATH;
  return env;
};

test('final archive graph and policy use the same explicit build-source identity without a self hash', () => {
  const template = JSON.parse(readFileSync(new URL('../src/canonical/doi-policy.json',import.meta.url),'utf8'));
  assert.equal(template.currentArchive.sourceCommitMode,'build-source');
  assert.equal(Object.hasOwn(template.currentArchive,'sourceCommit'),false);
  const result = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import {SOURCE} from './src/canonical/source.mjs';
    const archive=SOURCE.graph['@graph'].find(n => n['@id']===SOURCE.doiPolicy.currentArchive.url);
    console.log(JSON.stringify([SOURCE.doiPolicy.currentArchive.sourceCommit, archive['prov:wasDerivedFrom']['@id']]));
  `], {cwd, env: standaloneEnv({GITHUB_SHA:'1'.repeat(40),ARCHIVE_SOURCE_COMMIT:'',PREPARE_RESERVED_DOI:String(archive.recordId)}), encoding:'utf8'});
  assert.deepEqual(JSON.parse(result), [
    '1111111111111111111111111111111111111111',
    'https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/1111111111111111111111111111111111111111',
  ]);
});

test('JS and Python resolve the same build source without storing a self hash in the template', () => {
  const env=standaloneEnv({GITHUB_SHA:'2'.repeat(40),ARCHIVE_SOURCE_COMMIT:'',PREPARE_RESERVED_DOI:String(archive.recordId)});
  const python=execFileSync('python3',['-c',"import sys;sys.path.insert(0,'.github/scripts');import platform_bundle;print(platform_bundle.DOI_POLICY['currentArchive']['sourceCommit'])"],{cwd,env,encoding:'utf8'}).trim();
  const js=execFileSync(process.execPath,['--input-type=module','-e',"import {DOI_POLICY} from './src/lib/doi-policy.mjs';console.log(DOI_POLICY.currentArchive.sourceCommit)"],{cwd,env,encoding:'utf8'}).trim();
  assert.equal(js,python);assert.equal(js,env.GITHUB_SHA);
});

test('public discovery uses concept DOI and archive is a distinct versioned entity', () => {
  assert.match(AUTHORED_BODY, /href="https:\/\/doi.org\/10.5281\/zenodo.18765168"/);
  assert.equal(SOURCE.doiPolicy.concept.url,concept);
  assert.equal(SOURCE.doiPolicy.canonicalDatasetIri,datasetIri);
  assert.notEqual(exact,concept);
  assert.ok(SOURCE.machineProjection.discoveryGuide.includes(concept));
  const nodes = new Map(SOURCE.graph['@graph'].map(node => [node['@id'], node]));
  assert.equal(nodes.get(exact)?.version, archive.packagingVersion);
  assert.equal(nodes.get(exact)?.identifier, archive.doi);
  assert.equal(nodes.get(exact)?.['prov:wasDerivedFrom']?.['@id'],
    'https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/'+archive.sourceCommit);
  assert.equal(nodes.get(exact)?.['dcterms:isVersionOf']?.['@id'], concept);
  assert.equal(nodes.get(concept)?.['dcterms:hasVersion']?.['@id'], exact);
  assert.equal(nodes.get(concept)?.['dcat:hasCurrentVersion'], undefined);
  assert.doesNotMatch(JSON.stringify(nodes.get(exact)), /latest verified/i);
  assert.ok(nodes.has(datasetIri));
  assert.equal(nodes.get(datasetIri).version,archive.contentBaseline);
  for (const id of [datasetIri, 'https://www.ghezelbaash.ir/#saeed-ghezelbash', 'https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah']) {
    assert.ok(!JSON.stringify(nodes.get(id)?.sameAs ?? []).includes('doi.org/10.5281/zenodo'));
  }
});

test('every immutable record binding agrees with the reserved DOI', () => {
  const p = SOURCE.doiPolicy;
  const record = p.currentArchive.recordId;
  assert.ok(Number.isSafeInteger(record)&&record>0);
  assert.notEqual(record,p.concept.recordId);
  assert.equal(p.concept.doi,`10.5281/zenodo.${p.concept.recordId}`);
  assert.equal(p.currentArchive.role,'current_exact');
  assert.match(p.currentArchive.packagingVersion,/^\d+\.\d+\.\d+\+zenodo\.\d+$/);
  assert.ok(p.currentArchive.packagingVersion.startsWith(p.currentArchive.contentBaseline+'+'));
  assert.equal(p.downloadBindings.recordId, record);
  assert.equal(p.currentArchive.doi, `10.5281/zenodo.${record}`);
  assert.equal(p.currentArchive.url, `https://doi.org/${p.currentArchive.doi}`);
  assert.equal(p.downloadBindings.publicPrefix, `https://zenodo.org/records/${record}/files/`);
  assert.equal(p.downloadBindings.apiPrefix, `https://zenodo.org/api/records/${record}/files/`);
  assert.ok(p.downloadBindings.bundle.startsWith(p.downloadBindings.publicPrefix));
  const bundleName=p.downloadBindings.bundle.slice(p.downloadBindings.publicPrefix.length);
  assert.match(bundleName,/^[A-Za-z0-9._+-]+\.zip$/);
  assert.equal(p.downloadBindings.role,'download_binding');
});

test('a later maintenance build cannot relabel a pinned immutable archive', () => {
  const env=standaloneEnv({GITHUB_SHA:'3'.repeat(40),ARCHIVE_SOURCE_COMMIT:'4'.repeat(40),PREPARE_RESERVED_DOI:''});
  const js=execFileSync(process.execPath,['--input-type=module','-e',"import {DOI_POLICY} from './src/lib/doi-policy.mjs';console.log(DOI_POLICY.currentArchive.sourceCommit)"],{cwd,env,encoding:'utf8'}).trim();
  const python=execFileSync('python3',['-c',"import sys;sys.path.insert(0,'.github/scripts');import platform_bundle;print(platform_bundle.DOI_POLICY['currentArchive']['sourceCommit'])"],{cwd,env,encoding:'utf8'}).trim();
  assert.equal(js,env.ARCHIVE_SOURCE_COMMIT);assert.equal(python,env.ARCHIVE_SOURCE_COMMIT);
});

test('absence of an archive pin outside explicit preflight fails safely', () => {
  const env=standaloneEnv({GITHUB_SHA:'5'.repeat(40),ARCHIVE_SOURCE_COMMIT:'',PREPARE_RESERVED_DOI:''});
  assert.throws(()=>execFileSync(process.execPath,['--input-type=module','-e',"import './src/lib/doi-policy.mjs'"],{cwd,env,stdio:'pipe'}));
});

test('the captured published edition remains reproducible after the current binding changes', () => {
  // This is the real previous published policy from source 52ebaa1, not an
  // invented future reservation. Its old IDs/version are deliberately fixed.
  const bytes=readFileSync(new URL('./fixtures/doi-policy-published-23474664.json',import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    '5193f391d3278f6902ccb266b13cf1952924fd48e62528565306be5459eda380');
  const previous=JSON.parse(bytes);
  assert.equal(previous.currentArchive.recordId,23474664);
  assert.equal(previous.currentArchive.url,'https://doi.org/10.5281/zenodo.23474664');
  assert.equal(previous.currentArchive.packagingVersion,'1.3.4+zenodo.3');
  assert.equal(previous.concept.url,concept);
  const pin='ed767f6e6726e1453196e2ec2b312fcad00677e2';
  const env=standaloneEnv({ARCHIVE_SOURCE_COMMIT:pin,PREPARE_RESERVED_DOI:'',GITHUB_SHA:'6'.repeat(40)});
  const js=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',`
    import {readFileSync} from 'node:fs';
    import {resolveDoiPolicy} from './src/lib/doi-policy.mjs';
    const previous=JSON.parse(readFileSync('tests/fixtures/doi-policy-published-23474664.json','utf8'));
    console.log(JSON.stringify(resolveDoiPolicy(previous,process.env,()=>process.env.GITHUB_SHA)));
  `],{cwd,env,encoding:'utf8'}));
  const python=JSON.parse(execFileSync('python3',['-c',[
    "import json,os,sys;sys.path.insert(0,'.github/scripts')",
    'from release_plan import resolve_policy',
    "previous=json.load(open('tests/fixtures/doi-policy-published-23474664.json'))",
    'print(json.dumps(resolve_policy(previous,os.environ,os.environ["GITHUB_SHA"])))',
  ].join(';')],{cwd,env,encoding:'utf8'}));
  assert.deepEqual(js,python);
  assert.deepEqual(js,{...previous,currentArchive:{...previous.currentArchive,sourceCommit:pin}});
});
