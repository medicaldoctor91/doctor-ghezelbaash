import {MULTILINGUAL_HEADING_BOUNDARIES,MULTILINGUAL_RETURN_TO_PRIMARY} from '../../src/lib/language-contract.mjs';

const normalize=value=>String(value??'').replace(/\s+/g,' ').trim();
const textContent=node=>{
  if(!node)return '';
  if(node.type==='text')return node.value??'';
  if(Array.isArray(node.children))return node.children.map(textContent).join('');
  return '';
};
const headingText=node=>node?.type==='element'&&node.tagName==='h2'?normalize(textContent(node)):'';
const boundaryFor=text=>MULTILINGUAL_HEADING_BOUNDARIES.find(boundary=>text.startsWith(boundary.startsWith))??null;
const isReturnBoundary=text=>text.startsWith(MULTILINGUAL_RETURN_TO_PRIMARY.startsWith);

export function annotateLanguageRegions(tree){
  let annotated=false;
  const walk=node=>{
    if(annotated||!Array.isArray(node?.children))return;
    const boundaryIndexes=[];
    let returnIndex=-1;
    for(let index=0;index<node.children.length;index++){
      const text=headingText(node.children[index]);
      if(!text)continue;
      const boundary=boundaryFor(text);
      if(boundary)boundaryIndexes.push({index,boundary});
      else if(isReturnBoundary(text))returnIndex=index;
    }
    const complete=boundaryIndexes.length===MULTILINGUAL_HEADING_BOUNDARIES.length
      && boundaryIndexes.every((item,index)=>item.boundary.key===MULTILINGUAL_HEADING_BOUNDARIES[index].key)
      && returnIndex>boundaryIndexes.at(-1).index;
    if(complete){
      for(let regionIndex=0;regionIndex<boundaryIndexes.length;regionIndex++){
        const {index:start,boundary}=boundaryIndexes[regionIndex];
        const end=regionIndex+1<boundaryIndexes.length?boundaryIndexes[regionIndex+1].index:returnIndex;
        for(let index=start;index<end;index++){
          const child=node.children[index];
          if(child?.type!=='element')continue;
          child.properties??={};
          child.properties.lang=boundary.lang;
          child.properties.dir=boundary.dir;
        }
      }
      annotated=true;
      return;
    }
    for(const child of node.children)walk(child);
  };
  walk(tree);
  return annotated;
}

export default function rehypeLanguageRegions(){
  return tree=>{annotateLanguageRegions(tree);};
}
