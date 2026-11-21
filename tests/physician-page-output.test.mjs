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
  const answersWithVerifiedAuthors=new Set();
  for(const resource of SOURCE.routes.resources) {
    const home=resource.path==='/',url=origin+resource.path;
    const filename=home?'index.html':resource.path.slice(1)+'.html';
    const html=readFileSync(new URL('../dist/'+filename,import.meta.url),'utf8');
    const dom=parse(html),element=find(dom,node=>node.tagName==='html');
    const script=find(dom,node=>node.tagName==='script'&&attr(node,'id')===(home?'canonical-entity-graph':'schema-core-mainentity'));
    assert.ok(script,resource.path+' emits the active Search document');
    assert.equal(attr(script,'type'),'application/ld+json',resource.path);
    const raw=script.childNodes.map(node=>node.value??'').join(''),document=JSON.parse(raw);
    const actual=new Map(document['@graph'].map(node=>[node['@id'],node]));
    if(home) {
      assert.deepEqual(document,SOURCE.graph,'homepage publishes exactly the full canonical RDF graph');
      assert.equal([...dom.childNodes].filter(node=>node.tagName==='html').length,1);
      assert.equal(document['@graph'].filter(node=>node['@id']===personId).length,1,'the canonical physician is unique even when other Persons occur in the complete graph');
      const page=actual.get(origin+'/webpage'),person=actual.get(personId);
      assert.deepEqual(ids(page.mainEntity),[personId]);
      assert.deepEqual(ids(page.author),[personId]);
      assert.ok(ids(person.owns).includes(practiceId),'physician owns the clinic');
      assert.deepEqual(ids(person.owns),ids(canonical.get(personId).owns),
        'all authored ownership relations, including the separate data project, must remain intact');
      assert.equal(values(person.skills).length,85);
      assert.equal(values(person.knowsAbout).length,231);
      assert.equal(values(person.makesOffer).length,124);
      assert.ok(actual.has(practiceId));
      profiles++;
      continue; // Focused-page projections have a deliberately different contract.
    }
    const pageId=home?origin+'/webpage':url+'#webpage',page=actual.get(pageId);
    const authored=canonical.get(pageId),authoredDate=authored.dateModified?.['@value']??authored.dateModified;
    assert.ok(page,resource.path+' describes its own document');
    assert.deepEqual(ids(page.author),[personId],resource.path+' has the canonical physician author');
    assert.equal(document['@graph'].filter(node=>values(node['@type']).includes('Person')).length,1,resource.path);
    assert.equal(actual.get(personId).birthDate,'1991-05-29',resource.path+' publishes the existing canonical birth date');
    const routeProfiles=document['@graph'].filter(node=>values(node['@type']).includes('ProfilePage'));
    const biography=resource.pagePurpose==='professional-biography';
    assert.equal(routeProfiles.length,home||biography?1:0,resource.path+' profile scope');
    profiles+=routeProfiles.length;
    if(biography)assert.equal(values(actual.get(personId).knowsAbout).length,5);
    const supplemental=find(dom,node=>node.tagName==='script'&&attr(node,'id')==='schema-physician-clinical-authority');
    if(biography){
      assert.ok(supplemental,resource.path+' carries compact physician authority schema');
      const parsed=JSON.parse(supplemental.childNodes.map(n=>n.value??'').join(''));
      const other=new Map(parsed['@graph'].map(n=>[n['@id'],n]));
      const p=other.get(personId),catalog=other.get(origin+'/physician-clinical-offer-catalog');
      assert.equal(values(p.skills).length,12);
      assert.equal(values(p.availableService).length,6);
      assert.equal(catalog['@type'],'OfferCatalog');
      for(const item of [...values(p.skills),...values(p.availableService)])
        assert.ok(other.has(item['@id']),'Supplementary identity reference is self-contained');
    } else assert.equal(supplemental,undefined,resource.path+' does not include unrelated physician inventory');
    const expected=ids(authored.mainEntity);
    assert.deepEqual(ids(page.mainEntity),expected,resource.path+' mainEntity');
    if(resource.pagePurpose==='clinical-guide') {
      const article=actual.get(url+'#article');
      assert.ok(values(article?.['@type']).includes('Article'),resource.path);
      const authoredArticle=canonical.get(article['@id']);
      assert.deepEqual(ids(article.author),[personId],resource.path+' article author');
      assert.deepEqual(ids(article.citation),ids(authoredArticle.citation),resource.path+' inline citations');
      for(const citation of ids(article.citation))
        assert.ok(find(dom,node=>node.tagName==='a'&&attr(node,'href')===citation),resource.path+' visible citation');
      assert.equal(article.dateModified,latestRecordedModification(authored.dateModified,SOURCE.articleMarkupModifiedAt),resource.path+' Article date');
      const serviceIsPrimary=values(canonical.get(expected[0])?.['@type']).includes('Service');
      if(serviceIsPrimary) {
        assert.ok(ids(authored.hasPart).includes(article['@id']),resource.path+' canonical supporting article');
        assert.ok(ids(page.hasPart).includes(article['@id']),resource.path+' inline supporting article');
        assert.ok(!Object.hasOwn(authoredArticle,'mainEntityOfPage'),resource.path+' canonical article is secondary');
        assert.ok(!Object.hasOwn(article,'mainEntityOfPage'),resource.path+' inline article is secondary');
        const offerId=canonical.get(expected[0]).offers['@id'];
        assert.deepEqual(ids(actual.get(expected[0]).offers),[offerId],resource.path+' focused offer');
        assert.equal(actual.get(offerId)?.['@type'],'Offer',resource.path+' resolves the focused offer');
      } else {
        assert.equal(authoredArticle.mainEntityOfPage,url,resource.path+' canonical primary article');
        assert.equal(article.mainEntityOfPage,url,resource.path+' inline primary article');
      }
    }
    assert.equal(page.dateModified,home?latestRecordedModification(authored.dateModified,SOURCE.profileMarkupModifiedAt):authoredDate,resource.path+' document date');
    assert.equal(sitemapDates.get(url),authoredDate,resource.path+' sitemap uses its own recorded document edit');
    if(authored.lastReviewed)assert.equal(page.lastReviewed,authored.lastReviewed?.['@value']??authored.lastReviewed,resource.path+' review date');
    const language=attr(element,'lang');
    assert.ok(language,resource.path+' declares its document language');
    assert.equal(attr(element,'dir'),language.startsWith('en')?'ltr':'rtl',resource.path+' writing direction');
    assert.ok(actual.has(practiceId),resource.path+' keeps the same physician-owned practice');
    for(const answer of actual.values()) {
      if(!values(answer['@type']).includes('Answer'))continue;
      const answerId=answer['@id'];
      const authoredAnswer=canonical.get(answerId);
      assert.ok(authoredAnswer,answerId+' has a canonical source');
      assert.deepEqual(ids(answer.author),ids(authoredAnswer.author),answerId+' preserves its canonical author');
      if(authoredAnswer.author)answersWithVerifiedAuthors.add(answerId);
    }
    for(const service of actual.values()) {
      if(!values(service['@type']).includes('Service'))continue;
      assert.deepEqual(ids(service.provider),[personId],service['@id']+' provider');
      const [channelId]=ids(service.availableChannel);
      const channel=actual.get(channelId);
      assert.ok(values(channel?.['@type']).includes('ServiceChannel'),service['@id']+' local channel');
      const authoredChannel=canonical.get(ids(canonical.get(service['@id']).availableChannel)[0]);
      assert.deepEqual(ids(channel.serviceLocation),ids(authoredChannel.serviceLocation),service['@id']+' local service location');
    }
    if(resource.path==='/filler') {
      assert.deepEqual(ids(page.mainEntity),[origin+'/procedure-facial-and-lip-dermal-filler'],resource.path+' primary service');
      for(const slug of ['facial-and-lip-dermal-filler','body-dermal-filler','autologous-fat-grafting','gluteal-body-filler'])
        assert.ok(values(actual.get(origin+'/procedure-'+slug)?.['@type']).includes('Service'),slug);
    }
    if(resource.path==='/botox-contraindications-and-precautions') {
      const serviceId=origin+'/service-botulinum-toxin-chronic-migraine';
      const article=actual.get(url+'#article');
      assert.deepEqual(ids(page.mainEntity),[article['@id']]);
      assert.ok(ids(article.about).includes(serviceId));
      assert.ok(ids(page.about).includes(serviceId));
      assert.ok(values(actual.get(serviceId)?.['@type']).includes('Service'));
      assert.equal(actual.get(serviceId).areaServed,undefined);
      assert.ok(find(dom,node=>attr(node,'id')==='migraine-botox-candidacy'));
    }
    for(const property of ['medicalSpecialty','availableService','hasOfferCatalog','areaServed'])
      assert.ok(!(property in actual.get(practiceId)),resource.path+' clinic '+property);
    if(resource.pagePurpose==='clinic-profile') {
      assert.deepEqual(ids(page.mainEntity),[practiceId],resource.path+' practice page subject');
      assert.deepEqual(ids(page.about),[practiceId,personId],resource.path+' practice and physician identities');
    }
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
    // The homepage is verified above as the full graph. Focused JSON-LD
    // projections are checked here and by the Search contract tests.
  }
  assert.equal(profiles,2,'the homepage and the professional biography are physician profiles');
  assert.deepEqual(answersWithVerifiedAuthors,new Set([...canonical.values()]
    .filter(node=>values(node['@type']).includes('Answer')&&node.author)
    .map(node=>node['@id'])),'all authored answers preserve their author in the built pages');
});
