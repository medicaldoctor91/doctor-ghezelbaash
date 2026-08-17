import {readFile} from 'node:fs/promises';

const source=await readFile('src/content-source/page.md','utf8');
const quick=await readFile('src/data/templates/quick-actions.html','utf8');
const release=JSON.parse(await readFile('src/data/release.json','utf8'));
const redirectsRaw=await readFile('src/data/subdomain-redirects.json','utf8');

const fail=message=>{throw new Error(message)};
const hero=[...source.matchAll(/<a\b[^>]*class=["'][^"']*\bhero-action\b[^"']*["'][^>]*>[\s\S]*?<\/a>/gi)].map(m=>m[0]);
if(hero.length!==3) fail(`Critical hero CTA count drift: ${hero.length} != 3`);

const heroContract=[
  {label:'رزرو وقت مشاوره رایگان',href:'tel:+989308209494',primary:true},
  {label:'مشاهده نمونه‌کارهای دکتر قزلباش',href:'https://www.instagram.com/doctor.ghezelbaash/'},
  {label:'آدرس دقیق کلینیک',href:'https://doctor.ghezelbaash.ir/'}
];
for(const c of heroContract){
  const hits=hero.filter(a=>a.includes(`>${c.label}</a>`)&&a.includes(`href="${c.href}"`));
  if(hits.length!==1) fail(`Hero CTA contract drift: ${c.label} (${hits.length})`);
  if(c.primary&&!hits[0].includes('hero-action--primary')) fail('Reservation CTA lost primary hierarchy');
  // The visible descriptive link text is itself the accessible name. Do not require
  // a redundant aria-label that would override that text for assistive technology.
  const visibleText=hits[0].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  if(visibleText!==c.label) fail(`Hero CTA accessible text drift: ${c.label} -> ${visibleText}`);
}

if(!redirectsRaw.includes('doctor.ghezelbaash.ir')||!/(google\.com\/maps|maps\.google)/i.test(redirectsRaw)) fail('doctor.ghezelbaash.ir no longer maps to the clinic map redirect contract');

if(!quick.includes('class="quick-actions__top"')||!quick.includes('href="#main-content"')) fail('Back-to-top control drift');
const floating=[...quick.matchAll(/<a\b[^>]*class=["'][^"']*\bquick-actions__item\b[^"']*["'][^>]*>[\s\S]*?<\/a>/gi)].map(m=>m[0]);
if(floating.length!==3) fail(`Floating CTA count drift: ${floating.length} != 3`);

const byNeedle=(needle,label)=>{
  const hits=floating.filter(a=>a.includes(needle));
  if(hits.length!==1) fail(`Floating CTA destination drift: ${label} (${hits.length})`);
  return hits[0];
};
const phone=byNeedle('href="tel:+989308209494"','تماس');
if(!phone.includes('<span>تماس</span>')) fail('Floating phone copy drift');
const chat=byNeedle('href="https://ig.me/m/doctor.ghezelbaash"','چت با دکتر قزلباش');
if(!chat.includes('<strong>چت با دکتر قزلباش</strong>')) fail('Floating direct-chat copy drift');
const maps=byNeedle('https://www.google.com/maps/dir/?api=1','مسیریابی');
if(!maps.includes('<span>مسیریابی</span>')) fail('Floating directions copy drift');
if(!maps.includes(`destination_place_id=${release.clinic.placeId}`)) fail('Floating directions Place ID drift');
for(const [label,a] of [['تماس',phone],['چت با دکتر قزلباش',chat],['مسیریابی',maps]]) if(!/aria-label=["'][^"']+["']/i.test(a)) fail(`Floating CTA aria-label missing: ${label}`);

console.log(JSON.stringify({
  criticalCtas:'PASS',
  hero:heroContract.map(x=>x.label),
  floating:['تماس','چت با دکتر قزلباش','مسیریابی'],
  backToTop:'PRESERVED',
  directionsPlaceId:release.clinic.placeId,
  destinationsLocked:true
},null,2));
