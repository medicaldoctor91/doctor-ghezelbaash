import {SOURCE as canonicalSource, AUTHORED_BODY} from '../src/canonical/source.mjs';
import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import path from 'node:path';
import {parseFragment} from 'parse5';
const s=canonicalSource,by=new Map(s.graph['@graph'].map(n=>[n['@id'],n])),person=s.canonicalOrigin+'/#saeed-ghezelbash';
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
 for(const ref of [video.hasPart].flat()) {const clip=by.get(ref['@id']);assert(clip.startOffset>=0&&(clip.endOffset===undefined||clip.endOffset>clip.startOffset));const url=new URL(clip.url);assert.equal(url.pathname,watch.path);assert.equal(Number(url.searchParams.get('t')),clip.startOffset,'Clip URL must address its timestamp');assert(url.searchParams.has('t'),'Timestamp-specific Clip URL');}
 await verifyVisibleChapters(AUTHORED_BODY,watch,video,'Authored Home');
 if(process.argv[2]){
  const dist=path.resolve(process.argv[2]);
  await verifyVisibleChapters(await fs.readFile(path.join(dist,'index.html'),'utf8'),watch,video,'Final Home');
  await verifyVisibleChapters(await fs.readFile(path.join(dist,watch.path.slice(1)+'.html'),'utf8'),watch,video,'Final watch');
 }
}
console.log('Four canonical VideoObjects, assets, timestamp-specific Clips and visible chapter URL consistency PASS');
