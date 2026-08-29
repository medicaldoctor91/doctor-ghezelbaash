#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const ROOT=process.cwd();
const SCHEMA='https://schema.org/';
const VOCAB_BLOB_SHA='d658e0c4908a2a07c3d175c65ecc2c61cd6a1442';
const VOCAB_API=`https://api.github.com/repos/schemaorg/schemaorg/git/blobs/${VOCAB_BLOB_SHA}`;
const argIndex=process.argv.indexOf('--output');
const OUTPUT=argIndex>=0&&process.argv[argIndex+1]?process.argv[argIndex+1]:'schema-audit-report.json';
const asArray=value=>Array.isArray(value)?value:(value==null?[]:[value]);
const isObject=value=>value&&typeof value==='object'&&!Array.isArray(value);
const refId=value=>typeof value==='string'?value:value?.['@id'];
const expandSchema=value=>{
  if(typeof value!=='string')return value;
  if(value.startsWith('schema:'))return `${SCHEMA}${value.slice(7)}`;
  if(/^https?:\/\/schema\.org\//.test(value))return value.replace(/^http:\/\//,'https://');
  if(!value.includes(':')&&!value.startsWith('@'))return `${SCHEMA}${value}`;
  return value;
};
const localName=value=>typeof value==='string'&&value.startsWith(SCHEMA)?value.slice(SCHEMA.length):value;
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));

async function loadVocabulary(){
  const response=await fetch(VOCAB_API,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'doctor-ghezelbaash-schema-audit/1.0'}});
  if(!response.ok)throw new Error(`Schema.org vocabulary download failed: ${response.status} ${response.statusText}`);
  const payload=await response.json();
  if(payload.sha!==VOCAB_BLOB_SHA||payload.encoding!=='base64'||typeof payload.content!=='string')throw new Error('Pinned Schema.org Git blob mismatch');
  const bytes=Buffer.from(payload.content.replace(/\s+/g,''),'base64');
  return {document:JSON.parse(bytes.toString('utf8')),bytes};
}

function buildVocabulary(document){
  const classes=new Map(),properties=new Map(),ancestorMemo=new Map();
  for(const node of asArray(document?.['@graph'])){
    const id=expandSchema(node?.['@id']);
    if(typeof id!=='string')continue;
    const types=asArray(node['@type']).map(expandSchema);
    const isClass=types.some(type=>type==='rdfs:Class'||type==='http://www.w3.org/2000/01/rdf-schema#Class');
    const isProperty=types.some(type=>type==='rdf:Property'||type==='http://www.w3.org/1999/02/22-rdf-syntax-ns#Property');
    if(isClass)classes.set(id,{parents:asArray(node['rdfs:subClassOf']).map(refId).filter(Boolean).map(expandSchema)});
    if(isProperty){
      const get=name=>asArray(node[`schema:${name}`]??node[`${SCHEMA}${name}`]).map(refId).filter(Boolean).map(expandSchema);
      properties.set(id,{domains:get('domainIncludes'),ranges:get('rangeIncludes'),replacement:get('supersededBy')});
    }
  }
  const ancestors=id=>{
    id=expandSchema(id);
    if(ancestorMemo.has(id))return ancestorMemo.get(id);
    const result=new Set([id]);
    ancestorMemo.set(id,result);
    for(const parent of classes.get(id)?.parents??[])for(const item of ancestors(parent))result.add(item);
    return result;
  };
  for(const id of classes.keys())ancestors(id);
  return {classes,properties,ancestors};
}

function contextCoercions(document){
  const result=new Map();
  for(const context of asArray(document?.['@context'])){
    if(!isObject(context))continue;
    for(const [key,value] of Object.entries(context))if(isObject(value)&&typeof value['@type']==='string')result.set(key,value['@type']);
  }
  return result;
}

function collectObjects(document){
  const roots=Array.isArray(document)?document:asArray(document?.['@graph']??document);
  const objects=[],embeddedIdentityDefinitions=[];
  const visit=(value,where,topLevel=false)=>{
    if(Array.isArray(value)){value.forEach((entry,index)=>visit(entry,`${where}[${index}]`,false));return;}
    if(!isObject(value))return;
    const keys=Object.keys(value);
    const semantic=keys.some(key=>!key.startsWith('@'));
    if(topLevel||value['@type']!=null||semantic)objects.push({node:value,path:where,topLevel});
    if(!topLevel&&typeof value['@id']==='string'&&keys.some(key=>key!=='@id'))embeddedIdentityDefinitions.push({path:where,id:value['@id'],keys});
    for(const [key,entry] of Object.entries(value)){
      if(key==='@context'||key==='@graph'||key==='@value')continue;
      if(key.startsWith('@')&&key!=='@reverse')continue;
      visit(entry,`${where}.${key}`,false);
    }
  };
  roots.forEach((node,index)=>visit(node,`@graph[${index}]`,true));
  return {objects,embeddedIdentityDefinitions};
}

function inferKinds(value,propertyName,byId,coercions,vocab){
  const kinds=new Set();
  const add=type=>{
    const id=expandSchema(type);
    if(vocab.classes.has(id))for(const ancestor of vocab.ancestors(id))kinds.add(ancestor);else kinds.add(id);
  };
  if(Array.isArray(value)){for(const entry of value)for(const kind of inferKinds(entry,propertyName,byId,coercions,vocab))kinds.add(kind);return kinds;}
  if(value==null)return kinds;
  if(typeof value==='boolean'){add('Boolean');return kinds;}
  if(typeof value==='number'){add(Number.isInteger(value)?'Integer':'Number');return kinds;}
  if(typeof value==='string'){
    if(coercions.get(propertyName)==='@id'){
      add('URL');
      for(const type of asArray(byId.get(value)?.['@type']))add(type);
      return kinds;
    }
    add('Text');
    if(/^https?:\/\//i.test(value))add('URL');
    if(/^\d{4}-\d{2}-\d{2}$/.test(value))add('Date');
    if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/.test(value))add('DateTime');
    if(/^P(?=\d|T\d)/.test(value))add('Duration');
    if(/^\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?$/.test(value))add('Time');
    return kinds;
  }
  if(isObject(value)){
    if('@value'in value){
      const datatype=value['@type'];
      const xsd={'http://www.w3.org/2001/XMLSchema#date':'Date','http://www.w3.org/2001/XMLSchema#dateTime':'DateTime','http://www.w3.org/2001/XMLSchema#time':'Time','http://www.w3.org/2001/XMLSchema#integer':'Integer','http://www.w3.org/2001/XMLSchema#decimal':'Number','http://www.w3.org/2001/XMLSchema#double':'Number','http://www.w3.org/2001/XMLSchema#boolean':'Boolean'};
      if(typeof datatype==='string')add(xsd[datatype]??datatype);else for(const kind of inferKinds(value['@value'],propertyName,byId,coercions,vocab))kinds.add(kind);
      return kinds;
    }
    if(typeof value['@id']==='string'){
      add('URL');
      for(const type of asArray(value['@type']??byId.get(value['@id'])?.['@type']))add(type);
      return kinds;
    }
    for(const type of asArray(value['@type']))add(type);
  }
  return kinds;
}

function audit(label,document,vocab){
  const graph=Array.isArray(document)?document:asArray(document?.['@graph']??document);
  const topLevel=graph.filter(isObject),byId=new Map(),duplicateIds=[];
  for(const node of topLevel){
    if(typeof node['@id']!=='string')continue;
    if(byId.has(node['@id']))duplicateIds.push(node['@id']);else byId.set(node['@id'],node);
  }
  const coercions=contextCoercions(document);
  const {objects,embeddedIdentityDefinitions}=collectObjects(document);
  const issues=[];
  const add=(severity,code,payload)=>issues.push({severity,code,...payload});
  for(const id of duplicateIds)add('error','DUPLICATE_TOP_LEVEL_ID',{id});
  for(const entry of embeddedIdentityDefinitions)add('warning','EMBEDDED_IDENTITY_DEFINITION',entry);
  for(const {node,path:nodePath}of objects){
    if('@value'in node)continue;
    const nodeId=node['@id']??null;
    const rawTypes=asArray(node['@type']).filter(type=>typeof type==='string');
    const ancestors=new Set();
    for(const rawType of rawTypes){
      const type=expandSchema(rawType);
      if(type.startsWith(SCHEMA)&&!vocab.classes.has(type))add('error','UNKNOWN_SCHEMA_TYPE',{nodeId,path:nodePath,type:localName(type)});
      if(vocab.classes.has(type))for(const ancestor of vocab.ancestors(type))ancestors.add(ancestor);else ancestors.add(type);
    }
    for(const [propertyName,value]of Object.entries(node)){
      if(propertyName.startsWith('@')||propertyName.includes(':'))continue;
      const spec=vocab.properties.get(expandSchema(propertyName));
      if(!spec){add('error','UNKNOWN_SCHEMA_PROPERTY',{nodeId,path:`${nodePath}.${propertyName}`,property:propertyName,nodeTypes:rawTypes});continue;}
      if(spec.replacement.length)add('warning','SUPERSEDED_SCHEMA_PROPERTY',{nodeId,path:`${nodePath}.${propertyName}`,property:propertyName,replacement:spec.replacement.map(localName)});
      if(spec.domains.length&&rawTypes.length&&!spec.domains.some(domain=>ancestors.has(domain)))add('error','DOMAIN_MISMATCH',{nodeId,path:`${nodePath}.${propertyName}`,property:propertyName,nodeTypes:rawTypes,expectedDomains:spec.domains.map(localName)});
      if(spec.ranges.length)for(const [index,item]of asArray(value).entries()){
        const kinds=inferKinds(item,propertyName,byId,coercions,vocab);
        if(kinds.size&&!spec.ranges.some(range=>kinds.has(range)))add('warning','RANGE_MISMATCH',{nodeId,path:`${nodePath}.${propertyName}[${index}]`,property:propertyName,inferredKinds:[...kinds].map(localName).sort(),expectedRanges:spec.ranges.map(localName)});
      }
    }
  }
  const counts={};
  for(const issue of issues){counts[issue.severity]=(counts[issue.severity]??0)+1;counts[issue.code]=(counts[issue.code]??0)+1;}
  return {label,topLevelNodes:topLevel.length,typedObjectsAudited:objects.length,uniqueTopLevelIds:byId.size,counts,issues};
}

function extractJsonLd(html){
  const documents=[],errors=[];
  const pattern=/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match,index=0;
  while((match=pattern.exec(html))){try{documents.push({index,document:JSON.parse(match[1])});}catch(error){errors.push({index,message:error.message});}index+=1;}
  return {documents,errors};
}

function combineDocuments(documents){
  const combined={'@context':{'@vocab':SCHEMA},'@graph':[]};
  for(const {document}of documents){
    if(Array.isArray(document))combined['@graph'].push(...document);else if(Array.isArray(document?.['@graph']))combined['@graph'].push(...document['@graph']);else if(isObject(document))combined['@graph'].push(document);
  }
  return combined;
}

function keyEntity(document){
  const byId=new Map(asArray(document?.['@graph']).filter(isObject).map(node=>[node['@id'],node]));
  const doctorId='https://www.ghezelbaash.ir/#saeed-ghezelbash';
  const clinicId='https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah';
  const doctor=byId.get(doctorId),clinic=byId.get(clinicId);
  const relations=['practicesAt','worksFor','affiliation','workLocation','owns','memberOf'];
  return {doctorPresent:Boolean(doctor),doctorTypes:asArray(doctor?.['@type']),clinicPresent:Boolean(clinic),clinicTypes:asArray(clinic?.['@type']),doctorClinicRelations:Object.fromEntries(relations.map(property=>[property,asArray(doctor?.[property]).map(refId).filter(Boolean)])),clinicOwner:asArray(clinic?.owner).map(refId).filter(Boolean),clinicFounder:asArray(clinic?.founder).map(refId).filter(Boolean),clinicEmployee:asArray(clinic?.employee).map(refId).filter(Boolean)};
}

const {document:vocabularyDocument,bytes:vocabularyBytes}=await loadVocabulary();
const vocab=buildVocabulary(vocabularyDocument);
const files={canonical:'src/data/semantic/knowledge-graph.jsonld',head:'.generated/semantic/head-graph.json',support:'.generated/semantic/support-graph.json',html:'dist/index.html'};
for(const file of Object.values(files))if(!fs.existsSync(path.join(ROOT,file)))throw new Error(`Missing audit input: ${file}`);
const canonical=readJson(files.canonical),head=readJson(files.head),support=readJson(files.support),html=fs.readFileSync(files.html,'utf8');
const extracted=extractJsonLd(html);
const surfaces=[audit('canonical-graph',canonical,vocab),audit('head-projection',head,vocab),audit('support-projection',support,vocab),audit('rendered-jsonld-combined',combineDocuments(extracted.documents),vocab)];
const report={generatedAt:new Date().toISOString(),repository:'medicaldoctor91/doctor-ghezelbaash',commit:process.env.GITHUB_SHA??null,schemaOrg:{release:'30.0',pinnedBlobSha:VOCAB_BLOB_SHA,bytes:vocabularyBytes.length,sha256:sha256(vocabularyBytes),classes:vocab.classes.size,properties:vocab.properties.size},inputs:{...files,htmlBytes:Buffer.byteLength(html),jsonLdScriptCount:extracted.documents.length,jsonLdParseErrors:extracted.errors},keyEntity:{canonical:keyEntity(canonical),head:keyEntity(head)},surfaces};
fs.writeFileSync(OUTPUT,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({output:OUTPUT,schemaOrg:report.schemaOrg,inputs:report.inputs,surfaces:surfaces.map(({label,topLevelNodes,typedObjectsAudited,counts})=>({label,topLevelNodes,typedObjectsAudited,counts}))},null,2));
