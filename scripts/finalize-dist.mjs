import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFile,writeFile,readdir,unlink} from 'node:fs/promises';
import {assertDocumentContract,inspectHtml} from './lib/html-contract.mjs';
import {resolveDeterministicBuildInstant} from './lib/deterministic-build-time.mjs';
import {deriveIdentityFingerprint,hashIdentityFingerprint} from './lib/release-identity.mjs';
import {analyzeGraphClosure} from './lib/graph-integrity.mjs';
import {currentReleaseMetadataMismatches,selectCurrentReleaseBoundNodes} from './lib/release-graph.mjs';
import {compileHeadersTemplate} from './lib/headers-template.mjs';

const root=process.cwd(),dist=path.resolve(root,process.argv[2]||'dist'),data=path.join(root,'src/data');
const inv=JSON.parse(await readFile(path.join(data,'release-invariants.json'),'utf8'));
const release=JSON.parse(await readFile(path.join(data,'release.json'),'utf8'));
const volatile=JSON.parse(await readFile(path.join(data,'volatile-facts.json'),'utf8'));
const visibleContract=JSON.parse(await readFile(path.join(data,'visible-contract.json'),'utf8'));
const stableMediaInventory=JSON.parse(await readFile(path.join(data,'stable-media-aliases.json'),'utf8'));
const generatedAt=resolveDeterministicBuildInstant({releaseDate:release.dateModified}).iso;
const liveRevision=process.env.CF_PAGES_COMMIT_SHA||process.env.SOURCE_COMMIT||process.env.GITHUB_SHA||'local-unbound';
const shaHex=b=>createHash('sha256').update(b).digest('hex');
const shaB64=b=>createHash('sha256').update(b).digest('base64');
async function walk(d,p=''){let out=[];for(const e of (await readdir(d,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const a=path.join(d,e.name),r=p?`${p}/${e.name}`:e.name;if(e.isDirectory())out.push(...await walk(a,r));else if(e.isFile())out.push({abs:a,rel:r});}return out;}

const fileMeta=async rel=>{const b=await readFile(path.join(dist,rel));return{rel,bytes:b.length,sha256:shaHex(b)};};

const html=await readFile(path.join(dist,'index.html'),'utf8'),notFound=await readFile(path.join(dist,'404.html'),'utf8');
const activeCss=(html.match(/\/assets\/site\.[0-9a-f]{12}\.css/)||[])[0]?.slice(1);
if(!activeCss)throw new Error('Active fingerprint stylesheet missing before DIST finalization');
const distAssetDir=path.join(dist,'assets');
for(const name of await readdir(distAssetDir))if(/^site\.[0-9a-f]{12}\.css$/.test(name)&&`assets/${name}`!==activeCss)await unlink(path.join(distAssetDir,name));

const graph=JSON.parse(await readFile(path.join(dist,'graph.jsonld'),'utf8'));
const graphIntegrity=analyzeGraphClosure(graph,{baseUrl:release.canonicalUrl});
if(graphIntegrity.duplicateIds.length||graphIntegrity.danglingSameSiteCount>inv.maxOrphanGraphNodes)throw new Error(`Graph closure failed: duplicates=${graphIntegrity.duplicateIds.length}, dangling=${graphIntegrity.danglingSameSiteCount}`);
const releaseBoundNodes=selectCurrentReleaseBoundNodes(graph,release.dataset.id);
const releaseBoundMismatches=currentReleaseMetadataMismatches(releaseBoundNodes,{datasetId:release.dataset.id,release:release.release,dateModified:release.dateModified});
if(!releaseBoundNodes.length||releaseBoundMismatches.length)throw new Error(`Release-bound graph drift: nodes=${releaseBoundNodes.length}, mismatches=${releaseBoundMismatches.length}`);
const types=n=>Array.isArray(n['@type'])?n['@type']:[n['@type']].filter(Boolean);
const byId=new Map(graph['@graph'].filter(n=>n['@id']).map(n=>[n['@id'],n]));
const dataset=byId.get(`${release.canonicalUrl}graph.jsonld#dataset`);
if(!dataset?.name)throw new Error('Canonical Dataset node/name missing before DIST finalization');
const datasetName=dataset.name;

// Bind the mutable current-serving matrix before any integrity inventory is computed.
const currentMatrixPath=path.join(dist,'current-release-matrix.json');
const currentMatrix=JSON.parse(await readFile(path.join(data,'projections/current-release-matrix.json'),'utf8'));
Object.assign(currentMatrix,{liveRevision,sourceCommit:liveRevision,generatedAt});
await writeFile(currentMatrixPath,JSON.stringify(currentMatrix,null,2)+'\n');

// Canonical linked-data descriptors are generated before Astro build by generate-descriptors.mjs.
// Finalization treats them as immutable build inputs and validates their embedded hashes.
const dataPackage=JSON.parse(await readFile(path.join(dist,'datapackage.json'),'utf8'));
const croissant=JSON.parse(await readFile(path.join(dist,'croissant.json'),'utf8'));
const descriptorResourceCount=(dataPackage.resources||[]).length;

// CSP is derived only after executable/inline content is final.
const styleBlocks=[...html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi)].map(m=>m[1]);
const scriptBlocks=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(m=>({attrs:m[1],body:m[2]}));
const ldScripts=scriptBlocks.filter(x=>/type=["']application\/ld\+json["']/i.test(x.attrs));
const execScripts=scriptBlocks.filter(x=>!/type=["']application\/ld\+json["']/i.test(x.attrs));
const styles404=[...notFound.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi)].map(m=>m[1]);
const scriptBlocks404=[...notFound.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(m=>({attrs:m[1],body:m[2]}));
if(ldScripts.length!==2||execScripts.length!==2||!execScripts.some(x=>/id=["']site-runtime["']/i.test(x.attrs))||!execScripts.some(x=>/id=["']deferred-stylesheet-loader["']/i.test(x.attrs))||scriptBlocks404.length!==1||!/id=["']deferred-stylesheet-loader["']/i.test(scriptBlocks404[0].attrs)||styleBlocks.length<1||styles404.length<1)throw new Error(`Unexpected inline assets: styles=${styleBlocks.length}, ld=${ldScripts.length}, exec=${execScripts.length}, exec404=${scriptBlocks404.length}`);
const scriptHashes=scriptBlocks.map(x=>`'sha256-${shaB64(Buffer.from(x.body))}'`).join(' '),styleHashes=styleBlocks.map(x=>`'sha256-${shaB64(Buffer.from(x))}'`).join(' ');
const mainCsp=`default-src 'none'; base-uri 'self'; script-src ${scriptHashes}; style-src 'self' ${styleHashes}; img-src 'self' data:; media-src 'self'; font-src 'self'; manifest-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests`;
const csp404=`default-src 'none'; base-uri 'self'; script-src ${scriptBlocks404.map(x=>`'sha256-${shaB64(Buffer.from(x.body))}'`).join(' ')}; style-src 'self' ${styles404.map(x=>`'sha256-${shaB64(Buffer.from(x))}'`).join(' ')}; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; upgrade-insecure-requests`;
const headersTemplate=await readFile(path.join(data,'templates/headers.template'),'utf8');
const templateMachine=['graph.jsonld','graph.ttl','entity-facts.csv','answers.txt','knowledge.xml','llms.txt','index.md','llms-full.txt','provenance.jsonld','evidence-snapshot.json','shapes.ttl','datapackage.json','linkset.json','void.ttl','dcat.ttl','croissant.json','query-matrix.jsonl','live-observations.jsonld','current-release-matrix.json','artifact-manifest.json'];

const core=JSON.parse(ldScripts[0].body),support=JSON.parse(ldScripts[1].body);
const htmlContract=assertDocumentContract(html),ids=htmlContract.ids,frags=htmlContract.fragments,idSet=new Set(ids),missing=[];inspectHtml(notFound);
const files={};
for(const f of await walk(dist)){if(['artifact-manifest.json','_headers','live-serving-attestation.json','release-attestation.json'].includes(f.rel))continue;const b=await readFile(f.abs);files[f.rel]={bytes:b.length,sha256:shaHex(b)};}
const finger=Object.keys(files).filter(x=>/\.[0-9a-f]{12}\.[^.]+$/.test(x));
const llmsFullBytes=await readFile(path.join(dist,'llms-full.txt'));const llmPassages=(llmsFullBytes.toString('utf8').match(/^\[PASSAGE\]$/gm)||[]).length;const supportBytes=Buffer.byteLength(ldScripts[1].body);
const provenance=JSON.parse(await readFile(path.join(dist,'provenance.jsonld'),'utf8')),evidenceSnapshot=JSON.parse(await readFile(path.join(dist,'evidence-snapshot.json'),'utf8'));const provNodes=provenance['@graph']||[],provPassageCount=provNodes.filter(n=>String(n['@id']||'').includes('provenance.jsonld#passage-')).length,provAnswerCount=provNodes.filter(n=>String(n['@id']||'').includes('provenance.jsonld#answer-')).length,evidenceNodeCount=provNodes.filter(n=>String(n.additionalType||'').startsWith('EvidenceTier')).length;const calibrationSha256=shaHex(await readFile(path.join(root,'src/data/render-calibration.json')));
const queryRows=(await readFile(path.join(dist,'query-matrix.jsonl'),'utf8')).trim().split(/\r?\n/).filter(Boolean).length;
const liveBytes=await readFile(path.join(dist,'live-observations.jsonld'));
const manifest={
 architecture:'Astro pure-static single-page SSG with physician-first identity graph, deterministic release projections, Query Matrix 2.0, evidence/provenance, immutable release semantics separated from mutable live observations, single-pass current-serving integrity and native Cloudflare Git deployment.',
 generatedAt,canonicalUrl:release.canonicalUrl,release:release.release,baseRelease:release.release,liveRevision,
 dataset:{id:release.dataset.id,name:datasetName,wikidata:release.dataset.wikidata,conceptDoi:release.dataset.zenodo.conceptDoi,versionDoi:release.dataset.zenodo.versionDoi,zenodoRecordId:String(release.dataset.zenodo.recordId)},
 primaryEntity:{name:release.primaryEntity.name,fullNameAliases:release.primaryEntity.officialAliases,googleKnowledgeGraphId:release.primaryEntity.googleKnowledgeGraphId,wikidata:release.primaryEntity.wikidata},
 stableMediaIdentity:{...stableMediaInventory.subject,authorityMasterCount:(stableMediaInventory.aliases||[]).length,contract:'IPTC PersonInImageId + Dublin Core relation + embedded entity graph + HTTP Link'},
 identityFingerprint:{sha256:hashIdentityFingerprint(release),value:deriveIdentityFingerprint(release)},
 provenance:{passageRecords:provPassageCount,answerRecords:provAnswerCount,evidenceRecords:evidenceNodeCount,evidenceSnapshotObservedAt:evidenceSnapshot.observedAt},
 supportingClinic:{googleLocalKgmid:release.clinic.googleLocalKgmid,placeId:release.clinic.placeId,cid:release.clinic.cid,postalCode:release.clinic.postalCode,hours:release.clinic.hours,owner:release.primaryEntity.id},
 review:{date:release.medicalReviewedAt,reviewedBy:release.reviewedBy},
 liveObservation:{url:`${release.canonicalUrl}live-observations.jsonld`,entity:release.clinic.id,placeId:release.clinic.placeId,rating:Number(volatile.rating),reviewCount:Number(volatile.reviewCount),valueObservedAt:volatile.valueObservedAt},
 retrieval:{queryMatrix:`${release.canonicalUrl}query-matrix.jsonl`,queryRows,serviceCoverage:currentMatrix.servicesWithAliasCoverage,languages:['fa','en','ar','ckb'],positioningMode:'maximum_dominant_best_positioning'},
 video:{videoObjectCount:graph['@graph'].filter(n=>types(n).includes('VideoObject')).length,clipCount:graph['@graph'].filter(n=>types(n).includes('Clip')).length,chapterTrackCount:(html.match(/<track\b[^>]*kind=["']chapters["']/gi)||[]).length,captionTrackCount:(html.match(/<track\b[^>]*kind=["']captions["']/gi)||[]).length,formats:['video/av1 WebM','video/H.264 MP4'],captionStatus:'two Persian caption tracks are verified from visible burned-in subtitles; chapter tracks remain for all four videos; thread-lift and Kurdish testimonial speech captions are intentionally not fabricated without verified source text'},
 integrity:{algorithm:'SHA-256',excluded:['artifact-manifest.json','_headers','live-serving-attestation.json','release-attestation.json'],note:'Current manifest excludes itself, deployment headers and terminal attestations; integrity terminates at live-serving-attestation.json without a self-reference cycle.'},
 invariants:{userFacingHtmlPageCount:1,stableMediaAliasCount:(stableMediaInventory.aliases||[]).length,authorityMasterGoogleKgUrlCoverage:`${(stableMediaInventory.aliases||[]).length}/${(stableMediaInventory.aliases||[]).length}`,namespaceDocumentationPageCount:2,real404:true,htmlBytes:Buffer.byteLength(html),htmlUnder2000000:Buffer.byteLength(html)<inv.googlebotFetchBudgetBytes,htmlWithinGooglebotSafeBudget:Buffer.byteLength(html)<inv.maxHtmlBytes,googlebotReservedResponseHeaderBytes:inv.googlebotReservedResponseHeaderBytes,googlebotSafetyMarginBytes:inv.googlebotSafetyMarginBytes,externalGraphNodeCount:graph['@graph'].length,externalRdfTripleCount:inv.externalRdfTripleCount,coreGraphNodeCount:core['@graph'].length,coreGraphBytes:Buffer.byteLength(ldScripts[0].body),supportGraphNodeCount:support['@graph'].length,supportGraphBytes:supportBytes,ragPassageCount:llmPassages,ragCorpusSha256:shaHex(llmsFullBytes),queryMatrixRows:queryRows,rootHtmlSha256:shaHex(Buffer.from(html)),executableScriptCount:execScripts.length,htmlIdCount:ids.length,uniqueHtmlIdCount:idSet.size,fragmentLinkCount:frags.length,missingFragmentTargets:missing,renderChunkCount:(html.match(/class=["'][^"']*render-chunk/gi)||[]).length,renderCalibrationSha256:calibrationSha256,fullGraphClosed:graphIntegrity.fullGraphClosed,orphanGraphNodeCount:graphIntegrity.danglingSameSiteCount,duplicateGraphIdCount:graphIntegrity.duplicateIds.length,releaseBoundNodeCount:releaseBoundNodes.length,fingerprintedImmutableAssetCount:finger.length,fridayClosed:release.clinic.fridayClosed,localTruthOwnerConfirmed:release.clinic.ownerConfirmed,postalCode:release.clinic.postalCode,requiredAliasesPresent:release.primaryEntity.officialAliases.every(x=>JSON.stringify(graph).includes(x)),redirectsPreservedByteIdentical:shaHex(await readFile(path.join(dist,'_redirects')))===inv.redirectsSha256,redirectsSha256:shaHex(await readFile(path.join(dist,'_redirects'))),machineResourceIndexingPolicy:'canonical HTML is the sole Google Search sitemap landing; high-impact machine representations remain public, CORS-readable and generically index,follow while Googlebot receives scoped noindex,follow; machine discovery remains available through Link relations, linked-data descriptors and direct endpoints',releaseDerived:true},
 files
};
const manifestPath=path.join(dist,'artifact-manifest.json');
await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`);
const headerDigests={'index.html':shaB64(await readFile(path.join(dist,'index.html')))};
for(const file of templateMachine)headerDigests[file]=shaB64(await readFile(path.join(dist,file)));
const headers=compileHeadersTemplate(headersTemplate,{mainCsp,csp404,digests:headerDigests});
if(/\btrack-src\b/i.test(headers))throw new Error('Invalid CSP directive track-src');
await writeFile(path.join(dist,'_headers'),headers);

// Terminal current-serving attestation: nothing it hashes is mutated after this write.
const headersBytes=await readFile(path.join(dist,'_headers')),manifestBytes=await readFile(manifestPath),visibleContractSha256=shaHex(Buffer.from(JSON.stringify(visibleContract)));
const attestation={schemaVersion:'1.0',baseRelease:release.release,liveRevision,generatedAt,sourceCommit:liveRevision,artifactManifestSha256:shaHex(manifestBytes),indexHtmlSha256:shaHex(Buffer.from(html)),liveObservationSha256:shaHex(liveBytes),headersSha256:shaHex(headersBytes),visibleContractSha256,visibleContractPolicy:visibleContract.policy,mutableVisibleSelector:visibleContract.mutableSelector,conceptDoi:release.dataset.zenodo.conceptDoi,versionDoi:release.dataset.zenodo.versionDoi,integrity:'CURRENT_SERVING'};
await writeFile(path.join(dist,'live-serving-attestation.json'),JSON.stringify(attestation,null,2)+'\n');

// Descriptor integrity must survive the complete finalization DAG.
for(const r of dataPackage.resources||[]){const rel=String(r.path||'').replace(/^\//,'');if(!rel)continue;const m=await fileMeta(rel);if(r.bytes!==m.bytes||r.hash!==`sha256:${m.sha256}`)throw new Error(`Data Package post-finalization hash drift ${rel}`);}
for(const r of croissant.distribution||[]){const u=String(r.contentUrl||'');if(!u.startsWith(release.canonicalUrl))continue;const rel=u.slice(release.canonicalUrl.length).split('#')[0];if(!rel)continue;const m=await fileMeta(rel);if(String(r.contentSize)!==String(m.bytes)||r.sha256!==m.sha256)throw new Error(`Croissant post-finalization hash drift ${rel}`);}

console.log(JSON.stringify({finalized:true,release:release.release,liveRevision,htmlBytes:manifest.invariants.htmlBytes,graphNodes:manifest.invariants.externalGraphNodeCount,queryRows,clips:manifest.video.clipCount,chunks:manifest.invariants.renderChunkCount,files:Object.keys(files).length+2,descriptorResources:descriptorResourceCount,manifestSha256:attestation.artifactManifestSha256,headersSha256:attestation.headersSha256,liveObservationSha256:attestation.liveObservationSha256,descriptorIntegrity:'PASS',graphClosure:'PASS',nonCircular:true},null,2));
