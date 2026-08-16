import {readFile} from 'node:fs/promises';
import {assembleCanonicalContent} from './lib/assemble-content.mjs';

const css=await readFile('src/styles/global.css','utf8');
const marker='/*DIST_CRITICAL_CSS_END*/';
const markerIndex=css.indexOf(marker);
if(markerIndex<0||css.indexOf(marker,markerIndex+1)>=0)throw new Error('Critical CSS marker drift');
const critical=css.slice(0,markerIndex);
const must=(snippet,message)=>{if(!critical.includes(snippet))throw new Error(message)};

must('/*DIST_CRITICAL_HERO_GEOMETRY_START*/','Critical hero geometry block missing');
must('.hero-search-launch{grid-area:search;display:grid','Search launch final geometry is deferred');
must('.hero-figure-caption,.clinical-figure-caption{display:grid;gap:.4rem}','Hero caption grid geometry is deferred');
must('.hero-caption-facts{display:flex;flex-wrap:wrap','Hero caption facts geometry is deferred');
must('.hero-caption-reputation{padding-top:.32rem','Hero reputation geometry is deferred');
must('@media(max-width:720px){.hero-search-launch{min-height:3.1rem','Mobile hero search geometry is deferred');
must('.hero-caption-facts{display:grid;gap:.08rem;font-size:.8rem}','Mobile hero caption geometry is deferred');
must('@media(max-width:430px){.hero-search-launch{grid-template-columns:1.15rem minmax(0,1fr)','Narrow mobile hero geometry is deferred');
must('.hero-caption-reputation{min-block-size:4rem','Narrow-mobile reputation geometry is not reserved');

const {content}=await assembleCanonicalContent();
const reputationBlocks=content.match(/<div\b(?=[^>]*\bid=["']google-maps-clinic-reputation-current["'])[^>]*>[\s\S]*?<\/div>/gi)||[];
if(reputationBlocks.length!==1)throw new Error(`Expected one assembled reputation block; found ${reputationBlocks.length}`);
if(!reputationBlocks[0].includes('آخرین تغییر ثبت‌شده در Google:'))throw new Error('Current reputation observation semantics missing');
if(reputationBlocks[0].includes('آخرین دریافت از Google:'))throw new Error('Stale reputation observation semantics remain');

console.log(JSON.stringify({criticalHeroGeometry:'PASS',mobileBreakpoints:[720,430],reputationFootprint:'contract-exact-reserved',reputationSemantics:'current-value-change',finalComputedStyleChange:false}));
