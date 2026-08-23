import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {hashIdentityFingerprint} from './release-identity.mjs';
import {generatedWorkspace} from './generated-workspace.mjs';

export const nodeTypes=node=>Array.isArray(node?.['@type'])?node['@type']:[node?.['@type']].filter(Boolean);
export const refId=value=>value&&typeof value==='object'&&value['@id']?value['@id']:null;
export const refIds=value=>(Array.isArray(value)?value:[value]).map(refId).filter(Boolean);
export const valueText=value=>{
  if(value==null)return '';
  if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')return String(value);
  if(Array.isArray(value))return value.map(valueText).filter(Boolean).join(' | ');
  if(value['@value']!=null)return String(value['@value']);
  if(value['@id'])return value['@id'];
  return JSON.stringify(value);
};
export const csvCell=value=>{
  const source=String(value??'');
  return /[",\n\r]/.test(source)?`"${source.replaceAll('"','""')}"`:source;
};
export const sha256=value=>createHash('sha256').update(value).digest('hex');

export async function loadProjectionContext({root=process.cwd()}={}){
  const data=path.join(root,'src/data');
  const semantic=path.join(data,'semantic');
  const generated=generatedWorkspace(root);
  const [release,invariants,evidenceRegistry,evidenceSnapshot,graph]=await Promise.all([
    readFile(path.join(data,'release.json'),'utf8').then(JSON.parse),
    readFile(path.join(data,'release-invariants.json'),'utf8').then(JSON.parse),
    readFile(path.join(data,'evidence-registry.json'),'utf8').then(JSON.parse),
    readFile(path.join(data,'evidence-snapshot.json'),'utf8').then(JSON.parse),
    readFile(path.join(semantic,'knowledge-graph.jsonld'),'utf8').then(JSON.parse),
  ]);
  if(!Array.isArray(graph['@graph']))throw new Error('Canonical graph lacks @graph');

  const byId=new Map(graph['@graph'].filter(node=>node?.['@id']).map(node=>[node['@id'],node]));
  const graphByUrl=new Map(graph['@graph'].filter(node=>typeof node.url==='string').map(node=>[node.url,node]));
  const evidenceById=new Map((evidenceRegistry.evidence||[]).map(item=>[item.id,item]));
  const evidenceByUrl=new Map((evidenceRegistry.evidence||[]).filter(item=>item.url).map(item=>[item.url,item.id]));
  const tierAEvidenceIds=new Set((evidenceRegistry.evidence||[]).filter(item=>item.tier==='A').map(item=>item.id));
  const refsFromNode=node=>{
    if(!node||typeof node!=='object')return [];
    const found=[];
    const walk=value=>{
      if(Array.isArray(value))return value.forEach(walk);
      if(value&&typeof value==='object'){
        if(typeof value['@id']==='string')found.push(value['@id']);
        for(const nested of Object.values(value))walk(nested);
      }
    };
    walk(node);
    return [...new Set(found)];
  };
  const evidenceRefsForNode=node=>[...new Set(refsFromNode(node).map(id=>evidenceById.has(id)?id:evidenceByUrl.get(id)).filter(Boolean))];
  const readIds=async name=>JSON.parse(await readFile(path.join(semantic,`${name}-ids.json`),'utf8'));
  const nodeName=node=>valueText(node?.name).split(' | ')[0];

  return {
    root,data,semantic,generated,
    projections:generated.projections,
    generatedSemantic:generated.semantic,
    generatedPublic:generated.public,
    generatedContent:generated.content,
    generatedAssets:generated.assets,
    release,invariants,evidenceRegistry,evidenceSnapshot,graph,byId,graphByUrl,
    evidenceById,evidenceByUrl,tierAEvidenceIds,evidenceRefsForNode,readIds,nodeName,
    identityFingerprintSha256:hashIdentityFingerprint(release),
  };
}
