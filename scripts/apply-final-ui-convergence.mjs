import { readFile, writeFile } from 'node:fs/promises';

const introPath='src/content-source/001-intro.html';
const tailPath='src/content-source/100-rc099.html';
const cssPath='src/styles/global.css';
const fail=m=>{throw new Error(m)};

let intro=await readFile(introPath,'utf8');
let tail=await readFile(tailPath,'utf8');
let css=await readFile(cssPath,'utf8');

const count=(text,re)=>[...text.matchAll(re)].length;
const one=(text,re,label)=>{
  const matches=[...text.matchAll(re)];
  if(matches.length!==1) fail(`${label}: expected exactly one match, found ${matches.length}`);
  return matches[0];
};

// Hard preconditions: operate only on the known pre-convergence source shape.
one(intro,/<p class="hero-subtitle">سفارش از منوی خدمات زیبایی ممنوع<\/p>/g,'hero subtitle');
one(intro,/<p class="hero-reputation" id="google-maps-clinic-reputation-current">[\s\S]*?<\/p>/g,'hero reputation');
one(intro,/<ul aria-label="اطلاعات اعتماد و دسترسی" class="hero-trust-list">[\s\S]*?<\/ul>/g,'hero trust list');
one(intro,/<aside aria-label="هویت تأییدشده پزشک" class="verified-identity-core" id="verified-physician-identity-core">[\s\S]*?<\/aside>/g,'verified identity core');
one(intro,/<aside aria-labelledby="quick-start-title" class="quick-start">[\s\S]*?<\/aside>/g,'quick start');
if(count(intro,/data-guide-search-open/g)<1) fail('guide-search trigger contract missing');
if(tail.includes('id="quick-start-title"')) fail('quick-start already present in final source chunk');

const subtitle='<p class="hero-subtitle">سفارش از منوی خدمات زیبایی ممنوع</p>';
const searchLaunch=`<button aria-controls="guide-search" aria-haspopup="dialog" aria-keyshortcuts="/" class="hero-search-launch" data-guide-search-open type="button"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4 4"></path></svg><span>جست‌وجو در راهنمای جامع</span><kbd aria-hidden="true">/</kbd></button>`;
intro=intro.replace(subtitle,`${subtitle}${searchLaunch}`);

// Remove the former oversized search CTA from the CTA group; GuideNavigator remains unchanged.
intro=intro.replace(/<button aria-controls="guide-search" aria-haspopup="dialog" aria-keyshortcuts="\/" class="hero-action hero-action--search" data-guide-search-open type="button">جست‌وجو در راهنمای جامع<\/button>/,'');

const reputation=one(intro,/<p class="hero-reputation" id="google-maps-clinic-reputation-current">[\s\S]*?<\/p>/g,'hero reputation')[0]
  .replace('<p class="hero-reputation" id="google-maps-clinic-reputation-current">','<span class="hero-caption-reputation" id="google-maps-clinic-reputation-current">')
  .replace('</p>','</span>');
const trust=one(intro,/<ul aria-label="اطلاعات اعتماد و دسترسی" class="hero-trust-list">[\s\S]*?<\/ul>/g,'hero trust list')[0];
const medical=one(trust,/<strong>کد نظام پزشکی<\/strong><span>([\s\S]*?)<\/span>/g,'medical code')[1];
const hours=one(trust,/<strong>ساعات مراجعه<\/strong><span>([\s\S]*?)<\/span>/g,'clinic hours')[1];
const review=one(trust,/<strong>آخرین بازبینی پزشکی<\/strong><span>([\s\S]*?)<\/span>/g,'medical review')[1];

intro=intro.replace(/<p class="hero-reputation" id="google-maps-clinic-reputation-current">[\s\S]*?<\/p>/,'');
intro=intro.replace(/<ul aria-label="اطلاعات اعتماد و دسترسی" class="hero-trust-list">[\s\S]*?<\/ul>/,'');

// Integrate all trust/reputation facts into the first hero image caption as visible crawlable HTML.
const oldHeroCaption='<figcaption>دکتر سعید قزلباش، پزشک زیبایی</figcaption>';
if(!intro.includes(oldHeroCaption)) fail('hero figcaption shape drift');
const heroCaption=`<figcaption class="hero-figure-caption"><span class="hero-caption-title">دکتر سعید قزلباش، پزشک زیبایی</span><span aria-label="اطلاعات اعتماد و دسترسی" class="hero-caption-facts"><span><strong>نظام پزشکی:</strong> ${medical}</span><span><strong>مراجعه:</strong> ${hours}</span><span><strong>بازبینی پزشکی:</strong> ${review}</span></span>${reputation}</figcaption>`;
intro=intro.replace(oldHeroCaption,heroCaption);

// Move the exact verified identity core into the second clinical image caption; keep its canonical id and links.
const identity=one(intro,/<aside aria-label="هویت تأییدشده پزشک" class="verified-identity-core" id="verified-physician-identity-core">[\s\S]*?<\/aside>/g,'verified identity core')[0]
  .replace('<aside aria-label="هویت تأییدشده پزشک" class="verified-identity-core" id="verified-physician-identity-core">','<span aria-label="هویت تأییدشده پزشک" class="verified-identity-core figure-identity-core" id="verified-physician-identity-core">')
  .replace('</aside>','</span>');
intro=intro.replace(/<aside aria-label="هویت تأییدشده پزشک" class="verified-identity-core" id="verified-physician-identity-core">[\s\S]*?<\/aside>/,'');
const clinicalCaption='<figcaption>دکتر سعید قزلباش در محیط بالینی</figcaption>';
if(!intro.includes(clinicalCaption)) fail('second clinical figcaption shape drift');
intro=intro.replace(clinicalCaption,`<figcaption class="clinical-figure-caption"><span class="figure-caption-title">دکتر سعید قزلباش در محیط بالینی</span>${identity}</figcaption>`);

// Physically move, rather than delete, the quick-start navigation to the end of the existing final source module.
let quick=one(intro,/<aside aria-labelledby="quick-start-title" class="quick-start">[\s\S]*?<\/aside>/g,'quick start')[0];
intro=intro.replace(/<aside aria-labelledby="quick-start-title" class="quick-start">[\s\S]*?<\/aside>/,'');
quick=quick.replace('class="quick-start"','class="quick-start quick-start--end"');
tail=`${tail}${quick}`;

// Postconditions: preserve authority and functional search signals exactly once.
for(const [label,re] of [
  ['verified identity id',/id="verified-physician-identity-core"/g],
  ['reputation id',/id="google-maps-clinic-reputation-current"/g],
  ['hero search launcher',/class="hero-search-launch"/g],
]) if(count(intro,re)!==1) fail(`${label} multiplicity drift`);
if(count(intro,/class="hero-trust-list"/g)!==0) fail('old hero trust cards remain');
if(count(intro,/class="hero-reputation"/g)!==0) fail('old standalone hero reputation remains');
if(count(intro,/class="hero-action hero-action--search"/g)!==0) fail('old oversized hero search CTA remains');
if(count(intro,/id="quick-start-title"/g)!==0||count(tail,/id="quick-start-title"/g)!==1) fail('quick-start physical move failed');
if(!intro.includes('جمعه تعطیل')||!intro.includes('Q140287622')||!intro.includes('0009-0001-9346-8475')||!intro.includes('/g/11nqdfk76c')) fail('identity/trust signal loss detected');

const uiCss=`/* FINAL_2026_UI_CONVERGENCE_START */
.entity-hero{grid-template-areas:"title portrait" "subtitle portrait" "search portrait" "lead portrait" "identity portrait" "actions portrait"}.entity-hero .hero-search-launch{grid-area:search}.hero-search-launch{display:grid;grid-template-columns:1.2rem minmax(0,1fr) auto;gap:.65rem;align-items:center;width:100%;min-height:3rem;margin:.15rem 0 .55rem;padding:.68rem .85rem;border:1px solid #bdd9cf;border-radius:.78rem;background:linear-gradient(135deg,#fff,#f6faf8);color:var(--accent-strong);font:inherit;font-weight:780;line-height:1.35;text-align:start;box-shadow:0 7px 22px rgb(7 82 68/.055);cursor:pointer;-webkit-tap-highlight-color:transparent}.hero-search-launch:hover{border-color:#91beb0;background:var(--accent-soft);color:var(--accent-strong)}.hero-search-launch:active{transform:translateY(1px)}.hero-search-launch svg{width:1.15rem;height:1.15rem;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.hero-search-launch kbd{min-width:1.7rem;padding:.12rem .38rem;border:1px solid #d6e3de;border-bottom-width:2px;border-radius:.4rem;background:#fff;color:var(--muted);font:600 .72rem/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;text-align:center}.hero-figure-caption{display:grid;gap:.42rem}.hero-caption-title,.figure-caption-title{display:block;color:#52665f;font-weight:650}.hero-caption-facts{display:flex;flex-wrap:wrap;gap:.25rem .7rem;color:var(--muted);font-size:.82rem;line-height:1.65}.hero-caption-facts>span{display:inline}.hero-caption-facts>span:not(:last-child)::after{content:" · ";color:#93a19c}.hero-caption-facts strong{color:#36584e;font-weight:760}.hero-caption-reputation{display:block;padding-top:.35rem;border-top:1px solid rgb(10 107 88/.11);color:#315b50;font-size:.82rem;line-height:1.65}.hero-caption-reputation strong{color:#1f5145}.clinical-figure-caption{display:grid;gap:.35rem}.figure-identity-core{display:block;margin:.45rem 0 0;padding:.5rem 0 0;border:0;border-top:1px solid color-mix(in srgb,currentColor 13%,transparent);border-radius:0;background:transparent;color:#4c625b;font-size:.84rem;line-height:1.75}.figure-identity-core code{font-size:.9em}.quick-start--end{margin-block:4.5rem 0;background:linear-gradient(135deg,#f7fbf9,#eef7f3)}@media(max-width:720px){.entity-hero{grid-template-areas:"title" "subtitle" "search" "portrait" "actions" "lead" "identity"}.hero-search-launch{min-height:3.15rem;margin:.05rem 0 .2rem}.hero-search-launch kbd{display:none}.hero-caption-facts{display:grid;gap:.12rem;font-size:.8rem}.hero-caption-facts>span:not(:last-child)::after{content:""}.hero-caption-reputation{font-size:.8rem}.figure-identity-core{font-size:.82rem;line-height:1.7}.hero-actions{grid-template-columns:1fr 1fr}.quick-start--end{margin-block-start:3.5rem}}@media(max-width:430px){.hero-search-launch{grid-template-columns:1.15rem minmax(0,1fr);padding-inline:.75rem}.hero-caption-facts,.hero-caption-reputation{font-size:.78rem}}@media print{.hero-search-launch{display:none!important}}
/* FINAL_2026_UI_CONVERGENCE_END */`;

if(css.includes('FINAL_2026_UI_CONVERGENCE_START')) fail('UI convergence CSS already applied');
const marker='/*DIST_CRITICAL_CSS_END*/';
if(!css.includes(marker)) fail('critical CSS boundary missing');
// Above-fold layout rules must exist in the inline critical path to avoid first-paint CLS.
css=css.replace(marker,`${uiCss}${marker}`);
// The external stylesheet has legacy hero rules later; repeat the small deterministic override at the very end so final cascade is identical.
css=`${css}\n${uiCss}\n`;

await Promise.all([
  writeFile(introPath,intro),
  writeFile(tailPath,tail),
  writeFile(cssPath,css),
]);

console.log(JSON.stringify({
  applied:true,
  branchIntent:'final-ui-convergence',
  preserved:{verifiedIdentity:true,reputation:true,medicalCode:true,hours:true,medicalReview:true,guideSearch:true,quickStart:true},
  moved:{trustToHeroCaption:true,identityToSecondFigureCaption:true,searchUnderHeroSubtitle:true,quickStartToDocumentEnd:true},
  criticalCss:true,
  integrity:'SOURCE_TRANSFORM_PASS'
},null,2));
