import {readFile,writeFile} from 'node:fs/promises';

const FILE='src/data/semantic/knowledge-graph.jsonld';
const PROMOTE='scripts/promote-release.mjs';
const SHAPES='src/data/semantic/shapes.ttl';
const ROOT='https://www.ghezelbaash.ir/';
const DATASET=`${ROOT}graph.jsonld#dataset`;
const HF=`${ROOT}#project-huggingface-dataset`;
const ZENODO=`${ROOT}#project-zenodo-release`;
const GITHUB=`${ROOT}#project-github-source`;
const asArray=value=>Array.isArray(value)?value:(value==null?[]:[value]);
const refId=value=>typeof value==='string'?value:value?.['@id'];
const nodeTypes=node=>new Set(asArray(node?.['@type']).filter(Boolean));

const graph=JSON.parse(await readFile(FILE,'utf8'));
const nodes=graph['@graph'];
if(!Array.isArray(nodes))throw new Error('Canonical graph lacks @graph');
const byId=new Map(nodes.filter(node=>node?.['@id']).map(node=>[node['@id'],node]));
const dataset=byId.get(DATASET),hf=byId.get(HF),zenodo=byId.get(ZENODO),github=byId.get(GITHUB);
for(const [label,node] of Object.entries({dataset,hf,zenodo,github}))if(!node)throw new Error(`Missing ${label} node`);

const before=asArray(dataset.distribution).map(refId).filter(Boolean);
dataset.distribution=asArray(dataset.distribution).filter(ref=>{
  const id=refId(ref),target=id?byId.get(id):null;
  return Boolean(target&&nodeTypes(target).has('DataDownload')&&typeof target.contentUrl==='string'&&target.contentUrl.length>0);
});
hf['@type']='Dataset';
delete hf.contentUrl;
delete hf.isPartOf;
hf.isBasedOn={'@id':DATASET};
hf.description=`AI and retrieval Dataset derived from Version ${hf.version} of the physician-owned Dr. Saeed Ghezelbash Public Knowledge Graph, with a release-faithful Core plus separately governed retrieval positioning and live-observation layers.`;
zenodo['@type']='Dataset';
delete zenodo.contentUrl;
zenodo.isPartOf={'@id':DATASET};
zenodo.isBasedOn={'@id':GITHUB};
zenodo.description=`Immutable DOI-preserved Version ${zenodo.version} Dataset release of the canonical Dr. Saeed Ghezelbash Public Knowledge Graph.`;
const after=asArray(dataset.distribution).map(refId).filter(Boolean);
if(after.length<1)throw new Error('Dataset lost all direct distributions');
if(after.includes(HF)||after.includes(ZENODO))throw new Error('External Dataset landing resource still in distribution');
for(const id of after){const node=byId.get(id);if(!nodeTypes(node).has('DataDownload')||typeof node.contentUrl!=='string'||!node.contentUrl)throw new Error(`Invalid direct distribution ${id}`)}
await writeFile(FILE,`${JSON.stringify(graph,null,2)}\n`);

let promote=await readFile(PROMOTE,'utf8');
const replaceRequired=(from,to,label)=>{
  if(promote.includes(to))return;
  if(!promote.includes(from))throw new Error(`Promotion migration anchor missing: ${label}`);
  promote=promote.replace(from,to);
};
replaceRequired(
  "hf['@type']='DataDownload';\nhf.url=release.dataset.huggingFace.dataset;\ndelete hf.contentUrl;\nhf.encodingFormat=['application/ld+json','text/turtle','text/csv','text/plain','application/json','application/xml','application/jsonl'];\nhf.description=`AI and retrieval distribution of Version ${next.release} of the physician-owned Dr. Saeed Ghezelbash Public Knowledge Graph, with a release-faithful Core plus separately governed retrieval positioning and live-observation layers.`;\ndelete hf.additionalType;",
  "hf['@type']='Dataset';\nhf.url=release.dataset.huggingFace.dataset;\ndelete hf.contentUrl;\ndelete hf.isPartOf;\nhf.isBasedOn={'@id':release.dataset.id};\nhf.encodingFormat=['application/ld+json','text/turtle','text/csv','text/plain','application/json','application/xml','application/jsonl'];\nhf.description=`AI and retrieval Dataset derived from Version ${next.release} of the physician-owned Dr. Saeed Ghezelbash Public Knowledge Graph, with a release-faithful Core plus separately governed retrieval positioning and live-observation layers.`;\ndelete hf.additionalType;",
  'Hugging Face Dataset role'
);
replaceRequired(
  "zenodo['@type']='DataDownload';\nzenodo.name=`Dr. Saeed Ghezelbash Public Knowledge Graph — Zenodo preservation distribution ${next.release}`;\nzenodo.url=`https://doi.org/${next.versionDoi}`;\ndelete zenodo.contentUrl;",
  "zenodo['@type']='Dataset';\nzenodo.name=`Dr. Saeed Ghezelbash Public Knowledge Graph — Zenodo preservation Dataset ${next.release}`;\nzenodo.url=`https://doi.org/${next.versionDoi}`;\ndelete zenodo.contentUrl;",
  'Zenodo Dataset role'
);
replaceRequired(
  "zenodo.description=`Immutable DOI-preserved Version ${next.release} distribution of the canonical Dr. Saeed Ghezelbash Public Knowledge Graph Dataset.`;",
  "zenodo.isPartOf={'@id':release.dataset.id};\nzenodo.isBasedOn={'@id':github['@id']};\nzenodo.description=`Immutable DOI-preserved Version ${next.release} Dataset release of the canonical Dr. Saeed Ghezelbash Public Knowledge Graph.`;",
  'Zenodo provenance'
);
const catalogAnchor="catalog.url=`${release.canonicalUrl}dcat.ttl`;";
const distributionGuard=`${catalogAnchor}\n// schema:distribution is reserved for directly downloadable DataDownload nodes.\n// Platform/DOI landing resources remain linked through the project graph but are not fake file downloads.\ndataset.distribution=(Array.isArray(dataset.distribution)?dataset.distribution:[dataset.distribution]).filter(ref=>{\n  const rid=typeof ref==='string'?ref:ref?.['@id'];\n  const target=rid?byId.get(rid):null;\n  const targetTypes=new Set(Array.isArray(target?.['@type'])?target['@type']:[target?.['@type']].filter(Boolean));\n  return targetTypes.has('DataDownload')&&typeof target?.contentUrl==='string'&&target.contentUrl.length>0;\n});`;
if(!promote.includes('schema:distribution is reserved for directly downloadable DataDownload nodes.')){
  if(!promote.includes(catalogAnchor))throw new Error('Promotion distribution guard anchor missing');
  promote=promote.replace(catalogAnchor,distributionGuard);
}
await writeFile(PROMOTE,promote);

let shapes=await readFile(SHAPES,'utf8');
if(!shapes.includes('ex:HuggingFaceDatasetRoleShape')){
  const anchor=`ex:GitHubSourceRoleShape a sh:NodeShape ;\n  sh:targetNode ex:project-github-source ;\n  sh:property [ sh:path rdf:type ; sh:hasValue schema:SoftwareSourceCode ] ;\n  sh:property [ sh:path schema:codeRepository ; sh:hasValue <https://github.com/medicaldoctor91/doctor-ghezelbaash> ; sh:minCount 1 ; sh:maxCount 1 ] ;\n  sh:property [ sh:path schema:contentUrl ; sh:maxCount 0 ] ;\n  sh:not [ sh:property [ sh:path rdf:type ; sh:hasValue schema:DataDownload ] ] .`;
  if(!shapes.includes(anchor))throw new Error('SHACL insertion anchor missing');
  shapes=shapes.replace(anchor,`${anchor}\n\nex:HuggingFaceDatasetRoleShape a sh:NodeShape ;\n  sh:targetNode ex:project-huggingface-dataset ;\n  sh:property [ sh:path rdf:type ; sh:hasValue schema:Dataset ] ;\n  sh:property [ sh:path schema:isBasedOn ; sh:hasValue <https://www.ghezelbaash.ir/graph.jsonld#dataset> ; sh:minCount 1 ; sh:maxCount 1 ] ;\n  sh:property [ sh:path schema:contentUrl ; sh:maxCount 0 ] ;\n  sh:not [ sh:property [ sh:path rdf:type ; sh:hasValue schema:DataDownload ] ] .\n\nex:ZenodoDatasetRoleShape a sh:NodeShape ;\n  sh:targetNode ex:project-zenodo-release ;\n  sh:property [ sh:path rdf:type ; sh:hasValue schema:Dataset ] ;\n  sh:property [ sh:path schema:isPartOf ; sh:hasValue <https://www.ghezelbaash.ir/graph.jsonld#dataset> ; sh:minCount 1 ; sh:maxCount 1 ] ;\n  sh:property [ sh:path schema:isBasedOn ; sh:hasValue ex:project-github-source ; sh:minCount 1 ; sh:maxCount 1 ] ;\n  sh:property [ sh:path schema:contentUrl ; sh:maxCount 0 ] ;\n  sh:not [ sh:property [ sh:path rdf:type ; sh:hasValue schema:DataDownload ] ] .`);
}
await writeFile(SHAPES,shapes);

console.log(JSON.stringify({stage:'DATASET_TOPOLOGY_REPAIR',before:before.length,after:after.length,removed:before.filter(id=>!after.includes(id)),huggingFace:'DERIVED_DATASET',zenodo:'VERSIONED_PRESERVATION_DATASET',releaseAutomation:'HARDENED',shacl:'HARDENED',integrity:'PASS'},null,2));
