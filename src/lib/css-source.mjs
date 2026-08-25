import {createHash} from 'node:crypto';
import {applyHeroSearchPresentationCss} from './hero-search-presentation.mjs';
import {applyHeroSubtitlePresentationCss} from './hero-subtitle-presentation.mjs';
import {applyMediaPresentationCss} from './media-presentation.mjs';
import {applySitePresentationCss} from './site-presentation.mjs';

export const CSS_SPLIT_MARKER='/*DIST_CRITICAL_CSS_END*/';
export const RENDER_CALIBRATION_SLOT='/*DIST_CHUNK_INTRINSIC_SLOT*/';
export const RENDER_CALIBRATION_START='/*DIST_CHUNK_INTRINSIC_START*/';
export const RENDER_CALIBRATION_END='/*DIST_CHUNK_INTRINSIC_END*/';
export const RENDER_CALIBRATION_WIDTHS=Object.freeze([360,390,430,768,1024,1440]);

const fail=message=>{throw new Error(message)};
const finite=value=>Number.isFinite(Number(value))?Number(value):fail(`Non-finite calibration value: ${value}`);
const format=value=>String(Number(finite(value).toFixed(2)));
const count=(source,needle)=>String(source).split(needle).length-1;

export function renderCalibrationCss(calibrationRaw){
  const raw=String(calibrationRaw);
  let data;
  try{data=JSON.parse(raw)}catch(error){throw new Error(`Invalid render calibration JSON: ${error.message}`)}
  if(!data||typeof data!=='object'||Array.isArray(data))fail('Render calibration must be an object');
  const baseline=data['360'];
  if(!baseline||!Array.isArray(baseline.chunks)||!baseline.chunks.length)fail('360px calibration baseline missing');
  const chunkCount=baseline.chunks.length;
  const identity=baseline.chunks.map(({i,id,key},index)=>{
    if(!Number.isInteger(i)||i!==index||typeof id!=='string'||!/^[A-Za-z][\w:-]*$/.test(id)||typeof key!=='string'||!key)fail(`Invalid calibration identity at 360:${index}`);
    return {i,id,key};
  });
  if(new Set(identity.map(item=>item.id)).size!==chunkCount)fail('Duplicate render calibration chunk ID');
  for(const width of RENDER_CALIBRATION_WIDTHS){
    const entry=data[String(width)];
    if(!entry||!Array.isArray(entry.chunks)||entry.chunks.length!==chunkCount)fail(`Calibration width/chunk drift ${width}: expected ${chunkCount}`);
    if(!Number.isInteger(entry.total)||entry.total<100000)fail(`Calibration document height invalid ${width}`);
    for(let index=0;index<chunkCount;index++){
      const current=entry.chunks[index],expected=identity[index];
      if(current.i!==expected.i||current.id!==expected.id||current.key!==expected.key||finite(current.h)<100)fail(`Calibration identity/height drift ${width}:${index}`);
    }
  }
  const rulesFor=(values,render)=>values.map((chunk,index)=>`#${chunk.id}{--cis:${render(chunk,index)}}`).join('');
  const media=[];
  media.push(`@media(max-width:360px){${rulesFor(data['360'].chunks,chunk=>`${format(chunk.h)}px`)}}`);
  for(let index=0;index<RENDER_CALIBRATION_WIDTHS.length-1;index++){
    const fromWidth=RENDER_CALIBRATION_WIDTHS[index],toWidth=RENDER_CALIBRATION_WIDTHS[index+1],from=data[String(fromWidth)].chunks,to=data[String(toWidth)].chunks;
    const rules=rulesFor(from,(chunk,chunkIndex)=>{
      const slope=(finite(to[chunkIndex].h)-finite(chunk.h))/(toWidth-fromWidth),coefficient=slope*100,intercept=finite(chunk.h)-slope*fromWidth;
      return `calc(${format(intercept)}px ${coefficient<0?'-':'+'} ${format(Math.abs(coefficient))}vw)`;
    });
    media.push(`@media(min-width:${format(fromWidth+0.01)}px) and (max-width:${toWidth}px){${rules}}`);
  }
  media.push(`@media(min-width:1440.01px){${rulesFor(data['1440'].chunks,chunk=>`${format(chunk.h)}px`)}}`);
  const sha256=createHash('sha256').update(Buffer.from(raw)).digest('hex');
  const css=`/*DIST_CHUNK_CALIBRATION_SHA256:${sha256}*/${RENDER_CALIBRATION_START}${media.join('')}${RENDER_CALIBRATION_END}`;
  const ruleCount=chunkCount*(RENDER_CALIBRATION_WIDTHS.length+1);
  if((css.match(/#[A-Za-z][\w:-]*\{--cis:/g)||[]).length!==ruleCount)fail('Generated render calibration rule count drift');
  return {css,sha256,widths:[...RENDER_CALIBRATION_WIDTHS],chunkCount,ruleCount,data};
}

export function assembleCssSource(authoredCss,calibrationRaw){
  let source=applyMediaPresentationCss(String(authoredCss),{splitMarker:CSS_SPLIT_MARKER});
  source=applyHeroSearchPresentationCss(source);
  source=applyHeroSubtitlePresentationCss(source);
  source=applySitePresentationCss(source);
  if(count(source,RENDER_CALIBRATION_SLOT)!==1)fail('Authored CSS must contain exactly one render calibration slot');
  if(source.includes('DIST_CHUNK_CALIBRATION_SHA256:')||source.includes(RENDER_CALIBRATION_START)||source.includes(RENDER_CALIBRATION_END))fail('Materialized render calibration CSS must not be stored in authored CSS');
  const splitAt=source.indexOf(CSS_SPLIT_MARKER),slotAt=source.indexOf(RENDER_CALIBRATION_SLOT);
  if(count(source,CSS_SPLIT_MARKER)!==1)fail('Authored CSS must contain exactly one critical CSS split marker');
  if(slotAt<=splitAt)fail('Render calibration slot must remain in deferred CSS');
  const calibration=renderCalibrationCss(calibrationRaw);
  const cssSource=source.replace(RENDER_CALIBRATION_SLOT,calibration.css);
  if(cssSource.includes(RENDER_CALIBRATION_SLOT)||count(cssSource,RENDER_CALIBRATION_START)!==1||count(cssSource,RENDER_CALIBRATION_END)!==1||count(cssSource,`/*DIST_CHUNK_CALIBRATION_SHA256:${calibration.sha256}*/`)!==1)fail('Render calibration CSS assembly drift');
  return {cssSource,calibration};
}
