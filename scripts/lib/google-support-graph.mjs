const nodeTypes=node=>Array.isArray(node?.['@type'])?node['@type']:[node?.['@type']].filter(Boolean);
const isoDurationSeconds=value=>{const m=String(value??'').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);if(!m)return null;return (Number(m[1]||0)*3600)+(Number(m[2]||0)*60)+Number(m[3]||0);};

export function normalizeGoogleSupportGraph(doc){
  if(!doc||typeof doc!=='object'||Array.isArray(doc))throw new Error('Google support graph must be an object');
  const normalized=structuredClone(doc);
  const nodes=Array.isArray(normalized['@graph'])?normalized['@graph']:[];
  const byId=new Map(nodes.filter(node=>typeof node?.['@id']==='string').map(node=>[node['@id'],node]));
  const ineligibleVideoIds=new Set();
  for(const node of nodes){
    if(!nodeTypes(node).includes('VideoObject'))continue;
    const duration=isoDurationSeconds(node.duration);
    if(duration!==null&&duration<30){ineligibleVideoIds.add(node['@id']);delete node.hasPart;}
  }
  const output=[];
  for(const node of nodes){
    if(nodeTypes(node).includes('Clip')){
      const parentId=node?.isPartOf?.['@id'];
      if(parentId&&ineligibleVideoIds.has(parentId))continue;
      if(node.endOffset==null&&parentId){
        const parent=byId.get(parentId);
        const end=isoDurationSeconds(parent?.duration);
        const start=Number(node.startOffset);
        if(end!==null&&Number.isFinite(start)&&end>start)node.endOffset=end;
      }
    }
    if(nodeTypes(node).includes('Dataset')&&Object.hasOwn(node,'hasPart')){
      const values=Array.isArray(node.hasPart)?node.hasPart:[node.hasPart];
      const valid=values.filter(value=>{
        if(typeof value==='string')return /^https?:\/\//i.test(value);
        if(!value||typeof value!=='object')return false;
        if(value['@type'])return (Array.isArray(value['@type'])?value['@type']:[value['@type']]).includes('Dataset');
        const id=value['@id'];
        if(typeof id!=='string'||!/^https?:\/\//i.test(id))return false;
        const target=byId.get(id);
        return !target||nodeTypes(target).includes('Dataset');
      });
      if(valid.length)node.hasPart=Array.isArray(node.hasPart)?valid:valid[0];else delete node.hasPart;
    }
    if(nodeTypes(node).includes('ScholarlyArticle')){
      const images=(Array.isArray(node.image)?node.image:[node.image]).filter(Boolean);
      if(!images.length)throw new Error(`ScholarlyArticle missing image in Google support graph: ${node['@id']||node.name||'(unknown)'}`);
      for(const image of images){
        if(typeof image==='string'&&/^https?:\/\//i.test(image))continue;
        const imageId=image&&typeof image==='object'?image['@id']:null,target=imageId?byId.get(imageId):null;
        if(!target||!nodeTypes(target).includes('ImageObject'))throw new Error(`ScholarlyArticle image target missing from Google support graph: ${imageId||'(invalid image)'}`);
      }
    }
    output.push(node);
  }
  normalized['@graph']=output;
  return normalized;
}
