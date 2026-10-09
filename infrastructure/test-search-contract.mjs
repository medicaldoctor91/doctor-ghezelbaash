import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const moduleUrl=new URL('../src/lib/search-contract.mjs',import.meta.url);
assert(await fs.access(moduleUrl).then(()=>true,()=>false),'Focused graph reference and date contract helper is required');
const {closeSearchReferences,renderMedicalTrust}=await import(moduleUrl);
const origin='https://www.ghezelbaash.ir', person=origin+'/#saeed-ghezelbash', clinic=origin+'/clinic';
const truth={'@graph':[{'@id':person,'@type':'Person',name:'Doctor'},{'@id':clinic,'@type':'MedicalClinic',name:'Clinic'},{'@id':origin+'/webpage','@type':'WebPage',url:origin+'/'},{'@id':origin+'/service','@type':'Service',provider:{'@id':clinic}}]};
const page={'@id':origin+'/topic#webpage','@type':'MedicalWebPage',author:{'@id':person},reviewedBy:{'@id':person},lastReviewed:'2026-10-04',isPartOf:{'@id':origin+'/webpage'},mainEntity:{'@id':origin+'/service'}};
const document={'@context':'https://schema.org','@graph':[page]};
closeSearchReferences(document,{origin,graph:truth,project:id=>truth['@graph'].find(n=>n['@id']===id)});
assert(document['@graph'].some(n=>n['@id']===origin+'/service'));
assert(document['@graph'].some(n=>n['@id']===clinic));
const html=renderMedicalTrust(page,truth,'en');
assert(html.includes('Doctor'));assert(html.includes('2026-10-04'));assert(!html.includes('2026-10-07'));
assert.equal(renderMedicalTrust({...page,'@type':'WebPage'},truth,'en'),'');
const hostile={...truth,'@graph':truth['@graph'].map(n=>n['@id']===person?{...n,name:'</script><script>bad</script>'}:n)};
assert(!renderMedicalTrust(page,hostile,'en').includes('<script>'));
const hiddenId=origin+'/hidden#question',homeId=origin+'/webpage';
const scopedTruth={'@graph':[...truth['@graph'],{'@id':hiddenId,'@type':'Question',name:'Invisible medical question',acceptedAnswer:{'@id':origin+'/hidden#answer'}},{'@id':origin+'/hidden#answer','@type':'Answer',text:'Invisible answer'}]};
const seededHome={...truth['@graph'].find(n=>n['@id']===homeId),hasPart:{'@id':hiddenId}};
const scopedDocument={'@context':'https://schema.org','@graph':[structuredClone(page),...truth['@graph'].filter(n=>n['@id']!==homeId),seededHome,...scopedTruth['@graph'].filter(n=>n['@id'].includes('/hidden#'))]};
closeSearchReferences(scopedDocument,{origin,graph:scopedTruth,primaryPageId:page['@id'],visibleQuestionIds:[],visibleMediaIds:[],project:id=>scopedTruth['@graph'].find(n=>n['@id']===id)});
assert(!scopedDocument['@graph'].some(n=>n['@id']===hiddenId),'Preselected Home must not leak invisible clinical Questions');

// Focused pages keep the physician/clinic identity boundary, but must not recursively
// materialize their global authority/evidence/service tails. Route-owned references
// (such as the page mainEntity) still close normally.
const evidenceId=origin+'/authority-evidence',unrelatedServiceId=origin+'/global-service';
const boundedTruth={'@graph':[
  {'@id':person,'@type':['Person','IndividualPhysician'],name:'Doctor',url:origin+'/',sameAs:['https://www.wikidata.org/wiki/Q140287622'],subjectOf:{'@id':evidenceId},knowsAbout:{'@id':unrelatedServiceId}},
  {'@id':clinic,'@type':['MedicalClinic','LocalBusiness'],name:'Clinic',url:origin+'/clinic',availableService:{'@id':unrelatedServiceId}},
  {'@id':homeId,'@type':'WebPage',url:origin+'/'},
  {'@id':origin+'/service','@type':'Service',provider:{'@id':clinic}},
  {'@id':evidenceId,'@type':'ScholarlyArticle',name:'Global authority evidence'},
  {'@id':unrelatedServiceId,'@type':'Service',name:'Global service'}
]};
const boundedDocument={'@context':'https://schema.org','@graph':[structuredClone(page)]};
closeSearchReferences(boundedDocument,{origin,graph:boundedTruth,primaryPageId:page['@id'],project:id=>boundedTruth['@graph'].find(n=>n['@id']===id)});
const boundedIds=new Set(boundedDocument['@graph'].map(n=>n['@id']));
assert(boundedIds.has(person),'Focused graph must retain canonical physician identity');
assert(boundedIds.has(clinic),'Focused graph must retain canonical clinic identity');
assert(boundedIds.has(origin+'/service'),'Focused graph must retain route-owned mainEntity closure');
assert(!boundedIds.has(evidenceId),'Focused graph must not expand the physician global authority tail');
assert(!boundedIds.has(unrelatedServiceId),'Focused graph must not expand global physician/clinic service tails');
const boundedPerson=boundedDocument['@graph'].find(n=>n['@id']===person);
assert.deepEqual(boundedPerson.sameAs,['https://www.wikidata.org/wiki/Q140287622'],'External identity reconciliation must remain on the compact physician node');
console.log('Focused reference closure and visible trust PASS');
