import {readFile} from 'node:fs/promises';
import {assembleCanonicalContent} from './lib/assemble-content.mjs';
import {assembleCssSource,CSS_SPLIT_MARKER} from '../src/lib/css-source.mjs';
import {deriveCssDelivery} from '../src/lib/css-delivery.mjs';
import {HERO_SEARCH_PRESENTATION_CONTRACT} from '../src/lib/hero-search-presentation.mjs';

const fail=message=>{throw new Error(message)};
const assert=(condition,message)=>{if(!condition)fail(message)};
const count=(source,needle)=>String(source).split(needle).length-1;

const [authoredCss,calibrationRaw,authoredPage]=await Promise.all([
  readFile('src/styles/global.css','utf8'),
  readFile('src/data/render-calibration.json','utf8'),
  readFile('src/content-source/page.md','utf8'),
]);
const {cssSource}=assembleCssSource(authoredCss,calibrationRaw);
const delivery=deriveCssDelivery(cssSource);
const {content}=await assembleCanonicalContent();
const authoredSplitEnd=authoredCss.indexOf(CSS_SPLIT_MARKER)+CSS_SPLIT_MARKER.length;
const authoredCritical=authoredCss.slice(0,authoredSplitEnd).replace(/\r?\n/g,'');

assert(HERO_SEARCH_PRESENTATION_CONTRACT.visibleLabel==='جست‌وجو','Hero search visible label contract drift');
assert(HERO_SEARCH_PRESENTATION_CONTRACT.desktopCompact&&HERO_SEARCH_PRESENTATION_CONTRACT.mobileFullWidth,'Hero search responsive presentation contract drift');
assert(HERO_SEARCH_PRESENTATION_CONTRACT.desktopShadow===false,'Hero search desktop shadow must remain absent');
assert(HERO_SEARCH_PRESENTATION_CONTRACT.dialogBehaviorPreserved&&HERO_SEARCH_PRESENTATION_CONTRACT.keyboardHintDesktopOnly,'Hero search interaction contract drift');
assert(HERO_SEARCH_PRESENTATION_CONTRACT.heroOrderChanged===false&&HERO_SEARCH_PRESENTATION_CONTRACT.heroImageGeometryChanged===false,'Hero search presentation must not alter Hero ordering/image geometry');

assert(count(authoredPage,'<span>جست‌وجو در راهنمای جامع</span>')===1,'Canonical authored Hero search label drift');
assert(count(content,'<span>جست‌وجو</span>')===1,'Assembled compact Hero search label missing');
assert(!content.includes('<span>جست‌وجو در راهنمای جامع</span>'),'Long Hero search label leaked into assembled page');
assert(content.includes('aria-label="باز کردن جست‌وجوی راهنمای جامع"'),'Accessible Hero search name changed');
assert(content.includes('aria-keyshortcuts="/"')&&content.includes('aria-controls="guide-search"')&&content.includes('aria-haspopup="dialog"'),'Hero search dialog/keyboard semantics changed');
assert(content.includes('<p class="hero-subtitle">سفارش از منوی خدمات زیبایی ممنوع</p>'),'Subtitle changed while only B was approved');
const subtitleAt=content.indexOf('class="hero-subtitle"'),searchAt=content.indexOf('class="hero-action hero-search-launch"'),leadAt=content.indexOf('class="hero-lead"');
assert(subtitleAt>=0&&searchAt>subtitleAt&&leadAt>searchAt,'Hero element order changed');

const compactRule='.hero-search-launch{grid-area:search;display:grid;grid-template-columns:1.1rem auto auto;gap:.58rem;align-items:center;justify-self:start;width:fit-content;min-height:2.85rem;margin:.15rem 0 .55rem;padding:.6rem .72rem;border:1px solid #cadfd7;border-radius:.72rem;background:#fff;color:var(--accent-strong);font:inherit;font-weight:760;line-height:1.35;text-align:start;cursor:pointer;-webkit-tap-highlight-color:transparent}';
assert(delivery.criticalCss.includes(compactRule),'Compact desktop Hero search rule missing');
assert(!delivery.criticalCss.includes('box-shadow:0 7px 22px rgb(7 82 68/.055)'),'Legacy Hero search shadow survived');
assert(!delivery.criticalCss.includes('background:linear-gradient(135deg,#fff,#f6faf8)'),'Legacy Hero search gradient survived');
assert(delivery.criticalCss.includes('.hero-search-launch{width:100%;min-height:3.1rem;margin:.05rem 0 .2rem}'),'Mobile full-width Hero search restoration missing');
assert(delivery.criticalCss.includes('.hero-search-launch kbd{display:none}'),'Mobile keyboard hint suppression missing');
assert(Buffer.byteLength(delivery.criticalCss)<=Buffer.byteLength(authoredCritical),'Compact Hero search increased critical CSS bytes');

console.log(JSON.stringify({stage:'HERO_SEARCH_PRESENTATION',visibleLabel:'جست‌وجو',desktop:'compact-flat',mobile:'full-width',subtitle:'UNCHANGED',heroOrder:'UNCHANGED',criticalByteDelta:Buffer.byteLength(delivery.criticalCss)-Buffer.byteLength(authoredCritical),status:'PASS'},null,2));
