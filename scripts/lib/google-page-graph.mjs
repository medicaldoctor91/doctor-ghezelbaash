const SCHEMA_BASE='https://schema.org/';
const XSD_BASE='http://www.w3.org/2001/XMLSchema#';
const asArray=value=>Array.isArray(value)?value:(value==null?[]:[value]);
const nodeTypes=node=>asArray(node?.['@type']);
const refId=value=>typeof value==='string'?value:value?.['@id'];

const schemaOnlyContext=context=>{
  const source=context&&typeof context==='object'&&!Array.isArray(context)?context:{};
  const out={};
  for(const [key,value] of Object.entries(source)){
    if(key==='@version'||key==='@vocab'||key==='schema')out[key]=structuredClone(value);
    else if(value&&typeof value==='object'&&typeof value['@id']==='string'&&value['@id'].startsWith(SCHEMA_BASE))out[key]=structuredClone(value);
  }
  out['@version']??=1.1;
  out['@vocac']=SCHEMA_BASE;
  out.schema=SCHEMA_BASE;
  return out;
};

const castValueObject=value=>{
  const raw=value['@value'];
  const datatype=value['@type'];
  if(typeof datatype!=='string')return raw;
  if([`${XSD_BASE}integer`,`${XSD_BASE}int`,`${XSD_BASE}long`,`${XSD_BASE}short`,`${XSD_BASE}nonNegativeInteger`,`${XSD_BASE}positiveInteger`].includes(datatype)){
    const parsed=Number.parseInt(String(raw),10);
    return Number.isSafeInteger(parsed)?parsed:String(raw);
  }
  if([`${XSD_BASE}decimal`,`${XSD_BASE}double`,`${XSD_BASE}float`].includes(datatype)){
    const parsed=Number(String(raw));
    return Number.isFinite(parsed)?parsed:String(raw);
  }
  if(datatype===`${XSD_BASE}boolean`){
    if(raw===true||raw==='true'||raw==='1')return true;
    if(raw===false||raw==='false'||raw==='0')return false;
  }
  return raw;
};

const stableKey=value=>value&&typeof value==='object'?JSON.stringify(value):`${typeof value}:${String(value)}`;
const dedupe=values=>{
  const seen=new Set(),out=[];
  for(const value of values){
    if(value===undefined||value===null||value==='')continue;
    const key=stableKey(value);
    if(seen.has(key))continue;
    seen.add(key);out.push(value);
  }
  return out;
};

const normalizeValue=value=>{
  if(Array.isArray(value))return dedupe(value.map(normalizeValue).flatMap(item=>Array.isArray(item)?item:[item]));
  if(!value||typeof value!=='object')return value;
  if(Object.hasOwn(value,'@value'))return castValueObject(value);
  const out={};
  for(const [key,nested] of Object.entries(value)){
    if(key==='@language'||/^(?:prov|dcterms|skos):/.test(key))continue;
    const next=normalizeValue(nested);
    if(next===undefined||next===null||next===''||(Array.isArray(next)&&!next.length))continue;
    out[key]=next;
  }
  return Object.keys(out).length?out:undefined;
};

const addAdditionalType=(node,url)=>{
  const values=dedupe([...asArray(node.additionalType),url]);
  node.additionalType=values.length===1?values[0]:values;
};

const setTypes=(node,types)=>{
  const values=dedupe(types);
  if(!values.length)delete node['@type'];
  else node['@type']=values.length===1?values[0]:values;
};

const normalizeGoogleRole=node=>{
  const types=nodeTypes(node);
  if(types.includes('ScholarlyArticle')){
    setTypes(node,types.map(type=>type==='ScholarlyArticle'?'CreativeWork':type));
    addAdditionalType(node,`${SCHEMA_BASE}ScholarlyArticle`);
  }
  const currentTypes=nodeTypes(node);
  if(currentTypes.includes('EducationEvent')&&!node.startDate){
    setTypes(node,currentTypes.filter(type=>type!=='EducationEvent'));
    addAdditionalType(node,`${SCHEMA_BASE}EducationEvent`);
  }
  if(nodeTypes(node).includes('Dataset')){
    // These remain in the canonical research graph. They are intentionally
    // excluded from the page projection because Google assigns them a more
    // restrictive Dataset meaning than Schema.org's general graph semantics.
    for(const key of ['citation','provider','hasPart'])delete node[key];
  }
  return node;
};

const normalizeDatasetDistribution=(nodes,byId)=>{
  for(const node of nodes){
    if(!nodeTypes(node).includes('Dataset'))continue;
    const distributions=asArray(node.distribution).filter(value=>{
      const id=refId(value),target=id?byId.get(id):null;
      return Boolean(target&&nodeTypes(target).includes('DataDownload')&&typeof target.contentUrl==='string'&&typeof target.encodingFormat!=='undefined');
    });
    if(distributions.length)node.distribution=distributions;
    else delete node.distribution;
  }
};

/**
 * Compiles the JSON-LD delivered in HTML into a conservative Google-facing
 * projection while preserving the canonical research RDF unchanged. The page
 * projection uses only Schema.org context terms, native JSON scalars and
 * non-eligible support roles for historical events/publications that are not
 * landing pages for those Google rich-result features.
 */
export function normalizeGooglePageGraph(document,{lane='support'}={}){
  if(!document||typeof document!=='object'||Array.isArray(document))throw new Error('Google page graph must be an object');
  const sourceNodes=Array.isArray(document['@graph'])?document['@graph']:[];
  const nodes=sourceNodes.map(node=>normalizeGoogleRole(normalizeValue(node))).filter(Boolean);
  const byId=new Map(nodes.filter(node=>typeof node?.['@id']==='string').map(node=>[node['@id'],node]));
  if(byId.size!==nodes.filter(node=>typeof node?.['@id']==='string').length)throw new Error(`Duplicate @id in Google ${lane} projection`);
  normalizeDatasetDistribution(nodes,byId);
  return {'@context':schemaOnlyContext(document['@context']),'@graph':nodes};
}
