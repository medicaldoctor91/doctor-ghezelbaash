import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SOURCE,AUTHORED_BODY} from '../src/canonical/source.mjs';
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
      birthDate:{'@value':'1991-05-29','@type':'http://www.w3.org/2001/XMLSchema#date'},
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
  assert.deepEqual(actual.get(personId).birthDate,canonical.get(personId).birthDate,'the focused authority boundary retains the recorded date');
  assert.equal(actual.has(origin+'/unrelated-clinic'),false,'an unrelated MedicalClinic is not an authority root');
  assert.equal(actual.has(origin+'/doctor-ghezelbaash-structured-data-project'),false);
});

test('a projected practice template keeps the clinical identity fields validated against the full graph',()=>{
  const graph=fixture(),document=structuredClone(graph),primaryPageId=graph['@graph'][0]['@id'];
  const result=projectBoundedSearchDocument(document,{graph,primaryPageId,language:'en'});
  const actual=byId(result);
  assert.equal(actual.get(practiceId).telephone,byId(graph).get(practiceId).telephone);
  assert.deepEqual(ids(actual.get(personId).owns),[practiceId]);
  assert.equal(actual.get(personId).birthDate,'1991-05-29','the Search projection preserves date-only precision');
  assert.equal(actual.get(practiceId).owner,undefined);
  assert.equal(actual.get(practiceId).founder,undefined);
  assert.doesNotThrow(()=>assertBoundedSearchDocument(result));
});

test('dedicated practice Search graph preserves canonical reciprocal references without affecting other routes',()=>{
  const graph=fixture(),canonical=byId(graph);
  const clinicPageId=practiceId+'#webpage';
  const cityId=origin+'/city';
  const clinicPage={'@id':clinicPageId,'@type':'MedicalWebPage',mainEntity:{'@id':practiceId},about:[{'@id':personId},{'@id':practiceId}]};
  graph['@graph'].push(clinicPage,{'@id':cityId,'@type':'City',name:'City'});
  canonical.get(personId).workLocation=[{'@id':practiceId},{'@id':cityId}];
  const before=structuredClone(graph);
  const document=structuredClone(graph);
  // Deliberately omit the relationships from the focused templates. They must
  // come from the authoritative graph, not require duplicate authored facts.
  const templates=byId(document);
  delete templates.get(personId).workLocation;
  delete templates.get(practiceId).owner;
  delete templates.get(practiceId).founder;
  const projected=projectBoundedSearchDocument(document,{graph,primaryPageId:clinicPageId,language:'en'});
  const actual=byId(projected);
  assert.deepEqual(actual.get(personId).workLocation,canonical.get(personId).workLocation);
  for(const key of ['owner','founder'])assert.deepEqual(actual.get(practiceId)[key],canonical.get(practiceId)[key]);
  assert.deepEqual(ids(actual.get(personId).owns),[practiceId]);
  assert.deepEqual(ids(actual.get(personId).practicesAt),[practiceId]);
  assert.equal(actual.get(clinicPageId).mainEntity['@id'],practiceId);
  assert.notEqual(personId,practiceId);
  assert.doesNotThrow(()=>assertBoundedSearchDocument(projected));
  assert.throws(()=>assertBoundedSearchDocument(projected,{maxExpandedObjects:1}),/expansion budget/);
  assert.throws(()=>assertBoundedSearchDocument(projected,{maxDepth:0}),/depth budget/);
  assert.throws(()=>assertBoundedSearchDocument(projected,{maxNodes:1}),/node budget/);
  for(const change of [
    g=>{byId(g).get(practiceId).employee={'@id':personId};},
    g=>{byId(g).get(practiceId).owner={'@id':personId,name:'Not a bare reference'};},
    g=>{byId(g).get(practiceId).founder=[{'@id':personId},{'@id':cityId}];},
    g=>{g['@graph'][0]['@id']=origin+'/different#webpage';},
  ]) {
    const broken=structuredClone(projected);change(broken);
    assert.throws(()=>assertBoundedSearchDocument(broken),/Cyclic Search entity reference/);
  }
  const dangling=structuredClone(projected);
  byId(dangling).get(practiceId).founder={'@id':origin+'/missing-founder'};
  assert.throws(()=>assertBoundedSearchDocument(dangling),/Unresolved local Search entity/);
  const duplicate=structuredClone(projected);
  duplicate['@graph'].push(structuredClone(actual.get(personId)));
  assert.throws(()=>assertBoundedSearchDocument(duplicate),/Duplicate Search entity identifier/);
  const other=byId(projectBoundedSearchDocument(document,{graph,primaryPageId:origin+'/treatment#webpage',language:'en'}));
  assert.equal(other.get(personId).workLocation,undefined);
  assert.equal(other.get(practiceId).owner,undefined);
  assert.equal(other.get(practiceId).founder,undefined);
  assert.deepEqual(graph,before,'canonical graph remains byte-equivalent as data');
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
  assert.equal(person.sameAs.length,23);
  assert.equal(values(person.identifier).length,25);
  assert.deepEqual(person.sameAs,authored.sameAs);
  assert.deepEqual(person.identifier,authored.identifier);
  const researchGateUrl='https://www.researchgate.net/profile/Saeed-Ghezelbash-2';
  const researchGateId=SOURCE.canonicalOrigin+'/identifier-person-researchgate';
  assert.ok(person.sameAs.includes(researchGateUrl));
  assert.ok(ids(person.identifier).includes(researchGateId));
  assert.equal(actual.get(researchGateId).value,'Saeed-Ghezelbash-2');
  assert.equal(actual.get(researchGateId).url,researchGateUrl);
  assert.equal(person.birthDate,authored.birthDate['@value']);
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
    assert.equal(actual.get(physicianId).birthDate,'1991-05-29',resource.path+' retains the existing public birth date');
    const biography=resource.pagePurpose==='professional-biography';
    assert.equal(projected['@graph'].filter(node=>values(node['@type']).includes('ProfilePage')).length,home||biography?1:0,resource.path);
    assert.deepEqual(ids(primary.mainEntity),ids(page.mainEntity),resource.path+' mainEntity');
    assert.ok(actual.has(clinicId),resource.path+' includes the same personal practice');
    if(primaryPageId===clinicId+'#webpage') {
      assert.deepEqual(actual.get(physicianId).workLocation,canonical.get(physicianId).workLocation);
      for(const key of ['owner','founder'])assert.deepEqual(actual.get(clinicId)[key],clinic[key]);
    } else {
      assert.equal(actual.get(physicianId).workLocation,undefined,resource.path);
      assert.equal(actual.get(clinicId).owner,undefined,resource.path);
      assert.equal(actual.get(clinicId).founder,undefined,resource.path);
    }
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

test('the existing owner-confirmed professional-authority statement remains verbatim',()=>{
  const statements=[...AUTHORED_BODY.matchAll(/<span data-entity-authority-extension="true">[\s\S]*?<\/span>/g)];
  assert.equal(statements.length,1);
  const statement=statements[0][0];
  assert.equal(Buffer.byteLength(statement,'utf8'),853);
  assert.equal(createHash('sha256').update(statement).digest('hex'),'340ae843bfe465eae1928f2c321583cfe1ef25b29bcc997130d532ec0c80e312');
});
