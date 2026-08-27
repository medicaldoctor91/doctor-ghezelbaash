import {readFile} from 'node:fs/promises';
import {applyCurrentReleaseMetadata,releaseHistoryNodeId} from './lib/release-graph.mjs';
import {commitTextFiles} from './lib/file-transaction.mjs';
import {canonicalizeRdfDocument} from './lib/rdf-measurement.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(x=>{const [k,...v]=x.replace(/^--/,'').split('=');return [k,v.join('=')]}));
const readJson=async file=>JSON.parse(await readFile(file,'utf8'));
const json=value=>`${JSON.stringify(value,null,2)}\n`;
const must=(cond,msg)=>{if(!cond)throw new Error(msg)};
const replaceExactly=(source,pattern,replacement,label)=>{
  const matches=String(source).match(pattern)||[];
  must(matches.length===1,`${label} must match exactly once; found ${matches.length}`);
  return String(source).replace(pattern,replacement);
};
const dryRun=args['dry-run']==='true'||args['dry-run']==='1';

const [release,pkg,lock,volatile,evidenceSnapshot,invariants,graph,citationSource,codemeta]=await Promise.all([
  readJson('src/data/release.json'),
  readJson('package.json'),
  readJson('package-lock.json'),
  readJson('src/data/volatile-facts.json'),
  readJson('src/data/evidence-snapshot.json'),
  readJson('src/data/release-invariants.json'),
  readJson('src/data/semantic/knowledge-graph.jsonld'),
  readFile('CITATION.cff','utf8'),
  readJson('codemeta.json'),
]);

const z=release.dataset?.zenodo;
must(z&&Array.isArray(z.releaseHistory),'Zenodo release truth requires releaseHistory[]');
const old={release:release.release,date:release.dateModified,recordId:String(z.recordId),versionDoi:z.versionDoi};
const next={release:args.version,date:args.date,recordId:String(args['zenodo-record']||''),versionDoi:args['zenodo-doi']};
must(/^\d+\.\d+\.\d+$/.test(next.release||''),'Invalid --version');
must(/^\d{4}-\d{2}-\d{2}$/.test(next.date||''),'Invalid --date');
must(/^\d+$/.test(next.recordId),'Invalid --zenodo-record');
must(/^10\.5281\/zenodo\.\d+$/.test(next.versionDoi||''),'Invalid --zenodo-doi');
must(next.versionDoi!==z.conceptDoi,'Concept DOI cannot be the Version DOI');
if(next.release===old.release){
  must(next.versionDoi===old.versionDoi&&next.recordId===old.recordId&&next.date===old.date,'Idempotent promotion request drifted from current release');
  console.log(JSON.stringify({promoted:false,idempotent:true,current:old},null,2));process.exit(0);
}

const existing=z.releaseHistory.find(x=>x.release===next.release);
if(existing)must(existing.versionDoi===next.versionDoi&&String(existing.recordId)===next.recordId&&existing.publicationDate===next.date,'Target release already exists with different identity');
else z.releaseHistory.push({release:next.release,recordId:next.recordId,versionDoi:next.versionDoi,publicationDate:next.date});
z.releaseHistory.sort((a,b)=>a.publicationDate.localeCompare(b.publicationDate)||a.release.localeCompare(b.release,undefined,{numeric:true}));
z.versionDoi=next.versionDoi;
z.recordId=next.recordId;
release.release=next.release;
release.dateModified=next.date;

pkg.version=next.release;
lock.version=next.release;
if(lock.packages?.[''])lock.packages[''].version=next.release;
volatile.release=next.release;
evidenceSnapshot.release=next.release;

const nodes=graph['@graph'];
must(Array.isArray(nodes),'Canonical graph lacks @graph');
const byId=new Map(nodes.filter(x=>x?.['@id']).map(x=>[x['@id'],x]));
const dataset=byId.get(release.dataset.id),project=byId.get(`${release.canonicalUrl}#doctor-ghezelbaash-structured-data-project`),github=byId.get(`${release.canonicalUrl}#project-github-source`),hf=byId.get(`${release.canonicalUrl}#project-huggingface-dataset`),zenodo=byId.get(`${release.canonicalUrl}#project-zenodo-release`),catalog=byId.get(`${release.canonicalUrl}#data-catalog`);
for(const [name,node] of Object.entries({dataset,project,github,hf,zenodo,catalog}))must(node,`Canonical graph node missing: ${name}`);

// Only known current-release nodes advance. Historical release nodes are never globally rewritten.
for(const node of [dataset,project,github,hf,zenodo,catalog]){
  if(Object.hasOwn(node,'version'))node.version=next.release;
  if(Object.hasOwn(node,'dateModified'))node.dateModified=next.date;
}
dataset.version=next.release;
dataset.dateModified=next.date;
delete dataset.sameAs;
delete dataset.url;
dataset.description='Canonical first-party Dr. Saeed Ghezelbash Public Knowledge Graph Dataset for the physician and supporting clinic. GitHub is its version-controlled source, Zenodo is immutable DOI preservation, and Hugging Face is its AI/retrieval distribution layer; these access points are related resources, not identity-equivalent entities.';
const identifiers=Array.isArray(dataset.identifier)?dataset.identifier:[];
const keep=identifiers.filter(x=>!(x&&typeof x==='object'&&['DOI','Zenodo Version DOI','Zenodo Concept DOI'].includes(String(x.propertyID||''))));
keep.push({'@type':'PropertyValue',propertyID:'Zenodo Concept DOI',name:'Zenodo Concept DOI for the continuing Dataset lineage',value:z.conceptDoi,url:`https://doi.org/${z.conceptDoi}`});
keep.push({'@type':'PropertyValue',propertyID:'Zenodo Version DOI',name:`Zenodo Version DOI ${next.release}`,value:next.versionDoi,url:`https://doi.org/${next.versionDoi}`});
dataset.identifier=keep;
project.version=next.release;
project.dateModified=next.date;
project.description=`Version-controlled source project for Version ${next.release} of the Dr. Saeed Ghezelbash Public Knowledge Graph. GitHub is source, Zenodo is immutable DOI preservation, and Hugging Face is AI/retrieval distribution.`;
github.version=next.release;
github.dateModified=next.date;
github['@type']='SoftwareSourceCode';
github.url=release.dataset.github.repository;
github.codeRepository=release.dataset.github.repository;
github.isPartOf={'@id':project['@id']};
delete github.contentUrl;
github.description=`Version-controlled GitHub source for Version ${next.release} of the canonical Dr. Saeed Ghezelbash Public Knowledge Graph; it is a source repository, not an identity-equivalent Dataset.`;
hf.version=next.release;
hf.dateModified=next.date;
hf['@type']='DataDownload';
hf.url=release.dataset.huggingFace.dataset;
delete hf.contentUrl;
hf.encodingFormat=['application/ld+json','text/turtle','text/csv','text/plain','application/json','application/xml','application/jsonl'];
hf.description=`AI and retrieval distribution of Version ${next.release} of the physician-owned Dr. Saeed Ghezelbash Public Knowledge Graph, with a release-faithful Core plus separately governed retrieval positioning and live-observation layers.`;
delete hf.additionalType;
zenodo['@type']='DataDownload';
zenodo.name=`Dr. Saeed Ghezelbash Public Knowledge Graph — Zenodo preservation distribution ${next.release}`;
zenodo.url=`https://doi.org/${next.versionDoi}`;
delete zenodo.contentUrl;
zenodo.identifier=`DOI:${next.versionDoi}`;
zenodo.version=next.release;
zenodo.datePublished=next.date;
zenodo.dateModified=next.date;
zenodo.sameAs=`https://zenodo.org/records/${next.recordId}`;
delete zenodo.codeRepository;
zenodo.description=`Immutable DOI-preserved Version ${next.release} distribution of the canonical Dr. Saeed Ghezelbash Public Knowledge Graph Dataset.`;
catalog.version=next.release;
catalog.dateModified=next.date;
catalog.name='Dr. Saeed Ghezelbash Public Knowledge Graph — Data Catalog';
catalog.description='First-party machine-readable catalog for the Dr. Saeed Ghezelbash Public Knowledge Graph, preserving physician-first identity and explicit source, preservation, AI/retrieval and live-observation roles.';
catalog.url=`${release.canonicalUrl}dcat.ttl`;
const releaseBound=applyCurrentReleaseMetadata(nodes,{datasetId:release.dataset.id,release:next.release,dateModified:next.date});
must(releaseBound.length>0,'No current release-bound graph distributions were selected');

// Explicit release-history nodes make provenance machine-resolvable without leaking old values into current fields.
for(const h of z.releaseHistory){
  const rid=releaseHistoryNodeId(release.canonicalUrl,h.release);
  let n=byId.get(rid);
  if(!n){n={'@id':rid};nodes.push(n);byId.set(rid,n)}
  Object.assign(n,{'@type':'Dataset',name:`Dr. Saeed Ghezelbash Public Knowledge Graph — Version ${h.release}`,version:h.release,datePublished:h.publicationDate,identifier:[{'@type':'PropertyValue',propertyID:'Zenodo Version DOI',value:h.versionDoi,url:`https://doi.org/${h.versionDoi}`},{'@type':'PropertyValue',propertyID:'Zenodo Record ID',value:String(h.recordId)}],isPartOf:{'@id':release.dataset.id},url:`https://doi.org/${h.versionDoi}`});
  delete n.additionalType;
}
dataset.citation=z.releaseHistory.map(h=>({'@id':releaseHistoryNodeId(release.canonicalUrl,h.release)}));

// Release-derived RDF measurements are recomputed from the exact promoted graph.
// This prevents a stale hand-maintained triple invariant from blocking or mis-describing a release.
const rdfMeasurement=await canonicalizeRdfDocument(graph);
invariants.externalRdfTripleCount=rdfMeasurement.triples;
must(invariants.contractClasses?.releaseDerivedMeasurements?.rdfTripleCountField==='externalRdfTripleCount','RDF release-derived invariant contract drift');

let citation=citationSource;
citation=replaceExactly(citation,/^version: .+$/m,`version: ${next.release}`,'CITATION version');
citation=replaceExactly(citation,/^date-released: .+$/m,`date-released: ${next.date}`,'CITATION release date');
citation=replaceExactly(citation,/^doi: .+$/m,`doi: ${next.versionDoi}`,'CITATION DOI');
codemeta.softwareVersion=next.release;
codemeta.dateModified=next.date;
must(codemeta.subjectOf&&typeof codemeta.subjectOf==='object','CodeMeta subjectOf is required for release promotion');
codemeta.subjectOf.version=next.release;
codemeta.subjectOf.identifier=`https://doi.org/${next.versionDoi}`;
codemeta.subjectOf.name='Dr. Saeed Ghezelbash Public Knowledge Graph';

// No repository file is touched before the complete promotion candidate above has been constructed and validated.
const writes=[
  {file:'src/data/release.json',content:json(release)},
  {file:'package.json',content:json(pkg)},
  {file:'package-lock.json',content:json(lock)},
  {file:'src/data/volatile-facts.json',content:json(volatile)},
  {file:'src/data/evidence-snapshot.json',content:json(evidenceSnapshot)},
  {file:'src/data/release-invariants.json',content:json(invariants)},
  {file:'src/data/semantic/knowledge-graph.jsonld',content:json(graph)},
  {file:'CITATION.cff',content:citation},
  {file:'codemeta.json',content:json(codemeta)},
];

if(dryRun){
  console.log(JSON.stringify({promoted:false,dryRun:true,prepared:true,from:old,to:next,conceptDoi:z.conceptDoi,history:z.releaseHistory,releaseBoundNodes:releaseBound.length,externalRdfTripleCount:rdfMeasurement.triples,files:writes.map(x=>x.file)},null,2));
  process.exit(0);
}

const transaction=await commitTextFiles(writes);
console.log(JSON.stringify({promoted:true,transactional:true,transactionId:transaction.transactionId,from:old,to:next,conceptDoi:z.conceptDoi,history:z.releaseHistory,releaseBoundNodes:releaseBound.length,externalRdfTripleCount:rdfMeasurement.triples,files:transaction.committed},null,2));
