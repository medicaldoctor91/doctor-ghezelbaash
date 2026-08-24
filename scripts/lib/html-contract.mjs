import { parse } from 'parse5';

export const attr=(node,name)=>node.attrs?.find(item=>item.name===name)?.value;
export const classes=node=>new Set((attr(node,'class')||'').split(/\s+/).filter(Boolean));
export function walk(node,visit){
  visit(node);
  for(const child of node.childNodes||[]) walk(child,visit);
  if(node.content) walk(node.content,visit);
}
export function ancestors(node){
  const out=[];
  for(let current=node.parentNode;current;current=current.parentNode) out.push(current);
  return out;
}
export function nearest(node,predicate){return ancestors(node).find(predicate);}
export function textContent(node){
  let value='';
  walk(node,current=>{if(current.nodeName==='#text')value+=current.value||''});
  return value.replace(/\s+/g,' ').trim();
}
export function stripFrontmatter(source){
  if(!source.startsWith('---')) return source;
  const end=source.indexOf('\n---',3);
  return end<0?source:source.slice(end+4);
}
export function inspectHtml(source,{wrapMain=false}={}){
  const html=wrapMain?`<!doctype html><html><body><main id="main-content">${stripFrontmatter(source)}</main></body></html>`:source;
  const document=parse(html,{sourceCodeLocationInfo:true});
  const nodes=[];walk(document,node=>nodes.push(node));
  const elements=nodes.filter(node=>node.tagName);
  const ids=elements.map(node=>attr(node,'id')).filter(Boolean);
  const fragments=elements.filter(node=>node.tagName==='a').map(node=>attr(node,'href')).filter(value=>value?.startsWith('#')).map(value=>value.slice(1));
  const sections=elements.filter(node=>node.tagName==='section');
  const unclosedSections=sections.filter(node=>!node.sourceCodeLocation?.endTag);
  const contentSections=sections.filter(node=>classes(node).has('content-section'));
  const misplacedContentSections=contentSections.filter(node=>node.parentNode?.tagName!=='main');
  const headings=elements.filter(node=>/^h[1-6]$/.test(node.tagName));
  const videos=elements.filter(node=>node.tagName==='video');
  const videoErrors=[];
  for(const video of videos){
    const children=(video.childNodes||[]).filter(node=>node.tagName||node.nodeName==='#text'&&String(node.value||'').trim());
    let fallbackSeen=false;
    for(const child of children){
      if(child.nodeName==='#text'){fallbackSeen=true;continue;}
      if((child.tagName==='source'||child.tagName==='track')&&fallbackSeen) videoErrors.push(`${attr(video,'id')||'(video)'} has ${child.tagName} after fallback text`);
    }
    if(attr(video,'poster')) videoErrors.push(`${attr(video,'id')||'(video)'} eagerly declares poster`);
    if(!attr(video,'data-poster')) videoErrors.push(`${attr(video,'id')||'(video)'} lacks deferred data-poster`);
    if(attr(video,'preload')!=='none') videoErrors.push(`${attr(video,'id')||'(video)'} preload must be none`);
  }
  return {document,elements,ids,fragments,sections,contentSections,unclosedSections,misplacedContentSections,headings,videos,videoErrors};
}

export function assertDocumentContract(source,{wrapMain=false,expectedContentSections}={}){
  const result=inspectHtml(source,{wrapMain});
  const duplicateIds=[...new Set(result.ids.filter((id,index)=>result.ids.indexOf(id)!==index))];
  if(duplicateIds.length) throw new Error(`Duplicate actual HTML IDs: ${duplicateIds.join(',')}`);
  const idSet=new Set(result.ids),missing=[...new Set(result.fragments.filter(fragment=>!idSet.has(fragment)))];
  if(missing.length) throw new Error(`Broken actual HTML fragments: ${missing.join(',')}`);
  if(result.unclosedSections.length) throw new Error(`Sections without explicit end tags: ${result.unclosedSections.map(node=>attr(node,'id')||'(section)').join(',')}`);
  if(result.misplacedContentSections.length) throw new Error(`Content sections are not direct main children: ${result.misplacedContentSections.map(node=>attr(node,'id')||'(section)').join(',')}`);
  if(expectedContentSections!==undefined&&result.contentSections.length!==expectedContentSections) throw new Error(`Content section count drift: ${result.contentSections.length}/${expectedContentSections}`);
  if(result.videoErrors.length) throw new Error(`Video markup contract failed: ${result.videoErrors.join('; ')}`);
  return result;
}
