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
    if(!expected.has(itemId))throw new Error(`Visible WebPageElement is outside the Head projection: ${itemId}`);
    if(seen.has(itemId))throw new Error(`Duplicate visible WebPageElement scope: ${itemId}`);
    const node=byId.get(itemId);
    const types=asArray(node?.['@type']);
    if(!node||!types.includes('WebPageElement'))throw new Error(`Canonical WebPageElement missing for ${itemId}`);
    if(attr(tag,'itemtype')!=='https://schema.org/WebPageElement')throw new Error(`Visible WebPageElement type drift: ${itemId}`);
    const url=typeof node.url==='string'?node.url:null;
    const inLanguage=asArray(node.inLanguage);
    if(!url||inLanguage.length!==1||typeof inLanguage[0]!=='string')throw new Error(`Visible WebPageElement lacks one canonical url/inLanguage: ${itemId}`);
    seen.add(itemId);
    return `${withoutAttr(tag,'itemprop')}${tail}<link href="${escapeAttribute(url)}" itemprop="url"><meta content="${escapeAttribute(inLanguage[0])}" itemprop="inLanguage">`;
  };

  // JSON-LD is the authoritative owner of ProfilePage -> mainContentOfPage.
  // The DOM keeps the same 18 visible WebPageElement identities and their
  // intrinsic name/url/language facts, but deliberately omits the duplicated
  // mainContentOfPage Microdata edge. This prevents nested WebPageElement
  // scopes from re-owning the page-level property while preserving the full
  // canonical relationship in the Google-facing JSON-LD graph.
  const visibleSection=/<section\b(?=[^>]*\bitemprop=["'][^"']*\bmainContentOfPage\b[^"']*["'])(?=[^>]*\bitemid=["'][^"']+["'])(?=[^>]*\bitemscope\b)(?=[^>]*\bitemtype=["']https:\/\/schema\.org\/WebPageElement["'])[^>]*>/gi;
  output=output.replace(visibleSection,tag=>enrich(tag));
  const visibleDetails=/(<details\b(?=[^>]*\bitemprop=["'][^"']*\bmainContentOfPage\b[^"']*["'])(?=[^>]*\bitemid=["'][^"']+["'])(?=[^>]*\bitemscope\b)(?=[^>]*\bitemtype=["']https:\/\/schema\.org\/WebPageElement["'])[^>]*>)(<summary\b[^>]*>[\s\S]*?<\/summary>)/gi;
  output=output.replace(visibleDetails,(_match,tag,summary)=>enrich(tag,summary));
  const missing=expectedIds.filter(id=>!seen.has(id));
  if(missing.length)throw new Error(`Head mainContentOfPage nodes lack visible WebPageElement scopes: ${missing.join(', ')}`);
  return output;
}
