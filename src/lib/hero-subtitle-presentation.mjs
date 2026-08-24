const AUTHORED_HERO_TITLE='<h1 class="hero-title" id="saeed-ghezelbash"><span id="saeed-ghezelbash-aesthetic-medicine">دکتر سعید قزلباش؛ پزشک زیبایی در کرمانشاه</span></h1>';
const ASSEMBLED_HERO_TITLE='<h1 class="hero-title" id="saeed-ghezelbash"><span class="hero-title__name">دکتر سعید قزلباش</span><span class="hero-title__semantic-separator">؛ </span><span class="hero-title__descriptor" id="saeed-ghezelbash-aesthetic-medicine">پزشک زیبایی در کرمانشاه</span></h1>';
const AUTHORED_HERO_SUBTITLE='<p class="hero-subtitle">سفارش از منوی خدمات زیبایی ممنوع</p>';
const ASSEMBLED_HERO_SUBTITLE='<p class="hero-subtitle">سفارش از منوی خدمات زیبایی <strong class="hero-subtitle__stop">ممنوع!</strong></p>';

const LEGACY_HERO_TITLE_RULE='.entity-hero .hero-title{grid-area:title}';
const MASTHEAD_HERO_TITLE_RULE='.entity-hero .hero-title{grid-area:title;display:flex;flex-wrap:wrap;align-items:baseline;column-gap:.14em;row-gap:.08rem;margin-block-end:.9rem;direction:rtl}.hero-title__descriptor{order:1;color:#52645e;font-size:clamp(.98rem,.91rem + .28vw,1.16rem);font-weight:650;line-height:1.45;white-space:nowrap}.hero-title__semantic-separator{order:2;color:#52645e;font-size:clamp(.98rem,.91rem + .28vw,1.16rem);font-weight:650}.hero-title__name{order:3;flex-basis:100%;color:var(--ink);font-weight:830;line-height:1.2;white-space:nowrap}.hero-title__name::after{content:":"}';
const LEGACY_HERO_SUBTITLE_RULE='.entity-hero .hero-subtitle{grid-area:subtitle}';
const MANIFESTO_HERO_SUBTITLE_RULE='.entity-hero .hero-subtitle{grid-area:subtitle;justify-self:center;max-width:32ch;margin:.05rem auto 1.05rem;color:#344b44;font-size:clamp(1.04rem,.98rem + .24vw,1.2rem);font-weight:650;line-height:1.58;text-align:center;text-wrap:balance}.hero-subtitle__stop{color:#9b2c2c;font-weight:850;white-space:nowrap}';
const LEGACY_MOBILE_TITLE_RULE='.entity-hero .hero-title{margin-block-end:.15rem}';
const MASTHEAD_MOBILE_TITLE_RULE='.entity-hero .hero-title{margin-block-end:.72rem}';
const LEGACY_MOBILE_SUBTITLE_RULE='.entity-hero .hero-subtitle{margin-block:0 .25rem}';
const MANIFESTO_MOBILE_SUBTITLE_RULE='.entity-hero .hero-subtitle{margin-block:.05rem .8rem}';

const count=(source,needle)=>String(source).split(needle).length-1;
const replaceExactlyOnce=(source,from,to,label)=>{
  if(count(source,from)!==1)throw new Error(`${label}: expected exactly one canonical occurrence`);
  return source.replace(from,to);
};

export function bindHeroMastheadPresentation(content){
  let source=String(content);
  source=replaceExactlyOnce(source,AUTHORED_HERO_TITLE,ASSEMBLED_HERO_TITLE,'Hero semantic/visual title split');
  source=replaceExactlyOnce(source,AUTHORED_HERO_SUBTITLE,ASSEMBLED_HERO_SUBTITLE,'Hero diagnostic manifesto');
  return source;
}

export function applyHeroSubtitlePresentationCss(authoredCss){
  let source=String(authoredCss);
  source=replaceExactlyOnce(source,LEGACY_HERO_TITLE_RULE,MASTHEAD_HERO_TITLE_RULE,'Hero identity masthead');
  source=replaceExactlyOnce(source,LEGACY_HERO_SUBTITLE_RULE,MANIFESTO_HERO_SUBTITLE_RULE,'Hero diagnostic manifesto presentation');
  source=replaceExactlyOnce(source,LEGACY_MOBILE_TITLE_RULE,MASTHEAD_MOBILE_TITLE_RULE,'Hero masthead mobile spacing');
  source=replaceExactlyOnce(source,LEGACY_MOBILE_SUBTITLE_RULE,MANIFESTO_MOBILE_SUBTITLE_RULE,'Hero manifesto mobile spacing');
  return source;
}

export const HERO_SUBTITLE_PRESENTATION_CONTRACT=Object.freeze({
  semanticH1TextChanged:false,
  visualH1Order:'profession-location-first',
  visualNameSuffix:':',
  manifestoCentered:true,
  manifestoStop:'ممنوع!',
  manifestoStopColor:'#9b2c2c',
  decorativeChrome:false,
  heroOrderChanged:false,
  searchPresentationChanged:false,
  heroImageGeometryChanged:false,
});
