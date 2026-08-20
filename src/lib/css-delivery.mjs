import { createHash } from 'node:crypto';

export const CSS_SPLIT_MARKER='/*DIST_CRITICAL_CSS_END*/';

export function deriveCssDelivery(globalCss){
  const splitAt=globalCss.indexOf(CSS_SPLIT_MARKER);
  if(splitAt<0)throw new Error('Critical CSS split marker missing');
  const externalAt=splitAt+CSS_SPLIT_MARKER.length;
  const criticalBase=globalCss.slice(0,splitAt);
  const externalCss=globalCss.slice(externalAt);
  const externalCssHash=createHash('sha256').update(externalCss).digest('hex').slice(0,12);
  const assetName=`site.${externalCssHash}.css`;
  return {splitAt,externalAt,criticalBase,criticalCss:criticalBase,externalCss,externalCssHash,assetName,assetHref:`/assets/${assetName}`};
}
