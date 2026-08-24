import {createHash} from 'node:crypto';
import {CSS_SPLIT_MARKER,RENDER_CALIBRATION_SLOT} from './css-source.mjs';

export {CSS_SPLIT_MARKER};

export function deriveCssDelivery(cssSource){
  if(cssSource.includes(RENDER_CALIBRATION_SLOT))throw new Error('CSS source must be assembled before delivery derivation');
  if(String(cssSource).split(CSS_SPLIT_MARKER).length!==2)throw new Error('Critical CSS split marker must occur exactly once');
  const splitAt=cssSource.indexOf(CSS_SPLIT_MARKER);
  const externalAt=splitAt+CSS_SPLIT_MARKER.length;
  const criticalBase=cssSource.slice(0,externalAt);
  const externalCss=cssSource.slice(externalAt);
  const externalCssHash=createHash('sha256').update(externalCss).digest('hex').slice(0,12);
  const assetName=`site.${externalCssHash}.css`;
  return {splitAt,externalAt,criticalBase,criticalCss:criticalBase,externalCss,externalCssHash,assetName,assetHref:`/assets/${assetName}`};
}
