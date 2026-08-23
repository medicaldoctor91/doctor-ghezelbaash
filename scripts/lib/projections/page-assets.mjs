import path from 'node:path';
import {mkdir,readFile,readdir,unlink,writeFile} from 'node:fs/promises';
import {assembleCanonicalContent} from '../assemble-content.mjs';
import {assembleCssSource} from '../../../src/lib/css-source.mjs';
import {deriveCssDelivery} from '../../../src/lib/css-delivery.mjs';

export async function compilePageAssets(context){
  const {root,data,graph}=context;
  const assembled=await assembleCanonicalContent({root,graph});
  if(!assembled.names.length)throw new Error('Canonical modular content source is empty');
  const contentDir=path.join(root,'src/content');
  await mkdir(contentDir,{recursive:true});
  await writeFile(path.join(contentDir,'home.md'),assembled.content);

  const [authoredCss,renderCalibrationRaw]=await Promise.all([
    readFile(path.join(root,'src/styles/global.css'),'utf8'),
    readFile(path.join(data,'render-calibration.json'),'utf8'),
  ]);
  const {cssSource,calibration}=assembleCssSource(authoredCss,renderCalibrationRaw);
  const {externalCss,assetName}=deriveCssDelivery(cssSource);
  if(!externalCss.includes('/*DIST_CHUNK_INTRINSIC_START*/')||!externalCss.includes('/*DIST_CHUNK_INTRINSIC_END*/')||!externalCss.includes(`/*DIST_CHUNK_CALIBRATION_SHA256:${calibration.sha256}*/`))throw new Error('External CSS lost assembled render calibration');

  const cssAssetDir=path.join(root,'public/assets');
  await mkdir(cssAssetDir,{recursive:true});
  for(const name of await readdir(cssAssetDir)){
    if(/^site\.[0-9a-f]{12}\.css$/.test(name)&&name!==assetName)await unlink(path.join(cssAssetDir,name));
  }
  await writeFile(path.join(cssAssetDir,assetName),externalCss);
  return {home:assembled.content,externalCssAssetName:assetName,calibration};
}
