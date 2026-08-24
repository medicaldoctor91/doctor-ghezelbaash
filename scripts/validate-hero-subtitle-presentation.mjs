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
assert(HERO_SUBTITLE_PRESENTATION_CONTRACT.visualH1Order==='profession-location-first-inline'&&HERO_SUBTITLE_PRESENTATION_CONTRACT.visualNameSuffix===':'&&HERO_SUBTITLE_PRESENTATION_CONTRACT.forcedTitleLineBreak===false,'Hero visual identity order contract drift');
assert(HERO_SUBTITLE_PRESENTATION_CONTRACT.manifestoCentered&&HERO_SUBTITLE_PRESENTATION_CONTRACT.manifestoStop==='ممنوع!'&&HERO_SUBTITLE_PRESENTATION_CONTRACT.manifestoStopColor==='#9b2c2c','Hero manifesto contract drift');
assert(HERO_SUBTITLE_PRESENTATION_CONTRACT.decorativeChrome===false,'Hero manifesto must remain chrome-free');
assert(HERO_SUBTITLE_PRESENTATION_CONTRACT.heroOrderChanged===false&&HERO_SUBTITLE_PRESENTATION_CONTRACT.searchPresentationChanged===false&&HERO_SUBTITLE_PRESENTATION_CONTRACT.heroImageGeometryChanged===false,'Hero masthead leaked into unrelated Hero contracts');

assert(authoredPage.includes('<span id="saeed-ghezelbash-aesthetic-medicine">دکتر سعید قزلباش؛ پزشک زیبایی در کرمانشاه</span>'),'Canonical authored H1 changed');
assert(authoredPage.includes('<p class="hero-subtitle">سفارش از منوی خدمات زیبایی ممنوع</p>'),'Canonical authored Hero manifesto source changed');
const h1=content.match(/<h1\b[^>]*id="saeed-ghezelbash"[^>]*>[\s\S]*?<\/h1>/i)?.[0]||'';
const h1Text=h1.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
assert(h1Text==='دکتر سعید قزلباش؛ پزشک زیبایی در کرمانشاه','Assembled semantic H1 text/order changed');
assert(h1.includes('class="hero-title__name"')&&h1.includes('class="hero-title__semantic-separator"')&&h1.includes('class="hero-title__descriptor"'),'Hero visual title spans missing');
assert(h1.indexOf('hero-title__name')<h1.indexOf('hero-title__semantic-separator')&&h1.indexOf('hero-title__semantic-separator')<h1.indexOf('hero-title__descriptor'),'DOM H1 order no longer entity-first');
assert(content.includes('<p class="hero-subtitle">سفارش از منوی خدمات زیبایی <strong class="hero-subtitle__stop">ممنوع!</strong></p>'),'Hero diagnostic manifesto markup missing');

assert(delivery.criticalCss.includes('.hero-title__descriptor{order:1}')&&delivery.criticalCss.includes('.hero-title__semantic-separator{order:2}')&&delivery.criticalCss.includes('.hero-title__name{order:3}'),'Visual profession/location-first inline title order missing');
assert(!delivery.criticalCss.includes('flex-basis:100%'),'Hero title must not force physician name onto a second line');
assert(delivery.criticalCss.includes('.hero-title__name::after{content:":"}'),'Visual physician-name colon missing');
assert(delivery.criticalCss.includes('justify-self:center;max-width:34ch')&&delivery.criticalCss.includes('text-align:center;text-wrap:balance'),'Centered Hero manifesto typography missing');
assert(delivery.criticalCss.includes('.hero-subtitle__stop{color:#9b2c2c;font-weight:850;white-space:nowrap}'),'Deep-red manifesto stop treatment missing');
assert(!/\.entity-hero \.hero-subtitle\{[^}]*\b(?:background|border|box-shadow):/.test(delivery.criticalCss),'Decorative chrome entered Hero manifesto');
assert(delivery.criticalCss.includes('.entity-hero .hero-title{margin-block-end:.35rem}')&&delivery.criticalCss.includes('.entity-hero .hero-subtitle{margin-block:0 .55rem}'),'Mobile masthead/manifesto spacing missing');
assert(content.includes('<span>جست‌وجو</span>'),'Approved compact Hero search presentation changed');
const titleAt=content.indexOf('class="hero-title"'),subtitleAt=content.indexOf('class="hero-subtitle"'),searchAt=content.indexOf('class="hero-action hero-search-launch"');
assert(titleAt>=0&&subtitleAt>titleAt&&searchAt>subtitleAt,'Hero title/manifesto/search structural order changed');
assert(Buffer.byteLength(delivery.criticalCss)<=invariants.maxCriticalCssBytes,'Hero masthead exceeds critical CSS release budget');

console.log(JSON.stringify({stage:'HERO_SUBTITLE_PRESENTATION',mode:'PHYSICIAN_IDENTITY_MASTHEAD',semanticH1:'UNCHANGED',visualH1:'پزشک زیبایی در کرمانشاه؛ دکتر سعید قزلباش:',forcedTitleLineBreak:false,manifesto:'سفارش از منوی خدمات زیبایی ممنوع!',manifestoCentered:true,stopColor:'#9b2c2c',decorativeChrome:false,search:'PRESERVED',heroOrder:'UNCHANGED',criticalBytes:Buffer.byteLength(delivery.criticalCss),criticalBudget:invariants.maxCriticalCssBytes,status:'PASS'},null,2));
