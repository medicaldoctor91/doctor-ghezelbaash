import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {generatedWorkspace} from './generated-workspace.mjs';

const root=process.cwd(),data=path.join(root,'src/data'),semantic=path.join(data,'semantic'),generated=generatedWorkspace(root),projections=generated.projections;
const distFlag=process.argv.indexOf('--dist');
const distMode=distFlag>=0;
const distDir=distMode?path.resolve(root,process.argv[distFlag+1]||'dist'):null;
const outputDir=distMode?distDir:projections;
const readJson=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const release=await readJson('src/data/release.json');
const inv=await readJson('src/data/release-invariants.json');
const rdfLock=await readJson('.generated/semantic/rdf-lock.json');
const graph=await readJson('src/data/semantic/knowledge-graph.jsonld');
await mkdir(outputDir,{recursive:true});
const nodes=graph['@graph']||[],byId=new Map(nodes.filter(n=>n?.['@id']).map(n=>[n['@id'],n]));
const dataset=byId.get(release.dataset.id),person=byId.get(release.primaryEntity.id);
if(!dataset||!person)throw new Error('Descriptor generator missing canonical Dataset/Person');
if(rdfLock.triples!==inv.externalRdfTripleCount||rdfLock.source!=='src/data/semantic/knowledge-graph.jsonld')throw new Error('RDF lock and release triple invariant diverged before descriptor generation');
const arr=v=>Array.isArray(v)?v:(v==null?[]:[v]);
const id=v=>typeof v==='string'?v:v?.['@id'];
const identityMe=arr(person.sameAs).map(id).filter(Boolean).map(href=>({href}));
const datasetName=typeof dataset.name==='string'?dataset.name:'Dr. Saeed Ghezelbash Public Knowledge Graph';
const datasetDescription=typeof dataset.description==='string'?dataset.description:'Physician-owned first-party entity, clinic, medical-topic, answer and provenance dataset for Saeed Ghezelbash.';
const createdAt=(release.dataset.zenodo.releaseHistory||[]).map(x=>x.publicationDate).filter(Boolean).sort()[0]||release.dateModified;
const datasetLandingPage=`https://doi.org/${release.dataset.zenodo.versionDoi}`;
const shaHex=b=>createHash('sha256').update(b).digest('hex');
const ttlString=s=>`"${String(s).replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('\n','\\n')}"`;
const contentTypes={'graph.jsonld':'application/ld+json','graph.ttl':'text/turtle','entity-facts.csv':'text/csv','answers.txt':'text/plain','knowledge.xml':'application/xml','llms.txt':'text/plain','index.md':'text/markdown','llms-full.txt':'text/plain','void.ttl':'text/turtle','dcat.ttl':'text/turtle','linkset.json':'application/linkset+json','provenance.jsonld':'application/ld+json','evidence-snapshot.json':'application/json','shapes.ttl':'text/turtle','query-matrix.jsonl':'application/jsonl'};
const resourceTitles={'graph.jsonld':'Canonical JSON-LD entity knowledge graph','graph.ttl':'RDF Turtle serialization isomorphic with JSON-LD','entity-facts.csv':'Flat fact projection of canonical graph','answers.txt':'Canonical direct-answer corpus','knowledge.xml':'Hierarchical semantic knowledge projection','llms.txt':'Machine discovery and retrieval guide','index.md':'Full canonical content projection','llms-full.txt':'Passage-oriented full content projection','void.ttl':'VoID RDF dataset description','dcat.ttl':'W3C DCAT 3 catalog and distribution metadata','linkset.json':'RFC 9264 Web Link Set','provenance.jsonld':'Claim and passage provenance graph','evidence-snapshot.json':'Release-time evidence snapshot','shapes.ttl':'SHACL entity constitution','query-matrix.jsonl':'Query Matrix 2.0 multilingual intent and service retrieval projection'};
const sourceProjectionAbs=rel=>rel==='graph.jsonld'?path.join(semantic,'knowledge-graph.jsonld'):rel==='graph.ttl'?path.join(generated.semantic,'knowledge-graph.ttl'):rel==='shapes.ttl'?path.join(semantic,'shapes.ttl'):path.join(projections,rel);
const artifactAbs=rel=>distMode?path.join(distDir,rel):sourceProjectionAbs(rel);
const fileMeta=async rel=>{const b=await readFile(artifactAbs(rel));return{rel,bytes:b.length,sha256:shaHex(b),mediaType:contentTypes[rel]||'application/octet-stream',title:resourceTitles[rel]||rel};};
const coreResources=['graph.jsonld','graph.ttl','entity-facts.csv','answers.txt','knowledge.xml','llms.txt','index.md','llms-full.txt','provenance.jsonld','evidence-snapshot.json','shapes.ttl','query-matrix.jsonl'];
const out=rel=>path.join(outputDir,rel);

const linkset={linkset:[{anchor:release.canonicalUrl,canonical:[{href:release.canonicalUrl}],author:[{href:release.primaryEntity.id}],about:[{href:release.primaryEntity.id},{href:release.clinic.id}],describedby:[
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
await writeFile(out('linkset.json'),JSON.stringify(linkset,null,2)+'\n');

const voidTtl=`@prefix void: <http://rdfs.org/ns/void#> .\n@prefix dct: <http://purl.org/dc/terms/> .\n@prefix foaf: <http://xmlns.com/foaf/0.1/> .\n@prefix schema: <https://schema.org/> .\n<${release.canonicalUrl}graph.jsonld#dataset> a void:Dataset ;\n  dct:title ${ttlString(datasetName)}@en ;\n  dct:publisher <${release.primaryEntity.id}> ;\n  dct:modified ${ttlString(release.dateModified)} ;\n  dct:license <https://creativecommons.org/licenses/by/4.0/> ;\n  foaf:homepage <${datasetLandingPage}> ;\n  foaf:primaryTopic <${release.primaryEntity.id}> ;\n  void:uriSpace ${ttlString(release.canonicalUrl)} ;\n  void:triples ${inv.externalRdfTripleCount} ;\n  void:dataDump <${release.canonicalUrl}graph.jsonld>, <${release.canonicalUrl}graph.ttl>, <${release.canonicalUrl}entity-facts.csv>, <${release.canonicalUrl}query-matrix.jsonl> ;\n  void:vocabulary <https://schema.org/>, <http://purl.org/dc/terms/>, <http://www.w3.org/ns/prov#> .\n<${release.primaryEntity.id}> a foaf:Person ; foaf:name "Saeed Ghezelbash"@en .\n`;
await writeFile(out('void.ttl'),voidTtl);

const dcatMeta=await Promise.all(coreResources.map(fileMeta));
const distributionIris=dcatMeta.map(m=>`<${release.canonicalUrl}${m.rel}#distribution>`).join(', ');
let dcat=`@prefix dcat: <http://www.w3.org/ns/dcat#> .\n@prefix dct: <http://purl.org/dc/terms/> .\n@prefix spdx: <http://spdx.org/rdf/terms#> .\n@prefix schema: <https://schema.org/> .\n@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n\n<${release.canonicalUrl}#data-catalog> a dcat:Catalog ; dct:title "${datasetName} — Data Catalog"@en ; dct:publisher <${release.primaryEntity.id}> ; dct:modified "${release.dateModified}"^^xsd:date ; dcat:dataset <${release.canonicalUrl}graph.jsonld#dataset> .\n<${release.canonicalUrl}graph.jsonld#dataset> a dcat:Dataset ; dct:title ${ttlString(datasetName)}@en ; dct:description ${ttlString(datasetDescription)}@en ; dct:creator <${release.primaryEntity.id}> ; dct:publisher <${release.primaryEntity.id}> ; dct:modified "${release.dateModified}"^^xsd:date ; dct:license <https://creativecommons.org/licenses/by/4.0/> ; dcat:landingPage <${datasetLandingPage}> ; schema:version "${release.release}" ; dcat:distribution ${distributionIris} .\n\n`;
for(const m of dcatMeta)dcat+=`<${release.canonicalUrl}${m.rel}#distribution> a dcat:Distribution ; dct:title ${ttlString(m.title)}@en ; dct:license <https://creativecommons.org/licenses/by/4.0/> ; dcat:accessURL <${release.canonicalUrl}${m.rel}> ; dcat:downloadURL <${release.canonicalUrl}${m.rel}> ; dcat:mediaType ${ttlString(m.mediaType)} ; dcat:byteSize "${m.bytes}"^^xsd:decimal ; spdx:checksum [ a spdx:Checksum ; spdx:algorithm spdx:checksumAlgorithm_sha256 ; spdx:checksumValue "${m.sha256}" ] .\n\n`;
await writeFile(out('dcat.ttl'),dcat);

const descriptorResources=[...coreResources,'void.ttl','dcat.ttl','linkset.json'];
const descriptorMeta=await Promise.all(descriptorResources.map(fileMeta));
async function walkFiles(dir,prefix=''){let files=[];for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const abs=path.join(dir,e.name),rel=prefix?`${prefix}/${e.name}`:e.name;if(e.isDirectory())files.push(...await walkFiles(abs,rel));else if(e.isFile())files.push({abs,rel});}return files;}
const vttBase=distMode?distDir:path.join(root,'public');
const vttMeta=[];
for(const f of (await walkFiles(vttBase)).filter(x=>x.rel.endsWith('.vtt'))){const b=await readFile(f.abs);const kind=f.rel.includes('.captions.')?'caption':'chapter';vttMeta.push({rel:f.rel,bytes:b.length,sha256:shaHex(b),mediaType:'text/vtt',title:kind==='caption'?'Verified Persian WebVTT caption track transcribed from visible burned-in subtitles.':'WebVTT chapter track for a self-hosted physician video.'});}
const resources=[...descriptorMeta,...vttMeta];
const slug=s=>s.replace(/\.[^.]+$/,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase();
const fullSlug=s=>s.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase();
const baseNameCounts=new Map();for(const resource of resources){const name=slug(resource.rel);baseNameCounts.set(name,(baseNameCounts.get(name)||0)+1)}
const resourceName=rel=>{const base=slug(rel);return baseNameCounts.get(base)>1?fullSlug(rel):base};
const dataPackageResources=resources.map(m=>({name:resourceName(m.rel),path:m.rel,title:m.title,format:m.rel.endsWith('.vtt')?'vtt':undefined,mediatype:m.mediaType,bytes:m.bytes,hash:`sha256:${m.sha256}`,description:m.rel.endsWith('.vtt')?m.title:undefined})).map(o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined)));
const resourceNames=dataPackageResources.map(resource=>resource.name),resourcePaths=dataPackageResources.map(resource=>resource.path);
if(new Set(resourceNames).size!==resourceNames.length)throw new Error('Data Package resource names must be unique');
if(new Set(resourcePaths).size!==resourcePaths.length)throw new Error('Data Package resource paths must be unique');
for(const name of resourceNames)if(!/^[a-z0-9][a-z0-9._-]*$/.test(name))throw new Error(`Invalid Data Package resource name: ${name}`);
const dataPackage={profile:'data-package',name:'dr-saeed-ghezelbash-public-knowledge-graph',title:`${datasetName} — Data Package`,description:'Physician-owned first-party knowledge graph, direct-answer, evidence, provenance and retrieval resources for Dr. Saeed Ghezelbash and the supporting clinic.',homepage:datasetLandingPage,id:`${release.canonicalUrl}datapackage.json`,version:release.release,created:createdAt,lastUpdated:release.dateModified,licenses:[{name:'CC-BY-4.0',path:'https://creativecommons.org/licenses/by/4.0/',title:'Creative Commons Attribution 4.0'}],contributors:[{title:'Saeed Ghezelbash',path:release.primaryEntity.id,role:'author, creator, publisher, owner'}],resources:dataPackageResources};
await writeFile(out('datapackage.json'),JSON.stringify(dataPackage,null,2)+'\n');
const croissant={'@context':{'@language':'en','@base':release.canonicalUrl,'@vocab':'https://schema.org/','sc':'https://schema.org/','cr':'http://mlcommons.org/croissant/','dct':'http://purl.org/dc/terms/','conformsTo':'dct:conformsTo'},'@id':`${release.canonicalUrl}graph.jsonld#dataset`,'@type':'sc:Dataset',conformsTo:'http://mlcommons.org/croissant/1.1',name:datasetName,description:'Physician-owned first-party knowledge graph Dataset for Dr. Saeed Ghezelbaash, the supporting clinic, services, answers, provenance and machine retrieval.',url:datasetLandingPage,license:'https://creativecommons.org/licenses/by/4.0/',version:release.release,datePublished:release.dateModified,dateCreated:createdAt,dateModified:release.dateModified,creator:{'@id':release.primaryEntity.id,'@type':'sc:Person',name:'Saeed Ghezelbash'},publisher:{'@id':release.primaryEntity.id,'@type':'sc:Person',name:'Saeed Ghezelbash'},keywords:['Saeed Ghezelbash',...release.primaryEntity.officialAliases.slice(0,2),'physician knowledge graph','aesthetic medicine','Kermanshah','entity data','linked data','query matrix','multilingual retrieval'],inLanguage:['fa','en','ar','ckb'],isLiveDataset:false,distribution:resources.map(m=>({'@type':'cr:FileObject','@id':`${release.canonicalUrl}${m.rel}#croissant-file`,name:path.basename(m.rel),contentUrl:`${release.canonicalUrl}${m.rel}`,contentSize:String(m.bytes),encodingFormat:m.mediaType,sha256:m.sha256,description:m.rel.endsWith('.vtt')?m.title:undefined})).map(o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined)))};
await writeFile(out('croissant.json'),JSON.stringify(croissant,null,2)+'\n');
console.log(JSON.stringify({descriptorsGenerated:true,phase:distMode?'dist-final':'generated-input',release:release.release,coreResources:coreResources.length,resources:resources.length,queryMatrixIncluded:true,datasetName,outputDir:path.relative(root,outputDir)||'.'},null,2));
