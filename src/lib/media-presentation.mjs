const LEGACY_FIGURE_RULE='figure{content-visibility:visible;contain:none;margin:2.2rem 0;padding:clamp(0.65rem,1.5vw,1rem);border:1px solid var(--line);border-radius:1rem;background:var(--surface-soft);}';
const EDITORIAL_FIGURE_RULE='figure{content-visibility:visible;contain:none;margin:2.2rem 0;padding:clamp(0.65rem,1.5vw,1rem);border:1px solid var(--line);border-color:transparent;background:transparent;}';
const LEGACY_HERO_FIGURE_RULE='.entity-hero .hero-figure{grid-area:portrait;align-self:start;margin:0;padding:0;overflow:hidden;background:#eef5f2}';
const PRESERVED_HERO_FIGURE_RULE='.entity-hero .hero-figure{grid-area:portrait;align-self:start;margin:0;padding:0;overflow:hidden;border-color:var(--line);border-radius:1rem;background:#eef5f2}';

export const MEDIA_PRESENTATION_DEFERRED_CSS='figure:not(.hero-figure) figcaption{position:relative}figure:not(.hero-figure) figcaption::before{content:"";position:absolute;inset-inline:0;top:-.38rem;height:1px;background:rgb(10 107 88/.14)}';

const count=(source,needle)=>String(source).split(needle).length-1;
const replaceExactlyOnce=(source,from,to,label)=>{
  if(count(source,from)!==1)throw new Error(`${label}: expected exactly one canonical CSS rule`);
  return source.replace(from,to);
};

export function applyMediaPresentationCss(authoredCss,{splitMarker}={}){
  if(typeof splitMarker!=='string'||!splitMarker)throw new Error('Media presentation requires the critical CSS split marker');
  let source=String(authoredCss);
  if(count(source,splitMarker)!==1)throw new Error('Media presentation requires exactly one critical CSS split marker');
  source=replaceExactlyOnce(source,LEGACY_FIGURE_RULE,EDITORIAL_FIGURE_RULE,'Editorial figure presentation');
  source=replaceExactlyOnce(source,LEGACY_HERO_FIGURE_RULE,PRESERVED_HERO_FIGURE_RULE,'Hero figure preservation');
  source=source.replace(splitMarker,`${splitMarker}${MEDIA_PRESENTATION_DEFERRED_CSS}`);
  return source;
}

export const MEDIA_PRESENTATION_CONTRACT=Object.freeze({
  geometryChanged:false,
  ordinaryFigureBorderPaint:false,
  ordinaryFigureSurfacePaint:false,
  heroBorderPreserved:true,
  heroRadiusPreserved:true,
  captionSeparatorLayoutNeutral:true,
});
