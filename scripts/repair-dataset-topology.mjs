import {readFile,writeFile} from 'node:fs/promises';

const FILE='src/data/semantic/knowledge-graph.jsonld';
const ROOT='https://www.ghezelbaash.ir/';
const DATASET=`${ROOT}graph.jsonld#dataset`;
const HF=`${ROOT}#project-huggingface-dataset`;
const ZENODO=`${ROOT}#project-zenodo-release`;
const GITHUB=`${ROOT}#project-github-source`;
const graph=JSON.parse(await readFile(FILE,'utf8'));
const nodes=graph['@graph'];
if(!Array.isArray(nodes))throw new Error('Canonical graph lacks @graph');
const byId=new Map(nodes.filter(node=>node?.['@id']).map(node=>[node['@id'],node]));
const dataset=byId.get(DATASET),hf=byId.get(HF),zenodo=byId.get(ZENODO),github=byId.get(GITHUB);
for(const [label,node] of Object.entries({dataset,hf,zenodo,github}))if(!node)throw new Error(`Missing ${label} node`);
const asArray=value=>Array.isArray(value)?value:(value==null?[]:[value]);
const refId=value=>typeof value==='string'?value:value?.['@id'];
const nodeTypes=node=>new Set(asArray(node?.['@type']).filter(Boolean));

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
for(const id of after){
  const node=byId.get(id);
  if(!nodeTypes(node).has('DataDownload')||typeof node.contentUrl!=='string'||!node.contentUrl)throw new Error(`Invalid direct distribution ${id}`);
}
await writeFile(FILE,`${JSON.stringify(graph,null,2)}\n`);
console.log(JSON.stringify({stage:'DATASET_TOPOLOGY_REPAIR',before:before.length,after:after.length,removed:before.filter(id=>!after.includes(id)),huggingFace:'DERIVED_DATASET',zenodo:'VERSIONED_PRESERVATION_DATASET',integrity:'PASS'},null,2));
