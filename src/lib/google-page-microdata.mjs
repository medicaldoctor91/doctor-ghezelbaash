const asArray=value=>Array.isArray(value)?value:(value==null?[]:[value]);
const refId=value=>typeof value==='string'?value:value?.['@id'];
const requireValue=(value,label)=>{
  if(value==null||value==='')throw new Error(`Google page projection is missing ${label}`);
  return value;
};

/**
 * Builds the deliberately small DOM-bound Microdata view of the canonical
 * Google JSON-LD page node. The JSON-LD projection remains authoritative;
 * this view only repeats relations that bind that node to visible HTML.
 */
export function deriveGooglePageMicrodata(graphDocument,pageId){
  const nodes=Array.isArray(graphDocument)?graphDocument:graphDocument?.['@graph'];
  if(!Array.isArray(nodes))throw new Error('Google page projection lacks @graph');
  const page=nodes.find(node=>node?.['@id']===pageId);
  if(!page)throw new Error(`Google page projection is missing ${pageId}`);

  const types=asArray(page['@type']);
  if(types.length!==1||types[0]!=='ProfilePage'){
    throw new Error(`Google page projection must be exactly ProfilePage, received ${types.join(', ')||'none'}`);
  }
  if(Object.hasOwn(page,'dateModified')){
    throw new Error('Google ProfilePage projection must omit dateModified until a genuine DateTime exists');
  }

  const mainEntityId=requireValue(refId(page.mainEntity),'mainEntity');
  const linkValues=new Map();
  const addLink=(itemprop,href)=>{
    const value=requireValue(href,itemprop);
    if(!linkValues.has(value))linkValues.set(value,[]);
    const properties=linkValues.get(value);
    if(!properties.includes(itemprop))properties.push(itemprop);
  };

  addLink('url',requireValue(page.url,'url'));
  for(const property of ['author','publisher','reviewedBy','isPartOf','primaryImageOfPage','about','specialty']){
    for(const value of asArray(page[property]))addLink(property,refId(value));
  }

  const meta=[];
  for(const language of asArray(page.inLanguage)){
    meta.push({itemprop:'inLanguage',content:requireValue(language,'inLanguage')});
  }
  if(page.lastReviewed!=null){
    const lastReviewed=String(page.lastReviewed);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(lastReviewed))throw new Error(`Invalid lastReviewed Date: ${lastReviewed}`);
    meta.push({itemprop:'lastReviewed',content:lastReviewed});
  }

  return Object.freeze({
    itemId:page['@id'],
    itemType:'https://schema.org/ProfilePage',
    mainEntityId,
    links:[...linkValues].map(([href,properties])=>Object.freeze({href,itemprop:properties.join(' ')})),
    meta:meta.map(value=>Object.freeze(value)),
  });
}
