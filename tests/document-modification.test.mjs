import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE} from '../src/canonical/source.mjs';
import {latestRecordedModification,projectBoundedSearchDocument,projectHomeSearchGraph} from '../src/lib/search-contract.mjs';

const byId=document=>new Map(document['@graph'].map(node=>[node['@id'],node]));
const dateTime=value=>({'@value':value,'@type':'http://www.w3.org/2001/XMLSchema#dateTime'});

test('latest modification compares actual instants and retains recorded calendar precision and timezone',()=>{
  assert.equal(latestRecordedModification('2026-11-03T21:36:49Z','2026-10-30T04:17:44Z'),'2026-11-03T21:36:49Z');
  assert.equal(latestRecordedModification('2026-11-03T22:00:00+03:30','2026-11-03T20:00:00Z'),'2026-11-03T20:00:00Z');
  assert.equal(latestRecordedModification(dateTime('2026-11-03T23:45:00+03:30'),'2026-11-03T20:00:00Z'),'2026-11-03T23:45:00+03:30');
  assert.equal(latestRecordedModification('2026-11-04','2026-11-03T20:00:00Z'),'2026-11-04','a calendar date never gains an invented midnight');
  assert.equal(latestRecordedModification('2026-11-03','2026-11-03T20:00:00Z'),'2026-11-03T20:00:00Z');
  assert.equal(latestRecordedModification(undefined,'2026-11-03T20:00:00Z'),'2026-11-03T20:00:00Z');
  for(const value of ['2026-02-30','2026-02-30T12:00:00Z','2026-11-03T12:00:00','not a date'])
    assert.throws(()=>latestRecordedModification(value,'2026-11-03T20:00:00Z'),/recorded timestamp with timezone/);
});

test('a later document edit updates Article without changing publication, clinical review or the shared markup timestamp',()=>{
  const origin='https://example.test',url=origin+'/treatment',pageId=url+'#webpage',personId=origin+'/#saeed-ghezelbash';
  const contentModifiedAt='2026-11-03T21:36:49Z',markupModifiedAt='2026-10-30T04:17:44Z';
  const graph={'@context':'https://schema.org','@graph':[
    {'@id':pageId,'@type':'MedicalWebPage',url,name:'Treatment guide',author:{'@id':personId},
      mainEntity:{'@id':url},dateModified:dateTime(contentModifiedAt),datePublished:'2026-07-25',lastReviewed:'2026-10-04'},
    {'@id':url,'@type':'WebPageElement',name:'Treatment guide'},
    {'@id':personId,'@type':'Person',name:'Physician'},
  ]},before=structuredClone(graph);
  const actual=byId(projectBoundedSearchDocument(graph,{graph,primaryPageId:pageId,pagePurpose:'clinical-guide',articleModifiedAt:markupModifiedAt}));
  assert.equal(actual.get(url+'#article').dateModified,contentModifiedAt);
  assert.equal(actual.get(pageId).dateModified,contentModifiedAt);
  assert.equal(actual.get(url+'#article').datePublished,'2026-07-25');
  assert.equal(actual.get(pageId).lastReviewed,'2026-10-04');
  assert.equal(markupModifiedAt,'2026-10-30T04:17:44Z');
  assert.deepEqual(graph,before);
});

test('ProfilePage keeps a later document edit and omits an imprecise newer date instead of publishing an older timestamp',()=>{
  const origin=SOURCE.canonicalOrigin,graph=structuredClone(SOURCE.graph),page=byId(graph).get(origin+'/webpage');
  const profileModifiedAt=SOURCE.profileMarkupModifiedAt,contentModifiedAt='2026-11-03T21:36:49Z';
  page.dateModified=dateTime(contentModifiedAt);
  const before=structuredClone(graph);
  assert.equal(byId(projectHomeSearchGraph(graph,origin,{profileModifiedAt})).get(page['@id']).dateModified,contentModifiedAt);
  assert.deepEqual(graph,before);
  page.dateModified={'@value':'2026-11-04','@type':'http://www.w3.org/2001/XMLSchema#date'};
  assert.equal(byId(projectHomeSearchGraph(graph,origin,{profileModifiedAt})).get(page['@id']).dateModified,undefined);
});

test('per-document content dates reach the real Article projections without advancing unchanged pages or clinical reviews',()=>{
  const origin=SOURCE.canonicalOrigin,canonical=byId(SOURCE.graph),before=structuredClone(SOURCE.graph);
  const dates=new Set();
  for(const resource of SOURCE.routes.resources.filter(resource=>resource.pagePurpose==='clinical-guide')) {
    const url=origin+resource.path,pageId=url+'#webpage',page=canonical.get(pageId);
    const language=[].concat(page.inLanguage??'fa-IR')[0];
    const actual=byId(projectBoundedSearchDocument(SOURCE.graph,{graph:SOURCE.graph,primaryPageId:pageId,
      language:typeof language==='string'?language:language['@value'],pagePurpose:resource.pagePurpose,articleModifiedAt:SOURCE.articleMarkupModifiedAt}));
    const expected=latestRecordedModification(page.dateModified,SOURCE.articleMarkupModifiedAt);
    assert.equal(actual.get(url+'#article').dateModified,expected,resource.path);
    assert.equal(actual.get(pageId).dateModified,page.dateModified['@value']??page.dateModified,resource.path);
    assert.equal(actual.get(pageId).lastReviewed,page.lastReviewed?.['@value']??page.lastReviewed,resource.path);
    dates.add(expected);
  }
  assert.ok(dates.has(SOURCE.articleMarkupModifiedAt),'unchanged articles retain the previous recorded markup correction');
  assert.ok(dates.has('2026-11-03T21:36:49Z'),'edited articles retain their later recorded content finalization');
  assert.equal(SOURCE.profileMarkupModifiedAt,'2026-11-03T13:59:18Z');
  assert.equal(SOURCE.articleMarkupModifiedAt,'2026-10-30T04:17:44Z');
  assert.deepEqual(SOURCE.graph,before);
});
