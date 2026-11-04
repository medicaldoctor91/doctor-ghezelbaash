import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE} from '../src/canonical/source.mjs';
import {physicianIdentityIds,resolvePhysicianPractice} from '../src/lib/physician-identity.mjs';
import {closeSearchReferences,projectBoundedSearchDocument,projectHomeSearchGraph,assertBoundedSearchDocument,latestRecordedModification,truthText} from '../src/lib/search-contract.mjs';
import {serializeInlineJsonLd} from '../src/lib/jsonld.mjs';

const origin='https://example.test';
const {personId,practiceId}=physicianIdentityIds(origin);
const values=value=>Array.isArray(value)?value:value==null?[]:[value];
const ids=value=>values(value).map(ref=>typeof ref==='string'?ref:ref?.['@id']);
const byId=document=>new Map(document['@graph'].map(node=>[node['@id'],node]));

function fixture() {
  const projectId=origin+'/doctor-ghezelbaash-structured-data-project';
  return {'@context':'https://schema.org','@graph':[
    {'@id':origin+'/treatment#webpage','@type':'MedicalWebPage',name:'Treatment'},
    {'@id':personId,'@type':['Person','IndividualPhysician'],name:'Physician',
      owns:[{'@id':projectId},{'@id':practiceId}],practicesAt:{'@id':practiceId}},
    {'@id':projectId,'@type':'SoftwareSourceCode',name:'Owned data project',owner:{'@id':personId}},
    {'@id':origin+'/unrelated-clinic','@type':'MedicalClinic',name:'Unrelated clinic'},
    {'@id':practiceId,'@type':['PhysiciansOffice','LocalBusiness'],name:'Personal practice',
      owner:{'@id':personId},founder:{'@id':personId},telephone:'+98 83 3725 1101'},
  ]};
}

test('practice resolution uses the stable identity and sole physician ownership without MedicalClinic typing',()=>{
  const graph=fixture(),before=structuredClone(graph),practice=byId(graph).get(practiceId);
  assert.equal(resolvePhysicianPractice(graph,{origin}),practice);
  assert.equal(resolvePhysicianPractice(graph['@graph'],{origin:origin+'/'}),practice);
  assert.ok(!practice['@type'].includes('MedicalClinic'));
  practice['@type']=['https://schema.org/PhysiciansOffice','https://schema.org/LocalBusiness'];
  assert.equal(resolvePhysicianPractice(graph,{origin}),practice,'expanded Schema.org types remain valid');
  graph['@graph'].at(-1)['@type']=before['@graph'].at(-1)['@type'];
  assert.deepEqual(graph,before,'resolving an identity must not change authored graph data');
});

test('an owned data project, arbitrary LocalBusiness, conflicting proprietor or merged identity cannot become the practice',()=>{
  for(const alter of [
    graph=>graph['@graph'].pop(),
    graph=>{const practice=graph['@graph'].at(-1);practice['@id']=origin+'/different-practice';},
    graph=>{graph['@graph'].at(-1)['@type']=['MedicalClinic','LocalBusiness'];},
    graph=>{graph['@graph'].at(-1).owner={'@id':origin+'/other-person'};},
    graph=>{graph['@graph'].at(-1).founder={'@id':origin+'/other-person'};},
    graph=>{delete graph['@graph'].at(-1).owner;delete graph['@graph'].at(-1).founder;},
    graph=>{graph['@graph'][1].owns=[{'@id':graph['@graph'][2]['@id']}];delete graph['@graph'][1].practicesAt;},
    graph=>{graph['@graph'].at(-1)['@type'].push('Person');},
    graph=>graph['@graph'].push(structuredClone(graph['@graph'].at(-1))),
  ]) {
    const graph=fixture();alter(graph);
    assert.equal(resolvePhysicianPractice(graph,{origin}),null);
  }
});

test('focused reference closure explicitly seeds only the resolved personal practice',()=>{
  const graph=fixture(),primaryPageId=graph['@graph'][0]['@id'];
  const canonical=byId(graph),document={'@context':'https://schema.org','@graph':[structuredClone(graph['@graph'][0])]};
  closeSearchReferences(document,{origin,graph,primaryPageId,project:id=>{
    const node=structuredClone(canonical.get(id));
    // The projection boundary need not expose Person's inventory for the
    // practice to remain an explicit supporting identity.
    if(id===personId){delete node.owns;delete node.practicesAt;}
    return node;
  }});
  const actual=byId(document);
  assert.deepEqual(actual.get(practiceId),canonical.get(practiceId));
  assert.ok(actual.has(personId));
  assert.equal(actual.has(origin+'/unrelated-clinic'),false,'an unrelated MedicalClinic is not an authority root');
  assert.equal(actual.has(origin+'/doctor-ghezelbaash-structured-data-project'),false);
});

test('a projected practice template keeps the clinical identity fields validated against the full graph',()=>{
  const graph=fixture(),document=structuredClone(graph),primaryPageId=graph['@graph'][0]['@id'];
  const result=projectBoundedSearchDocument(document,{graph,primaryPageId,language:'en'});
  const actual=byId(result);
  assert.equal(actual.get(practiceId).telephone,byId(graph).get(practiceId).telephone);
  assert.deepEqual(ids(actual.get(personId).owns),[practiceId]);
  assert.equal(actual.get(practiceId).owner,undefined);
  assert.equal(actual.get(practiceId).founder,undefined);
  assert.doesNotThrow(()=>assertBoundedSearchDocument(result));
});

test('the recorded homepage projection preserves convergence IDs and acyclic ownership inside the serialized byte budget',t=>{
  const graph=SOURCE.graph,before=structuredClone(graph),canonical=byId(graph);
  const {personId:physicianId,practiceId:clinicId}=physicianIdentityIds(SOURCE.canonicalOrigin);
  const authored=canonical.get(physicianId),clinic=resolvePhysicianPractice(graph,{origin:SOURCE.canonicalOrigin});
  assert.ok(clinic,'the current PhysiciansOffice + LocalBusiness model must resolve');
  assert.ok(!values(clinic['@type']).includes('MedicalClinic'));
  const projected=projectHomeSearchGraph(graph,SOURCE.canonicalOrigin,{profileModifiedAt:SOURCE.profileMarkupModifiedAt});
  const actual=byId(projected),person=actual.get(physicianId);
  assert.equal(actual.get(SOURCE.canonicalOrigin+'/webpage').dateModified,
    latestRecordedModification(canonical.get(SOURCE.canonicalOrigin+'/webpage').dateModified,SOURCE.profileMarkupModifiedAt));
  assert.equal(person.sameAs.length,22);
  assert.equal(values(person.identifier).length,24);
  assert.deepEqual(person.sameAs,authored.sameAs);
  assert.deepEqual(person.identifier,authored.identifier);
  assert.deepEqual(ids(person.owns),[clinicId]);
  assert.deepEqual(ids(person.practicesAt),[clinicId]);
  assert.equal(actual.get(clinicId).owner,undefined,'one-way ownership keeps the bounded Search document acyclic');
  assert.equal(actual.get(clinicId).founder,undefined);
  assert.doesNotThrow(()=>assertBoundedSearchDocument(projected));
  const bytes=Buffer.byteLength(serializeInlineJsonLd(projected),'utf8');
  assert.ok(bytes<=38000,`timestamped serialized homepage Search document is ${bytes} bytes`);
  t.diagnostic(`Recorded homepage Search document: ${bytes}/38000 UTF-8 bytes`);
  assert.deepEqual(graph,before);
});

test('all declared routes preserve the physician author, page subject and localized practice identity',()=>{
  const graph=SOURCE.graph,canonical=byId(graph),before=structuredClone(graph);
  const {personId:physicianId,practiceId:clinicId}=physicianIdentityIds(SOURCE.canonicalOrigin);
  const clinic=resolvePhysicianPractice(graph,{origin:SOURCE.canonicalOrigin});
  const languages=new Set();
  assert.equal(SOURCE.routes.resources.length,72);
  for(const resource of SOURCE.routes.resources) {
    const home=resource.path==='/',url=SOURCE.canonicalOrigin+resource.path;
    const primaryPageId=home?SOURCE.canonicalOrigin+'/webpage':url+'#webpage';
    const page=canonical.get(primaryPageId),languageEntry=values(page.inLanguage)[0]??'fa-IR';
    const language=typeof languageEntry==='string'?languageEntry:languageEntry['@value'];
    languages.add(language.split('-')[0]);
    const projected=home?projectHomeSearchGraph(graph,SOURCE.canonicalOrigin,{profileModifiedAt:SOURCE.profileMarkupModifiedAt})
      :projectBoundedSearchDocument(graph,{graph,primaryPageId,language,pagePurpose:resource.pagePurpose});
    const actual=byId(projected),primary=actual.get(primaryPageId);
    assert.deepEqual(ids(primary.author),[physicianId],resource.path+' retains its real physician author');
    assert.equal(projected['@graph'].filter(node=>values(node['@type']).includes('Person')).length,1,resource.path);
    assert.equal(projected['@graph'].filter(node=>values(node['@type']).includes('ProfilePage')).length,home?1:0,resource.path);
    assert.deepEqual(ids(primary.mainEntity),resource.pagePurpose==='clinical-guide'?[url+'#article']:ids(page.mainEntity),resource.path+' mainEntity');
    assert.ok(actual.has(clinicId),resource.path+' includes the same personal practice');
    for(const key of ['name','description'])if(key in clinic)
      assert.equal(actual.get(clinicId)[key],truthText(clinic[key],language),resource.path+' practice '+key);
    for(const node of projected['@graph'])if(values(node['@type']).some(type=>['Role','Occupation'].includes(type))) {
      const authored=canonical.get(node['@id']);
      for(const key of ['name','roleName'])if(authored&&key in authored&&key in node)
        assert.equal(node[key],truthText(authored[key],language),resource.path+' '+node['@id']+' '+key);
    }
    assert.doesNotThrow(()=>assertBoundedSearchDocument(projected),resource.path);
  }
  for(const language of ['fa','en','ar','ckb'])assert.ok(languages.has(language),'route coverage for '+language);
  assert.deepEqual(graph,before,'route Search projections preserve every canonical claim and identifier');
});
