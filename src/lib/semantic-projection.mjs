const refId=value=>value&&typeof value==='object'&&typeof value['@id']==='string'?value['@id']:null;
const asArray=value=>Array.isArray(value)?value:(value==null?[]:[value]);
const types=node=>asArray(node?.['@type']);

/**
 * Removes vocabulary terms that are valid in the canonical research graph but
 * are not valid on the projected Schema.org type delivered in page markup.
 */
const normalizeSchemaProjection=projected=>{
  const out=projected;
  for(const key of Object.keys(out))if(/^(?:prov|dcterms|skos):/.test(key))delete out[key];
  const projectedTypes=types(out);
  if(projectedTypes.length===1&&projectedTypes[0]==='Person'){
    for(const key of ['practicesAt','areaServed','medicalSpecialty'])delete out[key];
  }
  if(projectedTypes.includes('HowTo'))delete out.reviewedBy;
  return out;
};

/**
 * Applies a declarative projection profile to one canonical graph node.
 * This is shared by JSON-LD generation and HTML Microdata assembly so both
 * delivery syntaxes are compiled from the same policy instead of drifting.
 */
export const projectNode=(node,spec={})=>{
  const out={};
  if(!spec.include)Object.assign(out,structuredClone(node));
  else for(const key of spec.include)if(Object.hasOwn(node,key))out[key]=structuredClone(node[key]);
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
  return normalizeSchemaProjection(out);
};
