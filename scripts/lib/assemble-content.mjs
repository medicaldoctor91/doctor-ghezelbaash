import path from 'node:path';
import {parseFragment,serialize} from 'parse5';
import {readFile,readdir} from 'node:fs/promises';
import {bindHeroPictureSizes} from '../../src/lib/hero-image-contract.mjs';
import {bindHeroSearchLabel} from '../../src/lib/hero-search-presentation.mjs';
import {bindHeroMastheadPresentation} from '../../src/lib/hero-subtitle-presentation.mjs';
import {bindGoogleSemanticHtml} from '../../src/lib/google-semantic-html.mjs';
import {CONTENT_LANGUAGES} from '../../src/lib/language-contract.mjs';
import {bindLanguageRegions} from '../../src/lib/language-regions.mjs';
import {bindReleaseTokens} from '../../src/lib/release-tokens.mjs';
import {bindSiteTokens,deriveSiteData} from '../../src/lib/site-data.mjs';

const LIVE_REPUTATION_SLOT='<div class="hero-caption-reputation" id="google-maps-clinic-reputation-current" data-live-reputation-slot></div>';
const persianNumber=(value,digits=0)=>new Intl.NumberFormat('fa-IR',{minimumFractionDigits:digits,maximumFractionDigits:digits,useGrouping:true}).format(Number(value));
const persianGregorianDate=value=>new Intl.DateTimeFormat('fa-IR-u-ca-gregory',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value));

export const compactAuthoredHtmlLayout=source=>String(source).replace(/>\s*\r?\n\s*</g,'><');

const bindLiveReputation=async(root,content,release)=>{
  const volatile=JSON.parse(await readFile(path.join(root,'src/data/volatile-facts.json'),'utf8'));
  const rating=Number(volatile.rating),reviewCount=Number(volatile.reviewCount),observedAt=volatile.valueObservedAt;
  if(!(rating>=1&&rating<=5)||!Number.isInteger(reviewCount)||reviewCount<0||volatile.placeId!==release.clinic.placeId||Number.isNaN(Date.parse(observedAt)))throw new Error('Invalid live reputation source for visible binding');
  const slotCount=String(content).split(LIVE_REPUTATION_SLOT).length-1;
  if(slotCount!==1)throw new Error(`Expected one exact visible reputation slot; found ${slotCount}`);
  const replacement='<div class="hero-caption-reputation" id="google-maps-clinic-reputation-current"><strong>'+persianNumber(rating,1)+' از ۵ در <span translate="no">Google Maps</span></strong> · بر اساس '+persianNumber(reviewCount)+' نظر · آخرین تغییر ثبت‌شده در Google: '+persianGregorianDate(observedAt)+' — <a href="https://www.google.com/maps?cid='+release.clinic.cid+'" rel="external noopener">مشاهده نظرها</a></div>';
  return content.replace(LIVE_REPUTATION_SLOT,replacement);
};

export async function canonicalSourceNames(root=process.cwd()){
  const sourceDir=path.join(root,'src/content-source');
  const names=(await readdir(sourceDir)).filter(name=>/\.(?:md|html)$/i.test(name)).sort();
  if(names.length!==1||names[0]!=='page.md')throw new Error('Canonical page source contract drift: '+names.join(', '));
  return names;
}

export async function assembleCanonicalContent({root=process.cwd(),graph}={}){
  const names=await canonicalSourceNames(root);
  const [release,headProfile]=await Promise.all([
    readFile(path.join(root,'src/data/release.json'),'utf8').then(JSON.parse),
    readFile(path.join(root,'src/data/semantic/head-profile.json'),'utf8').then(JSON.parse),
  ]);
  const canonicalGraph=graph??JSON.parse(await readFile(path.join(root,'src/data/semantic/knowledge-graph.jsonld'),'utf8'));
  const site=deriveSiteData(release,canonicalGraph);
  let content=await readFile(path.join(root,'src/content-source/page.md'),'utf8');
  content=bindLanguageRegions(content);
  content=compactAuthoredHtmlLayout(content);
  content=bindHeroMastheadPresentation(content);
  content=bindHeroSearchLabel(content);
  content=bindHeroPictureSizes(content);
  content=bindReleaseTokens(content,release);
  content=bindSiteTokens(content,site);
  content=await bindLiveReputation(root,content,release);
  content=bindGoogleSemanticHtml(content,{graphDocument:canonicalGraph,headProfile,pageId:`${release.canonicalUrl}#webpage`,languages:CONTENT_LANGUAGES});
  return {content,names};
}

const PUBLIC_HEADING_TAGS=new Set(['h3','h4','h5','h6']);
const PUBLIC_ANSWER_TAGS=new Set(['p','ul','ol','table','blockquote']);
const PUBLIC_MEDIA_TAGS=new Set(['figure','video','audio']);
const PUBLIC_REQUIRED_CLASSES=new Set(['section-answer','micro-answer']);
const publicAttrs=node=>Object.fromEntries((node.attrs||[]).map(({name,value})=>[name,value]));
const publicClasses=node=>new Set(String(publicAttrs(node).class||'').split(/\s+/).filter(Boolean));
const publicText=node=>node?.nodeName==='#text'?(node.value||''):(node?.childNodes||[]).map(publicText).join(' ');
const publicId=node=>publicAttrs(node).id||'';
const publicDescendants=(node,out=[])=>{for(const child of node.childNodes||[]){if(child.tagName)out.push(child);publicDescendants(child,out)}return out};
const setPublicAttr=(node,name,value)=>{node.attrs=node.attrs||[];const found=node.attrs.find(a=>a.name===name);if(found)found.value=value;else node.attrs.push({name,value})};
const publicAnchor=id=>({nodeName:'span',tagName:'span',namespaceURI:'http://www.w3.org/1999/xhtml',attrs:[{name:'id',value:id},{name:'class',value:'semantic-alias-anchor'},{name:'aria-hidden',value:'true'}],childNodes:[]});
const hasRequiredPublicClass=node=>[node,...publicDescendants(node,[])].some(item=>[...publicClasses(item)].some(name=>PUBLIC_REQUIRED_CLASSES.has(name)));

export function projectPublicContent(source){
  const raw=String(source),match=raw.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n)([\s\S]*)$/);
  if(!match)throw new Error('Public projection requires Markdown frontmatter');
  const [,frontmatter,body]=match,fragment=parseFragment(body),chunks=publicDescendants(fragment,[]).filter(node=>publicClasses(node).has('render-chunk')),changed=[];
  for(const chunk of chunks){
    const originalChars=publicText(chunk).replace(/\s+/g,' ').trim().length;
    if(originalChars<=5000)continue;
    const children=(chunk.childNodes||[]).filter(child=>child.tagName),keep=[];let followup=0;
    for(const child of children){
      if(PUBLIC_HEADING_TAGS.has(child.tagName)){keep.push(child);followup=2;continue}
      if(PUBLIC_MEDIA_TAGS.has(child.tagName)||hasRequiredPublicClass(child)){keep.push(child);continue}
      if(child.tagName==='details'&&publicDescendants(child,[]).some(node=>PUBLIC_MEDIA_TAGS.has(node.tagName))){keep.push(child);continue}
      if(followup>0&&PUBLIC_ANSWER_TAGS.has(child.tagName)){keep.push(child);followup-=1}
    }
    const originalIds=new Set(publicDescendants(chunk,[]).map(publicId).filter(Boolean)),keptIds=new Set();
    for(const child of keep){if(publicId(child))keptIds.add(publicId(child));for(const node of publicDescendants(child,[]))if(publicId(node))keptIds.add(publicId(node))}
    const anchors=[...originalIds].filter(id=>!keptIds.has(id)).sort().map(publicAnchor);
    chunk.childNodes=[...anchors,...keep];for(const child of chunk.childNodes)child.parentNode=chunk;setPublicAttr(chunk,'data-public-projection','answer-first');
    changed.push({originalChars,publicChars:publicText(chunk).replace(/\s+/g,' ').trim().length,anchorCount:anchors.length});
  }
  const content=frontmatter+serialize(fragment);
  return {content,stats:{renderChunks:chunks.length,changedChunks:changed.length,originalChars:changed.reduce((n,x)=>n+x.originalChars,0),publicChars:changed.reduce((n,x)=>n+x.publicChars,0),preservedFragmentAnchors:changed.reduce((n,x)=>n+x.anchorCount,0),publicBytes:Buffer.byteLength(content),canonicalBytes:Buffer.byteLength(raw)}};
}
