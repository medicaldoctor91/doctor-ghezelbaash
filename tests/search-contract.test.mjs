import test from 'node:test';
import assert from 'node:assert/strict';
import {closeSearchReferences, projectBoundedSearchDocument, projectHomeSearchGraph, assertBoundedSearchDocument} from '../src/lib/search-contract.mjs';
import {SOURCE} from '../src/canonical/source.mjs';

const origin = 'https://example.test';
const personId = origin + '/#saeed-ghezelbash';
const homeId = origin + '/webpage';
const pageId = origin + '/treatment#webpage';

for (const preselected of [false, true]) {
  test(`reference closure retains the physician of a ${preselected ? 'preselected' : 'newly resolved'} supporting ProfilePage`, () => {
    const primary = {'@id': pageId, '@type': 'MedicalWebPage', name: 'Treatment',
      isPartOf: {'@id': homeId}, mainEntity: {'@id': origin + '/treatment'}};
    const person = {'@id': personId, '@type': 'Person', name: 'Example Physician',
      mainEntityOfPage: {'@id': homeId}};
    const home = {'@id': homeId, '@type': ['ProfilePage', 'MedicalWebPage'], url: origin + '/',
      name: 'Physician profile', inLanguage: 'en', mainEntity: {'@id': personId},
      hasPart: {'@id': origin + '/unrelated-article'}, description: 'Full homepage corpus'};
    const treatment = {'@id': origin + '/treatment', '@type': 'MedicalProcedure', name: 'Treatment'};
    const unrelated = {'@id': origin + '/unrelated-article', '@type': 'Article', name: 'Unrelated article'};
    const graph = {'@graph': [primary, person, home, treatment, unrelated]};
    const before = structuredClone(graph);
    const document = {'@context': 'https://schema.org', '@graph': structuredClone(preselected ? [primary, home] : [primary])};

    closeSearchReferences(document, {origin, graph, primaryPageId: pageId,
      project: id => graph['@graph'].find(node => node['@id'] === id), authorityIsScoped: true});

    const byId = new Map(document['@graph'].map(node => [node['@id'], node]));
    const profile = byId.get(homeId);
    assert.deepEqual(profile['@type'], ['ProfilePage', 'MedicalWebPage']);
    assert.deepEqual(profile.mainEntity, {'@id': personId});
    assert.equal(byId.get(profile.mainEntity['@id'])['@type'], 'Person');
    assert.equal(profile.hasPart, undefined, 'a supporting page must not expand its content inventory');
    assert.equal(profile.description, undefined);
    assert.equal(byId.has(unrelated['@id']), false);
    assert.deepEqual(graph, before, 'reference closure must not mutate the canonical graph');
  });
}

test('supporting clinical pages remain identity links without importing their mainEntity corpus', () => {
  const citedId = origin + '/other-treatment#webpage';
  const primary = {'@id': pageId, '@type': 'MedicalWebPage', citation: {'@id': citedId}};
  const cited = {'@id': citedId, '@type': 'MedicalWebPage', name: 'Other treatment',
    mainEntity: {'@id': origin + '/other-treatment'}};
  const unrelated = {'@id': origin + '/other-treatment', '@type': 'MedicalProcedure', name: 'Other treatment'};
  const graph = {'@graph': [primary, cited, unrelated]};
  const document = {'@context': 'https://schema.org', '@graph': [structuredClone(primary)]};

  closeSearchReferences(document, {origin, graph, primaryPageId: pageId,
    project: id => graph['@graph'].find(node => node['@id'] === id), authorityIsScoped: true});

  const byId = new Map(document['@graph'].map(node => [node['@id'], node]));
  assert.equal(byId.get(citedId).mainEntity, undefined);
  assert.equal(byId.has(unrelated['@id']), false);
});

test('focused support identities preserve clinical credentials and expertise without importing their inventories', () => {
  const credentialId = origin + '/credential';
  const skillId = origin + '/skill';
  const termSetId = origin + '/skill-registry';
  const identifierId = origin + '/professional-code';
  const organizationId = origin + '/medical-council';
  const evidenceId = origin + '/supporting-evidence';
  const primary = {'@id': pageId, '@type': 'MedicalWebPage', name: 'Treatment',
    mainEntity: {'@id': origin + '/treatment'}, author: {'@id': personId}};
  const person = {'@id': personId, '@type': ['Person', 'IndividualPhysician'], name: 'Example Physician',
    description: 'Exact professional positioning text.', disambiguatingDescription: 'Exact identity text.',
    sameAs: ['https://example.org/physician'], identifier: {'@id': identifierId},
    hasCredential: {'@id': credentialId}, skills: {'@id': skillId}, knowsAbout: {'@id': skillId},
    subjectOf: {'@id': evidenceId}, availableService: {'@id': origin + '/unrelated-service'}};
  const credential = {'@id': credentialId, '@type': 'EducationalOccupationalCredential',
    name: 'Medical registration', description: 'Exact credential description.', credentialCategory: 'Registration',
    identifier: '167430', educationalLevel: 'Doctorate', recognizedBy: {'@id': organizationId},
    url: 'https://example.org/registration', about: {'@id': personId}, subjectOf: {'@id': evidenceId}};
  const skill = {'@id': skillId, '@type': 'DefinedTerm', name: 'Treatment planning',
    description: 'Exact topic-specific expertise.', termCode: 'SKILL-1', inDefinedTermSet: {'@id': termSetId},
    subjectOf: {'@id': evidenceId}};
  const termSet = {'@id': termSetId, '@type': 'DefinedTermSet', name: 'Clinical skills',
    hasDefinedTerm: [{'@id': skillId}, {'@id': origin + '/unrelated-skill'}]};
  const identifier = {'@id': identifierId, '@type': 'PropertyValue', propertyID: 'Medical council code', value: '167430'};
  const organization = {'@id': organizationId, '@type': 'Organization', name: 'Medical council',
    url: 'https://example.org/council', sameAs: ['https://example.org/council-identity'],
    member: {'@id': origin + '/other-member'}};
  const treatment = {'@id': origin + '/treatment', '@type': 'MedicalProcedure', name: 'Treatment', provider: {'@id': personId}};
  const graph = {'@graph': [primary, person, credential, skill, termSet, identifier, organization, treatment,
    {'@id': evidenceId, '@type': 'WebPage', name: 'Evidence'},
    {'@id': origin + '/unrelated-service', '@type': 'Service', name: 'Unrelated service'},
    {'@id': origin + '/unrelated-skill', '@type': 'DefinedTerm', name: 'Unrelated skill'},
    {'@id': origin + '/other-member', '@type': 'Person', name: 'Other member'}]};
  const before = structuredClone(graph);
  const document = {'@context': 'https://schema.org', '@graph': [structuredClone(primary)]};

  closeSearchReferences(document, {origin, graph, primaryPageId: pageId,
    project: id => graph['@graph'].find(node => node['@id'] === id)});

  const byId = new Map(document['@graph'].map(node => [node['@id'], node]));
  const outputPerson = byId.get(personId);
  for (const key of ['description', 'disambiguatingDescription', 'sameAs', 'identifier', 'hasCredential', 'skills', 'knowsAbout'])
    assert.deepEqual(outputPerson[key], person[key], 'physician ' + key);
  for (const key of ['name', 'description', 'identifier', 'credentialCategory', 'educationalLevel', 'recognizedBy', 'url'])
    assert.deepEqual(byId.get(credentialId)[key], credential[key], 'credential ' + key);
  for (const key of ['name', 'description', 'termCode', 'inDefinedTermSet'])
    assert.deepEqual(byId.get(skillId)[key], skill[key], 'expertise ' + key);
  assert.deepEqual(byId.get(identifierId), identifier);
  assert.equal(byId.get(organizationId).name, organization.name);
  assert.deepEqual(byId.get(organizationId).sameAs, organization.sameAs);
  assert.deepEqual(byId.get(origin + '/treatment'), treatment, 'the actual clinical topic remains complete');
  for (const id of [evidenceId, origin + '/unrelated-service', origin + '/unrelated-skill', origin + '/other-member'])
    assert.equal(byId.has(id), false, 'support inventory leaked: ' + id);
  assert.deepEqual(graph, before, 'support projection must not modify the full canonical graph');
});

test('visible questions and media survive independently of supporting identity inventories', () => {
  const primary = {'@id': pageId, '@type': 'MedicalWebPage', name: 'Treatment'};
  const question = {'@id': origin + '/question', '@type': 'Question', name: 'Visible question',
    acceptedAnswer: {'@id': origin + '/answer'}};
  const answer = {'@id': origin + '/answer', '@type': 'Answer', text: 'Exact visible answer.'};
  const video = {'@id': origin + '/video', '@type': 'VideoObject', name: 'Visible video',
    hasPart: {'@id': origin + '/clip'}};
  const clip = {'@id': origin + '/clip', '@type': 'Clip', name: 'Visible clip'};
  const graph = {'@graph': [primary, question, answer, video, clip]};
  const document = {'@context': 'https://schema.org', '@graph': [structuredClone(primary)]};

  closeSearchReferences(document, {origin, graph, primaryPageId: pageId,
    visibleQuestionIds: [question['@id']], visibleMediaIds: [video['@id']],
    project: id => graph['@graph'].find(node => node['@id'] === id)});

  const byId = new Map(document['@graph'].map(node => [node['@id'], node]));
  for (const node of [question, answer, video, clip]) assert.deepEqual(byId.get(node['@id']), node);
});

test('focused procedures retain content meaning without a duplicate reciprocal content index', () => {
  const procedureId = origin + '/treatment';
  const primary = {'@id': pageId, '@type': 'MedicalWebPage', name: 'Treatment',
    mainEntity: {'@id': procedureId}, about: {'@id': procedureId}};
  const question = {'@id': origin + '/question', '@type': 'Question', name: 'Visible question',
    about: {'@id': procedureId}, acceptedAnswer: {'@id': origin + '/answer'}};
  const answer = {'@id': origin + '/answer', '@type': 'Answer', text: 'Exact visible answer.'};
  const procedure = {'@id': procedureId, '@type': ['MedicalProcedure', 'Service'], name: 'Treatment',
    subjectOf: [{'@id': pageId}, {'@id': question['@id']}, {'@id': origin + '/independent-source'}]};
  const independent = {'@id': origin + '/independent-source', '@type': 'Article', name: 'Independent evidence'};
  const graph = {'@graph': [primary, procedure, question, answer, independent]};
  const before = structuredClone(graph);
  const document = {'@context': 'https://schema.org', '@graph': [structuredClone(primary)]};

  closeSearchReferences(document, {origin, graph, primaryPageId: pageId,
    visibleQuestionIds: [question['@id']], project: id => graph['@graph'].find(node => node['@id'] === id)});

  const byId = new Map(document['@graph'].map(node => [node['@id'], node]));
  assert.deepEqual(byId.get(pageId), primary);
  assert.deepEqual(byId.get(question['@id']), question);
  assert.deepEqual(byId.get(procedureId).subjectOf, [{'@id': independent['@id']}], 'nonreciprocal evidence remains');
  assert.deepEqual(byId.get(independent['@id']), independent);
  assert.deepEqual(graph, before, 'the full canonical graph retains both authored directions');
});

test('the real physician retains contact, practice, education, occupation and licensed image identities', () => {
  const graph = SOURCE.graph;
  const canonical = new Map(graph['@graph'].map(node => [node['@id'], node]));
  const origin = SOURCE.canonicalOrigin;
  const physicianId = origin + '/#saeed-ghezelbash';
  const physician = canonical.get(physicianId);
  const primary = {'@id': origin + '/test-clinical-page#webpage', '@type': 'MedicalWebPage',
    name: 'Clinical page', mainEntity: {'@id': physicianId}};
  const before = structuredClone(graph);
  const document = {'@context': 'https://schema.org', '@graph': [primary]};

  closeSearchReferences(document, {origin, graph, primaryPageId: primary['@id'], project: id => canonical.get(id)});

  const output = new Map(document['@graph'].map(node => [node['@id'], node]));
  const actual = output.get(physicianId);
  assert.ok(actual['@type'].includes('IndividualPhysician'));
  for (const key of ['additionalType', 'additionalName', 'nationality', 'email', 'telephone', 'address', 'geo',
    'practicesAt', 'workLocation', 'owns', 'areaServed', 'image', 'alumniOf', 'potentialAction', 'hasOccupation']) {
    if (key in physician) assert.deepEqual(actual[key], physician[key], 'real physician ' + key);
  }
  const address = output.get(actual.address['@id']);
  assert.ok([address['@type']].flat().includes('PostalAddress'));
  for (const key of ['streetAddress', 'addressLocality', 'addressRegion', 'addressCountry', 'postalCode'])
    assert.deepEqual(address[key], canonical.get(actual.address['@id'])[key], 'complete physician address ' + key);
  assert.equal(output.get(actual.practicesAt['@id']).owner['@id'], physicianId);
  const images = [actual.image].flat();
  assert.ok(images.length, 'the physician must retain its published image identities');
  for (const ref of images) {
    const image = output.get(ref['@id']), original = canonical.get(ref['@id']);
    assert.ok(image && [image['@type']].flat().includes('ImageObject'));
    for (const key of ['name', 'alternateName', 'description', 'caption', 'contentUrl', 'encodingFormat', 'width', 'height',
      'creator', 'publisher', 'copyrightHolder', 'copyrightNotice', 'creditText', 'license', 'acquireLicensePage'])
      if (key in original) assert.deepEqual(image[key], original[key], 'licensed image ' + key);
    assert.equal(image.encoding, undefined, 'supporting images do not expand rendition inventories');
    assert.equal(image.isPartOf, undefined, 'supporting images do not expand the homepage corpus');
  }
  assert.deepEqual(graph, before, 'the real canonical graph must remain unchanged');
});

test('the real homepage Search document is finite and preserves clinical identity and licensed image claims', () => {
  const original=structuredClone(SOURCE.graph);
  const canonical=new Map(SOURCE.graph['@graph'].map(node=>[node['@id'],node]));
  const projected=projectHomeSearchGraph(SOURCE.graph,SOURCE.canonicalOrigin);
  const actual=new Map(projected['@graph'].map(node=>[node['@id'],node]));
  const physicianId=SOURCE.canonicalOrigin+'/#saeed-ghezelbash';
  const physician=actual.get(physicianId),authored=canonical.get(physicianId);
  const home=actual.get(SOURCE.canonicalOrigin+'/webpage');
  assert.deepEqual(home['@type'],['ProfilePage','MedicalWebPage']);
  assert.equal(home.mainEntity['@id'],physicianId);
  assert.ok(physician['@type'].includes('Person'));
  assert.equal(typeof physician.name,'string');
  for(const key of ['telephone','email','sameAs','hasCredential','identifier','hasOccupation','owns','practicesAt']) {
    if(key==='owns')assert.deepEqual(physician[key],authored[key].filter(ref=>ref['@id'].includes('aesthetic-clinic')));
    else assert.deepEqual(physician[key],authored[key],key+' remains the authored clinical claim');
  }
  const address=actual.get(physician.address['@id']);
  for(const key of ['streetAddress','addressLocality','addressRegion','addressCountry','postalCode'])assert.equal(address[key],canonical.get(physician.address['@id'])[key]);
  assert.deepEqual(physician.image,authored.image.map(ref=>canonical.get(ref['@id']).contentUrl));
  for(const ref of authored.image) {
    const image=actual.get(ref['@id']),truth=canonical.get(ref['@id']);
    assert.equal(image.creator['@id'],physicianId);
    for(const key of ['contentUrl','license','acquireLicensePage','creditText','copyrightNotice'])assert.deepEqual(image[key],truth[key]);
    for(const key of ['width','height'])if(truth[key])assert.equal(image[key],typeof truth[key]==='number'?truth[key]:truth[key].value??canonical.get(truth[key]['@id']).value);
  }
  assert.equal(projected['@context'],'https://schema.org','URL strings stay terminal browser values rather than coerced self-links');
  assert.ok(Buffer.byteLength(JSON.stringify(projected))<=38000,'critical identity markup fits before the preserved full data');
  const stats=assertBoundedSearchDocument(projected);
  assert.ok(stats.expandedObjects<4096);
  assert.ok(stats.maxDepth<=12);
  assert.deepEqual(SOURCE.graph,original,'canonical facts and every authored literal are untouched');
});

test('clinical Search projection keeps the visible questions, breadcrumb and media without reciprocal inventories', () => {
  const ids={topic:origin+'/treatment',clinic:origin+'/clinic',image:origin+'/portrait',question:origin+'/question',answer:origin+'/answer',video:origin+'/video',clip:origin+'/clip',breadcrumb:origin+'/breadcrumb',address:origin+'/address'};
  const graph={'@context':'https://schema.org','@graph':[
    {'@id':pageId,'@type':'MedicalWebPage',name:'Treatment',mainEntity:{'@id':ids.topic},author:{'@id':personId},isPartOf:{'@id':homeId},breadcrumb:{'@id':ids.breadcrumb}},
    {'@id':homeId,'@type':['ProfilePage','MedicalWebPage'],url:origin+'/',mainEntity:{'@id':personId}},
    {'@id':personId,'@type':['Person','IndividualPhysician'],name:'Example Physician',description:'Exact clinical biography.',mainEntityOfPage:{'@id':homeId},owns:[{'@id':ids.clinic}],practicesAt:{'@id':ids.clinic},image:[{'@id':ids.image}],address:{'@id':ids.address}},
    {'@id':ids.clinic,'@type':['PhysiciansOffice','LocalBusiness'],name:'Clinic',owner:{'@id':personId},address:{'@id':ids.address}},
    {'@id':ids.address,'@type':'PostalAddress',streetAddress:'Street',addressLocality:'City'},
    {'@id':ids.image,'@type':'ImageObject',contentUrl:origin+'/photo.jpg',creator:{'@id':personId},license:'https://creativecommons.org/licenses/by/4.0/'},
    {'@id':ids.topic,'@type':'MedicalProcedure',name:'Treatment',description:'Exact clinical topic.',subjectOf:{'@id':pageId}},
    {'@id':ids.question,'@type':'Question',name:'Visible question?',acceptedAnswer:{'@id':ids.answer},isPartOf:{'@id':homeId},about:{'@id':ids.topic}},
    {'@id':ids.answer,'@type':'Answer',text:'Exact visible answer.',isPartOf:{'@id':ids.question}},
    {'@id':ids.video,'@type':'VideoObject',name:'Visible video',description:'Exact video description.',contentUrl:origin+'/video.mp4',thumbnailUrl:origin+'/poster.jpg',uploadDate:'2026-10-01T10:00:00Z',creator:{'@id':personId},isPartOf:{'@id':pageId},hasPart:[{'@id':ids.clip}]},
    {'@id':ids.clip,'@type':'Clip',name:'Chapter',url:origin+'/video?t=10',startOffset:10,endOffset:20,isPartOf:{'@id':ids.video}},
    {'@id':ids.breadcrumb,'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Home',item:origin+'/'},{'@type':'ListItem',position:2,name:'Treatment',item:origin+'/treatment'}]},
  ]};
  const before=structuredClone(graph);
  const result=projectBoundedSearchDocument(graph,{graph,primaryPageId:pageId,language:'en',visibleQuestionIds:[ids.question],visibleMediaIds:[ids.video]});
  const actual=new Map(result['@graph'].map(node=>[node['@id'],node]));
  assert.equal(actual.has(homeId),false,'an internal clinical page does not impersonate the home profile');
  assert.equal(actual.get(ids.answer).text,'Exact visible answer.');
  assert.equal(actual.get(ids.video).description,'Exact video description.');
  assert.equal(actual.get(ids.clip).startOffset,10);
  assert.deepEqual(actual.get(ids.breadcrumb),before['@graph'].find(node=>node['@id']===ids.breadcrumb));
  assert.equal(actual.get(ids.topic).subjectOf,undefined);
  assert.equal(actual.get(ids.question).isPartOf,undefined);
  assert.equal(actual.get(personId).mainEntityOfPage,undefined);
  assert.equal(actual.get(ids.clinic).owner,undefined,'the physician owns edge already carries the clinical ownership claim');
  assert.deepEqual(actual.get(personId).image,[origin+'/photo.jpg']);
  assert.ok(assertBoundedSearchDocument(result).expandedObjects<4096);
  assert.deepEqual(graph,before);
});

test('Search graph guard rejects merged identifier cycles and dangling local entities', () => {
  assert.throws(()=>assertBoundedSearchDocument({'@graph':[
    {'@id':pageId,'@type':'ProfilePage',mainEntity:{'@id':personId}},
    {'@id':personId,'@type':'Person',mainEntityOfPage:{'@id':pageId}},
  ]}),/Cyclic Search entity reference/);
  assert.throws(()=>assertBoundedSearchDocument({'@graph':[
    {'@id':pageId,'@type':'MedicalWebPage',author:{'@id':origin+'/missing'}},
  ]}),/Unresolved local Search entity/);
});

test('Search graph depth is checked even when a shared child was memoized earlier', () => {
  const leaf={'@id':origin+'/leaf','@type':'Thing'};
  const shared={'@id':origin+'/shared','@type':'Thing',about:{'@id':leaf['@id']}};
  const root={'@id':pageId,'@type':'MedicalWebPage',about:{'@id':shared['@id']}};
  assert.throws(()=>assertBoundedSearchDocument({'@graph':[leaf,shared,root]},{maxDepth:1}),/depth budget/);
});
