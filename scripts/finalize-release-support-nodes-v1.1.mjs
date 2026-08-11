import { readFile, writeFile } from 'node:fs/promises';
const RELEASE='1.1.0',DATE='2026-08-11',BASE='https://www.ghezelbaash.ir/';
const graphPath='src/data/semantic/knowledge-graph.jsonld';
const graph=JSON.parse(await readFile(graphPath,'utf8'));
const graphNodes=graph['@graph']||[];
const byId=new Map(graphNodes.filter(n=>n?.['@id']).map(n=>[n['@id'],n]));
const project=byId.get(`${BASE}#doctor-ghezelbaash-structured-data-project`);
const zenodo=byId.get(`${BASE}#project-zenodo-release`);
const dataset=byId.get(`${BASE}graph.jsonld#dataset`);
if(!project||!zenodo||!dataset) throw new Error('Expected project/Zenodo/Dataset release nodes missing');

// Current canonical graph contract: every node that declares `version` belongs to this current release.
// Historical release identity is preserved outside the current graph in release.json provenance.
const versioned=[];
for(const node of graphNodes){
  if(Object.hasOwn(node,'version')){
    node.version=RELEASE;
    versioned.push(node['@id']||'(anonymous)');
  }
}
if(versioned.length===0) throw new Error('Canonical graph unexpectedly contains no version-bearing nodes');

project.version=RELEASE;
project.dateModified=DATE;
zenodo.version=RELEASE;
delete zenodo.dateModified;
if('datePublished' in zenodo) zenodo.datePublished=DATE;
dataset.version=RELEASE;
dataset.dateModified=DATE;
await writeFile(graphPath,JSON.stringify(graph,null,2)+'\n');

const validatorPath='scripts/validate-source.mjs';
let v=await readFile(validatorPath,'utf8');
const old="for(const [label,node] of [['project',projectNode],['zenodo',zenodoNode],['dataset',datasetNode]])if(node?.version!=='1.0.0')fail(`${label} Version 1.0.0 drift`);\nif(projectNode?.dateModified!=='2026-08-08')fail('Project dateModified drift');";
const current="for(const [label,node] of [['project',projectNode],['zenodo',zenodoNode],['dataset',datasetNode]])if(node?.version!==inv.release)fail(`${label} Version ${inv.release} drift`);\nif(projectNode?.dateModified!==inv.date)fail('Project dateModified drift');";
if(v.includes(old)) v=v.replace(old,current);
if(!v.includes(current)) throw new Error('Could not migrate supporting-node release validator to invariant-driven v1.1 contract');
await writeFile(validatorPath,v);
console.log(JSON.stringify({release:RELEASE,versionedGraphNodes:versioned.length,project:project['@id'],zenodo:zenodo['@id'],dataset:dataset['@id'],integrity:'PASS'},null,2));
