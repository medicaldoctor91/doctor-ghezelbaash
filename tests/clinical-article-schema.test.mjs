import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE} from '../src/canonical/source.mjs';
import {projectBoundedSearchDocument, assertBoundedSearchDocument, truthText} from '../src/lib/search-contract.mjs';

const origin='https://example.test';
const pageId=origin+'/treatment#webpage';
const contentId=origin+'/treatment';
const physicianId=origin+'/#saeed-ghezelbash';
const topicId=origin+'/procedure';
const imageUrl=origin+'/visible-treatment-image.jpg';
function fixture() {
  return {'@context':'https://schema.org','@graph':[
    {'@id':pageId,'@type':'MedicalWebPage',url:contentId,name:'Authored treatment guide',description:'Visible guide summary.',
      inLanguage:'en',author:{'@id':physicianId},publisher:{'@id':physicianId},reviewedBy:{'@id':physicianId},
      dateModified:{'@value':'2026-10-10','@type':'http://www.w3.org/2001/XMLSchema#date'},lastReviewed:'2026-10-04',
      mainEntity:{'@id':contentId},about:[{'@id':topicId}]},
    {'@id':contentId,'@type':'WebPageElement',url:contentId,name:'Authored treatment guide',about:[{'@id':topicId}]},
    {'@id':topicId,'@type':'MedicalProcedure',name:'Treatment',description:'The actual clinical subject.'},
    {'@id':physicianId,'@type':'Person',name:'Actual physician',url:origin+'/',image:[{'@id':origin+'/portrait'}]},
    {'@id':origin+'/portrait','@type':'ImageObject',contentUrl:origin+'/physician-portrait.jpg',creator:{'@id':physicianId}},
  ]};
}
const project=(graph,options={})=>projectBoundedSearchDocument(graph,{graph,primaryPageId:pageId,language:'en',pagePurpose:'clinical-guide',...options});
const byId=document=>new Map(document['@graph'].map(node=>[node['@id'],node]));

test('Google Article dates carry a recorded metadata-edit time without relabelling the clinical source or review',()=>{
  const graph=fixture(),before=structuredClone(graph),articleModifiedAt=SOURCE.articleMarkupModifiedAt;
  const projected=byId(project(graph,{articleModifiedAt}));
  assert.equal(projected.get(contentId+'#article').dateModified,'2026-10-30T04:17:44Z');
  assert.equal(projected.get(pageId).dateModified,'2026-10-10');
  assert.equal(projected.get(pageId).lastReviewed,'2026-10-04');
  assert.deepEqual(graph,before);
  assert.throws(()=>project(graph,{articleModifiedAt:'2026-10-10'}),/timestamp with timezone/);
});

test('a reviewed clinical guide has a distinct authored Article and retains its medical document and content identities',()=>{
  const graph=fixture(),before=structuredClone(graph),result=project(graph),nodes=byId(result);
  const page=nodes.get(pageId),article=nodes.get(contentId+'#article');
  assert.equal(page['@type'],'MedicalWebPage');
  assert.deepEqual(page.mainEntity,{'@id':article['@id']});
  assert.equal(article['@type'],'Article');
  assert.equal(article.headline,'Authored treatment guide');
  assert.equal(article.description,'Visible guide summary.');
  assert.equal(article.mainEntityOfPage,contentId,'the page backlink is a terminal URL, not a framing cycle');
  assert.deepEqual(article.author,{'@id':physicianId});
  assert.deepEqual(article.publisher,{'@id':physicianId});
  assert.equal(article.dateModified,'2026-10-10');
  assert.deepEqual(article.about,[{'@id':topicId}]);
  assert.deepEqual(article.hasPart,[{'@id':contentId}]);
  assert.equal(nodes.get(contentId)['@type'],'WebPageElement');
  assert.equal(nodes.get(topicId).description,'The actual clinical subject.');
  assert.equal(article.articleBody,undefined,'the already-visible article is not duplicated into the crawler prefix');
  assert.equal(article.datePublished,undefined,'review, modification and build dates are not publication dates');
  assert.equal(article.image,undefined,'author portraits are not used as unrelated article images');
  assert.ok(assertBoundedSearchDocument(result).expandedObjects<4096);
  assert.deepEqual(graph,before,'search wrappers never rewrite canonical data or authored literal values');
});

test('Article uses sourced publication metadata and actual route images only when provided',()=>{
  const graph=fixture();graph['@graph'][0].datePublished='2026-09-12';
  const article=byId(project(graph,{visibleImageUrls:[imageUrl,imageUrl]})).get(contentId+'#article');
  assert.equal(article.datePublished,'2026-09-12');
  assert.deepEqual(article.image,[imageUrl]);
  assert.ok(!article.image.includes(origin+'/physician-portrait.jpg'));
});

test('a clinical article does not retype a clinic or turn that physical entity into an article part',()=>{
  const graph=fixture(),page=graph['@graph'][0];
  graph['@graph'][1]={'@id':contentId,'@type':['MedicalClinic','LocalBusiness'],name:'Actual clinic',address:{'@id':origin+'/address'}};
  graph['@graph'].push({'@id':origin+'/address','@type':'PostalAddress',streetAddress:'Actual address'});
  page.about=[{'@id':contentId}];
  const nodes=byId(project(graph)),article=nodes.get(contentId+'#article');
  assert.deepEqual(nodes.get(contentId)['@type'],['MedicalClinic','LocalBusiness']);
  assert.deepEqual(article.about,[{'@id':contentId}]);
  assert.equal(article.hasPart,undefined);
});

test('MedicalWebPage alone and nonclinical route purposes cannot opt into Article markup',()=>{
  for(const pagePurpose of [undefined,'authored-media','clinic-contact','visit-access','historical-evidence','professional-biography']) {
    const graph=fixture(),result=project(graph,{pagePurpose});
    assert.ok(!result['@graph'].some(node=>[].concat(node['@type']).includes('Article')),String(pagePurpose));
    assert.deepEqual(byId(result).get(pageId).mainEntity,{'@id':contentId});
  }
  const graph=fixture();graph['@graph'][0]['@type']='WebPage';
  assert.throws(()=>project(graph),/reviewed MedicalWebPage/);
});

test('every reviewed real clinical guide gets sourced Article metadata without changing the complete canonical graph',()=>{
  const before=structuredClone(SOURCE.graph),canonical=new Map(SOURCE.graph['@graph'].map(node=>[node['@id'],node]));
  const guides=SOURCE.routes.resources.filter(resource=>resource.pagePurpose==='clinical-guide');
  assert.equal(guides.length,63,'the reviewed clinical-guide registry is the eligibility boundary');
  for(const resource of guides) {
    const url=SOURCE.canonicalOrigin+resource.path,primaryPageId=url+'#webpage',page=canonical.get(primaryPageId);
    const declaredLanguage=[].concat(page.inLanguage??'fa-IR')[0];
    const language=typeof declaredLanguage==='string'?declaredLanguage:declaredLanguage['@value'];
    const result=projectBoundedSearchDocument(SOURCE.graph,{graph:SOURCE.graph,primaryPageId,language,pagePurpose:resource.pagePurpose});
    const nodes=byId(result),article=nodes.get(url+'#article');
    assert.ok([].concat(nodes.get(primaryPageId)['@type']).includes('MedicalWebPage'),resource.path);
    assert.equal(article.headline,truthText(page.name,language),resource.path);
    assert.deepEqual(article.author,page.author,resource.path);
    assert.deepEqual(article.publisher,page.publisher,resource.path);
    assert.equal(article.dateModified,page.dateModified?.['@value']??page.dateModified,resource.path);
    assert.equal(article.datePublished,page.datePublished?.['@value']??page.datePublished,resource.path);
    assert.equal(article.image,undefined,resource.path+' does not receive an inferred portrait image');
    assert.ok(assertBoundedSearchDocument(result).expandedObjects<4096,resource.path);
  }
  assert.equal(SOURCE.graph['@graph'].length,1600);
  assert.deepEqual(SOURCE.graph,before);
});
