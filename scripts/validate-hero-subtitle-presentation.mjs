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
assert(HERO_SUBTITLE_PRESENTATION_CONTRACT.contextLabel==='پزشک زیبایی در کرمانشاه'&&HERO_SUBTITLE_PRESENTATION_CONTRACT.contextLabelTemplateTreatment,'Hero context-label contract drift');
assert(HERO_SUBTITLE_PRESENTATION_CONTRACT.visualSemanticSeparator===false&&HERO_SUBTITLE_PRESENTATION_CONTRACT.visualNameSuffix===':'&&HERO_SUBTITLE_PRESENTATION_CONTRACT.identityIndependent,'Hero identity presentation contract drift');
assert(HERO_SUBTITLE_PRESENTATION_CONTRACT.manifestoCentered&&HERO_SUBTITLE_PRESENTATION_CONTRACT.manifestoStop==='ممنوع!'&&HERO_SUBTITLE_PRESENTATION_CONTRACT.manifestoStopBlock&&HERO_SUBTITLE_PRESENTATION_CONTRACT.manifestoStopColor==='#982f2b','Hero manifesto contract drift');
assert(HERO_SUBTITLE_PRESENTATION_CONTRACT.portraitFooter==='white-editorial'&&HERO_SUBTITLE_PRESENTATION_CONTRACT.searchPresentationCoordinated,'Hero composition contract drift');
assert(HERO_SUBTITLE_PRESENTATION_CONTRACT.heroOrderChanged===false&&HERO_SUBTITLE_PRESENTATION_CONTRACT.heroImageGeometryChanged===false,'Hero art direction altered protected structure/image geometry');

assert(authoredPage.includes('<span id="saeed-ghezelbash-aesthetic-medicine">دکتر سعید قزلباش؛ پزشک زیبایی در کرمانشاه</span>'),'Canonical authored H1 changed');
assert(authoredPage.includes('<p class="hero-subtitle">سفارش از منوی خدمات زیبایی ممنوع</p>'),'Canonical authored manifesto source changed');
const h1=content.match(/<h1\b[^>]*id="saeed-ghezelbash"[^>]*>[\s\S]*?<\/h1>/i)?.[0]||'';
const h1Text=h1.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
assert(h1Text==='دکتر سعید قزلباش؛ پزشک زیبایی در کرمانشاه','Assembled semantic H1 text/order changed');
assert(h1.includes('class="hero-title__name"')&&h1.includes('class="hero-title__semantic-separator"')&&h1.includes('class="hero-title__descriptor"'),'Hero visual title spans missing');
assert(h1.indexOf('hero-title__name')<h1.indexOf('hero-title__semantic-separator')&&h1.indexOf('hero-title__semantic-separator')<h1.indexOf('hero-title__descriptor'),'DOM H1 order no longer entity-first');
assert(content.includes('<p class="hero-subtitle">سفارش از منوی خدمات زیبایی <strong class="hero-subtitle__stop">ممنوع!</strong></p>'),'Hero manifesto markup missing');

assert(delivery.criticalCss.includes('.hero-title__descriptor{order:-1;border-inline-start:2px solid #8fbfb1;padding-inline-start:.5rem;opacity:.68;font-size:.8rem;font-weight:700}'),'Template-like Hero context label missing');
assert(delivery.criticalCss.includes('.hero-title__semantic-separator{display:none}'),'Semantic semicolon remains visually exposed');
assert(delivery.criticalCss.includes('.hero-title__name::after{content:":"}'),'Visual physician-name colon missing');
assert(!delivery.criticalCss.includes('flex-basis:100%'),'Hero identity must not force a legacy line break');
assert(delivery.criticalCss.includes('justify-self:center;max-width:25ch')&&delivery.criticalCss.includes('line-height:1.65;text-align:center;text-wrap:balance'),'Independent centered manifesto typography missing');
assert(delivery.criticalCss.includes('.hero-subtitle__stop{display:block;color:#982f2b;font-weight:880;white-space:nowrap}'),'Manifesto stop is not a dedicated deep-red signature line');
assert(delivery.criticalCss.includes('.entity-hero .hero-figure figcaption{margin:0;padding:.65rem .85rem .75rem;background:#fff;box-shadow:0 1px #e3ece8 inset}'),'Portrait editorial footer surface missing');
assert(delivery.criticalCss.includes('.hero-caption-title,.figure-caption-title{color:#263b35;font-weight:780}'),'Portrait footer identity hierarchy missing');
assert(delivery.criticalCss.includes('.entity-hero .hero-title{gap:.42rem;margin-block-end:.25rem}')&&delivery.criticalCss.includes('.entity-hero .hero-subtitle{margin-block:.1rem .55rem}'),'Mobile identity/manifesto rhythm missing');
assert(content.includes('<span>جست‌وجو</span>'),'Hero search label changed unexpectedly');
const titleAt=content.indexOf('class="hero-title"'),subtitleAt=content.indexOf('class="hero-subtitle"'),searchAt=content.indexOf('class="hero-action hero-search-launch"');
assert(titleAt>=0&&subtitleAt>titleAt&&searchAt>subtitleAt,'Hero title/manifesto/search structural order changed');
assert(Buffer.byteLength(delivery.criticalCss)<=invariants.maxCriticalCssBytes,'Hero art direction exceeds critical CSS release budget');

console.log(JSON.stringify({stage:'HERO_ART_DIRECTION_2026',semanticH1:'UNCHANGED',contextLabel:'template-overline',visualSemicolon:'HIDDEN',identity:'INDEPENDENT',manifesto:'سفارش از منوی خدمات زیبایی ممنوع!',manifestoStop:'BLOCK_DEEP_RED',portraitFooter:'WHITE_EDITORIAL',search:'COORDINATED',heroOrder:'UNCHANGED',criticalBytes:Buffer.byteLength(delivery.criticalCss),criticalBudget:invariants.maxCriticalCssBytes,status:'PASS'},null,2));
