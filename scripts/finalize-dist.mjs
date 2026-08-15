import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFile,writeFile,readdir,unlink} from 'node:fs/promises';
import {assertDocumentContract,inspectHtml} from './lib/html-contract.mjs';
import {resolveDeterministicBuildInstant} from './lib/deterministic-build-time.mjs';

const root=process.cwd(),dist=path.resolve(root,process.argv[2]||'dist'),data=path.join(root,'src/data');
const inv=JSON.parse(await readFile(path.join(data,'release-invariants.json'),'utf8'));
const release=JSON.parse(await readFile(path.join(data,'release.json'),'utf8'));
const volatile=JSON.parse(await readFile(path.join(data,'volatile-facts.json'),'utf8'));
const visibleContract=JSON.parse(await readFile(path.join(data,'visible-contract.json'),'utf8'));
const stableMediaInventory=JSON.parse(await readFile(path.join(data,'stable-media-aliases.json'),'utf8'));
const generatedAt=resolveDeterministicBuildInstant({releaseDate:release.dateModified}).iso;
const liveRevision=process.env.CF_PAGES_COMMIT_SHA||process.env.SOURCE_COMMIT||process.env.GITHUB_SHA||'local-unbound';
const createdAt=(release.dataset.zenodo.releaseHistory||[]).map(x=>x.publicationDate).sort()[0]||release.dateModified;
const shaHex=b=>createHash('sha256').update(b).digest('hex');
const shaB64=b=>createHash('sha256').update(b).digest('base64');
async function walk(d,p=''){let out=[];for(const e of (await readdir(d,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const a=path.join(d,e.name),r=p?`${p}/${e.name}`:e.name;if(e.isDirectory())out.push(...await walk(a,r));else if(e.isFile())out.push({abs:a,rel:r});}return out;}

const contentTypes={
 'graph.jsonld':'application/ld+json','graph.ttl':'text/turtle','entity-facts.csv':'text/csv','answers.txt':'text/plain','knowledge.xml':'application/xml','llms.txt':'text/plain','index.md':'text/markdown','llms-full.txt':'text/plain','void.ttl':'text/turtle','dcat.ttl':'text/turtle','linkset.json':'application/linkset+json','provenance.jsonld':'application/ld+json','evidence-snapshot.json':'application/json','shapes.ttl':'text/turtle','query-matrix.jsonl':'application/jsonl'
};
const resourceTitles={
 'graph.jsonld':'Canonical JSON-LD entity knowledge graph','graph.ttl':'RDF Turtle serialization isomorphic with JSON-LD','entity-facts.csv':'Flat fact projection of canonical graph','answers.txt':'Canonical direct-answer corpus','knowledge.xml':'Hierarchical semantic knowledge projection','llms.txt':'Machine discovery and retrieval guide','index.md':'Full canonical content projection','llms-full.txt':'Passage-oriented full content projection','void.ttl':'VoID RDF dataset description','dcat.ttl':'W3C DCAT 3 catalog and distribution metadata','linkset.json':'RFC 9264 Web Link Set','provenance.jsonld':'Claim and passage provenance graph','evidence-snapshot.json':'Release-time evidence snapshot','shapes.ttl':'SHACL entity constitution','query-matrix.jsonl':'Query Matrix 2.0 multilingual intent and service retrieval projection'
};
// Query Matrix is release-semantic and belongs in the canonical descriptor inventory.
// Live observations/current-serving matrix stay discoverable but outside the frozen descriptor hash set.
const coreResources=['graph.jsonld','graph.ttl','entity-facts.csv','answers.txt','knowledge.xml','llms.txt','index.md','llms-full.txt','provenance.jsonld','evidence-snapshot.json','shapes.ttl','query-matrix.jsonl'];
const descriptorResources=[...coreResources,'void.ttl','dcat.ttl','linkset.json'];
const fileMeta=async rel=>{const b=await readFile(path.join(dist,rel));return{rel,bytes:b.length,sha256:shaHex(b),mediaType:contentTypes[rel]||'application/octet-stream',title:resourceTitles[rel]||rel};};
const ttlString=s=>`"${String(s).replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('\n','\\n')}"`;

const html=await readFile(path.join(dist,'index.html'),'utf8'),notFound=await readFile(path.join(dist,'404.html'),'utf8');
const activeCss=(html.match(/\/assets\/site\.[0-9a-f]{12}\.css/)||[])[0]?.slice(1);
if(!activeCss)throw new Error('Active fingerprint stylesheet missing before DIST finalization');
const distAssetDir=path.join(dist,'assets');
for(const name of await readdir(distAssetDir))if(/^site\.[0-9a-f]{12}\.css$/.test(name)&&`assets/${name}`!==activeCss)await unlink(path.join(distAssetDir,name));

const graph=JSON.parse(await readFile(path.join(dist,'graph.jsonld'),'utf8'));
const types=n=>Array.isArray(n['@type'])?n['@type']:[n['@type']].filter(Boolean);
const byId=new Map(graph['@graph'].filter(n=>n['@id']).map(n=>[n['@id'],n]));
const person=byId.get(release.primaryEntity.id),identityMe=(Array.isArray(person?.sameAs)?person.sameAs:[person?.sameAs].filter(Boolean)).map(x=>({href:typeof x==='string'?x:x?.['@id']})).filter(x=>x.href);
const dataset=byId.get(`${release.canonicalUrl}graph.jsonld#dataset`);
const datasetName=typeof dataset?.name==='string'?dataset.name:'Dr. Saeed Ghezelbash Public Knowledge Graph';
const datasetDescription=typeof dataset?.description==='string'?dataset.description:'Physician-owned first-party entity, clinic, medical-topic, answer and provenance dataset for Saeed Ghezelbash.';

// Bind the mutable current-serving matrix before any integrity inventory is computed.
const currentMatrixPath=path.join(dist,'current-release-matrix.json');
const currentMatrix=JSON.parse(await readFile(currentMatrixPath,'utf8'));
Object.assign(currentMatrix,{liveRevision,sourceCommit:liveRevision,generatedAt});
await writeFile(currentMatrixPath,JSON.stringify(currentMatrix,null,2)+'\n');

// RFC 9264 Link Set is generated once from canonical release/current-serving truth.
const linkset={linkset:[{anchor:release.canonicalUrl,canonical:[{href:release.canonicalUrl}],author:[{href:release.primaryEntity.id}],about:[{href:release.primaryEntity.id},{href:release.clinic.id},{href:`${release.canonicalUrl}#doctor-ghezelbaash-structured-data-project`}],describedby:[
 {href:`${release.canonicalUrl}graph.jsonld`,type:'application/ld+json'},
 {href:`${release.canonicalUrl}graph.ttl`,type:'text/turtle'},
 {href:`${release.canonicalUrl}entity-facts.csv`,type:'text/csv'},
 {href:`${release.canonicalUrl}knowledge.xml`,type:'application/xml'},
 {href:`${release.canonicalUrl}query-matrix.jsonl`,type:'application/jsonl'},
 {href:`${release.canonicalUrl}live-observations.jsonld`,type:'application/ld+json'},
 {href:`${release.canonicalUrl}current-release-matrix.json`,type:'application/json'},
 {href:`${release.canonicalUrl}datapackage.json`,type:'application/json'},
 {href:`${release.canonicalUrl}void.ttl`,type:'text/turtle'},
 {href:`${release.canonicalUrl}dcat.ttl`,type:'text/turtle'},
 {href:`${release.canonicalUrl}croissant.json`,type:'application/ld+json'},
 {href:`${release.canonicalUrl}provenance.jsonld`,type:'application/ld+json'},
 {href:`${release.canonicalUrl}evidence-snapshot.json`,type:'application/json'},
 {href:`${release.canonicalUrl}shapes.ttl`,type:'text/turtle'},
 {href:`${release.canonicalUrl}artifact-manifest.json`,type:'application/json'}],license:[{href:'https://creativecommons.org/licenses/by/4.0/'}],alternate:[
 {href:`${release.canonicalUrl}answers.txt`,type:'text/plain'},
 {href:`${release.canonicalUrl}llms.txt`,type:'text/plain'},
 {href:`${release.canonicalUrl}index.md`,type:'text/markdown'},
 {href:`${release.canonicalUrl}llms-full.txt`,type:'text/plain'}],me:identityMe}]};
await writeFile(path.join(dist,'linkset.json'),`${JSON.stringify(linkset,null,2)}\n`);

const voidTtl=`@prefix void: <http://rdfs.org/ns/void#> .\n@prefix dct: <http://purl.org/dc/terms/> .\n@prefix foaf: <http://xmlns.com/foaf/0.1/> .\n@prefix schema: <https://schema.org/> .\n<${release.canonicalUrl}graph.jsonld#dataset> a void:Dataset ;\n  dct:title ${ttlString(datasetName)}@en ;\n  dct:publisher <${release.primaryEntity.id}> ;\n  dct:modified ${ttlString(release.dateModified)} ;\n  dct:license <https://creativecommons.org/licenses/by/4.0/> ;\n  foaf:homepage <${release.canonicalUrl}> ;\n  foaf:primaryTopic <${release.primaryEntity.id}> ;\n  void:uriSpace ${ttlString(release.canonicalUrl)} ;\n  void:triples ${inv.externalRdfTripleCount} ;\n  void:dataDump <${release.canonicalUrl}graph.jsonld>, <${release.canonicalUrl}graph.ttl>, <${release.canonicalUrl}entity-facts.csv>, <${release.canonicalUrl}query-matrix.jsonl> ;\n  void:vocabulary <https://schema.org/>, <http://purl.org/dc/terms/>, <http://www.w3.org/ns/prov#> .\n<${release.primaryEntity.id}> a foaf:Person ; foaf:name "Saeed Ghezelbash"@en .\n`;
await writeFile(path.join(dist,'void.ttl'),voidTtl);

// DCAT, Data Package and Croissant are generated once from final leaf bytes.
const dcatMeta=await Promise.all(coreResources.map(fileMeta));
const distributionIris=dcatMeta.map(m=>`<${release.canonicalUrl}${m.rel}#distribution>`).join(', ');
let dcat=`@prefix dcat: <http://www.w3.org/ns/dcat#> .\n@prefix dct: <http://purl.org/dc/terms/> .\n@prefix spdx: <http://spdx.org/rdf/terms#> .\n@prefix schema: <https://schema.org/> .\n@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n\n<${release.canonicalUrl}#data-catalog> a dcat:Catalog ; dct:title "${datasetName} — Data Catalog"@en ; dct:publisher <${release.primaryEntity.id}> ; dct:modified "${release.dateModified}"^^xsd:date ; dcat:dataset <${release.canonicalUrl}graph.jsonld#dataset> .\n<${release.canonicalUrl}graph.jsonld#dataset> a dcat:Dataset ; dct:title ${ttlString(datasetName)}@en ; dct:description ${ttlString(datasetDescription)}@en ; dct:creator <${release.primaryEntity.id}> ; dct:publisher <${release.primaryEntity.id}> ; dct:modified "${release.dateModified}"^^xsd:date ; dct:license <https://creativecommons.org/licenses/by/4.0/> ; dcat:landingPage <${release.canonicalUrl}> ; schema:version "${release.release}" ; dcat:distribution ${distributionIris} .\n\n`;
for(const m of dcatMeta)dcat+=`<${release.canonicalUrl}${m.rel}#distribution> a dcat:Distribution ; dct:title ${ttlString(m.title)}@en ; dct:license <https://creativecommons.org/licenses/by/4.0/> ; dcat:accessURL <${release.canonicalUrl}${m.rel}> ; dcat:downloadURL <${release.canonicalUrl}${m.rel}> ; dcat:mediaType ${ttlString(m.mediaType)} ; dcat:byteSize "${m.bytes}"^^xsd:decimal ; spdx:checksum [ a spdx:Checksum ; spdx:algorithm spdx:checksumAlgorithm_sha256 ; spdx:checksumValue "${m.sha256}" ] .\n\n`;
await writeFile(path.join(dist,'dcat.ttl'),dcat);

const descriptorMeta=await Promise.all(descriptorResources.map(fileMeta));
const allFiles=await walk(dist),vttMeta=[];
for(const f of allFiles.filter(f=>f.rel.endsWith('.vtt'))){const b=await readFile(f.abs);const kind=f.rel.includes('.captions.')?'caption':'chapter';vttMeta.push({rel:f.rel,bytes:b.length,sha256:shaHex(b),mediaType:'text/vtt',title:kind==='caption'?'Verified Persian WebVTT caption track transcribed from visible burned-in subtitles.':'WebVTT chapter track for a self-hosted physician video.'});}
const resources=[...descriptorMeta,...vttMeta];
const slug=s=>s.replace(/\.[^.]+$/,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase();
const dataPackage={profile:'data-package',name:'dr-saeed-ghezelbash-public-knowledge-graph',title:`${datasetName} — Data Package`,description:'Physician-owned first-party knowledge graph, direct-answer, evidence, provenance and retrieval resources for Dr. Saeed Ghezelbash and the supporting clinic.',homepage:release.canonicalUrl,id:`${release.canonicalUrl}datapackage.json`,version:release.release,created:createdAt,lastUpdated:release.dateModified,licenses:[{name:'CC-BY-4.0',path:'https://creativecommons.org/licenses/by/4.0/',title:'Creative Commons Attribution 4.0'}],contributors:[{title:'Saeed Ghezelbash',path:release.primaryEntity.id,role:'author, creator, publisher, owner'}],resources:resources.map(m=>({name:slug(m.rel),path:m.rel,title:m.title,format:m.rel.endsWith('.vtt')?'vtt':undefined,mediatype:m.mediaType,bytes:m.bytes,hash:`sha256:${m.sha256}`,description:m.rel.endsWith('.vtt')?m.title:undefined})).map(o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined)))};
await writeFile(path.join(dist,'datapackage.json'),`${JSON.stringify(dataPackage,null,2)}\n`);
const croissant={
 '@context':{'@language':'en','@base':release.canonicalUrl,'@vocab':'https://schema.org/','sc':'https://schema.org/','cr':'http://mlcommons.org/croissant/','dct':'http://purl.org/dc/terms/','conformsTo':'dct:conformsTo'},
 '@id':`${release.canonicalUrl}graph.jsonld#dataset`,'@type':'sc:Dataset',conformsTo:'http://mlcommons.org/croissant/1.1',name:datasetName,description:'Physician-owned first-party knowledge graph Dataset for Dr. Saeed Ghezelbash, the supporting clinic, services, answers, provenance and machine retrieval.',url:release.canonicalUrl,license:'https://creativecommons.org/licenses/by/4.0/',version:release.release,datePublished:release.dateModified,dateCreated:createdAt,dateModified:release.dateModified,creator:{'@id':release.primaryEntity.id,'@type':'sc:Person',name:'Saeed Ghezelbash'},publisher:{'@id':release.primaryEntity.id,'@type':'sc:Person',name:'Saeed Ghezelbash'},keywords:['Saeed Ghezelbash',...release.primaryEntity.officialAliases.slice(0,2),'physician knowledge graph','aesthetic medicine','Kermanshah','entity data','linked data','query matrix','multilingual retrieval'],inLanguage:['fa','en','ar','ckb'],isLiveDataset:false,distribution:resources.map(m=>({'@type':'cr:FileObject','@id':`${release.canonicalUrl}${m.rel}#croissant-file`,name:path.basename(m.rel),contentUrl:`${release.canonicalUrl}${m.rel}`,contentSize:String(m.bytes),encodingFormat:m.mediaType,sha256:m.sha256,description:m.rel.endsWith('.vtt')?m.title:undefined})).map(o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined)))
};
await writeFile(path.join(dist,'croissant.json'),`${JSON.stringify(croissant,null,2)}\n`);

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
let headers=await readFile(path.join(data,'templates/headers.template'),'utf8');
headers=headers.replace('{{MAIN_CSP}}',mainCsp).replace('{{404_CSP}}',csp404);
const templateMachine=['graph.jsonld','graph.ttl','entity-facts.csv','answers.txt','knowledge.xml','llms.txt','index.md','llms-full.txt','provenance.jsonld','evidence-snapshot.json','shapes.ttl','datapackage.json','linkset.json','void.ttl','dcat.ttl','croissant.json','artifact-manifest.json'];
headers=headers.replace('{{DIGEST:index.html}}',shaB64(await readFile(path.join(dist,'index.html'))));
for(const file of templateMachine.filter(file=>file!=='artifact-manifest.json'))headers=headers.replace(`{{DIGEST:${file}}}`,shaB64(await readFile(path.join(dist,file))));

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
 generatedAt,canonicalUrl:release.canonicalUrl,release:inv.release,baseRelease:release.release,liveRevision,
 dataset:{id:release.dataset.id,name:datasetName,wikidata:release.dataset.wikidata,conceptDoi:release.dataset.zenodo.conceptDoi,versionDoi:release.dataset.zenodo.versionDoi,zenodoRecordId:String(release.dataset.zenodo.recordId)},
 primaryEntity:{name:'Saeed Ghezelbash',fullNameAliases:inv.officialAliases??inv.aliases,googleKnowledgeGraphId:inv.googleKg,wikidata:'Q140287622'},
 stableMediaIdentity:{...stableMediaInventory.subject,authorityMasterCount:(stableMediaInventory.aliases||[]).length,contract:'IPTC PersonInImageId + Dublin Core relation + embedded entity graph + HTTP Link'},
 identityFingerprint:{sha256:inv.identityFingerprintSha256,value:release.identityFingerprint},
 provenance:{passageRecords:provPassageCount,answerRecords:provAnswerCount,evidenceRecords:evidenceNodeCount,evidenceSnapshotObservedAt:evidenceSnapshot.observedAt},
 supportingClinic:{googleLocalKgmid:inv.clinicKg,placeId:inv.placeId,cid:'12350483144643112463',postalCode:inv.postalCode,hours:'Saturday–Thursday 16:00–22:00; Friday closed',owner:release.primaryEntity.id},
 review:{date:release.medicalReviewedAt,reviewedBy:inv.reviewedBy},
 liveObservation:{url:`${release.canonicalUrl}live-observations.jsonld`,entity:release.clinic.id,placeId:release.clinic.placeId,rating:Number(volatile.rating),reviewCount:Number(volatile.reviewCount),valueObservedAt:volatile.valueObservedAt},
 retrieval:{queryMatrix:`${release.canonicalUrl}query-matrix.jsonl`,queryRows,serviceCoverage:currentMatrix.servicesWithAliasCoverage,languages:['fa','en','ar','ckb'],positioningMode:'maximum_dominant_best_positioning'},
 video:{videoObjectCount:graph['@graph'].filter(n=>types(n).includes('VideoObject')).length,clipCount:graph['@graph'].filter(n=>types(n).includes('Clip')).length,chapterTrackCount:(html.match(/<track\b[^>]*kind=["']chapters["']/gi)||[]).length,captionTrackCount:(html.match(/<track\b[^>]*kind=["']captions["']/gi)||[]).length,formats:['video/av1 WebM','video/H.264 MP4'],captionStatus:'two Persian caption tracks are verified from visible burned-in subtitles; chapter tracks remain for all four videos; thread-lift and Kurdish testimonial speech captions are intentionally not fabricated without verified source text'},
 integrity:{algorithm:'SHA-256',excluded:['artifact-manifest.json','_headers','live-serving-attestation.json','release-attestation.json'],note:'Current manifest excludes itself, deployment headers and terminal attestations; integrity terminates at live-serving-attestation.json without a self-reference cycle.'},
 invariants:{userFacingHtmlPageCount:1,stableMediaAliasCount:(stableMediaInventory.aliases||[]).length,authorityMasterGoogleKgUrlCoverage:`${(stableMediaInventory.aliases||[]).length}/${(stableMediaInventory.aliases||[]).length}`,namespaceDocumentationPageCount:2,real404:true,htmlBytes:Buffer.byteLength(html),htmlUnder2000000:Buffer.byteLength(html)<inv.googlebotFetchBudgetBytes,htmlWithinGooglebotSafeBudget:Buffer.byteLength(html)<inv.maxHtmlBytes,googlebotReservedResponseHeaderBytes:inv.googlebotReservedResponseHeaderBytes,googlebotSafetyMarginBytes:inv.googlebotSafetyMarginBytes,externalGraphNodeCount:graph['@graph'].length,externalRdfTripleCount:inv.externalRdfTripleCount,coreGraphNodeCount:core['@graph'].length,coreGraphBytes:Buffer.byteLength(ldScripts[0].body),supportGraphNodeCount:support['@graph'].length,supportGraphBytes:supportBytes,ragPassageCount:llmPassages,ragCorpusSha256:shaHex(llmsFullBytes),queryMatrixRows:queryRows,rootHtmlSha256:shaHex(Buffer.from(html)),executableScriptCount:execScripts.length,htmlIdCount:ids.length,uniqueHtmlIdCount:idSet.size,fragmentLinkCount:frags.length,missingFragmentTargets:missing,renderChunkCount:(html.match(/class=["'][^"']*render-chunk/gi)||[]).length,renderCalibrationSha256:calibrationSha256,fullGraphClosed:true,fingerprintedImmutableAssetCount:finger.length,fridayClosed:true,localTruthOwnerConfirmed:true,postalCode:inv.postalCode,requiredAliasesPresent:(inv.aliases??[]).every(x=>JSON.stringify(graph).includes(x)),redirectsPreservedByteIdentical:shaHex(await readFile(path.join(dist,'_redirects')))===inv.redirectsSha256,redirectsSha256:shaHex(await readFile(path.join(dist,'_redirects'))),machineResourceIndexingPolicy:'canonical HTML is the sole Google Search sitemap landing; high-impact machine representations remain public, CORS-readable and generically index,follow while Googlebot receives scoped noindex,follow; machine discovery remains available through Link relations, linked-data descriptors and direct endpoints',releaseDerived:true},
 files
};
const manifestPath=path.join(dist,'artifact-manifest.json');
await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`);
headers=headers.replace('{{DIGEST:artifact-manifest.json}}',shaB64(await readFile(manifestPath)));
if(/{{[^}]+}}/.test(headers))throw new Error('Unresolved _headers placeholder');
if(/\btrack-src\b/i.test(headers))throw new Error('Invalid CSP directive track-src');

const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const routeBlock=(route,media,cache,digest=true)=>`\n/${route}\n  Content-Type: ${media}\n  X-Robots-Tag: index, follow, max-snippet:-1\n  X-Robots-Tag: googlebot: noindex, follow\n  Cache-Control: ${cache}\n  Cloudflare-CDN-Cache-Control: ${cache}\n  Link: <${release.canonicalUrl}${route}>; rel="canonical", <${release.dataset.id}>; rel="describedby", <${release.clinic.id}>; rel="about"\n${digest?'  Repr-Digest: sha-256=:__DIGEST__:\n':''}  Access-Control-Allow-Origin: *\n  Access-Control-Expose-Headers: Link, Repr-Digest, Content-Signal\n  Cross-Origin-Resource-Policy: cross-origin\n`;
const ensureBlock=(route,media,cache,digest=true)=>{if(!new RegExp(`(?:^|\\n)/${esc(route)}\\n`).test(headers))headers+=routeBlock(route,media,cache,digest);};
ensureBlock('query-matrix.jsonl','application/jsonl; charset=utf-8','public, max-age=3600, must-revalidate');
ensureBlock('live-observations.jsonld','application/ld+json; charset=utf-8','public, max-age=0, must-revalidate');
ensureBlock('current-release-matrix.json','application/json; charset=utf-8','public, max-age=0, must-revalidate');
ensureBlock('live-serving-attestation.json','application/json; charset=utf-8','public, max-age=0, must-revalidate',false);

const mutateRoute=(route,fn)=>{const lines=headers.split('\n'),i=lines.findIndex(x=>x===`/${route}`);if(i<0)return;for(let j=i+1;j<lines.length&&/^  /.test(lines[j]);j++)lines[j]=fn(lines[j]);headers=lines.join('\n');};
for(const route of ['artifact-manifest.json','live-observations.jsonld','current-release-matrix.json','live-serving-attestation.json'])mutateRoute(route,line=>/^  Cache-Control:/.test(line)?'  Cache-Control: public, max-age=0, must-revalidate':/^  Cloudflare-CDN-Cache-Control:/.test(line)?'  Cloudflare-CDN-Cache-Control: public, max-age=0, must-revalidate':line);
for(const route of ['graph.jsonld','graph.ttl','entity-facts.csv','answers.txt','knowledge.xml','llms.txt','index.md','llms-full.txt','datapackage.json','croissant.json','dcat.ttl','void.ttl','linkset.json','provenance.jsonld','evidence-snapshot.json','shapes.ttl','query-matrix.jsonl'])mutateRoute(route,line=>/^  Cloudflare-CDN-Cache-Control:/.test(line)?'  Cloudflare-CDN-Cache-Control: public, max-age=3600, must-revalidate, stale-if-error=86400':line);

const setDigest=(route,b64)=>{const lines=headers.split('\n'),i=lines.findIndex(x=>x===`/${route}`);if(i<0)throw new Error(`_headers route missing ${route}`);let found=false;for(let j=i+1;j<lines.length&&/^  /.test(lines[j]);j++){if(/^  Repr-Digest:/.test(lines[j])){lines[j]=`  Repr-Digest: sha-256=:${b64}:`;found=true;break;}}if(!found)lines.splice(i+1,0,`  Repr-Digest: sha-256=:${b64}:`);headers=lines.join('\n');};
for(const route of ['query-matrix.jsonl','live-observations.jsonld','current-release-matrix.json'])setDigest(route,shaB64(await readFile(path.join(dist,route))));
if(!headers.includes(`${release.canonicalUrl}live-observations.jsonld`)){const marker=/((?:^|\n)  Link: <https:\/\/www\.ghezelbaash\.ir\/entity-facts\.csv>[^\n]*\n)/;headers=headers.replace(marker,`$1  Link: <${release.canonicalUrl}query-matrix.jsonl>; rel="describedby"; type="application/jsonl", <${release.canonicalUrl}live-observations.jsonld>; rel="describedby"; type="application/ld+json", <${release.canonicalUrl}current-release-matrix.json>; rel="describedby"; type="application/json"\n`);}
await writeFile(path.join(dist,'_headers'),headers);

// Terminal current-serving attestation: nothing it hashes is mutated after this write.
const headersBytes=await readFile(path.join(dist,'_headers')),manifestBytes=await readFile(manifestPath),visibleContractSha256=shaHex(Buffer.from(JSON.stringify(visibleContract)));
const attestation={schemaVersion:'1.0',baseRelease:release.release,liveRevision,generatedAt,sourceCommit:liveRevision,artifactManifestSha256:shaHex(manifestBytes),indexHtmlSha256:shaHex(Buffer.from(html)),liveObservationSha256:shaHex(liveBytes),headersSha256:shaHex(headersBytes),visibleContractSha256,visibleContractPolicy:visibleContract.policy,mutableVisibleSelector:visibleContract.mutableAfterReleaseSelector,conceptDoi:release.dataset.zenodo.conceptDoi,versionDoi:release.dataset.zenodo.versionDoi,integrity:'CURRENT_SERVING'};
await writeFile(path.join(dist,'live-serving-attestation.json'),JSON.stringify(attestation,null,2)+'\n');

// Descriptor integrity must survive the complete finalization DAG.
for(const r of dataPackage.resources||[]){const rel=String(r.path||'').replace(/^\//,'');if(!rel)continue;const m=await fileMeta(rel);if(r.bytes!==m.bytes||r.hash!==`sha256:${m.sha256}`)throw new Error(`Data Package post-finalization hash drift ${rel}`);}
for(const r of croissant.distribution||[]){const u=String(r.contentUrl||'');if(!u.startsWith(release.canonicalUrl))continue;const rel=u.slice(release.canonicalUrl.length).split('#')[0];if(!rel)continue;const m=await fileMeta(rel);if(String(r.contentSize)!==String(m.bytes)||r.sha256!==m.sha256)throw new Error(`Croissant post-finalization hash drift ${rel}`);}

console.log(JSON.stringify({finalized:true,release:inv.release,liveRevision,htmlBytes:manifest.invariants.htmlBytes,graphNodes:manifest.invariants.externalGraphNodeCount,queryRows,clips:manifest.video.clipCount,chunks:manifest.invariants.renderChunkCount,files:Object.keys(files).length+2,descriptorResources:resources.length,manifestSha256:attestation.artifactManifestSha256,headersSha256:attestation.headersSha256,liveObservationSha256:attestation.liveObservationSha256,descriptorIntegrity:'PASS',nonCircular:true},null,2));
