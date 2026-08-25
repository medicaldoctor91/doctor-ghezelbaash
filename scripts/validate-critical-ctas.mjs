import {readFile} from 'node:fs/promises';
import {deriveSiteData} from '../src/lib/site-data.mjs';
import {assembleCanonicalContent} from './lib/assemble-content.mjs';

const [quick,runtime,sitePresentation]=await Promise.all([
  readFile('src/components/FloatingActionDock.astro','utf8'),
  readFile('src/components/GuideNavigator.astro','utf8'),
  readFile('src/lib/site-presentation.mjs','utf8'),
]);
const release=JSON.parse(await readFile('src/data/release.json','utf8'));
const graph=JSON.parse(await readFile('src/data/semantic/knowledge-graph.jsonld','utf8'));
const redirectsRaw=await readFile('src/data/subdomain-redirects.json','utf8');
const site=deriveSiteData(release,graph);
const {content:source}=await assembleCanonicalContent({graph});

const fail=message=>{throw new Error(message)};
const hero=[...source.matchAll(/<a\b[^>]*class=["'][^"']*\bhero-action\b[^"']*["'][^>]*>[\s\S]*?<\/a>/gi)].map(m=>m[0]);
if(hero.length!==3)fail(`Critical hero CTA count drift: ${hero.length} != 3`);

const heroContract=[
  {label:'رزرو وقت مشاوره رایگان',href:site.telHref,primary:true},
  {label:'مشاهده نمونه‌کارهای دکتر قزلباش',href:site.instagramUrl},
  {label:'آدرس دقیق کلینیک',href:'https://doctor.ghezelbaash.ir/'}
];
const visibleText=anchor=>anchor.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
for(const contract of heroContract){
  const hits=hero.filter(anchor=>visibleText(anchor)===contract.label&&anchor.includes(`href="${contract.href}"`));
  if(hits.length!==1)fail(`Hero CTA contract drift: ${contract.label} (${hits.length})`);
  if(contract.primary&&!hits[0].includes('hero-action--primary'))fail('Reservation CTA lost primary hierarchy');
  const text=visibleText(hits[0]);
  if(text!==contract.label)fail(`Hero CTA accessible text drift: ${contract.label} -> ${text}`);
}

if(!redirectsRaw.includes('doctor.ghezelbaash.ir')||!/(google\.com\/maps|maps\.google)/i.test(redirectsRaw))fail('doctor subdomain no longer maps to the clinic map redirect contract');
if(!quick.includes('class="quick-actions" data-hero-dock hidden')||!quick.includes('class="quick-actions__top"')||!quick.includes('data-quick-actions-top hidden')||!quick.includes('href="#main-content"'))fail('Flash-free Hero-aware floating controls drift');
if(!quick.includes("'IntersectionObserver'in window")||!quick.includes('s(!e.isIntersecting)')||!quick.includes("d.querySelector('.entity-hero')"))fail('Hero-aware dock runtime contract drift');
if(!runtime.includes("top.hidden=scrollY<800")||!runtime.includes("addEventListener('scroll',syncTop,{passive:true})")||!runtime.includes('syncTop();'))fail('Back-to-top scroll visibility contract drift');
if(!sitePresentation.includes('a[href^="tel:"]:not(.quick-actions__item)'))fail('Floating phone CTA escaped shared flex/RTL alignment contract');
for(const [binding,label] of [['href={site.telHref}','تماس'],['href={site.chatUrl}','چت با دکتر قزلباش'],['href={site.directionsUrl}','مسیریابی']])if(!quick.includes(binding))fail(`Floating CTA canonical binding drift: ${label}`);
const floating=[...quick.matchAll(/<a\b([^>]*)>[\s\S]*?<\/a>/g)]
  .filter(match=>((match[1].match(/\bclass=["']([^"']+)["']/i)||[])[1]||'').split(/\s+/).includes('quick-actions__item'))
  .map(match=>match[0]);
if(floating.length!==3)fail(`Floating CTA count drift: ${floating.length} != 3`);
for(const copy of ['<span>تماس</span>','<strong>چت با دکتر قزلباش</strong>','<span>مسیریابی</span>'])if(!floating.some(anchor=>anchor.includes(copy)))fail(`Floating CTA copy drift: ${copy}`);
for(const [binding,label] of [['href={site.telHref}','تماس'],['href={site.chatUrl}','چت با دکتر قزلباش'],['href={site.directionsUrl}','مسیریابی']])if(floating.filter(anchor=>anchor.includes(binding)).length!==1)fail(`Floating CTA unique binding drift: ${label}`);
for(const [index,anchor] of floating.entries())if(!/aria-label=["'][^"']+["']/i.test(anchor))fail(`Floating CTA aria-label missing at index ${index}`);
const directions=new URL(site.directionsUrl);
if(directions.searchParams.get('destination_place_id')!==release.clinic.placeId)fail('Floating directions Place ID drift');

console.log(JSON.stringify({
  criticalCtas:'PASS',
  hero:heroContract.map(item=>item.label),
  floating:['تماس','چت با دکتر قزلباش','مسیریابی'],
  floatingDock:'FIRST_PAINT_HIDDEN_AND_HERO_AWARE',
  backToTop:'HIDDEN_UNTIL_800PX_SCROLL',
  phoneAlignment:'SHARED_FLEX_RTL',
  directionsPlaceId:release.clinic.placeId,
  contactAuthority:'release+canonical-graph',
  validationSurface:'assembled-canonical-content',
  destinationsLocked:true
},null,2));
