import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';

const root=process.cwd();
const canonicalPath=path.join(root,'src/data/render-calibration.json');
const inputPath=path.resolve(root,process.argv[2]||canonicalPath);
const cssPath=path.join(root,'src/styles/global.css');
const widths=[360,390,430,768,1024,1440];
const expectedChunks=134;
const data=JSON.parse(await readFile(inputPath,'utf8'));
const fail=message=>{throw new Error(message)};
const number=value=>Number.isFinite(Number(value))?Number(value):fail(`Non-finite calibration value: ${value}`);
const format=value=>String(Number(number(value).toFixed(2)));

for(const width of widths){
  const entry=data[String(width)];
  if(!entry||!Array.isArray(entry.chunks)||entry.chunks.length!==expectedChunks)fail(`Calibration width/chunk drift ${width}`);
  if(!Number.isInteger(entry.total)||entry.total<100000)fail(`Calibration document height invalid ${width}`);
}
const identity=data['360'].chunks.map(({i,id,key})=>({i,id,key}));
for(const width of widths)for(let i=0;i<expectedChunks;i++){
  const current=data[String(width)].chunks[i],expected=identity[i];
  if(current.i!==expected.i||current.id!==expected.id||current.key!==expected.key||number(current.h)<100)fail(`Calibration identity/height drift ${width}:${i}`);
}

const rulesFor=(values,render)=>values.map((chunk,index)=>`#${chunk.id}{--cis:${render(chunk,index)}}`).join('');
const media=[];
media.push(`@media(max-width:360px){${rulesFor(data['360'].chunks,chunk=>`${format(chunk.h)}px`)}}`);
for(let w=0;w<widths.length-1;w++){
  const fromWidth=widths[w],toWidth=widths[w+1],from=data[String(fromWidth)].chunks,to=data[String(toWidth)].chunks;
  const rules=rulesFor(from,(chunk,index)=>{
    const slope=(number(to[index].h)-number(chunk.h))/(toWidth-fromWidth),coefficient=slope*100,intercept=number(chunk.h)-slope*fromWidth;
    return `calc(${format(intercept)}px ${coefficient<0?'-':'+'} ${format(Math.abs(coefficient))}vw)`;
  });
  media.push(`@media(min-width:${format(fromWidth+0.01)}px) and (max-width:${toWidth}px){${rules}}`);
}
media.push(`@media(min-width:1440.01px){${rulesFor(data['1440'].chunks,chunk=>`${format(chunk.h)}px`)}}`);

const canonicalBytes=Buffer.from(`${JSON.stringify(data,null,2)}\n`),sha=createHash('sha256').update(canonicalBytes).digest('hex');
const block=`/*DIST_CHUNK_CALIBRATION_SHA256:${sha}*//*DIST_CHUNK_INTRINSIC_START*/${media.join('')}/*DIST_CHUNK_INTRINSIC_END*/`;
const css=await readFile(cssPath,'utf8'),pattern=/\/\*DIST_CHUNK_CALIBRATION_SHA256:[0-9a-f]{64}\*\/\/\*DIST_CHUNK_INTRINSIC_START\*\/[\s\S]*?\/\*DIST_CHUNK_INTRINSIC_END\*\//;
if(!pattern.test(css))fail('Render calibration CSS boundary missing');
const nextCss=css.replace(pattern,block);
if((nextCss.match(/#rc\d+\{--cis:/g)||[]).length!==expectedChunks*7)fail('Generated render calibration rule count drift');
await Promise.all([writeFile(canonicalPath,canonicalBytes),writeFile(cssPath,nextCss)]);
console.log(JSON.stringify({applied:true,input:path.relative(root,inputPath),widths,chunks:expectedChunks,sha256:sha,cssRules:expectedChunks*7},null,2));
