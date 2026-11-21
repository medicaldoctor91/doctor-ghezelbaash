import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SOURCE} from '../src/canonical/source.mjs';
import {durationSeconds,enforceVideoKeyMomentEligibility} from '../src/lib/video-key-moments.mjs';

const root='https://www.ghezelbaash.ir';
const refs=v=>v==null?[]:Array.isArray(v)?v:[v];
const idOf=v=>typeof v==='string'?v:v?.['@id'];
const nodes=SOURCE.graph['@graph'];
const byId=new Map(nodes.map(n=>[n['@id'],n]));
const videos=nodes.filter(n=>refs(n['@type']).includes('VideoObject'));
const shortId=root+'/video-kurdish-patient-experience';

test('Google key moments are never generated for a video shorter than 30 seconds',()=>{
  assert.equal(videos.length,4);
  const short=byId.get(shortId);
  assert.equal(short.duration,'PT20S','preserve the real published duration');
  assert.ok(!short.hasPart,'20-second video must not claim Google key moments');
  for(const i of [1,2,3])
    assert.ok(!byId.has(shortId+'-clip-'+String(i).padStart(2,'0')),
      'remove only invalid structured Clip nodes');
  const allowed=videos.filter(v=>v['@id']!==shortId);
  assert.deepEqual(allowed.map(v=>durationSeconds(v.duration)).sort((a,b)=>a-b),[36,39,62]);
  assert.deepEqual(allowed.map(v=>refs(v.hasPart).length).sort((a,b)=>a-b),[4,4,5]);
  for(const video of allowed) {
    const sec=durationSeconds(video.duration);
    for(const child of refs(video.hasPart)) {
      const clip=byId.get(idOf(child));
      assert.ok(clip && refs(clip['@type']).includes('Clip'));
      assert.equal(idOf(clip.isPartOf),video['@id']);
      assert.ok(clip.startOffset>=0 && clip.startOffset<sec);
      assert.ok(clip.endOffset>clip.startOffset && clip.endOffset<=sec);
    }
  }
  assert.equal(enforceVideoKeyMomentEligibility(structuredClone(nodes)).removedClipIds.length,0);
});

test('short video remains a real discoverable, playable watch page',()=>{
  const short=byId.get(shortId);
  const page=root+'/video-saeed-ghezelbash-kurdish-patient-review';
  assert.equal(short.url,page);
  assert.match(short.contentUrl,/\.mp4$/);
  assert.match(short.thumbnailUrl,/\.webp$/);
  assert.equal(short.mainEntityOfPage['@id'],page+'#webpage');
  const html=readFileSync(new URL('../dist/video-saeed-ghezelbash-kurdish-patient-review.html',import.meta.url),'utf8');
  assert.match(html,/<video\b/);
  assert.match(html,/saeed-ghezelbash-kurdish-patient-review\.webm/);
  assert.match(html,/saeed-ghezelbash-kurdish-patient-review\.mp4/);
  assert.match(html,/video-chapters/,'keep human-visible time navigation');
  assert.match(html,/saeed-ghezelbash-kurdish-patient-review\.chapters\.fa\.vtt/);
  const sitemap=readFileSync(new URL('../dist/sitemap.xml',import.meta.url),'utf8');
  assert.equal((sitemap.match(/<video:video>/g)||[]).length,4);
  assert.match(sitemap,/video-saeed-ghezelbash-kurdish-patient-review/);
});

test('sub-30s schema removal is exact and fail-closed for cross-references',()=>{
  const vid=root+'/tmp-video',clip=vid+'-clip';
  const base=[{'@id':vid,'@type':'VideoObject',duration:'PT23S',hasPart:[{'@id':clip}]},
    {'@id':clip,'@type':'Clip',isPartOf:{'@id':vid},startOffset:0,endOffset:12}];
  let g=structuredClone(base);
  assert.deepEqual(enforceVideoKeyMomentEligibility(g),
    {affectedVideos:[vid],removedClipIds:[clip]});
  assert.equal(g.length,1);
  assert.ok(!g[0].hasPart);
  assert.equal(enforceVideoKeyMomentEligibility(g).removedClipIds.length,0);
  g=[...structuredClone(base),{'@id':root+'/dependent','@type':'CreativeWork',about:{'@id':clip}}];
  assert.throws(()=>enforceVideoKeyMomentEligibility(g),/foreign reference/);
  assert.equal(g.length,3);
  assert.deepEqual(durationSeconds('PT20S'),20);
  assert.deepEqual(durationSeconds('PT1M2S'),62);
  assert.equal(durationSeconds('invalid'),null);
});

test('physician service and Offer graph upgrades remain intact',()=>{
  assert.equal(nodes.filter(n=>refs(n['@type']).includes('Service')).length,124);
  assert.equal(nodes.filter(n=>refs(n['@type']).includes('Offer')).length,124);
  assert.equal(nodes.filter(n=>refs(n['@type']).includes('Offer') && n.url).length,10);
  assert.ok(nodes.filter(n=>refs(n['@type']).includes('Service') && refs(n.subjectOf).length).length>=29);
});
