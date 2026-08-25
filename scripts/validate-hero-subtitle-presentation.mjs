import {readFile} from 'node:fs/promises';
import {assembleCanonicalContent} from './lib/assemble-content.mjs';
import {assembleCssSource} from '../src/lib/css-source.mjs';
import {deriveCssDelivery} from '../src/lib/css-delivery.mjs';
import {HERO_SUBTITLE_PRESENTATION_CONTRACT} from '../src/lib/hero-subtitle-presentation.mjs';

const fail=message=>{throw new Error(message)};
const assert=(condition,message)=>{if(!condition)fail(message)};

const [authoredCss,calibrationRaw,invariants,authoredPage]=await Promise.all([
  readFile('src/styles/global.css','utf8'),
  readFile('src/data/render-calibration.json','utf8'),
  readFile('src/data/release-invariants.json','utf8').then(JSON.parse),
  readFile('src/content-source/page.md','utf8'),
]);
const {cssSource}=assembleCssSource(authoredCss,calibrationRaw);
const delivery=deriveCssDelivery(cssSource);
const {content}=await assembleCanonicalContent();

assert(HERO_SUBTITLE_PRESENTATION_CONTRACT.semanticH1TextChanged===false,'Semantic H1 text must remain unchanged');
assert(HERO_SUBTITLE_PRESENTATION_CONTRACT.contextLabel==='پزشک زیبایی در کرمانشاه'&&HERO_SUBTITLE_PRESENTATION_CONTRACT.contextTreatment==='horizontal-hairline','Hero context rail contract drift');
assert(HERO_SUBTITLE_PRESENTATION_CONTRACT.visualSemanticSeparator===false&&HERO_SUBTITLE_PRESENTATION_CONTRACT.visualNameSuffix===':'&&HERO_SUBTITLE_PRESENTATION_CONTRACT.identityCentered,'Hero identity presentation contract drift');
assert(HERO_SUBTITLE_PRESENTATION_CONTRACT.manifestoCentered&&HERO_SUBTITLE_PRESENTATION_CONTRACT.manifestoStop==='ممنوع!'&&!HERO_SUBTITLE_PRESENTATION_CONTRACT.manifestoStopBlock&&HERO_SUBTITLE_PRESENTATION_CONTRACT.manifestoStopColor==='#8f3934','Hero manifesto contract drift');
assert(HERO_SUBTITLE_PRESENTATION_CONTRACT.mobileRhythm==='compact'&&HERO_SUBTITLE_PRESENTATION_CONTRACT.portraitFooter==='white-editorial'&&HERO_SUBTITLE_PRESENTATION_CONTRACT.searchPresentationCoordinated,'Hero composition contract drift');
assert(HERO_SUBTITLE_PRESENTATION_CONTRACT.heroOrderChanged===false&&HERO_SUBTITLE_PRESENTATION_CONTRACT.heroImageGeometryChanged===false,'Hero art direction altered protected structure/image geometry');

assert(authoredPage.includes('<span itemprop="name">دکتر سعید قزلباش</span><span>؛ </span><span id="saeed-ghezelbash-aesthetic-medicine"><span itemprop="jobTitle">پزشک زیبایی</span> در کرمانشاه</span>'),'Canonical authored H1 semantic identity changed');
assert(authoredPage.includes('<p class="hero-subtitle">سفارش از منوی خدمات زیبایی ممنوع</p>'),'Canonical authored manifesto source changed');
const h1=content.match(/<h1\b[^>]*id="saeed-ghezelbash"[^>]*>[\s\S]*?<\/h1>/i)?.[0]||'';
const h1Text=h1.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
assert(h1Text==='دکتر سعید قزلباش؛ پزشک زیبایی در کرمانشاه','Assembled semantic H1 text/order changed');
assert(h1.includes('class="hero-title__name"')&&h1.includes('class="hero-title__semantic-separator"')&&h1.includes('class="hero-title__descriptor"'),'Hero visual title spans missing');
assert(h1.includes('class="hero-title__name" itemprop="name"')&&h1.includes('<span itemprop="jobTitle">پزشک زیبایی</span>'),'Visible Person name/jobTitle Microdata missing');
assert(h1.indexOf('hero-title__name')<h1.indexOf('hero-title__semantic-separator')&&h1.indexOf('hero-title__semantic-separator')<h1.indexOf('hero-title__descriptor'),'DOM H1 order no longer entity-first');
assert(content.includes('<p class="hero-subtitle">سفارش از منوی خدمات زیبایی <strong class="hero-subtitle__stop">ممنوع!</strong></p>'),'Hero manifesto markup missing');

assert(delivery.criticalCss.includes('.hero-title__descriptor{order:-1;padding-block-end:.28rem;border-block-end:1px solid var(--line);color:var(--muted);font-size:clamp(.82rem,.42em,1rem);font-weight:650}'),'Horizontal context hairline missing');
assert(delivery.criticalCss.includes('.hero-title__semantic-separator{display:none}'),'Semantic semicolon remains visually exposed');
assert(delivery.criticalCss.includes('.hero-title__name{font-size:clamp(2.05rem,1.05em,3rem);font-weight:820;line-height:1.14}')&&delivery.criticalCss.includes('.hero-title__name::after{content:":"}'),'Centered physician identity hierarchy missing');
assert(delivery.criticalCss.includes('justify-self:center;max-width:30ch')&&delivery.criticalCss.includes('line-height:1.55;text-align:center;text-wrap:balance'),'Integrated manifesto typography missing');
assert(delivery.criticalCss.includes('.hero-subtitle__stop{color:#8f3934;font-weight:820;white-space:nowrap}')&&!delivery.criticalCss.includes('.hero-subtitle__stop{display:block'),'Manifesto stop must remain inline and restrained');
assert(delivery.criticalCss.includes('grid-template-areas:"title" "subtitle" "search" "portrait" "actions" "lead" "identity";gap:.5rem;margin-block-end:2.2rem'),'Compact mobile Hero rhythm missing');
assert(delivery.criticalCss.includes('.entity-hero .hero-title{gap:.32rem;margin-block-end:0}')&&delivery.criticalCss.includes('.entity-hero .hero-subtitle{margin-block:0 .2rem}'),'Mobile identity/manifesto spacing missing');
assert(delivery.criticalCss.includes('.entity-hero .hero-figure figcaption{margin:0;padding:.65rem .85rem .75rem;background:#fff;box-shadow:0 1px #e3ece8 inset}'),'Portrait editorial footer surface missing');
assert(content.includes('<span>جست‌وجو</span>'),'Hero search label changed unexpectedly');
const titleAt=content.indexOf('class="hero-title"'),subtitleAt=content.indexOf('class="hero-subtitle"'),searchAt=content.indexOf('class="hero-action hero-search-launch"');
assert(titleAt>=0&&subtitleAt>titleAt&&searchAt>subtitleAt,'Hero title/manifesto/search structural order changed');
assert(Buffer.byteLength(delivery.criticalCss)<=invariants.maxCriticalCssBytes,'Hero art direction exceeds critical CSS release budget');

console.log(JSON.stringify({stage:'HERO_ART_DIRECTION_2026',semanticH1:'UNCHANGED',contextLabel:'HORIZONTAL_HAIRLINE',visualSemicolon:'HIDDEN',identity:'CENTERED',manifesto:'INTEGRATED_INLINE_STOP',portraitFooter:'WHITE_EDITORIAL',mobileRhythm:'COMPACT',search:'COORDINATED',heroOrder:'UNCHANGED',criticalBytes:Buffer.byteLength(delivery.criticalCss),criticalBudget:invariants.maxCriticalCssBytes,status:'PASS'},null,2));
