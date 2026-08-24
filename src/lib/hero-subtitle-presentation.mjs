const LEGACY_HERO_TITLE_RULE='.entity-hero .hero-title{grid-area:title}';
const EDITORIAL_HERO_TITLE_RULE='.entity-hero .hero-title{grid-area:title;margin-block-end:.55rem}';
const LEGACY_HERO_SUBTITLE_RULE='.entity-hero .hero-subtitle{grid-area:subtitle}';
const EDITORIAL_HERO_SUBTITLE_RULE='.entity-hero .hero-subtitle{grid-area:subtitle;max-width:36ch;margin:0 0 .9rem;color:#40564f;font-size:clamp(1.02rem,.98rem + .2vw,1.14rem);font-weight:650;line-height:1.55;text-wrap:balance}';

const count=(source,needle)=>String(source).split(needle).length-1;
const replaceExactlyOnce=(source,from,to,label)=>{
  if(count(source,from)!==1)throw new Error(`${label}: expected exactly one canonical occurrence`);
  return source.replace(from,to);
};

export function applyHeroSubtitlePresentationCss(authoredCss){
  let source=String(authoredCss);
  source=replaceExactlyOnce(source,LEGACY_HERO_TITLE_RULE,EDITORIAL_HERO_TITLE_RULE,'Hero title grouping');
  source=replaceExactlyOnce(source,LEGACY_HERO_SUBTITLE_RULE,EDITORIAL_HERO_SUBTITLE_RULE,'Hero subtitle editorial presentation');
  return source;
}

export const HERO_SUBTITLE_PRESENTATION_CONTRACT=Object.freeze({
  textChanged:false,
  decorativeChrome:false,
  maxWidth:'36ch',
  fontWeight:650,
  textWrap:'balance',
  heroOrderChanged:false,
  searchPresentationChanged:false,
  heroImageGeometryChanged:false,
});
