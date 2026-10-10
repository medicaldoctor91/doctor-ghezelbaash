import {SOURCE as canonicalSource, AUTHORED_BODY} from '../src/canonical/source.mjs';
import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import path from 'node:path';
import {parseFragment} from 'parse5';
const s=canonicalSource,by=new Map(s.graph['@graph'].map(n=>[n['@id'],n])),person=s.canonicalOrigin+'/#saeed-ghezelbash';
const normalize=value=>value.replace(/\s+/g,' ').trim();
const elements=root=>{const out=[];const visit=node=>{out.push(node);for(const child of node.childNodes??[])visit(child);};visit(root);return out;};
const attr=(node,name)=>node?.attrs?.find(item=>item.name===name)?.value;
const text=node=>node.nodeName==='#text'?node.value:(node.childNodes??[]).map(text).join('');
const seconds=stamp=>stamp.split(':').reduce((sum,value)=>sum*60+Number(value),0);
const transcriptIds=new Set(s.discovery.sitemapPolicy.videoWatchPages.filter(watch=>by.get(watch.videoId).caption).map(watch=>watch.path.slice(1)));
const children=node=>(node.childNodes??[]).filter(child=>child.nodeName!=='#text'||child.value.trim());
function assertTranscriptStructure(nodes,label){
 const seen=new Set();
 const structure=(node,tags)=>{const list=children(node);assert.deepEqual(list.map(child=>child.tagName),tags,label+' transcript structure');return list;};
 const plain=node=>assert((node.childNodes??[]).every(child=>child.nodeName==='#text'),label+' transcript contains only the permitted text');
 for(const node of nodes.filter(node=>attr(node,'data-video-transcript')!==undefined)){
  const id=attr(node,'data-video-transcript');
  assert.equal(node.tagName,'details',label+' transcript disclosure');
  assert(transcriptIds.has(id),label+' registered transcript marker');assert(!seen.has(id),label+' unique transcript marker');seen.add(id);
  const [summary,list]=structure(node,['summary','ol']);plain(summary);
  assert.equal(text(summary),'متن گفتار ویدئو؛ رفتن به زمان هر جمله',label+' transcript summary has no added clinical claims');
  for(const item of children(list)){
   assert.equal(item.tagName,'li',label+' transcript list contains only cue rows');
   const [link]=structure(item,['a']),[time,words]=structure(link,['time','span']);plain(time);plain(words);
  }
 }
}
function cues(vtt){
 assert(vtt.startsWith('WEBVTT'),'Native WebVTT signature');
 return vtt.trim().split(/\r?\n\r?\n/).slice(1).map(block=>{
  const lines=block.split(/\r?\n/),index=lines.findIndex(line=>line.includes(' --> '));
  assert(index>=0,'Every caption has native timing');const [start,end]=lines[index].split(' --> ').map(seconds);
  assert(start>=0&&end>start,'Nonempty caption interval');return {start,end,text:normalize(lines.slice(index+1).join(' '))};
 });
}
async function verifyCaptions(html,watch,video,label){
 const nodes=elements(parseFragment(html)),player=nodes.find(node=>node.tagName==='video'&&attr(node,'id')===watch.path.slice(1));
 assertTranscriptStructure(nodes,label);
 const tracks=elements(player).filter(node=>node.tagName==='track'&&['captions','subtitles'].includes(attr(node,'kind')));
 const declared=[video.caption??[]].flat();
 assert.deepEqual(tracks.map(node=>new URL(attr(node,'src'),s.canonicalOrigin).href),declared,label+' caption discovery agrees with visible native tracks');
 if(!declared.length)return;
 const original=tracks.find(node=>attr(node,'kind')==='captions');assert(original,label+' original-language speech captions');
 assert.notEqual(attr(original,'default'),undefined,label+' original speech captions are enabled by default');
 const originalCues=cues(await fs.readFile(new URL('../public'+new URL(attr(original,'src'),s.canonicalOrigin).pathname,import.meta.url),'utf8'));
 assert.equal(normalize(originalCues.map(cue=>cue.text).join(' ')),normalize(video.transcript),label+' machine transcript agrees with speech captions');
 const transcript=nodes.find(node=>attr(node,'data-video-transcript')===watch.path.slice(1));assert(transcript,label+' readable speech transcript');
 const links=elements(transcript).filter(node=>node.tagName==='a');assert.equal(links.length,originalCues.length,label+' complete timed speech transcript');
 for(let index=0;index<originalCues.length;index++){
  const cue=originalCues[index],link=links[index],url=new URL(attr(link,'href'),s.canonicalOrigin);
  assert.equal(url.pathname,watch.path,label+' transcript stays on its watch page');assert.equal(Number(url.searchParams.get('t')),cue.start,label+' transcript starts at exact speech time');
  assert.equal(Number(attr(link,'data-transcript-end')),cue.end,label+' speech highlight ends at caption boundary');
  const time=link.childNodes.find(node=>node.tagName==='time'),clock=[Math.floor(cue.start/3600),Math.floor(cue.start/60)%60,Math.floor(cue.start)%60].map(value=>String(value).padStart(2,'0')).join(':');
  assert.equal(attr(time,'datetime'),`PT${cue.start}S`,label+' speech timestamp is exact');assert.equal(text(time),clock,label+' speech clock cannot hide additional prose');
  assert.equal(normalize(text(link.childNodes.find(node=>node.tagName==='span'))),cue.text,label+' readable transcript preserves the original words');
  if(index)assert(cue.start>=originalCues[index-1].end,label+' captions do not overlap');
 }
 for(const translation of tracks.filter(node=>attr(node,'kind')==='subtitles')){
  const translated=cues(await fs.readFile(new URL('../public'+new URL(attr(translation,'src'),s.canonicalOrigin).pathname,import.meta.url),'utf8'));
  assert.deepEqual(translated.map(({start,end})=>[start,end]),originalCues.map(({start,end})=>[start,end]),label+' translated subtitles retain exact native timing');
 }
}
function chapterLinks(html, id){
 const nodes=[];
 function visit(node){nodes.push(node);for(const child of node.childNodes??[])visit(child);}
 visit(parseFragment(html));
 const chapters=nodes.find(node=>node.attrs?.some(attr=>attr.name==='id'&&attr.value===id));
 assert(chapters,'Visible chapter list '+id);
 const links=[];
 function collect(node){
  if(node.tagName==='a')links.push(node.attrs.find(attr=>attr.name==='href')?.value);
  for(const child of node.childNodes??[])collect(child);
 }
 collect(chapters);return links;
}
async function verifyVisibleChapters(html, watch, video, label){
 const actual=chapterLinks(html,watch.path.slice(1)+'-chapters').map(href=>new URL(href,s.canonicalOrigin).href);
 const expected=[video.hasPart].flat().map(ref=>by.get(ref['@id']).url);
 assert.deepEqual(actual,expected,label+' visible chapter URLs agree with their canonical Clip URLs '+watch.path);
}
for(const watch of s.discovery.sitemapPolicy.videoWatchPages){
 const video=by.get(watch.videoId);assert.equal(video.creator?.['@id'],person);assert.equal(video.publisher?.['@id'],person);assert.equal(video.mainEntityOfPage?.['@id'],s.canonicalOrigin+watch.path+'#webpage');
 assert.match(video.uploadDate?.['@value']??video.uploadDate,/^\d{4}-\d{2}-\d{2}/);assert.match(video.duration,/^PT/);
 for(const url of [video.contentUrl,...[video.thumbnailUrl].flat()]){assert.equal(new URL(url).origin,s.canonicalOrigin);await fs.access(new URL('../public'+new URL(url).pathname,import.meta.url));}
 for(const ref of [video.encoding].flat()){
  const encoding=by.get(ref['@id']),bytes=await fs.readFile(new URL('../public'+new URL(encoding.contentUrl).pathname,import.meta.url));
  assert.equal(encoding.contentSize,bytes.length+' bytes','Media metadata describes actual delivered encoding size');
  assert.match(encoding.bitrate,/^\d+ bit\/s$/,'Measured encoding bitrate');
 }
 for(const ref of [video.hasPart].flat()) {const clip=by.get(ref['@id']);assert(clip.startOffset>=0&&(clip.endOffset===undefined||clip.endOffset>clip.startOffset));const url=new URL(clip.url);assert.equal(url.pathname,watch.path);assert.equal(Number(url.searchParams.get('t')),clip.startOffset,'Clip URL must address its timestamp');assert(url.searchParams.has('t'),'Timestamp-specific Clip URL');}
 await verifyVisibleChapters(AUTHORED_BODY,watch,video,'Authored Home');
 await verifyCaptions(AUTHORED_BODY,watch,video,'Authored Home');
 if(process.argv[2]){
  const dist=path.resolve(process.argv[2]);
  await verifyVisibleChapters(await fs.readFile(path.join(dist,'index.html'),'utf8'),watch,video,'Final Home');
  await verifyVisibleChapters(await fs.readFile(path.join(dist,watch.path.slice(1)+'.html'),'utf8'),watch,video,'Final watch');
  await verifyCaptions(await fs.readFile(path.join(dist,'index.html'),'utf8'),watch,video,'Final Home');
  await verifyCaptions(await fs.readFile(path.join(dist,watch.path.slice(1)+'.html'),'utf8'),watch,video,'Final watch');
 }
}
const transcriptExample=AUTHORED_BODY.match(/<details\b[^>]*data-video-transcript[^>]*>[\s\S]*?<\/details>/)?.[0];assert(transcriptExample);
assertTranscriptStructure(elements(parseFragment(transcriptExample)),'Original transcript');
assert.throws(()=>assertTranscriptStructure(elements(parseFragment(transcriptExample.replace('</details>','<p>توصیهٔ پزشکی اضافه</p></details>'))),'Injected clinical paragraph'),/transcript structure/);
assert.throws(()=>assertTranscriptStructure(elements(parseFragment('<details data-video-transcript="unregistered"></details>')),'Unknown transcript'),/registered transcript marker/);
assert.throws(()=>assertTranscriptStructure(elements(parseFragment(transcriptExample+transcriptExample)),'Duplicate transcript'),/unique transcript marker/);
console.log('Four canonical VideoObjects, assets, timestamp-specific Clips and visible chapter URL consistency PASS');
