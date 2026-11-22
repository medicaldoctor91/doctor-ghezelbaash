/**
 * Graph-only, bounded medical authority enrichment for the existing physician.
 *
 * Separate research subjects from interventions offered in the practice:
 * a co-authored medical paper is proof of research-topic attribution,
 * NOT proof of psychiatric treatment at the aesthetic clinic.
 *
 * The 2MB homepage-first contract constrains the number of specialty
 * edges, so relevantSpecialty is restricted to the most semantically
 * specific MedicalTherapy and DiagnosticProcedure objects and clinical
 * MedicalCondition objects, not sprayed over 112 procedures.
 */
const arr=x=>x==null?[]:Array.isArray(x)?x:[x];
const id=x=>typeof x==='string'?x:x?.['@id'];
const refs=x=>arr(x).map(id).filter(Boolean);
const ref=x=>({'@id':x});
const types=x=>arr(x?.['@type']);
const typed=(x,t)=>types(x).includes(t);
const ORIGIN='https://www.ghezelbaash.ir';
const clinicalConditionSlugs=Object.freeze([
  'biomedical-concept-alopecia',
  'biomedical-concept-androgenetic-alopecia',
  'biomedical-concept-telogen-effluvium',
  'biomedical-concept-hyperhidrosis',
  'biomedical-concept-acne-vulgaris',
  'biomedical-concept-scar',
  'biomedical-concept-hyperpigmentation',
  'biomedical-concept-melasma',
]);
const studiedConditions=Object.freeze([
  ['biomedical-concept-major-depressive-disorder','article-mdd-attachment-dissociation-trauma-2021'],
  ['biomedical-concept-bipolar-disorder','article-omega-3-bipolar-i-2016'],
]);
const shapeOld=`ex:MedicalConditionTreatmentShape a sh:NodeShape ;
  sh:targetClass schema:MedicalCondition ;
  sh:property [ sh:path schema:possibleTreatment ; sh:class schema:MedicalTherapy ; sh:minCount 1 ] .`;
const clinicalTreatmentShape=`ex:MedicalConditionTreatmentShape a sh:NodeShape ;
  sh:targetNode ${clinicalConditionSlugs.map(x=>'ex:'+x).join(' , ')} ;
  sh:property [ sh:path schema:possibleTreatment ; sh:class schema:MedicalTherapy ; sh:minCount 1 ] .`;
const researchShape=`ex:ResearchOnlyMedicalConditionShape a sh:NodeShape ;
  sh:targetNode ${studiedConditions.map(x=>'ex:'+x[0]).join(' , ')} ;
  sh:property [ sh:path schema:subjectOf ; sh:class schema:ScholarlyArticle ; sh:minCount 1 ] ;
  sh:property [ sh:path schema:possibleTreatment ; sh:maxCount 0 ] ;
  sh:property [ sh:path schema:relevantSpecialty ; sh:maxCount 0 ] .`;
const specialtyShape=`ex:BoundedClinicalRelevantSpecialtyShape a sh:NodeShape ;
  sh:targetSubjectsOf schema:relevantSpecialty ;
  sh:property [ sh:path schema:relevantSpecialty ;
    sh:hasValue ex:medical-specialty-aesthetic-medicine ;
    sh:minCount 1 ; sh:maxCount 1 ] .`;

function ensureSpecialty(node,specialtyId) {
  const existing=refs(node.relevantSpecialty);
  if(existing.length && (existing.length!==1 || existing[0]!==specialtyId))
    throw new Error('Conflicting clinical specialty: '+node['@id']);
  node.relevantSpecialty=ref(specialtyId);
}

export function enrichMedicalResearchAndSpecialtyGraph(source,physician,origin=ORIGIN) {
  const graph=source?.graph?.['@graph'];
  if(!Array.isArray(graph) || !physician || id(physician)!==undefined && !physician['@id'] ||
     origin!==ORIGIN) throw new TypeError('Unexpected canonical medical authority inputs');
  const byId=new Map(graph.map(n=>[n['@id'],n]));
  if(byId.size!==graph.length) throw new Error('Duplicate graph nodes');
  if(!typed(physician,'IndividualPhysician'))throw new Error('Expected IndividualPhysician');
  const physicianId=physician['@id'];
  const specialtyId=refs(physician.medicalSpecialty)[0];
  if(specialtyId!==origin+'/medical-specialty-aesthetic-medicine' ||
     !typed(byId.get(specialtyId),'MedicalSpecialty'))
    throw new Error('Existing physician medicalSpecialty changed');

  // Only actual patient-facing medical therapy/diagnostic Service nodes,
  // never assessment-only surgery or academic topics.
  const medicalNodes=graph.filter(n=>
    typed(n,'Service') &&
    (typed(n,'MedicalTherapy') || typed(n,'DiagnosticProcedure')) &&
    refs(n.provider).length===1 && refs(n.provider)[0]===physicianId &&
    refs(physician.availableService).includes(n['@id']));
  if(medicalNodes.length!==26 || new Set(medicalNodes.map(n=>n['@id'])).size!==26)
    throw new Error('Patient-facing MedicalTherapy/DiagnosticProcedure scope drift');
  for(const n of medicalNodes)ensureSpecialty(n,specialtyId);

  // MedicalCondition itself is a medical topic, not the doctor's diagnosis.
  for(const slug of clinicalConditionSlugs) {
    const n=byId.get(origin+'/'+slug);
    if(!typed(n,'MedicalCondition') || !refs(n.possibleTreatment).length)
      throw new Error('Existing treated clinical MedicalCondition missing: '+slug);
    ensureSpecialty(n,specialtyId);
  }
  const knowledge=new Set(refs(physician.knowsAbout));
  const recorded=[];
  for(const [slug,articleSlug] of studiedConditions) {
    const condition=byId.get(origin+'/'+slug);
    const article=byId.get(origin+'/'+articleSlug);
    if(!typed(condition,'DefinedTerm') ||
       !typed(article,'ScholarlyArticle') ||
       !refs(article.author).includes(physicianId) ||
       !refs(article.about).includes(condition['@id']) ||
       !refs(physician.authoredWork).includes(article['@id']) ||
       !arr(condition.sameAs).length ||
       !arr(condition.identifier).length)
      throw new Error('Study-to-condition author attribution missing: '+slug);
    if(typed(condition,'MedicalCondition')===false)
      condition['@type']=[...types(condition),'MedicalCondition'];
    if(condition.possibleTreatment || condition.relevantSpecialty)
      throw new Error('Psychiatric research subject cannot become a clinic treatment: '+slug);
    const previous=refs(condition.subjectOf);
    if(previous.some(x=>x!==article['@id']))
      throw new Error('Unexpected research condition subjectOf: '+slug);
    if(!previous.includes(article['@id']))
      condition.subjectOf=[...arr(condition.subjectOf),ref(article['@id'])];
    if(!knowledge.has(condition['@id'])) {
      physician.knowsAbout=[...arr(physician.knowsAbout),ref(condition['@id'])];
      knowledge.add(condition['@id']);
    }
    recorded.push({condition:condition['@id'],scholarlyArticle:article['@id']});
  }
  if(![231,246].includes(refs(physician.knowsAbout).length) ||
     graph.filter(n=>typed(n,'MedicalCondition')).length!==10)
    throw new Error('Incomplete clinical/research subject graph');

  // Existing SHACL now applies clinical possibleTreatment to exactly eight
  // clinical conditions. The two study subjects instead require a scholarly
  // attribution and explicitly forbid invented treatment/specialty links.
  const validation=source.validation;
  const current=validation?.shaclSupplement;
  if(typeof current!=='string')throw new Error('Compiled SHACL missing');
  if(!current.includes('ex:ResearchOnlyMedicalConditionShape')) {
    if(current.split(shapeOld).length!==2)throw new Error('Unreviewed medical treatment SHACL baseline');
    validation.shaclSupplement=current.replace(shapeOld,
      [clinicalTreatmentShape,researchShape,specialtyShape].join('\n\n'));
  } else if(!current.includes(clinicalTreatmentShape) ||
     !current.includes(researchShape) ||
     !current.includes(specialtyShape) || current.includes(shapeOld))
    throw new Error('Compiled clinical vs research SHACL contract was weakened');
  return {clinicalConditions:8,researchConditions:recorded.length,
    medicallySpecializedServices:medicalNodes.length,
    medicallySpecializedConditions:clinicalConditionSlugs.length,
    researchConditions:recorded};
}
