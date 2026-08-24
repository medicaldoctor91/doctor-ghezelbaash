import path from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {normalizeGoogleSupportGraph} from '../google-support-graph.mjs';
import {nodeTypes,refId} from '../projection-context.mjs';

const projectNode=(node,spec={})=>{
  if(!spec.include)return structuredClone(node);
  const out={};
  for(const key of spec.include)if(Object.hasOwn(node,key))out[key]=structuredClone(node[key]);
  for(const [key,allow] of Object.entries(spec.refAllow||{})){
    if(!Object.hasOwn(out,key))continue;
    const values=Array.isArray(out[key])?out[key]:[out[key]];
    const filtered=values.filter(value=>{
      const id=refId(value);
      return id?allow.includes(id):true;
    });
    if(!filtered.length)delete out[key];
    else out[key]=Array.isArray(node[key])?filtered:filtered[0];
  }
  for(const [key,allow] of Object.entries(spec.valueAllow||{})){
    if(!Object.hasOwn(out,key))continue;
    const values=Array.isArray(out[key])?out[key]:[out[key]];
    const filtered=values.filter(value=>{
      const literal=value&&typeof value==='object'&&value['@value']!=null?String(value['@value']):typeof value==='string'?value:null;
      return literal===null?true:allow.includes(literal);
    });
    if(!filtered.length)delete out[key];
    else out[key]=Array.isArray(node[key])?filtered:filtered[0];
  }
  return out;
};

export async function compileGraphProjections(context){
  const {semantic,generatedSemantic,graph,byId,readIds}=context;
  const [headIds,headProfile,supportIds,supportProfile]=await Promise.all([
    readIds('head'),
    readFile(path.join(semantic,'head-profile.json'),'utf8').then(JSON.parse),
    readIds('support'),
    readFile(path.join(semantic,'support-profile.json'),'utf8').then(JSON.parse),
  ]);
  await mkdir(generatedSemantic,{recursive:true});

  const headNodes=[];
  for(const id of headIds){
    const node=byId.get(id);
    if(!node)throw new Error(`Head selection missing ${id}`);
    headNodes.push(projectNode(node,headProfile.nodes?.[id]));
  }
  const headDoc={'@context':graph['@context'],'@graph':headNodes};
  const headRaw=`${JSON.stringify(headDoc)}\n`;
  if(Buffer.byteLength(headRaw)>headProfile.maxBytes)throw new Error(`Head graph ${Buffer.byteLength(headRaw)} exceeds ${headProfile.maxBytes}`);
  await writeFile(path.join(generatedSemantic,'head-graph.json'),headRaw);

  const supportSelected=new Set([...supportIds,...headIds]);
  const graphIds=new Set(byId.keys());
  const profileFor=node=>supportProfile.idProfiles?.[node['@id']]||nodeTypes(node).map(type=>supportProfile.typeProfiles?.[type]).find(Boolean)||null;
  const pruneInlineRefs=value=>{
    if(Array.isArray(value))return value.map(pruneInlineRefs).filter(item=>item!==undefined);
    if(value&&typeof value==='object'){
      if(value['@id']&&graphIds.has(value['@id'])&&!supportSelected.has(value['@id']))return undefined;
      const out={};
      for(const [key,nested] of Object.entries(value)){
        const next=pruneInlineRefs(nested);
        if(next!==undefined&&(!Array.isArray(next)||next.length))out[key]=next;
      }
      return out;
    }
    return value;
  };
  const supportNodes=[];
  for(const id of supportIds){
    const node=byId.get(id);
    if(!node)throw new Error(`Support selection missing ${id}`);
    supportNodes.push(supportProfile.mode==='full'?structuredClone(node):pruneInlineRefs(projectNode(node,profileFor(node)||{})));
  }
  const supportDoc=normalizeGoogleSupportGraph({'@context':graph['@context'],'@graph':supportNodes});
  const supportRaw=`${JSON.stringify(supportDoc)}\n`;
  if(Buffer.byteLength(supportRaw)>supportProfile.maxBytes)throw new Error(`Support graph ${Buffer.byteLength(supportRaw)} exceeds ${supportProfile.maxBytes}`);
  await writeFile(path.join(generatedSemantic,'support-graph.json'),supportRaw);

  return {headIds,supportIds,headRaw,supportRaw};
}
