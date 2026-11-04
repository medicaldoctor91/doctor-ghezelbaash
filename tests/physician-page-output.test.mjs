import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'parse5';
import {SOURCE} from '../src/canonical/source.mjs';
import {physicianIdentityIds,resolvePhysicianPractice} from '../src/lib/physician-identity.mjs';
import {assertBoundedSearchDocument,latestRecordedModification,truthText} from '../src/lib/search-contract.mjs';

const values=value=>Array.isArray(value)?value:value==null?[]:[value];
const ids=value=>values(value).map(ref=>typeof ref==='string'?ref:ref?.['@id']);
const attr=(node,name)=>node?.attrs?.find(item=>item.name===name)?.value;
function find(root,predicate) {
  const queue=[root];
  for(let i=0;i<queue.length;i++) {
    const node=queue[i];if(predicate(node))return node;
    if(node.childNodes)queue.push(...node.childNodes);
  }
}

test('every built public HTML page preserves its author, main subject, localized practice and bounded identity graph',t=>{
  const origin=SOURCE.canonicalOrigin,{personId,practiceId}=physicianIdentityIds(origin);
  const clinic=resolvePhysicianPractice(SOURCE.graph,{origin});
  const canonical=new Map(SOURCE.graph['@graph'].map(node=>[node['@id'],node]));
  const sitemap=readFileSync(new URL('../dist/sitemap.xml',import.meta.url),'utf8');
  const sitemapDates=new Map([...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([,entry])=>[
    entry.match(/<loc>([^<]+)<\/loc>/)?.[1],entry.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1],
  ]));
  let profiles=0;
  for(const resource of SOURCE.routes.resources) {
    const home=resource.path==='/',url=origin+resource.path;
    const filename=home?'index.html':resource.path.slice(1)+'.html';
    const html=readFileSync(new URL('../dist/'+filename,import.meta.url),'utf8');
    const dom=parse(html),element=find(dom,node=>node.tagName==='html');
    const script=find(dom,node=>node.tagName==='script'&&attr(node,'id')==='schema-core-mainentity');
    assert.ok(script,resource.path+' emits the active Search document');
    assert.equal(attr(script,'type'),'application/ld+json',resource.path);
    const raw=script.childNodes.map(node=>node.value??'').join(''),document=JSON.parse(raw);
    const actual=new Map(document['@graph'].map(node=>[node['@id'],node]));
    const pageId=home?origin+'/webpage':url+'#webpage',page=actual.get(pageId);
    const authored=canonical.get(pageId),authoredDate=authored.dateModified?.['@value']??authored.dateModified;
    assert.ok(page,resource.path+' describes its own document');
    assert.deepEqual(ids(page.author),[personId],resource.path+' has the canonical physician author');
    assert.equal(document['@graph'].filter(node=>values(node['@type']).includes('Person')).length,1,resource.path);
    const routeProfiles=document['@graph'].filter(node=>values(node['@type']).includes('ProfilePage'));
    assert.equal(routeProfiles.length,home?1:0,resource.path+' profile scope');
    profiles+=routeProfiles.length;
    const expected=resource.pagePurpose==='clinical-guide'?[url+'#article']:ids(canonical.get(pageId).mainEntity);
    assert.deepEqual(ids(page.mainEntity),expected,resource.path+' mainEntity');
    if(resource.pagePurpose==='clinical-guide') {
      const article=actual.get(url+'#article');
      assert.ok(values(article?.['@type']).includes('Article'),resource.path);
      assert.deepEqual(ids(article.author),[personId],resource.path+' article author');
      assert.equal(article.dateModified,latestRecordedModification(authored.dateModified,SOURCE.articleMarkupModifiedAt),resource.path+' Article date');
    }
    assert.equal(page.dateModified,home?latestRecordedModification(authored.dateModified,SOURCE.profileMarkupModifiedAt):authoredDate,resource.path+' document date');
    assert.equal(sitemapDates.get(url),authoredDate,resource.path+' sitemap uses its own recorded document edit');
    if(authored.lastReviewed)assert.equal(page.lastReviewed,authored.lastReviewed?.['@value']??authored.lastReviewed,resource.path+' review date');
    const language=attr(element,'lang');
    assert.ok(language,resource.path+' declares its document language');
    assert.equal(attr(element,'dir'),language.startsWith('en')?'ltr':'rtl',resource.path+' writing direction');
    assert.ok(actual.has(practiceId),resource.path+' keeps the same physician-owned practice');
    for(const key of ['name','description'])if(key in clinic) {
      // The practice currently has Persian and English authored literals.
      // Other document languages retain the renderer's English fallback.
      const native=values(clinic[key]).some(value=>value?.['@language']?.split('-')[0]===language.split('-')[0]);
      assert.equal(actual.get(practiceId)[key],truthText(clinic[key],native?language:'en'),resource.path+' practice '+key);
    }
    assert.deepEqual(ids(actual.get(personId).owns),[practiceId],resource.path+' physician ownership');
    assert.equal(actual.get(practiceId).owner,undefined,resource.path+' avoids inverse ownership expansion');
    assert.equal(actual.get(practiceId).founder,undefined,resource.path+' avoids inverse founder expansion');
    assert.doesNotThrow(()=>assertBoundedSearchDocument(document),resource.path);
    if(home) {
      assert.ok(Buffer.byteLength(raw,'utf8')<=38000,'actual emitted homepage Search script fits its byte budget');
      assert.equal(actual.get(personId).sameAs.length,22);
      assert.equal(values(actual.get(personId).identifier).length,24);
      t.diagnostic(`Built homepage Search script: ${Buffer.byteLength(raw,'utf8')}/38000 UTF-8 bytes`);
    }
  }
  assert.equal(profiles,1,'only the physician homepage is a ProfilePage');
});
