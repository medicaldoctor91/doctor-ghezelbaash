import {readFile} from 'node:fs/promises';
import {deriveSiteData} from '../src/lib/site-data.mjs';

const source=await readFile('src/content-source/page.md','utf8');
const quick=await readFile('src/components/FloatingActionDock.astro','utf8');
const release=JSON.parse(await readFile('src/data/release.json','utf8'));
const graph=JSON.parse(await readFile('src/data/semantic/knowledge-graph.jsonld','utf8'));
const redirectsRaw=await readFile('src/data/subdomain-redirects.json','utf8');
const site=deriveSiteData(release,graph);

const fail=message=>{throw new Error(message)};
const hero=[...source.matchAll(/<a\b[^>]*class=["'][^"']*\bhero-action\b[^"']*["'][^>]*>[\s\S]*?<\/a>/gi)].map(m=>m[0]);
if(hero.length!==3)fail(`Critical hero CTA count drift: ${hero.length} != 3`);

const heroContract=[
  {label:'رزرو وقت مشاوره رایگان',href:site.telHref,primary:true},
  {label:'مشاهده نمونه‌کارهای دکتر قزلباش',href:site.instagramUrl},
  {label:'آدرس دقیق کلینیک',href:'https://doctor.ghezelbaash.ir/'}
];
for(const contract of heroContract){
  const hits=hero.filter(anchor=>anchor.includes(`>${contract.label}</a>`)&&anchor.includes(`href="${contract.href}"`));
  if(hits.length!==1)fail(`Hero CTA contract drift: ${contract.label} (${hits.length})`);
  if(contract.primary&&!hits[0].includes('hero-action--primary'))fail('Reservation CTA lost primary hierarchy');
  const visibleText=hits[0].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  if(visibleText!==contract.label)fail(`Hero CTA accessible text drift: ${contract.label} -> ${visibleText}`);
}

if(!redirectsRaw.includes('doctor.ghezelbaash.ir')||!/(google\.com\/maps|maps\.google)/i.test(redirectsRaw))fail('doctor subdomain no longer maps to the clinic map redirect contract');
if(!quick.includes('class="quick-actions__top"')||!quick.includes('href="#main-content"'))fail('Back-to-top control drift');
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
  backToTop:'PRESERVED',
  directionsPlaceId:release.clinic.placeId,
  contactAuthority:'release+canonical-graph',
  destinationsLocked:true
},null,2));
