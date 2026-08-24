import path from 'node:path';
import {readFile,readdir} from 'node:fs/promises';
import {bindHeroPictureSizes} from '../../src/lib/hero-image-contract.mjs';
import {bindHeroSearchLabel} from '../../src/lib/hero-search-presentation.mjs';
import {bindHeroMastheadPresentation} from '../../src/lib/hero-subtitle-presentation.mjs';
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
  const release=JSON.parse(await readFile(path.join(root,'src/data/release.json'),'utf8'));
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
  return {content,names};
}
