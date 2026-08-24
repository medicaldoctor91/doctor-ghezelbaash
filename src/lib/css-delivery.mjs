import {createHash} from 'node:crypto';
import {CSS_SPLIT_MARKER,RENDER_CALIBRATION_SLOT} from './css-source.mjs';

export {CSS_SPLIT_MARKER};

export const compactAuthoredCssLayout=source=>String(source).replace(/\r?\n/g,'');

export function deriveCssDelivery(cssSource){
  const deliverySource=compactAuthoredCssLayout(cssSource);
  if(deliverySource.includes(RENDER_CALIBRATION_SLOT))throw new Error('CSS source must be assembled before delivery derivation');
  if(deliverySource.split(CSS_SPLIT_MARKER).length!==2)throw new Error('Critical CSS split marker must occur exactly once');
  const splitAt=deliverySource.indexOf(CSS_SPLIT_MARKER);
  const externalAt=splitAt+CSS_SPLIT_MARKER.length;
  const criticalBase=deliverySource.slice(0,externalAt);
  const externalCss=deliverySource.slice(externalAt);
  const externalCssHash=createHash('sha256').update(externalCss).digest('hex').slice(0,12);
  const assetName=`site.${externalCssHash}.css`;
  return {splitAt,externalAt,criticalBase,criticalCss:criticalBase,externalCss,externalCssHash,assetName,assetHref:`/assets/${assetName}`};
}
