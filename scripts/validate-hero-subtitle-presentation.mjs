import {readFile} from 'node:fs/promises';
import {assembleCanonicalContent} from './lib/assemble-content.mjs';
import {assembleCssSource} from '../src/lib/css-source.mjs';
import {deriveCssDelivery} from '../src/lib/css-delivery.mjs';
import {HERO_SUBTITLE_PRESENTATION_CONTRACT} from '../src/lib/hero-subtitle-presentation.mjs';

const fail=message=>{throw new Error(message)};
const assert=(condition,message)=>{if(!condition)fail(message)};

const [authoredCss,calibrationRaw,invariants]=await Promise.all([
  readFile('src/styles/global.css','utf8'),
  readFile('src/data/render-calibration.json','utf8'),
  readFile('src/data/release-invariants.json','utf8').then(JSON.parse),
]);
const {cssSource}=assembleCssSource(authoredCss,calibrationRaw);
const delivery=deriveCssDelivery(cssSource);
const {content}=await assembleCanonicalContent();

assert(HERO_SUBTITLE_PRESENTATION_CONTRACT.textChanged===false,'Hero subtitle text must remain unchanged');
assert(HERO_SUBTITLE_PRESENTATION_CONTRACT.decorativeChrome===false,'Hero subtitle must remain typography-only');
assert(HERO_SUBTITLE_PRESENTATION_CONTRACT.maxWidth==='36ch'&&HERO_SUBTITLE_PRESENTATION_CONTRACT.fontWeight===650&&HERO_SUBTITLE_PRESENTATION_CONTRACT.textWrap==='balance','Hero subtitle editorial typography contract drift');
assert(HERO_SUBTITLE_PRESENTATION_CONTRACT.heroOrderChanged===false&&HERO_SUBTITLE_PRESENTATION_CONTRACT.searchPresentationChanged===false&&HERO_SUBTITLE_PRESENTATION_CONTRACT.heroImageGeometryChanged===false,'Hero subtitle presentation leaked into unrelated Hero contracts');

const titleRule='.entity-hero .hero-title{grid-area:title;margin-block-end:.55rem}';
const subtitleRule='.entity-hero .hero-subtitle{grid-area:subtitle;max-width:36ch;margin:0 0 .9rem;color:#40564f;font-size:clamp(1.02rem,.98rem + .2vw,1.14rem);font-weight:650;line-height:1.55;text-wrap:balance}';
assert(delivery.criticalCss.includes(titleRule),'Editorial Hero title grouping rule missing');
assert(delivery.criticalCss.includes(subtitleRule),'Editorial Hero subtitle typography rule missing');
assert(!/\.entity-hero \.hero-subtitle\{[^}]*\b(?:background|border|box-shadow):/.test(delivery.criticalCss),'Decorative chrome entered Hero subtitle presentation');
assert(delivery.criticalCss.includes('@media(max-width:720px)')&&delivery.criticalCss.includes('.entity-hero .hero-title{margin-block-end:.15rem}')&&delivery.criticalCss.includes('.entity-hero .hero-subtitle{margin-block:0 .25rem}'),'Existing mobile Hero spacing overrides changed');
assert(content.includes('<p class="hero-subtitle">سفارش از منوی خدمات زیبایی ممنوع</p>'),'Hero subtitle copy changed');
assert(content.includes('<span>جست‌وجو</span>'),'Approved compact Hero search presentation changed');
const titleAt=content.indexOf('class="hero-title"'),subtitleAt=content.indexOf('class="hero-subtitle"'),searchAt=content.indexOf('class="hero-action hero-search-launch"');
assert(titleAt>=0&&subtitleAt>titleAt&&searchAt>subtitleAt,'Hero title/subtitle/search order changed');
assert(Buffer.byteLength(delivery.criticalCss)<=invariants.maxCriticalCssBytes,'Hero subtitle presentation exceeds critical CSS release budget');

console.log(JSON.stringify({stage:'HERO_SUBTITLE_PRESENTATION',mode:'EDITORIAL_TYPOGRAPHY',copy:'UNCHANGED',decorativeChrome:false,maxWidth:'36ch',fontWeight:650,textWrap:'balance',mobileSpacing:'PRESERVED',search:'PRESERVED',heroOrder:'UNCHANGED',criticalBytes:Buffer.byteLength(delivery.criticalCss),criticalBudget:invariants.maxCriticalCssBytes,status:'PASS'},null,2));
