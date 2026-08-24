const HERO_SEARCH_LONG_LABEL='<span>جست‌وجو در راهنمای جامع</span>';
const HERO_SEARCH_SHORT_LABEL='<span>جست‌وجو</span>';

const LEGACY_SEARCH_RULE='.hero-search-launch{grid-area:search;display:grid;grid-template-columns:1.2rem minmax(0,1fr) auto;gap:.65rem;align-items:center;width:100%;min-height:3rem;margin:.15rem 0 .55rem;padding:.68rem .85rem;border:1px solid #bdd9cf;border-radius:.78rem;background:linear-gradient(135deg,#fff,#f6faf8);color:var(--accent-strong);font:inherit;font-weight:780;line-height:1.35;text-align:start;box-shadow:0 7px 22px rgb(7 82 68/.055);cursor:pointer;-webkit-tap-highlight-color:transparent}';
const COMPACT_SEARCH_RULE='.hero-search-launch{grid-area:search;display:grid;grid-template-columns:1.1rem auto auto;gap:.58rem;align-items:center;justify-self:start;width:fit-content;min-height:2.85rem;margin:.15rem 0 .55rem;padding:.6rem .72rem;border:1px solid #cadfd7;border-radius:.72rem;background:#fff;color:var(--accent-strong);font:inherit;font-weight:760;line-height:1.35;text-align:start;box-shadow:0 4px 16px rgb(7 82 68/.035);cursor:pointer;-webkit-tap-highlight-color:transparent}';
const LEGACY_SEARCH_ICON_RULE='.hero-search-launch svg{width:1.15rem;height:1.15rem;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}';
const COMPACT_SEARCH_ICON_RULE='.hero-search-launch svg{width:1.05rem;height:1.05rem;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}';
const LEGACY_SEARCH_KBD_RULE='.hero-search-launch kbd{min-width:1.7rem;padding:.12rem .38rem;border:1px solid #d6e3de;border-bottom-width:2px;border-radius:.4rem;background:#fff;color:var(--muted);font:600 .72rem/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;text-align:center}';
const COMPACT_SEARCH_KBD_RULE='.hero-search-launch kbd{min-width:1.55rem;padding:.08rem .32rem;border:1px solid #dce7e3;border-radius:.38rem;background:#f8faf9;color:#6a7873;font:600 .68rem/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;text-align:center}';
const LEGACY_MOBILE_SEARCH_RULE='.hero-search-launch{min-height:3.1rem;margin:.05rem 0 .2rem}';
const MOBILE_SEARCH_RULE='.hero-search-launch{justify-self:stretch;width:100%;grid-template-columns:1.05rem minmax(0,1fr);min-height:3.05rem;margin:.05rem 0 .2rem;padding:.64rem .78rem}';
const LEGACY_NARROW_SEARCH_RULE='.hero-search-launch{grid-template-columns:1.15rem minmax(0,1fr);padding-inline:.75rem}';
const NARROW_SEARCH_RULE='.hero-search-launch{grid-template-columns:1.05rem minmax(0,1fr);padding-inline:.72rem}';

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
  source=replaceExactlyOnce(source,LEGACY_SEARCH_RULE,COMPACT_SEARCH_RULE,'Hero search base presentation');
  source=replaceExactlyOnce(source,LEGACY_SEARCH_ICON_RULE,COMPACT_SEARCH_ICON_RULE,'Hero search icon presentation');
  source=replaceExactlyOnce(source,LEGACY_SEARCH_KBD_RULE,COMPACT_SEARCH_KBD_RULE,'Hero search keyboard hint presentation');
  source=replaceExactlyOnce(source,LEGACY_MOBILE_SEARCH_RULE,MOBILE_SEARCH_RULE,'Hero search mobile presentation');
  source=replaceExactlyOnce(source,LEGACY_NARROW_SEARCH_RULE,NARROW_SEARCH_RULE,'Hero search narrow presentation');
  return source;
}

export const HERO_SEARCH_PRESENTATION_CONTRACT=Object.freeze({
  visibleLabel:'جست‌وجو',
  desktopCompact:true,
  mobileFullWidth:true,
  dialogBehaviorPreserved:true,
  keyboardHintDesktopOnly:true,
  heroOrderChanged:false,
  heroImageGeometryChanged:false,
});
