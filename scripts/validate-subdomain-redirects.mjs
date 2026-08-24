import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {assembleCanonicalContent} from './lib/assemble-content.mjs';
import {STATIC_ARTIFACTS,staticArtifactForRoute} from '../src/lib/resources.mjs';

const root=process.cwd();
const fail=message=>{throw new Error(message)};
const contract=JSON.parse(await readFile(path.join(root,'src/data/subdomain-redirects.json'),'utf8'));
const graph=JSON.parse(await readFile(path.join(root,'src/data/semantic/knowledge-graph.jsonld'),'utf8'));
const {content}=await assembleCanonicalContent({root,graph});
const redirectsText=await readFile(path.join(root,'public/_redirects'),'utf8');
const machineRoutes=new Set([...STATIC_ARTIFACTS.map(({path:artifactPath})=>`/${artifactPath}`),'/artifact-manifest.json']);
const articlePattern=/^\/2025\/\d{2}\/blog-post(?:_?\d+)?\.html$/;

if(contract.schemaVersion!==2)fail(`Unsupported subdomain redirect schema ${contract.schemaVersion}`);
if(contract.zone!=='ghezelbaash.ir'||contract.canonicalOrigin!=='https://www.ghezelbaash.ir')fail('Subdomain redirect zone/canonical origin drift');
const canonical=new URL(contract.canonicalOrigin);
const fragments=new Set([...content.matchAll(/\bid=["']([^"']+)["']/gi)].map(match=>match[1]));
const validateHttpsTarget=(targetValue,ref)=>{const target=new URL(targetValue);if(target.protocol!=='https:')fail(`Non-HTTPS redirect target ${ref}`);return target};
const validateVisibleCanonicalTarget=(targetValue,ref)=>{const target=validateHttpsTarget(targetValue,ref);if(target.origin!==canonical.origin||target.pathname!=='/'||!target.hash)fail(`Canonical passage redirect must use a precise visible fragment: ${ref}`);const fragment=decodeURIComponent(target.hash.slice(1));if(!fragments.has(fragment))fail(`Redirect target fragment is absent from canonical HTML: ${fragment}`);return target};

const single=contract.singleRedirects;
if(single?.cloudflareProduct!=='Single Redirects')fail('Missing Single Redirects contract');
if(single.planRuleLimit!==10||!Array.isArray(single.rules)||!single.rules.length||single.rules.length>single.planRuleLimit)fail('Invalid Cloudflare Free Single Redirect contract');
const singleRefs=new Set(),singleHosts=new Set();
for(const rule of single.rules){if(!/^[a-z0-9_]+$/.test(rule.ref)||singleRefs.has(rule.ref))fail(`Invalid or duplicate Single Redirect ref ${rule.ref}`);singleRefs.add(rule.ref);if(!/^[a-z0-9-]+\.ghezelbaash\.ir$/.test(rule.host)||singleHosts.has(rule.host))fail(`Invalid or duplicate managed Single Redirect host ${rule.host}`);singleHosts.add(rule.host);if(rule.match!=='allPaths'||rule.statusCode!==301||rule.preserveQueryString!==false)fail(`Invalid Single Redirect behavior ${rule.ref}`);validateHttpsTarget(rule.target,rule.ref)}
const expectedSingleHosts=new Set(['doctor.ghezelbaash.ir','github.ghezelbaash.ir','ig.ghezelbaash.ir']);
if(singleHosts.size!==expectedSingleHosts.size||[...expectedSingleHosts].some(host=>!singleHosts.has(host)))fail(`Managed Single Redirect host drift: ${[...singleHosts].join(', ')}`);
if(singleHosts.has('blog.ghezelbaash.ir'))fail('Blog catchall must not pre-empt exact Bulk Redirects');
const machineEntrypoints=new Map([['github.ghezelbaash.ir',{ref:'ghezelbaash_github_entity_graph_v1',route:'/graph.jsonld'}],['ig.ghezelbaash.ir',{ref:'ghezelbaash_ig_ai_corpus_v1',route:'/llms-full.txt'}]]);
for(const [host,expected] of machineEntrypoints){const rule=single.rules.find(row=>row.host===host);const expectedTarget=`${contract.canonicalOrigin}${expected.route}`;if(rule?.ref!==expected.ref||rule?.target!==expectedTarget)fail(`${host} machine entrypoint drift`);const target=new URL(rule.target);if(target.origin!==canonical.origin||target.pathname!==expected.route||target.search||target.hash)fail(`${host} must terminate on its exact first-party machine endpoint`);if(!machineRoutes.has(expected.route))fail(`${host} target is not an approved machine representation`);const artifact=staticArtifactForRoute(expected.route);if(!artifact)fail(`Missing static artifact registry entry for ${expected.route}`);await readFile(path.join(root,artifact.source),'utf8').catch(()=>fail(`Missing static artifact source for ${expected.route}: ${artifact.source}`))}
const doctor=single.rules.find(rule=>rule.host==='doctor.ghezelbaash.ir');if(!doctor?.target.includes('query_place_id=ChIJBT0YDOTt-j8RD-7mAPy6Zas'))fail('doctor subdomain lost the canonical Google Maps Place ID');

const bulk=contract.bulkRedirects;
if(bulk?.cloudflareProduct!=='Bulk Redirects'||bulk.planUrlLimit!==10000)fail('Invalid Cloudflare Free Bulk Redirect contract');
if(!/^[a-z0-9_]{1,50}$/.test(bulk.listName)||!/^[a-z0-9_]+$/.test(bulk.ruleRef))fail('Invalid Bulk Redirect list or rule name');
if(bulk.host!=='blog.ghezelbaash.ir'||bulk.unmatchedPathPolicy!=='return-404')fail('Blog Bulk Redirect host/unmatched-path policy drift');
if(!Array.isArray(bulk.groups)||!bulk.groups.length)fail('Bulk Redirect groups are empty');
const bulkRefs=new Set(),sourcePaths=new Set(),targetFragments=new Set();
for(const group of bulk.groups){if(!/^[a-z0-9_]+$/.test(group.ref)||bulkRefs.has(group.ref))fail(`Invalid or duplicate Bulk Redirect group ref ${group.ref}`);bulkRefs.add(group.ref);if(!Array.isArray(group.paths)||!group.paths.length)fail(`Bulk Redirect group has no paths: ${group.ref}`);if(group.statusCode!==301||group.preserveQueryString!==false)fail(`Invalid Bulk Redirect behavior: ${group.ref}`);const target=validateVisibleCanonicalTarget(group.target,group.ref);targetFragments.add(target.hash.slice(1));for(const source of group.paths){if(typeof source!=='string'||!source.startsWith('/')||source.includes('?')||source.includes('#')||decodeURI(source)!==decodeURI(new URL(source,'https://blog.ghezelbaash.ir').pathname))fail(`Invalid exact Bulk Redirect source path ${source}`);if(sourcePaths.has(source))fail(`Duplicate Bulk Redirect source path ${source}`);sourcePaths.add(source)}}
if(sourcePaths.size>bulk.planUrlLimit)fail(`Bulk Redirect URL quota exceeded: ${sourcePaths.size}`);
const articlePaths=[...sourcePaths].filter(pathValue=>articlePattern.test(pathValue));const labelPaths=[...sourcePaths].filter(pathValue=>pathValue.startsWith('/search/label/'));
for(const [field,actual] of [['uniqueExecutableSourcePaths',sourcePaths.size],['historicalArticlePaths',articlePaths.length],['historicalLabelPaths',labelPaths.length]])if(bulk.evidence?.[field]!==actual)fail(`Archive evidence count drift for ${field}: ${actual}`);
if(bulk.evidence?.archivedHtmlUrls!==sourcePaths.size+1)fail('Archived HTML count must explain the one query-only /search duplicate');if(bulk.evidence?.queryOnlyVariantsCollapsed!==1)fail('Historical query-only collapse evidence drift');
const expected404=['/2025/02/blog-post_57.html','/2025/02/blog-post_87.html','/2025/03/blog-post_06.html'];if(JSON.stringify(bulk.evidence?.excludedArchived404Paths)!==JSON.stringify(expected404))fail('Historical 404 exclusion evidence drift');for(const excluded of expected404)if(sourcePaths.has(excluded))fail(`Historical 404 must not be redirected: ${excluded}`);for(const required of ['/','/2025/02/','/2025/03/','/2025/04/','/2025/05/','/2025/08/','/search'])if(!sourcePaths.has(required))fail(`Missing recovered archive path ${required}`);
const pagesRedirects=new Map();for(const [index,raw] of redirectsText.split(/\r?\n/).entries()){const line=raw.trim();if(!line||line.startsWith('#'))continue;const parts=line.split(/\s+/);if(parts.length!==3)fail(`Invalid public/_redirects line ${index+1}`);pagesRedirects.set(parts[0],{target:parts[1],statusCode:Number(parts[2])})}
for(const group of bulk.groups){const target=new URL(group.target),relative=`/${target.hash}`;for(const source of group.paths.filter(pathValue=>articlePattern.test(pathValue))){const pages=pagesRedirects.get(source);if(!pages||pages.target!==relative||pages.statusCode!==group.statusCode)fail(`Pages/blog historical redirect parity drift: ${source}`)}}
for(const source of [...pagesRedirects.keys()].filter(pathValue=>articlePattern.test(pathValue)))if(!sourcePaths.has(source))fail(`Historical Blogspot path is missing from Bulk Redirect contract: ${source}`);if(pagesRedirects.has('/'))fail('Canonical Pages redirects must never redirect the root path');for(const excluded of expected404)if(pagesRedirects.has(excluded))fail(`Historical 404 leaked into Pages redirects: ${excluded}`);
console.log(JSON.stringify({valid:true,singleRedirectProduct:single.cloudflareProduct,singleRedirectRuleCount:single.rules.length,singleRedirectRuleLimit:single.planRuleLimit,bulkRedirectProduct:bulk.cloudflareProduct,bulkRedirectUrlCount:sourcePaths.size,bulkRedirectUrlLimit:bulk.planUrlLimit,historicalArticlePaths:articlePaths.length,historicalLabelPaths:labelPaths.length,canonicalFragments:targetFragments.size,machineEntrypoints:Object.fromEntries([...machineEntrypoints].map(([host,{route}])=>[host,route])),machineArtifactRegistry:STATIC_ARTIFACTS.length,unmatchedBlogPaths:bulk.unmatchedPathPolicy},null,2));
