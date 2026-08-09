export const cssSplitMarker='/*DIST_CRITICAL_CSS_END*/';
export const calibrationPattern=/\/\*DIST_CHUNK_CALIBRATION_SHA256:[0-9a-f]{64}\*\/\/\*DIST_CHUNK_INTRINSIC_START\*\/[\s\S]*?\/\*DIST_CHUNK_INTRINSIC_END\*\//;

export function splitCssDelivery(source,stableGeometryCss=''){
  const splitAt=source.indexOf(cssSplitMarker);
  if(splitAt<0||source.indexOf(cssSplitMarker,splitAt+1)>=0)throw new Error('Critical CSS split marker drift');
  const externalAt=splitAt+cssSplitMarker.length;
  const criticalBase=source.slice(0,externalAt);
  const deferredSource=source.slice(externalAt);
  const calibrationMatch=deferredSource.match(calibrationPattern);
  if(!calibrationMatch)throw new Error('Render calibration CSS boundary missing');
  const calibrationCss=calibrationMatch[0];
  const calibrationAt=calibrationMatch.index;
  if(!stableGeometryCss.includes('.render-chunk')||!stableGeometryCss.includes('.skip-link'))throw new Error('Stable critical geometry CSS missing');
  const criticalCss=criticalBase+stableGeometryCss+calibrationCss;
  const externalCss=deferredSource.slice(0,calibrationAt)+deferredSource.slice(calibrationAt+calibrationCss.length)+stableGeometryCss;
  return {criticalCss,externalCss,calibrationCss,criticalBase};
}
