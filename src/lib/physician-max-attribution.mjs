/**
 * Exhaustive graph-only physician attribution closure.
 *
 * Treat canonical authored content, medical availability and the established
 * MedicalSpecialty as the authority for *directly entailed* inverse edges.
 * The data itself is the source of truth; do not fetch external metadata,
 * create credentials, fabricate medical conditions or services, or mutate HTML.
 */
const many=x=>x==null?[]:Array.isArray(x)?x:[x];
const id=x=>typeof x==='string'?x:x?.['@id'];
const ref=x=>({'@id':x});
const types=n=>many(n?.['@type']);
const is=(n,t)=>types(n).includes(t);
const ids=x=>many(x).map(id).filter(Boolean);
const unique=x=>[...new Set(x)];
const ID='https://www.ghezelbaash.ir/#saeed-ghezelbash';
const ORIGIN='https://www.ghezelbaash.ir';

function appendIfMissing(node,predicate,iri) {
  if(ids(node[predicate]).includes(iri))return false;
  node[predicate]=[...many(node[predicate]),ref(iri)];
  return true;
}

export function maximizeCanonicalPhysicianGraphAttribution(source,physician,origin=ORIGIN) {
  const graph=source?.graph?.['@graph'];
  if(!Array.isArray(graph)||physician?.['@id']!==ID||origin!==ORIGIN)
    throw new TypeError('Unexpected canonical physician or graph scope');
  const lookup=new Map(graph.map(x=>[x['@id'],x]));
  if(lookup.size!==graph.length||!is(physician,'IndividualPhysician'))
    throw new Error('Canonical graph collision or physician identity drift');
  const specialtyId=id(physician.medicalSpecialty);
  const specialty=lookup.get(specialtyId);
  if(specialtyId!==origin+'/medical-specialty-aesthetic-medicine' ||
     !is(specialty,'MedicalSpecialty'))
    throw new Error('Canonical aesthetic medicine specialty not resolved');

  // 1. Every physician-authored Article is explicitly navigable from the
  // physician using the already declared ontology:authoredWork property.
  // This is precisely the inverse of each existing Article.author assertion.
  const articles=graph.filter(x=>is(x,'Article') && ids(x.author).includes(ID));
  const otherAuthored=ids(physician.authoredWork);
  if(articles.length!==65 || ![6,68].includes(otherAuthored.length) ||
     otherAuthored.some(x=>!lookup.has(x)))
    throw new Error('Published author/research portfolio cardinality drift');
  let authoredWorkAdded=0;
  for(const article of articles)
    if(appendIfMissing(physician,'authoredWork',article['@id']))authoredWorkAdded++;

  // 2. Directly authored Article.about => topic is an actual knowsAbout
  // candidate. Include *only* the existing technical medical concepts,
  // medical specialty and medical procedures; exclude self, location,
  // company and incidental mentions. Do not equate knowledge with board
  // certifications or a guaranteed clinical outcome.
  let knowledgeAdded=0;
  const known=new Set(ids(physician.knowsAbout));
  for(const article of articles)for(const topicId of ids(article.about)){
    const topic=lookup.get(topicId);
    if(!topic || !['DefinedTerm','MedicalSpecialty','MedicalProcedure',
        'MedicalTherapy','MedicalCondition'].some(t=>is(topic,t)))continue;
    if(known.has(topicId))continue;
    physician.knowsAbout=[...many(physician.knowsAbout),ref(topicId)];
    known.add(topicId);knowledgeAdded++;
  }
  if(knowledgeAdded!==13 && known.size!==244)
    throw new Error('Canonical authored Article.about medical concepts drift');

  // 2b. Close research topics already explicitly named as subject of the
  // physician's existing ScholarlyArticle and authored presentation.
  // These are topics of scholarship only: no new therapy or psychiatric care.
  const scholarlyTopics=[
    ['biomedical-concept-omega-3-fatty-acids','article-omega-3-bipolar-i-2016'],
    ['biomedical-concept-dissociative-disorders','presentation-attachment-style-dissociative-depression-2017']
  ];
  let scholarlyKnowledgeAdded=0,scholarlySubjectOfAdded=0;
  for(const [conceptSlug,workSlug] of scholarlyTopics){
    const topic=lookup.get(origin+'/'+conceptSlug);
    const work=lookup.get(origin+'/'+workSlug);
    if(!is(topic,'DefinedTerm') ||
       !work || !ids(work.author).includes(ID) ||
       !ids(work.about).includes(topic['@id']) ||
       !ids(physician.authoredWork).includes(work['@id']) ||
       !['ScholarlyArticle','PresentationDigitalDocument'].some(t=>is(work,t)))
      throw new Error('Canonical research topic authorship missing: '+conceptSlug);
    if(appendIfMissing(physician,'knowsAbout',topic['@id']))
      scholarlyKnowledgeAdded++;
    if(appendIfMissing(topic,'subjectOf',work['@id']))
      scholarlySubjectOfAdded++;
    if(topic.possibleTreatment || topic.relevantSpecialty)
      throw new Error('Do not infer therapy or clinical specialty from authored research');
  }

  // 3. All 112 clinician-offered medically typed Services are already in
  // IndividualPhysician.availableService. MedicalEntity.relevantSpecialty
  // may truthfully connect the aesthetic medical procedures to this same
  // physician's existing declared medical specialty. Excludes psychiatric
  // research topics, assessment-only surgeries and standalone migraine care.
  const available=new Set(ids(physician.availableService));
  if(available.size!==113)throw new Error('Medical availableService changed');
  const clinicalMedical=graph.filter(x=>available.has(x['@id']) &&
    is(x,'Service') && (is(x,'MedicalProcedure')||is(x,'MedicalTherapy')||
      is(x,'DiagnosticProcedure')||is(x,'MedicalTest')));
  if(clinicalMedical.length!==112)throw new Error('Medically typed offered inventory drift');
  let specialtyAdded=0;
  for(const entity of clinicalMedical){
    if(ids(entity.provider).length!==1 || ids(entity.provider)[0]!==ID ||
       ids(entity.offers).length!==1)
      throw new Error('Medical service/provider/Offer mismatch '+entity['@id']);
    const previous=ids(entity.relevantSpecialty);
    if(previous.length && (previous.length!==1 || previous[0]!==specialtyId))
      throw new Error('Conflicting medical specialty '+entity['@id']);
    if(!previous.length) {
      entity.relevantSpecialty=ref(specialtyId);
      specialtyAdded++;
    }
  }

  // 4. A CreativeWork.about link carries a schema.org subjectOf inverse.
  // Complete specialty.subjectOf from explicitly physician-authored
  // Articles, without incorrectly marking incidental article mentions.
  let specialtySubjectOfAdded=0;
  for(const article of articles)
    if(ids(article.about).includes(specialtyId) &&
       appendIfMissing(specialty,'subjectOf',article['@id']))
      specialtySubjectOfAdded++;

  if(ids(physician.authoredWork).length!==68 ||
     ids(physician.knowsAbout).length!==246 ||
     clinicalMedical.filter(x=>ids(x.relevantSpecialty)[0]!==specialtyId).length ||
     specialtySubjectOfAdded<0)
    throw new Error('Incomplete physician graph-only attribution closure');

  // Fail closed on every crosslinked Article and topic. All targets must
  // resolve inside the immutable node inventory.
  for(const authoredId of ids(physician.authoredWork))
    if(!lookup.has(authoredId))throw new Error('Dangling authoredWork '+authoredId);
  for(const authored of articles)
    if(!ids(physician.authoredWork).includes(authored['@id']))
      throw new Error('Authored Article omitted from physician '+authored['@id']);
  for(const authoredId of ids(specialty.subjectOf)){
    const work=lookup.get(authoredId);
    if(!is(work,'Article') || !ids(work.author).includes(ID) ||
       !ids(work.about).includes(specialtyId))
      throw new Error('Unjustified MedicalSpecialty.subjectOf '+authoredId);
  }
  return {
    articleAuthorCount:articles.length,
    directPhysicianAuthoredWorkAdded:authoredWorkAdded,
    personAuthoredWork:ids(physician.authoredWork).length,
    additionalPhysicianKnowsAbout:knowledgeAdded,
    personKnowsAbout:ids(physician.knowsAbout).length,
    additionalScholarlyTopics:scholarlyKnowledgeAdded,
    scholarlyTopicSubjectOfEdges:scholarlySubjectOfAdded,
    actualMedicalServiceSpecialtyAdded:specialtyAdded,
    attributedMedicalServices:clinicalMedical.length,
    physicianAuthoredSpecialtyBacklinksAdded:specialtySubjectOfAdded,
    specialtySubjectOf:ids(specialty.subjectOf).length,
    graphNodeCount:graph.length
  };
}
