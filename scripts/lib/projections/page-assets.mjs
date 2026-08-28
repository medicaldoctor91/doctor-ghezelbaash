import path from 'node:path';
import {mkdir,readFile,readdir,unlink,writeFile} from 'node:fs/promises';
import {assembleCanonicalContent,projectPublicContent} from '../assemble-content.mjs';
import {assembleCssSource} from '../../../src/lib/css-source.mjs';
import {deriveCssDelivery} from '../../../src/lib/css-delivery.mjs';

export async function compilePageAssets(context){
  const {root,data,graph,generatedContent,generatedAssets}=context;
  const assembled=await assembleCanonicalContent({root,graph});
  if(!assembled.names.length)throw new Error('Canonical modular content source is empty');
  const publicProjection=projectPublicContent(assembled.content);
  await mkdir(generatedContent,{recursive:true});
  await Promise.all([
    writeFile(path.join(generatedContent,'home.md'),publicProjection.content),
    writeFile(path.join(generatedContent,'canonical-page-corpus.md'),assembled.content),
  ]);

  const [authoredCss,renderCalibrationRaw]=await Promise.all([
    readFile(path.join(root,'src/styles/global.css'),'utf8'),
    readFile(path.join(data,'render-calibration.json'),'utf8'),
  ]);
  const {cssSource,calibration}=assembleCssSource(authoredCss,renderCalibrationRaw);
  const {externalCss,assetName}=deriveCssDelivery(cssSource);
  if(!externalCss.includes('/*DIST_CHUNK_INTRINSIC_START*/')||!externalCss.includes('/*DIST_CHUNK_INTRINSIC_END*/')||!externalCss.includes(`/*DIST_CHUNK_CALIBRATION_SHA256:${calibration.sha256}*/`))throw new Error('External CSS lost assembled render calibration');

  await mkdir(generatedAssets,{recursive:true});
  for(const name of await readdir(generatedAssets)){
    if(/^site\.[0-9a-f]{12}\.css$/.test(name)&&name!==assetName)await unlink(path.join(generatedAssets,name));
  }
  await writeFile(path.join(generatedAssets,assetName),externalCss);
  return {home:publicProjection.content,corpusHome:assembled.content,publicProjection:publicProjection.stats,externalCssAssetName:assetName,calibration};
}
