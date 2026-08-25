const HERO_SEARCH_LONG_LABEL='<span>جست‌وجو در راهنمای جامع</span>';
const HERO_SEARCH_SHORT_LABEL='<span>جست‌وجو</span>';

const LEGACY_SEARCH_RULE='.hero-search-launch{grid-area:search;display:grid;grid-template-columns:1.2rem minmax(0,1fr) auto;gap:.65rem;align-items:center;width:100%;min-height:3rem;margin:.15rem 0 .55rem;padding:.68rem .85rem;border:1px solid #bdd9cf;border-radius:.78rem;background:linear-gradient(135deg,#fff,#f6faf8);color:var(--accent-strong);font:inherit;font-weight:780;line-height:1.35;text-align:start;box-shadow:0 7px 22px rgb(7 82 68/.055);cursor:pointer;-webkit-tap-highlight-color:transparent}';
const PREMIUM_SEARCH_RULE='.hero-search-launch{grid-area:search;display:inline-flex;gap:.45rem;align-items:center;justify-self:end;width:fit-content;min-height:2.75rem;margin:0 0 .35rem;padding:.42rem .6rem;border:1px solid #cbd8d3;border-radius:.18rem;background:transparent;color:var(--accent-strong);font:inherit;font-weight:740;line-height:1.35;cursor:pointer}';
const LEGACY_SEARCH_ICON_RULE='.hero-search-launch svg{width:1.15rem;height:1.15rem;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}';
const PREMIUM_SEARCH_ICON_RULE='.hero-search-launch svg{width:1rem;height:1rem;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}';
const LEGACY_SEARCH_KBD_RULE='.hero-search-launch kbd{min-width:1.7rem;padding:.12rem .38rem;border:1px solid #d6e3de;border-bottom-width:2px;border-radius:.4rem;background:#fff;color:var(--muted);font:600 .72rem/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;text-align:center}';
const PREMIUM_SEARCH_KBD_RULE='.hero-search-launch kbd{padding:.05rem .22rem;border:0;background:none;color:#75827d;font:600 .66rem/1 ui-monospace,SFMono-Regular,Menlo,monospace}';
const LEGACY_MOBILE_SEARCH_RULE='.hero-search-launch{min-height:3.1rem;margin:.05rem 0 .2rem}';
const MOBILE_SEARCH_RULE='.entity-hero .hero-action.hero-search-launch{justify-self:end;width:fit-content;min-height:2.85rem;margin:0 0 .25rem;padding:.45rem .6rem;border:1px solid #cbd8d3;border-radius:.18rem;background:transparent}';
const LEGACY_NARROW_SEARCH_RULE='.hero-search-launch{grid-template-columns:1.15rem minmax(0,1fr);padding-inline:.75rem}';

const count=(source,needle)=>String(source).split(needle).length-1;
const replaceExactlyOnce=(source,from,to,label)=>{
  if(count(source,from)!==1)throw new Error(`${label}: expected exactly one canonical occurrence`);
  return source.replace(from,to);
};

export function bindHeroSearchLabel(content){
  return replaceExactlyOnce(String(content),HERO_SEARCH_LONG_LABEL,HERO_SEARCH_SHORT_LABEL,'Hero search visible label');
}

export function applyHeroSearchPresentationCss(authoredCss){
  let source=String(authoredCss);
  source=replaceExactlyOnce(source,LEGACY_SEARCH_RULE,PREMIUM_SEARCH_RULE,'Hero search compact control');
  source=replaceExactlyOnce(source,LEGACY_SEARCH_ICON_RULE,PREMIUM_SEARCH_ICON_RULE,'Hero search icon presentation');
  source=replaceExactlyOnce(source,LEGACY_SEARCH_KBD_RULE,PREMIUM_SEARCH_KBD_RULE,'Hero search keyboard hint presentation');
  source=replaceExactlyOnce(source,LEGACY_MOBILE_SEARCH_RULE,MOBILE_SEARCH_RULE,'Hero search mobile compact control');
  source=replaceExactlyOnce(source,LEGACY_NARROW_SEARCH_RULE,'','Hero search narrow legacy removal');
  return source;
}

export const HERO_SEARCH_PRESENTATION_CONTRACT=Object.freeze({
  visibleLabel:'جست‌وجو',
  premiumControl:true,
  desktopCompact:true,
  mobileCompact:true,
  mobileFullWidth:false,
  centeredDesktop:false,
  counterweighted:true,
  shadow:false,
  dialogBehaviorPreserved:true,
  keyboardHintDesktopOnly:true,
  heroOrderChanged:false,
  heroImageGeometryChanged:false,
});
