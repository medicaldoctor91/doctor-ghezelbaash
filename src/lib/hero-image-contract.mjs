export const HERO_IMAGE_SIZES='(max-width: 720px) and (max-width: 79rem) calc(100vw - 2.56rem), (max-width: 720px) 76.44rem, (max-width: calc(45.19828rem + 2.1978px)) 18rem, (max-width: 80rem) calc(41.86vw - .92rem - .92px), (max-width: 100rem) calc(35.88rem - 4.14vw - .92px), calc(31.74rem - .92px)';
export const HERO_FIGURE_TOTAL_BORDER_PX=2;
export const HERO_IMAGE_SIZES_TOKEN='{{HERO_IMAGE_SIZES}}';
export const HERO_PRELOAD_HREF='/media/images/physician/saeed-ghezelbash-portrait-delivery-640.7b2b6ac2affa.avif';
export const HERO_PRELOAD_SRCSET='/media/images/physician/saeed-ghezelbash-portrait-delivery-640.7b2b6ac2affa.avif 640w, /media/images/physician/saeed-ghezelbash-portrait-960.497fc78613ac.avif 960w, /media/images/physician/saeed-ghezelbash-portrait-1600.665436f5bf39.avif 1600w';

const tokenCount=value=>String(value).split(HERO_IMAGE_SIZES_TOKEN).length-1;

function bindExactHeroTokens(value,expectedCount,context){
  const source=String(value);
  const count=tokenCount(source);
  if(count!==expectedCount)throw new Error(`${context}: expected ${expectedCount} Hero image sizes token(s); found ${count}`);
  const bound=source.replaceAll(HERO_IMAGE_SIZES_TOKEN,HERO_IMAGE_SIZES);
  if(bound.includes(HERO_IMAGE_SIZES_TOKEN))throw new Error(`${context}: unresolved Hero image sizes token`);
  return bound;
}

export function bindHeroImageSizes(value){
  const source=String(value);
  const count=tokenCount(source);
  if(count<1)throw new Error('Hero image sizes token missing');
  return bindExactHeroTokens(source,count,'Hero image sizes binding');
}

export function bindHeroPictureSizes(value){
  return bindExactHeroTokens(value,3,'Canonical Hero picture');
}

export function bindHeroPreloadSizes(value){
  return bindExactHeroTokens(value,1,'Canonical Hero preload');
}
