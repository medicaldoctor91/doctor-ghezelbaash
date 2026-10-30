import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SOURCE} from '../src/canonical/source.mjs';
import {projectBoundedSearchDocument,projectHomeSearchGraph} from '../src/lib/search-contract.mjs';

const origin=SOURCE.canonicalOrigin;
const byId=document=>new Map(document['@graph'].map(node=>[node['@id'],node]));

test('ProfilePage omits date-only Google DateTime fields without changing the canonical date',()=>{
  const before=structuredClone(SOURCE.graph);
  const page=byId(projectHomeSearchGraph(SOURCE.graph,origin)).get(origin+'/webpage');
  assert.equal(page.dateModified,undefined);
  assert.deepEqual(SOURCE.graph,before);
  assert.equal(byId(SOURCE.graph).get(origin+'/webpage').dateModified['@value'],'2026-10-10');
});

test('ProfilePage retains an actually recorded timestamp and its timezone',()=>{
  const graph=structuredClone(SOURCE.graph);
  const recorded='2026-10-10T14:23:00+03:30';
  byId(graph).get(origin+'/webpage').dateModified={'@value':recorded,'@type':'http://www.w3.org/2001/XMLSchema#dateTime'};
  assert.equal(byId(projectHomeSearchGraph(graph,origin)).get(origin+'/webpage').dateModified,recorded);
});

function videoFixture({duration='PT20S',explicitEnd,missingParent=false,last=true}={}) {
  const pageId=origin+'/watch#webpage',videoId=origin+'/test-video',clipId=origin+'/test-clip';
  const clip={'@id':clipId,'@type':'Clip',name:'Final chapter',startOffset:16,url:origin+'/watch?t=16',
    isPartOf:{'@id':missingParent?origin+'/unknown':videoId},...(explicitEnd==null?{}:{endOffset:explicitEnd})};
  const video={'@id':videoId,'@type':'VideoObject',name:'Video',duration,hasPart:[{'@id':clipId},...(last?[]:[{'@id':origin+'/next-clip'}])]};
  const graph={'@context':'https://schema.org','@graph':[
    {'@id':pageId,'@type':'WebPage',url:origin+'/watch',name:'Watch',mainEntity:{'@id':videoId}},video,clip,
    ...(last?[]:[{'@id':origin+'/next-clip','@type':'Clip',name:'Next chapter',startOffset:19,endOffset:20,url:origin+'/watch?t=19'}]),
  ]};
  return {graph,clipId,project:()=>byId(projectBoundedSearchDocument(graph,{graph,primaryPageId:pageId,visibleMediaIds:[videoId]})).get(clipId)};
}

test('final Clip receives its declared video end and preserves its source representation',()=>{
  const fixture=videoFixture(),before=structuredClone(fixture.graph);
  assert.equal(fixture.project().endOffset,20);
  assert.deepEqual(fixture.graph,before);
});

test('a declared end is retained and unknown or intermediate ends are not guessed',()=>{
  assert.equal(videoFixture({explicitEnd:19}).project().endOffset,19);
  for(const options of [{missingParent:true},{duration:''},{duration:'unknown'},{duration:'PT'},{duration:'PT15S'},{last:false}]) {
    const fixture=videoFixture(options);
    assert.equal(fixture.project().endOffset,undefined,JSON.stringify(options));
  }
  assert.equal(videoFixture({duration:'PT20.162S'}).project().endOffset,20.162);
});

test('the actual Kurdish final chapter has a known valid end in the Google projection',()=>{
  const nodes=byId(SOURCE.graph),videoId=origin+'/video-kurdish-patient-experience',clipId=origin+'/video-kurdish-patient-experience-clip-03';
  const video=nodes.get(videoId),clip=nodes.get(clipId);
  assert.equal(video.duration,'PT20S');
  assert.equal(clip.endOffset,undefined);
  const vtt=readFileSync(new URL('../public/media/video-tracks/testimonials/saeed-ghezelbash-kurdish-patient-review.chapters.fa.vtt',import.meta.url),'utf8');
  assert.match(vtt,/00:00:16\.000 --> 00:00:20\.162/);
  const pageId=origin+'/video-saeed-ghezelbash-kurdish-patient-review#webpage';
  const graph=structuredClone(SOURCE.graph);
  const projected=projectBoundedSearchDocument(graph,{graph,primaryPageId:pageId,visibleMediaIds:[videoId]});
  assert.equal(byId(projected).get(clipId).endOffset,20);
  assert.ok(byId(projected).get(clipId).endOffset>clip.startOffset);
});
