import {readFile} from 'node:fs/promises';
import {assembleCanonicalContent} from './lib/assemble-content.mjs';
import {assembleCssSource,CSS_SPLIT_MARKER} from '../src/lib/css-source.mjs';
import {deriveCssDelivery} from '../src/lib/css-delivery.mjs';
import {HERO_SEARCH_PRESENTATION_CONTRACT} from '../src/lib/hero-search-presentation.mjs';

const fail=message=>{throw new Error(message)};
const assert=(condition,message)=>{if(!condition)fail(message)};
const count=(source,needle)=>String(source).split(needle).length-1;

const [authoredCss,calibrationRaw,authoredPage,invariants]=await Promise.all([
  readFile('src/styles/global.css','utf8'),
  readFile('src/data/render-calibration.json','utf8'),
  readFile('src/content-source/page.md','utf8'),
  readFile('src/data/release-invariants.json','utf8').then(JSON.parse),
]);
const {cssSource}=assembleCssSource(authoredCss,calibrationRaw);
const delivery=deriveCssDelivery(cssSource);
const {content}=await assembleCanonicalContent();
const authoredSplitEnd=authoredCss.indexOf(CSS_SPLIT_MARKER)+CSS_SPLIT_MARKER.length;
const authoredCritical=authoredCss.slice(0,authoredSplitEnd).replace(/\r?\n/g,'');

assert(HERO_SEARCH_PRESENTATION_CONTRACT.visibleLabel==='جست‌وجو','Hero search visible label contract drift');
assert(HERO_SEARCH_PRESENTATION_CONTRACT.premiumControl&&HERO_SEARCH_PRESENTATION_CONTRACT.desktopCompact&&HERO_SEARCH_PRESENTATION_CONTRACT.mobileCompact&&!HERO_SEARCH_PRESENTATION_CONTRACT.mobileFullWidth&&!HERO_SEARCH_PRESENTATION_CONTRACT.centeredDesktop&&HERO_SEARCH_PRESENTATION_CONTRACT.counterweighted,'Hero search responsive presentation contract drift');
assert(HERO_SEARCH_PRESENTATION_CONTRACT.shadow===false,'Hero search shadow must remain absent');
assert(HERO_SEARCH_PRESENTATION_CONTRACT.dialogBehaviorPreserved&&HERO_SEARCH_PRESENTATION_CONTRACT.keyboardHintDesktopOnly,'Hero search interaction contract drift');
assert(HERO_SEARCH_PRESENTATION_CONTRACT.heroOrderChanged===false&&HERO_SEARCH_PRESENTATION_CONTRACT.heroImageGeometryChanged===false,'Hero search presentation altered protected Hero structure/image geometry');

assert(count(authoredPage,'<span>جست‌وجو در راهنمای جامع</span>')===1,'Canonical authored Hero search label drift');
assert(count(content,'<span>جست‌وجو</span>')===1,'Assembled short Hero search label missing');
assert(!content.includes('<span>جست‌وجو در راهنمای جامع</span>'),'Long Hero search label leaked into assembled page');
assert(content.includes('aria-label="باز کردن جست‌وجوی راهنمای جامع"'),'Accessible Hero search name changed');
assert(content.includes('aria-keyshortcuts="/"')&&content.includes('aria-controls="guide-search"')&&content.includes('aria-haspopup="dialog"'),'Hero search dialog/keyboard semantics changed');
const subtitleAt=content.indexOf('class="hero-subtitle"'),searchAt=content.indexOf('class="hero-action hero-search-launch"'),leadAt=content.indexOf('class="hero-lead"');
assert(subtitleAt>=0&&searchAt>subtitleAt&&leadAt>searchAt,'Hero element order changed');

const premiumRule='.hero-search-launch{grid-area:search;display:inline-flex;gap:.45rem;align-items:center;justify-self:end;width:fit-content;min-height:2.75rem;margin:0 0 .35rem;padding:.42rem .6rem;border:1px solid #cbd8d3;border-radius:.18rem;background:transparent;color:var(--accent-strong);font:inherit;font-weight:740;line-height:1.35;cursor:pointer}';
const mobileRule='.entity-hero .hero-action.hero-search-launch{justify-self:end;width:fit-content;min-height:2.85rem;margin:0 0 .25rem;padding:.45rem .6rem;border:1px solid #cbd8d3;border-radius:.18rem;background:transparent}';
assert(delivery.criticalCss.includes(premiumRule),'Compact desktop Hero search control missing');
assert(delivery.criticalCss.includes(mobileRule),'Compact mobile Hero search control missing');
assert(!delivery.criticalCss.includes('grid-template-columns:1.15rem minmax(0,1fr);padding-inline:.75rem'),'Legacy narrow search geometry survived');
assert(!delivery.criticalCss.includes('box-shadow:0 7px 22px rgb(7 82 68/.055)')&&!delivery.criticalCss.includes('background:linear-gradient(135deg,#fff,#f6faf8)'),'Legacy Hero search chrome survived');
assert(!delivery.criticalCss.includes('.entity-hero .hero-action.hero-search-launch{width:100%'),'Full-width mobile Search presentation returned');
assert(delivery.criticalCss.includes('.hero-search-launch kbd{display:none}'),'Mobile keyboard hint suppression missing');
assert(Buffer.byteLength(delivery.criticalCss)<=invariants.maxCriticalCssBytes,'Hero search plus art-directed Hero exceeds critical CSS release budget');

console.log(JSON.stringify({stage:'HERO_SEARCH_PRESENTATION',visibleLabel:'جست‌وجو',desktop:'compact-counterweight',mobile:'compact-counterweight',fullWidthMobile:false,heroPresentation:'COORDINATED',heroOrder:'UNCHANGED',criticalBytes:Buffer.byteLength(delivery.criticalCss),authoredCriticalBytes:Buffer.byteLength(authoredCritical),criticalByteDelta:Buffer.byteLength(delivery.criticalCss)-Buffer.byteLength(authoredCritical),criticalBudget:invariants.maxCriticalCssBytes,status:'PASS'},null,2));
