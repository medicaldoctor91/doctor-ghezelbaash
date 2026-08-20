import {readFile} from 'node:fs/promises';
import {assembleCanonicalContent} from './lib/assemble-content.mjs';
import {deriveCssDelivery} from '../src/lib/css-delivery.mjs';
import {compactCssValue,isMaxWidthRule,mediaRuleAppliesAtWidth,parseCssRules,selectorRules} from './lib/css-rules.mjs';
import {HERO_FIGURE_TOTAL_BORDER_PX,HERO_IMAGE_SIZES,bindHeroPreloadSizes} from '../src/lib/hero-image-contract.mjs';

const [globalCss,criticalMobileCss,invariants,mainHeadRaw]=await Promise.all([
  readFile('src/styles/global.css','utf8'),
  readFile('src/styles/critical-mobile.css','utf8'),
  readFile('src/data/release-invariants.json','utf8').then(JSON.parse),
  readFile('src/data/templates/main-head.html','utf8')
]);
const delivery=deriveCssDelivery(globalCss,{criticalMobileCss});
const criticalRules=parseCssRules(delivery.criticalCss);
const deferredRules=parseCssRules(delivery.externalCss);
const normalized=value=>compactCssValue(value).replace(/0(?=\.\d)/g,'');
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const decl=(rules,selector,property,{mobile=false}={})=>{
  const matches=selectorRules(rules,selector).filter(rule=>mobile?isMaxWidthRule(rule,720):true).filter(rule=>property in rule.declarations);
  assert(matches.length>0,`Missing ${mobile?'mobile ':''}${selector} ${property}`);
  return matches.at(-1).declarations[property];
};
const expect=(rules,selector,property,value,options={})=>assert(normalized(decl(rules,selector,property,options))===normalized(value),`${selector} ${property} drift`);

assert((globalCss.match(/\/\*DIST_CRITICAL_CSS_END\*\//g)||[]).length===1,'Critical CSS split marker drift');
assert(globalCss.includes('/*DIST_CRITICAL_HERO_GEOMETRY_START*/')&&globalCss.includes('/*DIST_CRITICAL_HERO_GEOMETRY_END*/'),'Critical Hero geometry block missing');

expect(criticalRules,'.entity-hero .hero-actions','display','grid',{mobile:true});
expect(criticalRules,'.entity-hero .hero-actions','grid-template-columns','minmax(0,1fr)',{mobile:true});
expect(criticalRules,'.entity-hero .hero-actions','gap','.58rem',{mobile:true});
expect(criticalRules,'.entity-hero .hero-actions','width','100%',{mobile:true});
expect(criticalRules,'.entity-hero .hero-action','grid-column','1/-1',{mobile:true});
expect(criticalRules,'.entity-hero .hero-action','width','100%',{mobile:true});
expect(criticalRules,'.entity-hero .hero-action','min-height','3.12rem',{mobile:true});
expect(criticalRules,'.entity-hero .hero-action','padding','.72rem 1rem',{mobile:true});

const allRules=[...criticalRules,...deferredRules];
const conflictingHeroColumns=allRules.filter(rule=>mediaRuleAppliesAtWidth(rule,720)&&rule.selector.includes('.hero-actions')&&normalized(rule.declarations['grid-template-columns']||'')==='1fr1fr');
assert(conflictingHeroColumns.length===0,'A two-column mobile rule can still match Hero actions');
assert(!delivery.externalCss.includes('.entity-hero .hero-actions{display:grid;grid-template-columns:minmax(0,1fr)'), 'Authoritative Hero action geometry remains deferred');
assert(!delivery.externalCss.includes('.entity-hero .hero-action{grid-column:1/-1'), 'Authoritative Hero CTA geometry remains deferred');
const conditions=rule=>rule.conditions.map(compactCssValue).join('|');
const duplicatedHeroDeclarations=[];
for(const criticalRule of criticalRules.filter(rule=>rule.selector.includes('hero'))){
  for(const deferredRule of deferredRules.filter(rule=>compactCssValue(rule.selector)===compactCssValue(criticalRule.selector)&&conditions(rule)===conditions(criticalRule))){
    for(const [property,value] of Object.entries(criticalRule.declarations))if(property in deferredRule.declarations&&compactCssValue(value)===compactCssValue(deferredRule.declarations[property]))duplicatedHeroDeclarations.push(`${criticalRule.selector}:${property}`);
  }
}
assert(duplicatedHeroDeclarations.length===0,`Hero geometry has multiple authorities: ${duplicatedHeroDeclarations.join(', ')}`);

for(const rules of [criticalRules,deferredRules]){
  for(const rule of selectorRules(rules,'main').filter(rule=>mediaRuleAppliesAtWidth(rule,720))){
    const padding=normalized(rule.declarations.padding||'');
    const inline=normalized(rule.declarations['padding-inline']||'');
    if(padding)assert(/^1rem\.78remcalc\(/.test(padding),'Mobile main shorthand horizontal padding must be .78rem');
    if(inline)assert(inline==='.78rem','Mobile main padding-inline must be .78rem');
  }
}

expect(criticalRules,'.quick-actions__top','width','2.15rem');
expect(criticalRules,'.quick-actions__top','height','2.15rem');
expect(criticalRules,'.quick-actions__top::before','inset','-.35rem');
for(const property of ['width','height'])assert(!selectorRules(deferredRules,'.quick-actions__top').some(rule=>property in rule.declarations),`Deferred quick top repeats ${property}`);
assert(!selectorRules(deferredRules,'.quick-actions__top::before').some(rule=>'inset' in rule.declarations),'Deferred quick top pseudo repeats inset');

assert(!allRules.some(rule=>(rule.selector==='html'||rule.selector===':root')&&'font-size' in rule.declarations),'Root font-size change requires Hero sizes re-audit');
expect(criticalRules,'figure','border','1px solid var(--line)');
assert(HERO_FIGURE_TOTAL_BORDER_PX===2,'Hero border contract drift');

const {content}=await assembleCanonicalContent();
assert((content.match(/class=["'][^"']*\bhero-actions\b[^"']*["']/g)||[]).length===1,'Unexpected Hero actions consumer count');
assert(/<button\b[^>]*class=["'][^"']*\bhero-action\b[^"']*\bhero-search-launch\b[^"']*["']/i.test(content),'Search launcher left the Hero action contract');
assert(!content.includes('hero-action--search'),'Dead Hero action search class reintroduced');

const boundHead=bindHeroPreloadSizes(mainHeadRaw);
assert((mainHeadRaw.match(/\{\{HERO_IMAGE_SIZES\}\}/g)||[]).length===1,'Hero preload must consume the shared sizes token exactly once');
assert((await readFile('src/content-source/page.md','utf8')).match(/\{\{HERO_IMAGE_SIZES\}\}/g)?.length===3,'Hero picture must consume the shared sizes token exactly three times');
const preloadHints=[...(boundHead.matchAll(/\bimagesizes=["']([^"']+)["']/g))].map(match=>match[1]);
const picture=content.match(/<picture\b(?=[^>]*\bid=["']image-saeed-ghezelbash-portrait-master-webp["'])[^>]*>[\s\S]*?<\/picture>/i)?.[0]||'';
const pictureHints=[...(picture.matchAll(/\bsizes=["']([^"']+)["']/g))].map(match=>match[1]);
const imageHints=[...preloadHints,...pictureHints];
assert(preloadHints.length===1&&pictureHints.length===3,'Hero must expose exactly four responsive image hints');
assert(imageHints.every(value=>value===HERO_IMAGE_SIZES),'Hero responsive image hints diverged');
assert(!/\b(?:min|max|clamp)\(/i.test(HERO_IMAGE_SIZES),'Unsupported sizing function entered Hero sizes contract');
assert(!/max-width:\s*720px\)\s+and/i.test(HERO_IMAGE_SIZES),'Hero sizes contains a redundant mobile branch');
const cssHeroSlotAt=width=>{
  if(width<=720)return width-16-(2*.78*16)-HERO_FIGURE_TOTAL_BORDER_PX;
  const outer=Math.min(width-32,78*16),padding=Math.min(48,.03*width),gap=Math.min(48,.03*width);
  const track=Math.max(18*16,.46*(outer-(2*padding)-2-gap));
  return track-HERO_FIGURE_TOTAL_BORDER_PX;
};
const sizesHeroSlotAt=width=>width<=720?width-(2.56*16)-2:width<=725.37028?(18*16)-2:width<=1280?(.4186*width)-(.92*16)-2.92:width<=1600?(35.88*16)-(.0414*width)-2.92:(31.74*16)-2.92;
const geometryViewports=[390,430,720,721,725.37028,768,800,960,1279,1280,1440,1599,1600,1920];
for(const width of geometryViewports)assert(Math.abs(cssHeroSlotAt(width)-sizesHeroSlotAt(width))<.001,`Hero sizes geometry drift at ${width}px`);

const reputationBlocks=content.match(/<div\b(?=[^>]*\bid=["']google-maps-clinic-reputation-current["'])[^>]*>[\s\S]*?<\/div>/gi)||[];
assert(reputationBlocks.length===1,'Expected one assembled reputation block');
assert(reputationBlocks[0].includes('آخرین تغییر ثبت‌شده در Google:'),'Current reputation observation semantics missing');
assert(!reputationBlocks[0].includes('آخرین دریافت از Google:'),'Stale reputation observation semantics remain');

assert(Buffer.byteLength(delivery.criticalCss)<=invariants.maxCriticalCssBytes,'Critical CSS exceeds release budget');
assert(Buffer.byteLength(delivery.externalCss)>=invariants.minExternalCssBytes,'Deferred CSS fell below release floor');

console.log(JSON.stringify({stage:'CSS_DELIVERY_CONVERGENCE',criticalBytes:Buffer.byteLength(delivery.criticalCss),deferredBytes:Buffer.byteLength(delivery.externalCss),heroMobileColumns:1,heroImageHintCount:imageHints.length,quickTop:'2.15rem x 2.15rem',mainMobilePaddingInline:'.78rem',staticConvergence:'PASS'},null,2));
