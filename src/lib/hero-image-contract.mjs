export const HERO_IMAGE_SIZES='(max-width: 720px) calc(100vw - 2.56rem - 2px), (max-width: calc(45.19828rem + 2.1978px)) calc(18rem - 2px), (max-width: 80rem) calc(41.86vw - .92rem - 2.92px), (max-width: 100rem) calc(35.88rem - 4.14vw - 2.92px), calc(31.74rem - 2.92px)';
export const HERO_FIGURE_TOTAL_BORDER_PX=2;
export const HERO_IMAGE_SIZES_TOKEN='{{HERO_IMAGE_SIZES}}';

export function bindHeroImageSizes(value){
  const source=String(value);
  const bound=source.replaceAll(HERO_IMAGE_SIZES_TOKEN,HERO_IMAGE_SIZES);
  if(bound.includes(HERO_IMAGE_SIZES_TOKEN))throw new Error('Unresolved Hero image sizes token');
  return bound;
}

export function bindHeroPictureSizes(value){
  const source=bindHeroImageSizes(value);
  const pattern=/<picture\b(?=[^>]*\bid=["']image-saeed-ghezelbash-portrait-master-webp["'])[^>]*>[\s\S]*?<\/picture>/i;
  const matches=source.match(new RegExp(pattern.source,'gi'))||[];
  if(matches.length!==1)throw new Error(`Expected one canonical Hero picture; found ${matches.length}`);
  let hintCount=0;
  const picture=matches[0].replace(/\bsizes=["'][^"']*["']/gi,()=>{hintCount++;return `sizes="${HERO_IMAGE_SIZES}"`});
  if(hintCount!==3)throw new Error(`Expected three Hero picture sizes hints; found ${hintCount}`);
  return source.replace(pattern,picture);
}

export function bindHeroPreloadSizes(value){
  const source=bindHeroImageSizes(value);
  const pattern=/<link\b(?=[^>]*\brel=["']preload["'])(?=[^>]*\bas=["']image["'])(?=[^>]*\bfetchpriority=["']high["'])(?=[^>]*saeed-ghezelbash-portrait-delivery-640)[^>]*\/>/i;
  const matches=source.match(new RegExp(pattern.source,'gi'))||[];
  if(matches.length!==1)throw new Error(`Expected one Hero image preload; found ${matches.length}`);
  if(!/\bimagesizes=["'][^"']*["']/i.test(matches[0]))throw new Error('Hero image preload imagesizes attribute missing');
  const preload=matches[0].replace(/\bimagesizes=["'][^"']*["']/i,`imagesizes="${HERO_IMAGE_SIZES}"`);
  return source.replace(pattern,preload);
}
