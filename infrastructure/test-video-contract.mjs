import {SOURCE as canonicalSource} from '../src/canonical/source.mjs';
import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const s=canonicalSource,by=new Map(s.graph['@graph'].map(n=>[n['@id'],n])),person=s.canonicalOrigin+'/#saeed-ghezelbash';
for(const watch of s.discovery.sitemapPolicy.videoWatchPages){
 const video=by.get(watch.videoId);assert.equal(video.creator?.['@id'],person);assert.equal(video.publisher?.['@id'],person);assert.equal(video.mainEntityOfPage?.['@id'],s.canonicalOrigin+watch.path+'#webpage');
 assert.match(video.uploadDate?.['@value']??video.uploadDate,/^\d{4}-\d{2}-\d{2}/);assert.match(video.duration,/^PT/);
 for(const url of [video.contentUrl,...[video.thumbnailUrl].flat()]){assert.equal(new URL(url).origin,s.canonicalOrigin);await fs.access(new URL('../public'+new URL(url).pathname,import.meta.url));}
 for(const ref of [video.hasPart].flat()) {const clip=by.get(ref['@id']);assert(clip.startOffset>=0&&(clip.endOffset===undefined||clip.endOffset>clip.startOffset));const url=new URL(clip.url);assert.equal(url.pathname,watch.path);assert.equal(Number(url.searchParams.get('t')),clip.startOffset,'Clip URL must address its timestamp');assert(url.searchParams.has('t'),'Timestamp-specific Clip URL');}
}
console.log('Four canonical VideoObjects, assets and timestamp-specific Clips PASS');
