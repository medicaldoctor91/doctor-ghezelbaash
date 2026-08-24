import {readFile} from 'node:fs/promises';
import {brotliCompressSync,constants as zlibConstants} from 'node:zlib';
import {assembleCanonicalContent} from './lib/assemble-content.mjs';
import {assembleCssSource} from '../src/lib/css-source.mjs';
import {deriveCssDelivery} from '../src/lib/css-delivery.mjs';
import {compactCssValue,isMaxWidthRule,mediaRuleAppliesAtWidth,normalizeCssValue,parseCssRules,selectorRules} from './lib/css-rules.mjs';
import {HERO_FIGURE_TOTAL_BORDER_PX,HERO_IMAGE_SIZES} from '../src/lib/hero-image-contract.mjs';

const [globalCss,renderCalibrationRaw,invariants,documentHead]=await Promise.all([
  readFile('src/styles/global.css','utf8'),
  readFile('src/data/render-calibration.json','utf8'),
  readFile('src/data/release-invariants.json','utf8').then(JSON.parse),
  readFile('src/components/DocumentHead.astro','utf8')
]);
const {cssSource,calibration}=assembleCssSource(globalCss,renderCalibrationRaw);
const delivery=deriveCssDelivery(cssSource);
const criticalRules=parseCssRules(delivery.criticalCss);
const deferredRules=parseCssRules(delivery.externalCss);
const normalized=normalizeCssValue;
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
assert(normalized('0.8rem')===normalized('.8rem'),'CSS normalizer must canonicalize numeric leading zero');
assert(normalized('rgb(0 0 0 / 0.12)')===normalized('rgb(0 0 0/.12)'),'CSS normalizer must canonicalize optional slash spacing');
assert(normalized('calc(100% - 1rem)')!==normalized('calc(100%-1rem)'),'CSS normalizer must preserve calc operator whitespace semantics');
assert(normalized('"0.5"')!==normalized('".5"'),'CSS normalizer must preserve quoted numeric text');
assert(normalized('url(0.5.png)')!==normalized('url(.5.png)'),'CSS normalizer must preserve URL payloads');
const decl=(rules,selector,property,{maxWidth=null}={})=>{
  const matches=selectorRules(rules,selector).filter(rule=>maxWidth?isMaxWidthRule(rule,maxWidth):true).filter(rule=>property in rule.declarations);
  assert(matches.length>0,`Missing ${maxWidth?`<=${maxWidth}px `:''}${selector} ${property}`);
  return matches.at(-1).declarations[property];
};
const expect=(rules,selector,property,value,options={})=>assert(normalized(decl(rules,selector,property,options))===normalized(value),`${selector} ${property} drift`);

assert((globalCss.match(/\/\*DIST_CRITICAL_CSS_END\*\//g)||[]).length===1,'Critical CSS split marker drift');
assert(globalCss.includes('/*DIST_CRITICAL_HERO_GEOMETRY_START*/')&&globalCss.includes('/*DIST_CRITICAL_HERO_GEOMETRY_END*/'),'Critical Hero geometry block missing');
assert(!/(?:Release 1\.0\.0|FINAL_2026_UI_CONVERGENCE|GEO_UI_20260817)/.test(globalCss),'Historical append-only CSS layer remains');
assert(globalCss.split(/\r?\n/).length>=200,'Authored CSS collapsed back into an unreadable single-line authority');
assert(!delivery.criticalCss.includes('\n')&&!delivery.externalCss.includes('\n'),'Readable authored CSS was not compacted at the delivery boundary');
for(const deadClass of ['hero-reputation','hero-trust-list','hero-cta','review-meta','quick-actions__separator','quick-actions__item--search'])assert(!globalCss.includes(`.${deadClass}`),`Dead CSS authority reintroduced: ${deadClass}`);

expect(criticalRules,'.entity-hero .hero-actions','display','grid',{maxWidth:720});
expect(criticalRules,'.entity-hero .hero-actions','grid-template-columns','minmax(0,1fr)',{maxWidth:720});
expect(criticalRules,'.entity-hero .hero-actions','gap','.58rem',{maxWidth:720});
expect(criticalRules,'.entity-hero .hero-actions','width','100%',{maxWidth:720});
expect(criticalRules,'.entity-hero .hero-action','grid-column','1/-1',{maxWidth:720});
expect(criticalRules,'.entity-hero .hero-action','width','100%',{maxWidth:720});
expect(criticalRules,'.entity-hero .hero-action','min-height','3.12rem',{maxWidth:720});
expect(criticalRules,'.entity-hero .hero-action','padding','.72rem 1rem',{maxWidth:720});

const allRules=[...criticalRules,...deferredRules];
const cssPropertyCount=property=>allRules.reduce((count,rule)=>count+Number(property in rule.declarations),0);
const backdropFilterCount=cssPropertyCount('backdrop-filter')+cssPropertyCount('-webkit-backdrop-filter');
const imageFilterCount=cssPropertyCount('filter');
assert(backdropFilterCount<=2,`GPU-heavy backdrop-filter budget exceeded: ${backdropFilterCount}`);
assert(imageFilterCount<=1,`Authored image/color filter budget exceeded: ${imageFilterCount}`);
const conflictingHeroColumns=allRules.filter(rule=>mediaRuleAppliesAtWidth(rule,720)&&rule.selector.includes('.hero-actions')&&normalized(rule.declarations['grid-template-columns']||'')===normalized('1fr 1fr'));
assert(conflictingHeroColumns.length===0,'A two-column mobile rule can still match Hero actions');
assert(!delivery.externalCss.includes('.entity-hero .hero-actions{display:grid;grid-template-columns:minmax(0,1fr)'), 'Authoritative Hero action geometry remains deferred');
assert(!delivery.externalCss.includes('.entity-hero .hero-action{grid-column:1/-1'), 'Authoritative Hero CTA geometry remains deferred');
const conditions=rule=>rule.conditions.map(compactCssValue).join('|');
const duplicatedDeliveryDeclarations=[];
for(const criticalRule of criticalRules){
  for(const deferredRule of deferredRules.filter(rule=>compactCssValue(rule.selector)===compactCssValue(criticalRule.selector)&&conditions(rule)===conditions(criticalRule))){
    for(const [property,value] of Object.entries(criticalRule.declarations))if(property in deferredRule.declarations&&normalized(value)===normalized(deferredRule.declarations[property]))duplicatedDeliveryDeclarations.push(`${criticalRule.selector}:${property}`);
  }
}
assert(duplicatedDeliveryDeclarations.length===0,`Critical/deferred declaration has multiple authorities: ${duplicatedDeliveryDeclarations.join(', ')}`);
assert(selectorRules(criticalRules,'.hero-search-launch').filter(rule=>'grid-area' in rule.declarations).length===1,'Hero search grid-area has duplicate critical authority');
const mobileCaptionReputation=selectorRules(criticalRules,'.hero-caption-reputation').filter(rule=>isMaxWidthRule(rule,430));
assert(mobileCaptionReputation.length===1&&'font-size' in mobileCaptionReputation[0].declarations&&'min-block-size' in mobileCaptionReputation[0].declarations,'Hero caption reputation mobile geometry is split across authorities');

for(const rules of [criticalRules,deferredRules]){
  for(const rule of selectorRules(rules,'main').filter(rule=>mediaRuleAppliesAtWidth(rule,720))){
    const padding=normalized(rule.declarations.padding||'');
    const inline=normalized(rule.declarations['padding-inline']||'');
    if(padding)assert(padding===normalized('1rem .78rem calc(7.2rem + env(safe-area-inset-bottom))'),'Mobile main shorthand horizontal padding must be .78rem');
    if(inline)assert(inline==='.78rem','Mobile main padding-inline must be .78rem');
  }
}

expect(criticalRules,'.skip-link','position','fixed');
expect(criticalRules,'.skip-link:focus','top','1rem');
expect(criticalRules,'html','scroll-behavior','auto',{maxWidth:720});
expect(criticalRules,'h1','font-size','clamp(1.85rem,8.3vw,2.65rem)',{maxWidth:720});
expect(criticalRules,'.hero-title-role','display','block');
expect(criticalRules,'.hero-title-role','font-size','.58em');
assert(!selectorRules(deferredRules,'.skip-link').some(rule=>rule.conditions.length===0),'Deferred skip-link base authority remains');
const criticalMobileRootFont=selectorRules(criticalRules,':root').filter(rule=>rule.conditions.some(condition=>compactCssValue(condition).includes('max-width:48rem')));
assert(criticalMobileRootFont.length===1&&normalized(criticalMobileRootFont[0].declarations['font-family']||'').includes('system-ui'),'Critical mobile font-family authority missing');
assert(!selectorRules(deferredRules,':root').some(rule=>rule.conditions.some(condition=>compactCssValue(condition).includes('max-width:48rem'))&&'font-family' in rule.declarations),'Deferred mobile font-family authority remains');

expect(criticalRules,'.quick-actions__item','padding','.3rem .26rem',{maxWidth:480});
expect(criticalRules,'.quick-actions__item','font-size','clamp(.7rem,2.9vw,.76rem)',{maxWidth:480});
expect(criticalRules,'.quick-actions__item--consultation','gap','.34rem',{maxWidth:480});
expect(criticalRules,'.quick-actions__consultation-copy small','font-size','.8em',{maxWidth:480});
for(const [selector,properties] of [[ '.quick-actions',['left','right','width','transform'] ],[ '.quick-actions__bar',['grid-template-columns','min-height','padding'] ],[ '.quick-actions__item',['gap','min-height','padding','font-size'] ],[ '.quick-actions__item--consultation',['gap'] ],[ '.quick-actions__item svg',['width','height'] ],[ '.quick-actions__consultation-copy small',['font-size'] ]]){
  for(const property of properties)assert(!selectorRules(deferredRules,selector).filter(rule=>isMaxWidthRule(rule,480)).some(rule=>property in rule.declarations),`Deferred <=480 quick-actions authority remains: ${selector} ${property}`);
}

expect(criticalRules,'.quick-actions__top','width','2.15rem');
expect(criticalRules,'.quick-actions__top','height','2.15rem');
expect(criticalRules,'.quick-actions__top::before','inset','-.35rem');
expect(criticalRules,'.quick-actions__bar','border','1px solid rgb(10 107 88/.12)');
expect(criticalRules,'.quick-actions__bar','background','linear-gradient(180deg,#fffefa,#f2f7f4)');
expect(criticalRules,'.quick-actions__item','background','rgb(255 255 255/.72)');
expect(criticalRules,'.quick-actions__item--consultation','background','linear-gradient(135deg,#064a3e,#0a6856)');
for(const property of ['width','height'])assert(!selectorRules(deferredRules,'.quick-actions__top').some(rule=>property in rule.declarations),`Deferred quick top repeats ${property}`);
assert(!selectorRules(deferredRules,'.quick-actions__top::before').some(rule=>'inset' in rule.declarations),'Deferred quick top pseudo repeats inset');
assert(!selectorRules(deferredRules,'.quick-actions').some(rule=>rule.conditions.length===0),'Deferred quick-actions base authority remains');
assert(!selectorRules(deferredRules,'.quick-actions__bar').some(rule=>rule.conditions.length===0),'Deferred quick-actions bar base authority remains');
for(const [selector,property] of [['.quick-actions__item','background'],['.quick-actions__item--consultation','background'],['.quick-actions__item--search','background']])assert(!selectorRules(deferredRules,selector).some(rule=>rule.conditions.length===0&&property in rule.declarations),`Deferred Quick Actions paint authority remains: ${selector} ${property}`);

assert(!allRules.some(rule=>(rule.selector==='html'||rule.selector===':root')&&'font-size' in rule.declarations),'Root font-size change requires Hero sizes re-audit');
expect(criticalRules,'figure','border','1px solid var(--line)');
assert(HERO_FIGURE_TOTAL_BORDER_PX===2,'Hero border contract drift');
expect(deferredRules,'.medical-guide','counter-reset','guide-chapter');
expect(deferredRules,'.content-section','counter-increment','guide-chapter');
expect(deferredRules,'.render-chunk','content-visibility','auto');
expect(deferredRules,'.render-chunk','contain','layout style paint');
const mobileToc=selectorRules(deferredRules,'#aesthetic-medicine-table-of-contents ol').filter(rule=>isMaxWidthRule(rule,720));
assert(mobileToc.length===1&&normalized(mobileToc[0].declarations.display)==='flex'&&normalized(mobileToc[0].declarations['scroll-snap-type'])===normalized('inline mandatory'),'Mobile TOC snap architecture drift');
const chapterRail=selectorRules(deferredRules,'.chapter-rail:not([hidden])').filter(rule=>rule.conditions.some(condition=>compactCssValue(condition).includes('min-width:80rem')));
assert(chapterRail.length===1&&normalized(chapterRail[0].declarations.position)==='fixed'&&normalized(chapterRail[0].declarations.display)==='block','Desktop chapter rail architecture drift');
assert(!delivery.criticalCss.includes('.chapter-rail')&&delivery.externalCss.includes('animation-timeline:scroll(root block)'),'Deferred navigation/progress delivery drift');
const {content}=await assembleCanonicalContent();
assert((content.match(/class=["'][^"']*\bhero-actions\b[^"']*["']/g)||[]).length===1,'Unexpected Hero actions consumer count');
assert(/<button\b(?=[^>]*class=["']hero-search-launch["'])(?=[^>]*aria-label=["'][^"']+["'])[^>]*>/i.test(content),'Compact accessible Hero search launcher contract drift');
assert(!/<button\b[^>]*class=["'][^"']*\bhero-action\b[^"']*\bhero-search-launch\b/i.test(content),'Search launcher re-entered the CTA geometry contract');
assert(!content.includes('hero-action--search'),'Dead Hero action search class reintroduced');
assert((documentHead.match(/imagesizes=\{HERO_IMAGE_SIZES\}/g)||[]).length===1,'Structured Hero preload must consume the shared sizes contract exactly once');
assert((await readFile('src/content-source/page.md','utf8')).match(/\{\{HERO_IMAGE_SIZES\}\}/g)?.length===3,'Hero picture must consume the shared sizes token exactly three times');
const preloadHints=[HERO_IMAGE_SIZES];
const picture=content.match(/<picture\b(?=[^>]*\bid=["']image-saeed-ghezelbash-portrait-master-webp["'])[^>]*>[\s\S]*?<\/picture>/i)?.[0]||'';
const pictureHints=[...(picture.matchAll(/\bsizes=["']([^"']+)["']/g))].map(match=>match[1]);
const imageHints=[...preloadHints,...pictureHints];
assert(preloadHints.length===1&&pictureHints.length===3,'Hero must expose exactly four responsive image hints');
assert(imageHints.every(value=>value===HERO_IMAGE_SIZES),'Hero responsive image hints diverged');
const expectedHeroImageSizes='(max-width: 720px) and (max-width: 79rem) calc(100vw - 2.56rem), (max-width: 720px) 76.44rem, (max-width: calc(45.19828rem + 2.1978px)) 18rem, (max-width: 80rem) calc(41.86vw - .92rem - .92px), (max-width: 100rem) calc(35.88rem - 4.14vw - .92px), calc(31.74rem - .92px)';
assert(HERO_IMAGE_SIZES===expectedHeroImageSizes,'Hero responsive image six-state contract drift');
assert(!/\b(?:min|max|clamp)\(/i.test(HERO_IMAGE_SIZES),'Unsupported sizing function entered Hero sizes contract');
assert(HERO_IMAGE_SIZES.startsWith('(max-width: 720px) and (max-width: 79rem) '),'Mobile main-cap branch missing from Hero sizes contract');

const cssHeroTrackAt=(width,remPx)=>{
  if(width<=720){
    const outer=Math.min(width-remPx,78*remPx);
    return outer-(2*.78*remPx);
  }
  const outer=Math.min(width-(2*remPx),78*remPx);
  const padding=Math.min(3*remPx,Math.max(remPx,.03*width));
  const gap=Math.min(3*remPx,Math.max(1.3*remPx,.03*width));
  const available=outer-(2*padding)-2-gap;
  return Math.max(18*remPx,.46*available);
};
const sizesHeroTrackAt=(width,remPx)=>{
  if(width<=720&&width<=79*remPx)return width-(2.56*remPx);
  if(width<=720)return 76.44*remPx;
  const minimumTrackCrossover=(45.19828*remPx)+2.1978;
  if(width<=minimumTrackCrossover)return 18*remPx;
  if(width<=80*remPx)return (.4186*width)-(.92*remPx)-.92;
  if(width<=100*remPx)return (35.88*remPx)-(.0414*width)-.92;
  return (31.74*remPx)-.92;
};
const geometryRemCases=[8,16,20];
let geometryChecks=0;
for(const remPx of geometryRemCases){
  const minimumTrackCrossover=(45.19828*remPx)+2.1978;
  const candidateWidths=[390,430,719,720,721,79*remPx-1,79*remPx,79*remPx+1,minimumTrackCrossover-1,minimumTrackCrossover,minimumTrackCrossover+1,80*remPx-1,80*remPx,80*remPx+1,100*remPx-1,100*remPx,100*remPx+1,1279,1280,1440,1600,1920,2200];
  for(const width of [...new Set(candidateWidths.filter(value=>value>=320))].sort((a,b)=>a-b)){
    const cssTrack=cssHeroTrackAt(width,remPx),hintTrack=sizesHeroTrackAt(width,remPx),imageContent=cssTrack-HERO_FIGURE_TOTAL_BORDER_PX;
    assert(Math.abs(cssTrack-hintTrack)<.02,`Hero sizes track geometry drift at ${width}px / ${remPx}px rem`);
    assert(hintTrack+0.001>=imageContent,`Hero sizes under-reports image content at ${width}px / ${remPx}px rem`);
    assert(Math.abs((hintTrack-imageContent)-HERO_FIGURE_TOTAL_BORDER_PX)<.02,`Hero sizes conservative border allowance drift at ${width}px / ${remPx}px rem`);
    geometryChecks++;
  }
}

const reputationBlocks=content.match(/<div\b(?=[^>]*\bid=["']google-maps-clinic-reputation-current["'])[^>]*>[\s\S]*?<\/div>/gi)||[];
assert(reputationBlocks.length===1,'Expected one assembled reputation block');
assert(reputationBlocks[0].includes('آخرین تغییر ثبت‌شده در Google:'),'Current reputation observation semantics missing');
assert(!reputationBlocks[0].includes('آخرین دریافت از Google:'),'Stale reputation observation semantics remain');

assert(Buffer.byteLength(delivery.criticalCss)<=invariants.maxCriticalCssBytes,'Critical CSS exceeds release budget');
assert(Buffer.byteLength(delivery.externalCss)>=invariants.minExternalCssBytes,'Deferred CSS fell below release floor');
const deferredBytes=Buffer.byteLength(delivery.externalCss);
const deferredBrotliBytes=brotliCompressSync(Buffer.from(delivery.externalCss),{params:{[zlibConstants.BROTLI_PARAM_QUALITY]:11}}).byteLength;
assert(deferredBytes<=69000,`Deferred CSS exceeds the signature architecture raw budget: ${deferredBytes}`);
assert(deferredBrotliBytes<=13900,`Deferred CSS exceeds the signature architecture Brotli budget: ${deferredBrotliBytes}`);

console.log(JSON.stringify({stage:'CSS_DELIVERY_CONVERGENCE',stylesheetSources:1,calibrationAssembly:'IN_MEMORY',renderCalibrationSha256:calibration.sha256,renderCalibrationRules:calibration.ruleCount,criticalBytes:Buffer.byteLength(delivery.criticalCss),deferredBytes,deferredBrotliBytes,deferredRawBudget:69000,deferredBrotliBudget:13900,backdropFilterCount,imageFilterCount,crossBoundaryDuplicateDeclarations:0,historicalCascadeLayers:0,heroMobileColumns:1,heroImageHintCount:imageHints.length,heroImageSizingStates:6,heroGeometryRemCases:geometryRemCases,heroGeometryChecks:geometryChecks,heroSizingMode:'geometry-derived conservative slot contract',normalizerSafety:'PASS',entityHeroHierarchy:'PASS',mobileTocSnap:'PASS',desktopChapterRail:'PASS',scrollProgress:'PASS',quickActionsMobileConvergence:'PASS',quickActionsPaintConvergence:'PASS',quickTop:'2.15rem x 2.15rem',mainMobilePaddingInline:'.78rem',staticConvergence:'PASS'},null,2));
