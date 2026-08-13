import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {assembleCanonicalContent} from './lib/assemble-content.mjs';

const root=process.cwd();
const fail=message=>{throw new Error(message)};
const contract=JSON.parse(await readFile(path.join(root,'src/data/subdomain-redirects.json'),'utf8'));
const graph=JSON.parse(await readFile(path.join(root,'src/data/semantic/knowledge-graph.jsonld'),'utf8'));
const {content}=await assembleCanonicalContent({root,graph});
const redirectsText=await readFile(path.join(root,'public/_redirects'),'utf8');
const machineRoutes=new Set(['/graph.jsonld','/graph.ttl','/entity-facts.csv','/answers.txt','/knowledge.xml','/llms.txt','/llms-full.txt','/index.md','/datapackage.json','/linkset.json','/void.ttl','/dcat.ttl','/croissant.json','/provenance.jsonld','/evidence-snapshot.json','/shapes.ttl','/artifact-manifest.json']);
const articlePattern=/^\/2025\/\d{2}\/blog-post(?:_?\d+)?\.html$/;

if(contract.schemaVersion!==2)fail(`Unsupported subdomain redirect schema ${contract.schemaVersion}`);
if(contract.zone!=='ghezelbaash.ir'||contract.canonicalOrigin!=='https://www.ghezelbaash.ir')fail('Subdomain redirect zone/canonical origin drift');
const canonical=new URL(contract.canonicalOrigin);
const fragments=new Set([...content.matchAll(/\bid=["']([^"']+)["']/gi)].map(match=>match[1]));
const validateTarget=(targetValue,ref)=>{
  const target=new URL(targetValue);
  if(target.protocol!=='https:')fail(`Non-HTTPS redirect target ${ref}`);
  if(target.origin===canonical.origin){
    if(target.pathname!=='/'||!target.hash)fail(`Canonical redirect target must use a precise visible fragment: ${ref}`);
    const fragment=decodeURIComponent(target.hash.slice(1));
    if(!fragments.has(fragment))fail(`Redirect target fragment is absent from canonical HTML: ${fragment}`);
    if(machineRoutes.has(target.pathname))fail(`Redirect must not terminate on a machine-only URL: ${ref}`);
  }
  return target;
};

const single=contract.singleRedirects;
if(single?.cloudflareProduct!=='Single Redirects')fail('Missing Single Redirects contract');
if(single.planRuleLimit!==10||!Array.isArray(single.rules)||!single.rules.length||single.rules.length>single.planRuleLimit)fail('Invalid Cloudflare Free Single Redirect contract');
const singleRefs=new Set(),singleHosts=new Set();
for(const rule of single.rules){
  if(!/^[a-z0-9_]+$/.test(rule.ref)||singleRefs.has(rule.ref))fail(`Invalid or duplicate Single Redirect ref ${rule.ref}`);
  singleRefs.add(rule.ref);
  if(!/^[a-z0-9-]+\.ghezelbaash\.ir$/.test(rule.host)||singleHosts.has(rule.host))fail(`Invalid or duplicate managed Single Redirect host ${rule.host}`);
  singleHosts.add(rule.host);
  if(rule.match!=='allPaths'||rule.statusCode!==301||rule.preserveQueryString!==false)fail(`Invalid Single Redirect behavior ${rule.ref}`);
  validateTarget(rule.target,rule.ref);
}
const expectedSingleHosts=new Set(['doctor.ghezelbaash.ir','github.ghezelbaash.ir','ig.ghezelbaash.ir']);
if(singleHosts.size!==expectedSingleHosts.size||[...expectedSingleHosts].some(host=>!singleHosts.has(host)))fail(`Managed Single Redirect host drift: ${[...singleHosts].join(', ')}`);
if(singleHosts.has('blog.ghezelbaash.ir'))fail('Blog catchall must not pre-empt exact Bulk Redirects');
const ig=single.rules.find(rule=>rule.host==='ig.ghezelbaash.ir');
if(ig?.target!==`${contract.canonicalOrigin}/#verified-physician-identity-core`)fail('ig subdomain must consolidate into the visible first-party identity bridge');
if([...machineRoutes].some(route=>ig.target.startsWith(`${contract.canonicalOrigin}${route}`)))fail('ig subdomain must not redirect to a Googlebot-noindex machine representation');
const github=single.rules.find(rule=>rule.host==='github.ghezelbaash.ir');
if(github?.target!=='https://github.com/medicaldoctor91/doctor-ghezelbaash')fail('github subdomain must preserve repository intent and independent source evidence');
const doctor=single.rules.find(rule=>rule.host==='doctor.ghezelbaash.ir');
if(!doctor?.target.includes('query_place_id=ChIJBT0YDOTt-j8RD-7mAPy6Zas'))fail('doctor subdomain lost the canonical Google Maps Place ID');

const bulk=contract.bulkRedirects;
if(bulk?.cloudflareProduct!=='Bulk Redirects'||bulk.planUrlLimit!==10000)fail('Invalid Cloudflare Free Bulk Redirect contract');
if(!/^[a-z0-9_]{1,50}$/.test(bulk.listName)||!/^[a-z0-9_]+$/.test(bulk.ruleRef))fail('Invalid Bulk Redirect list or rule name');
if(bulk.host!=='blog.ghezelbaash.ir'||bulk.unmatchedPathPolicy!=='do-not-redirect')fail('Blog Bulk Redirect host/unmatched-path policy drift');
if(!Array.isArray(bulk.groups)||!bulk.groups.length)fail('Bulk Redirect groups are empty');
const bulkRefs=new Set(),sourcePaths=new Set(),targetFragments=new Set();
for(const group of bulk.groups){
  if(!/^[a-z0-9_]+$/.test(group.ref)||bulkRefs.has(group.ref))fail(`Invalid or duplicate Bulk Redirect group ref ${group.ref}`);
  bulkRefs.add(group.ref);
  if(!Array.isArray(group.paths)||!group.paths.length)fail(`Bulk Redirect group has no paths: ${group.ref}`);
  if(group.statusCode!==301||group.preserveQueryString!==false)fail(`Invalid Bulk Redirect behavior: ${group.ref}`);
  const target=validateTarget(group.target,group.ref);
  targetFragments.add(target.hash.slice(1));
  for(const source of group.paths){
    if(typeof source!=='string'||!source.startsWith('/')||source.includes('?')||source.includes('#')||decodeURI(source)!==decodeURI(new URL(source,'https://blog.ghezelbaash.ir').pathname))fail(`Invalid exact Bulk Redirect source path ${source}`);
    if(sourcePaths.has(source))fail(`Duplicate Bulk Redirect source path ${source}`);
    sourcePaths.add(source);
  }
}
if(sourcePaths.size>bulk.planUrlLimit)fail(`Bulk Redirect URL quota exceeded: ${sourcePaths.size}`);
const articlePaths=[...sourcePaths].filter(pathValue=>articlePattern.test(pathValue));
const labelPaths=[...sourcePaths].filter(pathValue=>pathValue.startsWith('/search/label/'));
for(const [field,actual] of [['uniqueExecutableSourcePaths',sourcePaths.size],['historicalArticlePaths',articlePaths.length],['historicalLabelPaths',labelPaths.length]]){
  if(bulk.evidence?.[field]!==actual)fail(`Archive evidence count drift for ${field}: ${actual}`);
}
if(bulk.evidence?.archivedHtmlUrls!==sourcePaths.size+1)fail('Archived HTML count must explain the one query-only /search duplicate');
if(bulk.evidence?.queryOnlyVariantsCollapsed!==1)fail('Historical query-only collapse evidence drift');
const expected404=['/2025/02/blog-post_57.html','/2025/02/blog-post_87.html','/2025/03/blog-post_06.html'];
if(JSON.stringify(bulk.evidence?.excludedArchived404Paths)!==JSON.stringify(expected404))fail('Historical 404 exclusion evidence drift');
for(const excluded of expected404)if(sourcePaths.has(excluded))fail(`Historical 404 must not be redirected: ${excluded}`);
for(const required of ['/','/2025/02/','/2025/03/','/2025/04/','/2025/05/','/2025/08/','/search'])if(!sourcePaths.has(required))fail(`Missing recovered archive path ${required}`);

const pagesRedirects=new Map();
for(const [index,raw] of redirectsText.split(/\r?\n/).entries()){
  const line=raw.trim();if(!line||line.startsWith('#'))continue;
  const parts=line.split(/\s+/);if(parts.length!==3)fail(`Invalid public/_redirects line ${index+1}`);
  pagesRedirects.set(parts[0],{target:parts[1],statusCode:Number(parts[2])});
}
for(const group of bulk.groups){
  const target=new URL(group.target),relative=`/${target.hash}`;
  for(const source of group.paths.filter(pathValue=>articlePattern.test(pathValue))){
    const pages=pagesRedirects.get(source);
    if(!pages||pages.target!==relative||pages.statusCode!==group.statusCode)fail(`Pages/blog legacy redirect parity drift: ${source}`);
  }
}
for(const source of [...pagesRedirects.keys()].filter(pathValue=>articlePattern.test(pathValue)))if(!sourcePaths.has(source))fail(`Legacy Blogspot path is missing from Bulk Redirect contract: ${source}`);
if(pagesRedirects.has('/'))fail('Canonical Pages redirects must never redirect the root path');
for(const excluded of expected404)if(pagesRedirects.has(excluded))fail(`Historical 404 leaked into Pages redirects: ${excluded}`);

console.log(JSON.stringify({
  valid:true,
  singleRedirectProduct:single.cloudflareProduct,
  singleRedirectRuleCount:single.rules.length,
  singleRedirectRuleLimit:single.planRuleLimit,
  bulkRedirectProduct:bulk.cloudflareProduct,
  bulkRedirectUrlCount:sourcePaths.size,
  bulkRedirectUrlLimit:bulk.planUrlLimit,
  historicalArticlePaths:articlePaths.length,
  historicalLabelPaths:labelPaths.length,
  canonicalFragments:targetFragments.size,
  unmatchedBlogPaths:bulk.unmatchedPathPolicy
},null,2));
