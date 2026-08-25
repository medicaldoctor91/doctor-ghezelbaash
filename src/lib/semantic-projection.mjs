const refId=value=>value&&typeof value==='object'&&typeof value['@id']==='string'?value['@id']:null;

/**
 * Applies a declarative projection profile to one canonical graph node.
 * This is shared by JSON-LD generation and HTML Microdata assembly so both
 * delivery syntaxes are compiled from the same policy instead of drifting.
 */
export const projectNode=(node,spec={})=>{
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
