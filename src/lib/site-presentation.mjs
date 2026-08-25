const esc=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const count=(source,needle)=>String(source).split(needle).length-1;
const patchRule=(source,anchor,changes,label)=>{
  if(count(source,anchor)!==1)throw new Error(`${label}: expected exactly one canonical rule anchor`);
  const start=source.indexOf(anchor),open=source.indexOf('{',start),end=source.indexOf('}',open);
  if(open<0||end<0)throw new Error(`${label}: malformed canonical CSS rule`);
  let rule=source.slice(start,end+1);
  for(const [property,value] of changes){
    const pattern=new RegExp(`([;{])${esc(property)}:[^;}]*`);
    if(pattern.test(rule))rule=rule.replace(pattern,`$1${property}:${value}`);
    else rule=rule.slice(0,-1)+(rule.at(-2)===';'?'':';')+`${property}:${value}`+'}';
  }
  return source.slice(0,start)+rule+source.slice(end+1);
};

const RULES=Object.freeze([
  ['h2{margin-top:4.6rem;padding-top:0.4rem;',[['position','relative'],['border-block-start','1px solid #bcc8c4']],'chapter-heading'],
  ['.section-answer{margin-block:1.35rem 1.7rem;',[['border','0'],['border-radius','0'],['background','transparent']],'answer-surface'],
  ['.micro-answer,.semantic-alias{padding:0.75rem 0.9rem;',[['border','0'],['border-radius','0'],['background','transparent']],'micro-evidence-surface'],
  ['blockquote{margin:1.7rem 0;padding:0.9rem 1.1rem;',[['border-radius','0'],['background','transparent']],'blockquote-surface'],
  ['.entity-hero{display:grid;grid-template-columns:minmax(0,1.08fr)',[['font-family','"Vazirmatn",system-ui,sans-serif']],'hero-type-authority'],
  ['.hero-action{display:inline-flex;align-items:center;justify-content:center;',[['border-radius','.18rem'],['box-shadow','none']],'hero-actions'],
  ['.hero-trust-list li{display:grid;gap:.15rem;',[['border','0'],['border-radius','0'],['background','transparent'],['border-block','1px solid var(--line)']],'hero-trust'],
  ['.quick-actions__bar{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));',[['grid-template-columns','.9fr 1.2fr .9fr'],['border-radius','.38rem'],['box-shadow','0 8px 24px rgb(17 39 31/.1)']],'dock-rail'],
  ['.quick-actions__item{position:relative;display:inline-flex;gap:.4rem;',[['border-radius','0']],'dock-items'],
  ['.quick-actions__item--consultation{gap:.5rem;background:',[['box-shadow','inset 0 2px 0 var(--accent)']],'dock-center'],
  ['.quick-actions__top{position:absolute;left:50%;bottom:calc(100% + .42rem);',[['border-radius','.18rem'],['box-shadow','none']],'dock-top'],
  ['#aesthetic-medicine-table-of-contents{overflow:visible;margin-block:2.5rem 3.8rem;',[['border','0'],['border-radius','0'],['background','transparent'],['box-shadow','none']],'toc-shell'],
  ['#aesthetic-medicine-table-of-contents>p::before{content:"";width:0.48rem;',[['width','2.2rem'],['height','1px'],['border-radius','0'],['background','var(--ink)']],'toc-mark'],
  ['#aesthetic-medicine-table-of-contents a::before{content:counter(toc,decimal-leading-zero);',[['border','0'],['border-radius','0'],['background','transparent']],'toc-index'],
  ['#aesthetic-medicine-table-of-contents a:hover{transform:translateX(-2px);',[['background','transparent'],['color','var(--ink)']],'toc-hover'],
  ['details{content-visibility:visible;contain:none;overflow:clip;',[['border','0'],['border-radius','0'],['background','transparent'],['border-block','1px solid var(--line)']],'details'],
  ['details[open]{background:#fbfdfc;',[['background','transparent']],'details-open'],
  ['table{width:100%;border:1px solid var(--line);',[['border','0'],['border-radius','0'],['background','transparent'],['border-block-start','1px solid var(--ink)']],'table'],
  ['th,td{padding:0.7rem;border:0;',[['border-inline-end','0']],'table-cells'],
  ['th{background:var(--surface-soft);',[['background','transparent'],['font-weight','760']],'table-head'],
  ['address{padding:1rem 1.1rem;border:1px solid var(--line);',[['border','0'],['border-radius','0'],['background','transparent'],['border-block','1px solid var(--line)']],'address'],
  ['.site-footer{width:min(100% - 2rem,78rem);',[['border','0'],['border-radius','0'],['background','transparent'],['box-shadow','none'],['border-block-start','2px solid var(--ink)'],['border-block-end','1px solid var(--line)']],'entity-colophon'],
  ['.quick-start{margin:1.2rem 0 1.5rem;',[['border','0'],['border-radius','0'],['background','transparent'],['border-block','1px solid var(--line)']],'quick-start'],
  ['.quick-start--end{margin-block:4.5rem 0;',[['background','transparent']],'quick-start-end'],
  ['.quick-start nav a{display:inline-flex;min-height:42px;',[['border','0'],['border-radius','0'],['background','transparent'],['border-block-end','1px solid var(--line)']],'quick-start-links'],
  ['.clinic-facts{padding:.75rem .9rem;',[['border-inline-start','1px solid var(--accent)'],['background','transparent'],['border-radius','0']],'clinic-facts'],
  ['.video-chapters{max-width:var(--reading-measure);',[['border','0'],['border-radius','0'],['background','transparent'],['border-block','1px solid #d7e6e0']],'video-index'],
  ['.video-chapters a{display:grid;grid-template-columns:3.4rem minmax(0,1fr);',[['border-radius','0']],'video-index-links'],
  ['.guide-search{width:min(92vw,48rem);',[['border','1px solid #cbd6d2'],['border-radius','.2rem'],['box-shadow','0 18px 60px rgb(8 34 27/.2)']],'search-dialog'],
  ['.guide-search::backdrop{background:rgb(9 25 20/.58);',[['backdrop-filter','none']],'search-backdrop'],
  ['.guide-search__close{display:grid;place-items:center;',[['border-radius','0']],'search-close'],
  ['.guide-search__field input{width:100%;min-height:3.1rem;',[['border','0'],['border-radius','0'],['background','transparent'],['border-block-end','1px solid #8fafa3']],'search-field'],
  ['.guide-search__results a{display:block;padding:.7rem .8rem;',[['border','0'],['border-radius','0'],['background','transparent'],['border-block-end','1px solid var(--line)']],'search-results'],
  ['.trust-governance{margin-block:clamp(1.25rem,2.6vw,2.25rem);',[['border','0'],['border-radius','0'],['background','transparent'],['border-block','1px solid color-mix(in srgb,currentColor 16%,transparent)']],'trust-governance'],
  ['.verified-identity-core{margin:.85rem 0;padding:.65rem .8rem;',[['border','0'],['border-radius','0'],['background','transparent'],['border-block','1px solid color-mix(in srgb,currentColor 16%,transparent)']],'verified-identity'],
  ['#aesthetic-medicine-table-of-contents{margin-block:2rem 3rem;padding:0.88rem;',[['border-radius','0']],'toc-mobile']
]);

const SPLIT='/*DIST_CRITICAL_CSS_END*/';
const CALIBRATION_SLOT='/*DIST_CHUNK_INTRINSIC_SLOT*/';
const CHAPTER_CSS='.medical-guide{counter-reset:chapter}.content-section>h2{counter-increment:chapter}.content-section>h2::before{content:counter(chapter,decimal-leading-zero);position:absolute;inset-inline-end:0;top:-1.05rem;color:#85938e;font:800 .64rem/1 "Vazirmatn",system-ui,sans-serif;font-variant-numeric:tabular-nums;letter-spacing:.08em}';

export function applySitePresentationCss(authoredCss){
  let source=String(authoredCss);
  if(count(source,'a[href^="tel:"]{')!==1)throw new Error('Telephone presentation anchor drift');
  source=source.replace('a[href^="tel:"]{','a[href^="tel:"]:not(.quick-actions__item){');
  for(const [anchor,changes,label] of RULES)source=patchRule(source,anchor,changes,label);
  if(count(source,SPLIT)!==1)throw new Error('Critical CSS split marker drift in site presentation');
  if(count(source,CALIBRATION_SLOT)!==1)throw new Error('Render calibration slot drift in site presentation');
  source=source.replace(CALIBRATION_SLOT,CHAPTER_CSS+CALIBRATION_SLOT);
  return source;
}

export const SITE_PRESENTATION_CONTRACT=Object.freeze({
  direction:'diagnostic-surrealism',
  decorativeDomAdded:false,
  imageAssetsChanged:false,
  imageGeometryChanged:false,
  tocNavigationChanged:false,
  searchBehaviorChanged:false,
  cardChrome:'reduced',
  chapterIndex:'css-counter',
  floatingDock:'instrument-rail',
  footer:'entity-colophon',
  motion:'restrained',
});
