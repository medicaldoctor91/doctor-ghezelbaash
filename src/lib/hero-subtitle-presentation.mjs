const AUTHORED_HERO_TITLE='<h1 class="hero-title" id="saeed-ghezelbash"><span id="saeed-ghezelbash-aesthetic-medicine">دکتر سعید قزلباش؛ پزشک زیبایی در کرمانشاه</span></h1>';
const ASSEMBLED_HERO_TITLE='<h1 class="hero-title" id="saeed-ghezelbash"><span class="hero-title__name">دکتر سعید قزلباش</span><span class="hero-title__semantic-separator">؛ </span><span class="hero-title__descriptor" id="saeed-ghezelbash-aesthetic-medicine">پزشک زیبایی در کرمانشاه</span></h1>';
const AUTHORED_HERO_SUBTITLE='<p class="hero-subtitle">سفارش از منوی خدمات زیبایی ممنوع</p>';
const ASSEMBLED_HERO_SUBTITLE='<p class="hero-subtitle">سفارش از منوی خدمات زیبایی <strong class="hero-subtitle__stop">ممنوع!</strong></p>';

const LEGACY_HERO_TITLE_RULE='.entity-hero .hero-title{grid-area:title}';
const MASTHEAD_HERO_TITLE_RULE='.entity-hero .hero-title{grid-area:title;display:flex;flex-wrap:wrap;align-items:baseline;gap:0 .14em;margin-block-end:.65rem}.hero-title__descriptor{order:1}.hero-title__semantic-separator{order:2}.hero-title__name{order:3}.hero-title__name::after{content:":"}';
const LEGACY_HERO_SUBTITLE_RULE='.entity-hero .hero-subtitle{grid-area:subtitle}';
const MANIFESTO_HERO_SUBTITLE_RULE='.entity-hero .hero-subtitle{grid-area:subtitle;justify-self:center;max-width:34ch;margin:.05rem auto .9rem;color:#40564f;font-size:1.08em;font-weight:650;text-align:center;text-wrap:balance}.hero-subtitle__stop{color:#9b2c2c;font-weight:850;white-space:nowrap}';
const LEGACY_MOBILE_TITLE_RULE='.entity-hero .hero-title{margin-block-end:.15rem}';
const MASTHEAD_MOBILE_TITLE_RULE='.entity-hero .hero-title{margin-block-end:.35rem}';
const LEGACY_MOBILE_SUBTITLE_RULE='.entity-hero .hero-subtitle{margin-block:0 .25rem}';
const MANIFESTO_MOBILE_SUBTITLE_RULE='.entity-hero .hero-subtitle{margin-block:0 .55rem}';

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
  visualH1Order:'profession-location-first-inline',
  visualNameSuffix:':',
  forcedTitleLineBreak:false,
  manifestoCentered:true,
  manifestoStop:'ممنوع!',
  manifestoStopColor:'#9b2c2c',
  decorativeChrome:false,
  heroOrderChanged:false,
  searchPresentationChanged:false,
  heroImageGeometryChanged:false,
});
