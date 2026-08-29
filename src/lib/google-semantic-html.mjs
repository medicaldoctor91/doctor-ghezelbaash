import {deriveGooglePageMicrodata} from './google-page-microdata.mjs';
import {projectNode} from './semantic-projection.mjs';

const MAIN_ENTITY_ITEMPROP_TOKEN='{{GOOGLE_MAIN_ENTITY_ITEMPROP}}';
const MAIN_ENTITY_ITEMTYPE_TOKEN='{{GOOGLE_MAIN_ENTITY_ITEMTYPE}}';
const asArray=value=>Array.isArray(value)?value:(value==null?[]:[value]);
const refId=value=>typeof value==='string'?value:value?.['@id'];
const attr=(source,name)=>source.match(new RegExp(`\\b${name}=["']([^"']+)["']`,'i'))?.[1];
const withoutAttr=(source,name)=>source.replace(new RegExp(`\\s+${name}(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?`,'gi'),'');
const escapeAttribute=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');

const graphNodes=document=>Array.isArray(document)?document:document?.['@graph'];

export function deriveGooglePageNode(graphDocument,headProfile,pageId,languages){
  const nodes=graphNodes(graphDocument);
  if(!Array.isArray(nodes))throw new Error('Canonical graph lacks @graph');
  const canonicalPage=nodes.find(node=>node?.['@id']===pageId);
  if(!canonicalPage)throw new Error(`Canonical graph is missing ${pageId}`);
  const spec=headProfile?.nodes?.[pageId];
  if(!spec)throw new Error(`Head profile is missing ${pageId}`);
  const projected=projectNode(canonicalPage,spec);
  if(languages)projected.inLanguage=[...languages];
  return projected;
}

/**
 * Compiles the visible DOM projection from the same canonical graph and Head
 * Profile that produce Google-facing JSON-LD. It adds only HTML-bound facts:
 * nested page-to-person roles and intrinsic URL/language values for each
 * visible WebPageElement. Rich topic edges remain authoritative in JSON-LD.
 */
export function bindGoogleSemanticHtml(source,{graphDocument,headProfile,pageId,languages}){
  const nodes=graphNodes(graphDocument);
  if(!Array.isArray(nodes))throw new Error('Canonical graph lacks @graph');
  const byId=new Map(nodes.filter(node=>typeof node?.['@id']==='string').map(node=>[node['@id'],node]));
  const page=deriveGooglePageNode(graphDocument,headProfile,pageId,languages);
  const mainEntityId=refId(page.mainEntity);
  const canonicalMainEntity=byId.get(mainEntityId);
  const mainEntitySpec=headProfile?.nodes?.[mainEntityId];
  if(!canonicalMainEntity||!mainEntitySpec)throw new Error(`Google Head projection is missing mainEntity policy for ${mainEntityId||'unknown'}`);
  const projectedMainEntity=projectNode(canonicalMainEntity,mainEntitySpec);
  const pageMicrodata=deriveGooglePageMicrodata({'@graph':[page,projectedMainEntity]},pageId);
  let output=String(source);
  const tokenCount=token=>output.split(token).length-1;
  if(tokenCount(MAIN_ENTITY_ITEMPROP_TOKEN)!==1||tokenCount(MAIN_ENTITY_ITEMTYPE_TOKEN)!==1)throw new Error('Expected one Google main-entity itemprop and itemtype token');
  output=output.replace(MAIN_ENTITY_ITEMPROP_TOKEN,pageMicrodata.mainEntityItemprop);
  output=output.replace(MAIN_ENTITY_ITEMTYPE_TOKEN,pageMicrodata.mainEntityItemType);

  const expectedIds=asArray(page.mainContentOfPage).map(refId).filter(Boolean);
  if(!expectedIds.length||new Set(expectedIds).size!==expectedIds.length)throw new Error('Google page mainContentOfPage projection is empty or duplicated');
  const expected=new Set(expectedIds),seen=new Set();
  const enrich=(tag,tail='')=>{
    const itemId=attr(tag,'itemid');
    if(!expected.has(itemId))throw new Error(`Visible mainContentOfPage is outside the Head projection: ${itemId}`);
    if(seen.has(itemId))throw new Error(`Duplicate visible mainContentOfPage scope: ${itemId}`);
    const node=byId.get(itemId);
    const types=asArray(node?.['@type']);
    if(!node||!types.includes('WebPageElement'))throw new Error(`Canonical WebPageElement missing for ${itemId}`);
    if(attr(tag,'itemtype')!=='https://schema.org/WebPageElement')throw new Error(`Visible WebPageElement type drift: ${itemId}`);
    const url=typeof node.url==='string'?node.url:null;
    const inLanguage=asArray(node.inLanguage);
    if(!url||inLanguage.length!==1||typeof inLanguage[0]!=='string')throw new Error(`Visible WebPageElement lacks one canonical url/inLanguage: ${itemId}`);
    seen.add(itemId);
    return `${tag}${tail}<link href="${escapeAttribute(url)}" itemprop="url"/><meta content="${escapeAttribute(inLanguage[0])}" itemprop="inLanguage"/>`;
  };
  const scopedSection=/<section\b(?=[^>]*\bitemprop=["'][^"']*\bmainContentOfPage\b[^"']*["'])(?=[^>]*\bitemid=["'][^"']+["'])[^>]*>/gi;
  output=output.replace(scopedSection,tag=>enrich(tag));

  // Schema Markup Validator emits UNKNOWN_FIELD for mainContentOfPage when the
  // item scope itself is an interactive <details>. Keep the exact details /
  // summary UI and its canonical H2 name property, but move only the item scope
  // to a labeled semantic <section> wrapper around that details block.
  const scopedDetails=/(<details\b(?=[^>]*\bitemprop=["'][^"']*\bmainContentOfPage\b[^"']*["'])(?=[^>]*\bitemid=["'][^"']+["'])[^>]*>)(<summary\b[^>]*>[\s\S]*?<\/summary>)(\s*)(<section\b[^>]*>)/gi;
  let wrappedDetails=0;
  output=output.replace(scopedDetails,(_match,detailsTag,summary,gap,sectionTag)=>{
    const itemId=attr(detailsTag,'itemid'),detailsId=attr(detailsTag,'id'),labelId=attr(sectionTag,'aria-labelledby');
    if(!expected.has(itemId))throw new Error(`Visible details mainContentOfPage is outside the Head projection: ${itemId}`);
    if(!detailsId||!labelId)throw new Error(`Visible details WebPageElement lacks stable id/label binding: ${itemId}`);
    const cleanDetails=['itemid','itemprop','itemscope','itemtype'].reduce((tag,name)=>withoutAttr(tag,name),detailsTag);
    const scopeTag=`<section aria-labelledby="${escapeAttribute(labelId)}" id="${escapeAttribute(detailsId)}-semantic-scope" itemid="${escapeAttribute(itemId)}" itemprop="mainContentOfPage" itemscope itemtype="https://schema.org/WebPageElement">`;
    wrappedDetails+=1;
    return `${enrich(scopeTag)}${cleanDetails}${summary}${gap}${sectionTag}`;
  });
  if(wrappedDetails){
    let closedWrappers=0;
    output=output.replace(/<\/section>\s*<\/details>/gi,match=>{
      closedWrappers+=1;
      return `${match}</section>`;
    });
    if(closedWrappers!==wrappedDetails)throw new Error(`Google details wrapper closure drift: opened=${wrappedDetails}, closed=${closedWrappers}`);
  }
  const missing=expectedIds.filter(id=>!seen.has(id));
  if(missing.length)throw new Error(`Head mainContentOfPage nodes lack visible scopes: ${missing.join(', ')}`);
  return output;
}
