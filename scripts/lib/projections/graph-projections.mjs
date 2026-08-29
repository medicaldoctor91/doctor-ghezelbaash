import path from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {CONTENT_LANGUAGES} from '../../../src/lib/language-contract.mjs';
import {projectNode} from '../../../src/lib/semantic-projection.mjs';
import {normalizeGoogleSupportGraph} from '../google-support-graph.mjs';
import {normalizeGooglePageGraph} from '../google-page-graph.mjs';
import {nodeTypes} from '../projection-context.mjs';

export {projectNode};

const appendUnique=(target,values)=>{for(const value of values||[])if(!target.includes(value))target.push(value)};
const mergeProjectionProfiles=profiles=>{
  const active=(profiles||[]).filter(profile=>profile&&typeof profile==='object');
  if(!active.length)return null;
  if(active.some(profile=>!Array.isArray(profile.include)))return {};
  const merged={include:[]};
  for(const profile of active)appendUnique(merged.include,profile.include);
  for(const policy of ['refAllow','valueAllow']){
    const entries={};
    for(const profile of active)for(const [key,values] of Object.entries(profile[policy]||{})){
      entries[key]??=[];
      appendUnique(entries[key],values);
    }
    if(Object.keys(entries).length)merged[policy]=entries;
  }
  return merged;
};

const compactIdentityProfile=Object.freeze({include:['@id','@type','name','alternateName','sameAs','identifier']});
const HEAD_NODE_PROFILE_EXTENSIONS=Object.freeze({
  'https://www.ghezelbaash.ir/#credential-doctor-of-medicine':Object.freeze({include:['@id','@type','name','credentialCategory','identifier','recognizedBy','url','validIn','expires']}),
  'https://www.ghezelbaash.ir/#irimc-credential-167430':Object.freeze({include:['@id','@type','name','credentialCategory','identifier','recognizedBy','url','validIn','expires']}),
});
const SUPPORT_ID_EXCLUSIONS=Object.freeze(new Set([
  'https://www.ghezelbaash.ir/#online-consultation-channel',
]));
const SUPPORT_ID_ADDITIONS=Object.freeze([
  'https://www.ghezelbaash.ir/#country-iran',
  'https://www.ghezelbaash.ir/#country-iraq',
  'https://www.ghezelbaash.ir/#city-kermanshah',
  'https://www.ghezelbaash.ir/#city-tehran',
  'https://www.ghezelbaash.ir/#district-1-kermanshah',
  'https://www.ghezelbaash.ir/#medical-specialty-aesthetic-medicine',
  'https://www.ghezelbaash.ir/#occupation-physician',
  'https://www.ghezelbaash.ir/#occupation-medical-researcher',
  'https://www.ghezelbaash.ir/#kermanshah-university-of-medical-sciences',
  'https://www.ghezelbaash.ir/#topic-botox-migraine-context',
  'https://www.ghezelbaash.ir/#topic-botox-neurology-context',
  'https://www.ghezelbaash.ir/#topic-hair-transplant-boundary',
  'https://www.ghezelbaash.ir/#topic-orthognathic-boundary',
  'https://www.ghezelbaash.ir/#procedure-cryolipolysis-localized-fat-reduction',
  'https://www.ghezelbaash.ir/#clinic-consultation-treatment-and-follow-up-path',
]);
const SUPPORT_TYPE_PROFILE_EXTENSIONS=Object.freeze({
  DefinedTerm:Object.freeze({include:['url']}),
  Country:compactIdentityProfile,
  City:Object.freeze({include:[...compactIdentityProfile.include,'containedInPlace']}),
  AdministrativeArea:Object.freeze({include:[...compactIdentityProfile.include,'containedInPlace']}),
  MedicalSpecialty:compactIdentityProfile,
  Occupation:compactIdentityProfile,
  CollegeOrUniversity:Object.freeze({include:[...compactIdentityProfile.include,'url']}),
});

export async function compileGraphProjections(context){
  const {semantic,generatedSemantic,graph,byId,readIds,release}=context;
  const [headIds,headProfile,configuredSupportIds,supportProfile]=await Promise.all([
    readIds('head'),
    readFile(path.join(semantic,'head-profile.json'),'utf8').then(JSON.parse),
    readIds('support'),
    readFile(path.join(semantic,'support-profile.json'),'utf8').then(JSON.parse),
  ]);
  const supportIds=[...new Set([
    ...configuredSupportIds.filter(id=>!SUPPORT_ID_EXCLUSIONS.has(id)),
    ...SUPPORT_ID_ADDITIONS,
  ])];
  await mkdir(generatedSemantic,{recursive:true});

  const multilingualResourceIds=new Set([`${release.canonicalUrl}#website`,`${release.canonicalUrl}#webpage`]);
  const headNodes=[];
  for(const id of headIds){
    const node=byId.get(id);
    if(!node)throw new Error(`Head selection missing ${id}`);
    const extension=HEAD_NODE_PROFILE_EXTENSIONS[id];
    if(!multilingualResourceIds.has(id)){
      if(extension)headNodes.push(projectNode(node,mergeProjectionProfiles([headProfile.nodes?.[id],extension])||{}));
      else headNodes.push(projectNode(node,headProfile.nodes?.[id]));
      continue;
    }
    const projected=extension
      ? projectNode(node,mergeProjectionProfiles([headProfile.nodes?.[id],extension])||{})
      : projectNode(node,headProfile.nodes?.[id]);
    projected.inLanguage=[...CONTENT_LANGUAGES];
    headNodes.push(projected);
  }
  const headDoc=normalizeGooglePageGraph({'@context':graph['@context'],'@graph':headNodes},{lane:'head'});
  const headRaw=`${JSON.stringify(headDoc)}\n`;
  if(Buffer.byteLength(headRaw)>headProfile.maxBytes)throw new Error(`Head graph ${Buffer.byteLength(headRaw)} exceeds ${headProfile.maxBytes}`);
  await writeFile(path.join(generatedSemantic,'head-graph.json'),headRaw);

  const supportSelected=new Set([...supportIds,...headIds]);
  const graphIds=new Set(byId.keys());
  const profileFor=node=>supportProfile.idProfiles?.[node['@id']]??mergeProjectionProfiles(nodeTypes(node).flatMap(type=>[supportProfile.typeProfiles?.[type],SUPPORT_TYPE_PROFILE_EXTENSIONS[type]]));
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
  const supportDoc=normalizeGooglePageGraph(normalizeGoogleSupportGraph({'@context':graph['@context'],'@graph':supportNodes}),{lane:'support'});
  const supportRaw=`${JSON.stringify(supportDoc)}\n`;
  if(Buffer.byteLength(supportRaw)>supportProfile.maxBytes)throw new Error(`Support graph ${Buffer.byteLength(supportRaw)} exceeds ${supportProfile.maxBytes}`);
  await writeFile(path.join(generatedSemantic,'support-graph.json'),supportRaw);

  return {headIds,supportIds,headRaw,supportRaw};
}
