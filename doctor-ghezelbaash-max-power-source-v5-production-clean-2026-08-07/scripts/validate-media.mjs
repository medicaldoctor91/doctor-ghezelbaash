import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
const root=path.join(process.cwd(),'public/media'),stale=['ChIJBT','OYDOTt-j8RD-7mAPy6Zas'].join(''),current='ChIJBT0YDOTt-j8RD-7mAPy6Zas';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function walk(d){let o=[];for(const e of await readdir(d,{withFileTypes:true})){const p=path.join(d,e.name);e.isDirectory()?o.push(...await walk(p)):o.push(p)}return o}
const all=await walk(root);let currentHits=0,selfReferencedSvg=0;
for(const f of all){
  const b=await readFile(f);
  if(b.includes(Buffer.from(stale)))throw new Error(`Stale Place ID metadata ${f}`);
  if(b.includes(Buffer.from(current)))currentHits++;
  const m=path.basename(f).match(/\.([0-9a-f]{12})\.[^.]+$/);if(!m)throw new Error(`Unfingerprinted media ${f}`);
  const selfSvg=f.endsWith('.svg')&&b.includes(Buffer.from(path.basename(f)));
  if(selfSvg){
    selfReferencedSvg++;
    const expected=`https://www.ghezelbaash.ir/media/brand/${path.basename(f)}`;
    if(!b.includes(Buffer.from(expected)))throw new Error(`Self-referential SVG canonical URL mismatch ${f}`);
  } else if(sha(b).slice(0,12)!==m[1]) throw new Error(`Fingerprint mismatch ${f}`);
}
const probe=spawnSync('ffprobe',['-version']);
let videoFiles=0,imageFiles=0;
if(probe.status===0){
  for(const f of all.filter(x=>/\.(mp4|webm)$/i.test(x))){
    videoFiles++;
    const p=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name:format_tags','-of','json',f],{encoding:'utf8'});if(p.status)throw new Error(`ffprobe failed ${f}`);
    const j=JSON.parse(p.stdout),s=j.streams||[];
    if(s.filter(x=>x.codec_type==='video').length!==1||s.filter(x=>x.codec_type==='audio').length!==1||s.some(x=>!['video','audio'].includes(x.codec_type)))throw new Error(`Unexpected streams ${f}`);
  }
  for(const f of all.filter(x=>/\.(?:avif|webp|jpe?g|png)$/i.test(x))){
    imageFiles++;
    const p=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=codec_type,codec_name,width,height','-of','json',f],{encoding:'utf8'});if(p.status)throw new Error(`Image decode/probe failed ${f}`);
    const s=(JSON.parse(p.stdout).streams||[])[0];if(!s||s.codec_type!=='video'||!s.width||!s.height)throw new Error(`Invalid image stream ${f}`);
  }
}
if(currentHits<20)throw new Error(`Entity Place ID metadata unexpectedly sparse: ${currentHits}`);
console.log(JSON.stringify({valid:true,mediaFiles:all.length,videoFiles,imageFiles,currentPlaceIdMetadataFiles:currentHits,metadataPreserved:true,selfReferencedSvgIntegrityChecks:selfReferencedSvg},null,2));
