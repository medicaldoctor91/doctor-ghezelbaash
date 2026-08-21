import path from 'node:path';
import {readFile,rename,rm,writeFile} from 'node:fs/promises';
import {renderCalibrationCss} from '../src/lib/css-source.mjs';

const root=process.cwd();
const canonicalPath=path.join(root,'src/data/render-calibration.json');
const inputPath=path.resolve(root,process.argv[2]||canonicalPath);
const data=JSON.parse(await readFile(inputPath,'utf8'));
const canonicalRaw=`${JSON.stringify(data,null,2)}\n`;
const calibration=renderCalibrationCss(canonicalRaw);
const temporaryPath=`${canonicalPath}.tmp-${process.pid}`;
try{
  await writeFile(temporaryPath,canonicalRaw);
  await rename(temporaryPath,canonicalPath);
}finally{
  await rm(temporaryPath,{force:true});
}
console.log(JSON.stringify({applied:true,input:path.relative(root,inputPath),widths:calibration.widths,chunks:calibration.chunkCount,sha256:calibration.sha256,cssRules:calibration.ruleCount,cssMutation:false,cssAssembly:'in-memory'},null,2));
