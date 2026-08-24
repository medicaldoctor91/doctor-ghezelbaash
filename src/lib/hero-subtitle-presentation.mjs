const AUTHORED_HERO_TITLE='<h1 class="hero-title" id="saeed-ghezelbash"><span id="saeed-ghezelbash-aesthetic-medicine">دکتر سعید قزلباش؛ پزشک زیبایی در کرمانشاه</span></h1>';
const ASSEMBLED_HERO_TITLE='<h1 class="hero-title" id="saeed-ghezelbash"><span class="hero-title__name">دکتر سعید قزلباش</span><span class="hero-title__semantic-separator">؛ </span><span class="hero-title__descriptor" id="saeed-ghezelbash-aesthetic-medicine">پزشک زیبایی در کرمانشاه</span></h1>';
const AUTHORED_HERO_SUBTITLE='<p class="hero-subtitle">سفارش از منوی خدمات زیبایی ممنوع</p>';
const ASSEMBLED_HERO_SUBTITLE='<p class="hero-subtitle">سفارش از منوی خدمات زیبایی <strong class="hero-subtitle__stop">ممنوع!</strong></p>';

const LEGACY_HERO_TITLE_RULE='.entity-hero .hero-title{grid-area:title}';
const ART_HERO_TITLE_RULE='.entity-hero .hero-title{grid-area:title;display:flex;flex-direction:column;gap:.5rem;margin-block-end:.4rem}.hero-title__descriptor{order:-1;border-inline-start:2px solid #8fbfb1;padding-inline-start:.5rem;opacity:.68;font-size:.8rem;font-weight:700}.hero-title__semantic-separator{display:none}.hero-title__name::after{content:":"}';
const LEGACY_HERO_SUBTITLE_RULE='.entity-hero .hero-subtitle{grid-area:subtitle}';
const MANIFESTO_HERO_SUBTITLE_RULE='.entity-hero .hero-subtitle{grid-area:subtitle;justify-self:center;max-width:25ch;margin:.2rem auto 1rem;color:#425850;font-size:1.08em;font-weight:620;line-height:1.65;text-align:center;text-wrap:balance}.hero-subtitle__stop{display:block;color:#982f2b;font-weight:880;white-space:nowrap}';
const LEGACY_MOBILE_TITLE_RULE='.entity-hero .hero-title{margin-block-end:.15rem}';
const ART_MOBILE_TITLE_RULE='.entity-hero .hero-title{gap:.42rem;margin-block-end:.25rem}';
const LEGACY_MOBILE_SUBTITLE_RULE='.entity-hero .hero-subtitle{margin-block:0 .25rem}';
const ART_MOBILE_SUBTITLE_RULE='.entity-hero .hero-subtitle{margin-block:.1rem .55rem}';
const LEGACY_HERO_FIGCAP_RULE='.entity-hero .hero-figure figcaption{margin:0;padding:.65rem .85rem .75rem}';
const ART_HERO_FIGCAP_RULE='.entity-hero .hero-figure figcaption{margin:0;padding:.65rem .85rem .75rem;background:#fff;box-shadow:0 1px #e3ece8 inset}';
const LEGACY_CAPTION_TITLE_RULE='.hero-caption-title,.figure-caption-title{color:#52665f;font-weight:650}';
const ART_CAPTION_TITLE_RULE='.hero-caption-title,.figure-caption-title{color:#263b35;font-weight:780}';

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
  source=replaceExactlyOnce(source,LEGACY_HERO_TITLE_RULE,ART_HERO_TITLE_RULE,'Hero context and identity art direction');
  source=replaceExactlyOnce(source,LEGACY_HERO_SUBTITLE_RULE,MANIFESTO_HERO_SUBTITLE_RULE,'Hero diagnostic manifesto presentation');
  source=replaceExactlyOnce(source,LEGACY_MOBILE_TITLE_RULE,ART_MOBILE_TITLE_RULE,'Hero mobile identity spacing');
  source=replaceExactlyOnce(source,LEGACY_MOBILE_SUBTITLE_RULE,ART_MOBILE_SUBTITLE_RULE,'Hero mobile manifesto spacing');
  source=replaceExactlyOnce(source,LEGACY_HERO_FIGCAP_RULE,ART_HERO_FIGCAP_RULE,'Hero portrait editorial footer surface');
  source=replaceExactlyOnce(source,LEGACY_CAPTION_TITLE_RULE,ART_CAPTION_TITLE_RULE,'Hero portrait footer identity emphasis');
  return source;
}

export const HERO_SUBTITLE_PRESENTATION_CONTRACT=Object.freeze({
  semanticH1TextChanged:false,
  contextLabel:'پزشک زیبایی در کرمانشاه',
  contextLabelTemplateTreatment:true,
  visualSemanticSeparator:false,
  visualNameSuffix:':',
  identityIndependent:true,
  manifestoCentered:true,
  manifestoStop:'ممنوع!',
  manifestoStopBlock:true,
  manifestoStopColor:'#982f2b',
  portraitFooter:'white-editorial',
  searchPresentationCoordinated:true,
  heroOrderChanged:false,
  heroImageGeometryChanged:false,
});
