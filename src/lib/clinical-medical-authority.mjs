/**
 * Evidence-bounded medical knowledge graph around the same IndividualPhysician.
 *
 * Schema.org/IndividualPhysician inherits availableService from Physician.
 * Only MedicalProcedure/MedicalTherapy/MedicalTest (including DiagnosticProcedure,
 * a MedicalProcedure subtype) are allowed; NOT generic Service. Non-provided
 * surgeries and historical educational procedure concepts are excluded.
 *
 * Conditions represent medical topics rather than the physician's own health.
 * Their reciprocal subjectOf links require authored Article.about evidence.
 * Nothing here creates a credential, a specialty, a new procedure, a result,
 * an asserted clinical guideline, a diagnosis, or an unverified clinical claim.
 */
const many = x => x == null ? [] : Array.isArray(x) ? x : [x];
const id = x => typeof x === 'string' ? x : x?.['@id'];
const ref = x => ({'@id': x});
const types = x => many(x?.['@type']);
const has = (x,t) => types(x).includes(t);
const MEDICAL_RANGES = ['MedicalProcedure','MedicalTherapy','MedicalTest','DiagnosticProcedure'];
const exclusions = new Set([
  // Their source descriptions identify only assessment of surgical options,
  // rather than surgery actually performed at this physician's practice.
  'procedure-blepharoplasty',
  'procedure-central-lip-lift',
  'procedure-buccal-fat-removal',
  'procedure-submental-liposuction',
  'procedure-rhinoplasty',
  'procedure-facelift',
  'procedure-neck-lift',
  'procedure-body-aesthetic-surgery',
  // Source copy says assessment *or* treatment; do not claim personally
  // performed autologous fat transfer on this evidence alone.
  'procedure-autologous-fat-grafting',
]);

const uniqueIds = values => [...new Set(many(values).map(id))].filter(Boolean);

export function enrichEvidenceBoundedMedicalAuthority(graph, physician, origin) {
  if (!Array.isArray(graph) || !physician?.['@id'] || typeof origin !== 'string')
    throw new TypeError('Expected canonical graph, physician and origin');
  if (!has(physician,'Person') || !has(physician,'IndividualPhysician'))
    throw new Error('availableService requires an explicitly typed IndividualPhysician');
  const physicianId=physician['@id'];
  const nodes=new Map(graph.map(n=>[n['@id'],n]));
  if (nodes.size !== graph.length) throw new Error('Duplicate graph identifiers');
  const services=graph.filter(n=>has(n,'Service'));
  const medicalEntities=graph.filter(n=>MEDICAL_RANGES.some(t=>has(n,t)));
  const conditions=graph.filter(n=>has(n,'MedicalCondition'));
  const therapy=nodes.get(origin+'/procedure-botulinum-toxin-chronic-migraine');
  const migraineService=nodes.get(origin+'/service-botulinum-toxin-chronic-migraine');
  const medicallyTypedServices=services.filter(n=>MEDICAL_RANGES.some(t=>has(n,t)));
  const notDelivered=medicallyTypedServices.filter(n=>exclusions.has(n['@id'].slice(origin.length+1)));
  const surgerySet=new Set(notDelivered.map(n=>n['@id']));
  const recognizedSurgerySet=new Set([...exclusions].map(slug=>origin+'/'+slug));
  if (notDelivered.length !== exclusions.size ||
      notDelivered.some(n=>!recognizedSurgerySet.has(n['@id'])) ||
      services.length!==124 || conditions.length!==6 || medicallyTypedServices.length!==121)
    throw new Error('Clinical inventory drift: reviewed exclusion/source counts changed');
  if (!has(therapy,'MedicalTherapy') || has(therapy,'Service') ||
      !has(migraineService,'Service') ||
      !uniqueIds(migraineService.provider).includes(physicianId) ||
      !uniqueIds(migraineService['dcterms:subject']).includes(therapy['@id']))
    throw new Error('Chronic migraine MedicalTherapy/provider bridge is not evidenced');

  const eligible=medicallyTypedServices.filter(n=>{
    if (surgerySet.has(n['@id'])) return false;
    const providers=uniqueIds(n.provider);
    if(providers.length!==1 || providers[0]!==physicianId)
      throw new Error('Medical procedure incorrectly attributed: '+n['@id']);
    if(!uniqueIds(n.offers).length)
      throw new Error('Medical procedure has no physician Offer: '+n['@id']);
    return true;
  });
  const selected=[...eligible.map(n=>n['@id']),therapy['@id']];
  if (selected.length!==113 || new Set(selected).size!==113)
    throw new Error('Evidence-bounded medical availableService count drift');
  const stale=uniqueIds(physician.availableService);
  if (stale.length && stale.some(v=>!selected.includes(v)))
    throw new Error('Unexpected out-of-scope physician.availableService: '+stale.join(','));
  physician.availableService=selected.map(ref);

  const known=uniqueIds(physician.knowsAbout), knownSet=new Set(known);
  const addedConditionIds=[];
  let conditionSubjectOfEdges=0;
  for (const condition of conditions) {
    const possibilities=uniqueIds(condition.possibleTreatment);
    if (!possibilities.length || !possibilities.every(t=>{
      const target=nodes.get(t);
      return !!target && MEDICAL_RANGES.some(x=>has(target,x)) &&
        has(target,'Service') && uniqueIds(target.provider).includes(physicianId);
    })) throw new Error('Unverified MedicalCondition.possibleTreatment: '+condition['@id']);
    if (!knownSet.has(condition['@id'])) {
      physician.knowsAbout=[...many(physician.knowsAbout),ref(condition['@id'])];
      knownSet.add(condition['@id']);
      addedConditionIds.push(condition['@id']);
    }
    for(const work of graph) {
      if(!has(work,'Article') || typeof work.url!=='string') continue;
      if (!work.url.startsWith(origin+'/') || !uniqueIds(work.author).includes(physicianId))
        continue;
      if (!uniqueIds(work.about).includes(condition['@id'])) continue;
      if(!uniqueIds(condition.subjectOf).includes(work['@id'])) {
        condition.subjectOf=[...many(condition.subjectOf),ref(work['@id'])];
        conditionSubjectOfEdges++;
      }
    }
  }
  if(new Set(uniqueIds(physician.availableService)).size!==113)
    throw new Error('Duplicate availableService values');
  return {
    medicalInventory:medicalEntities.length,
    eligibleMedicalServices:eligible.length,
    selectedAvailableService:selected.length,
    excludedSurgeryAssessments:exclusions.size,
    medicallyTypedConditions:conditions.length,
    conditionKnowledgeAdded:addedConditionIds.length,
    physicianMedicalConditionKnowledge:conditions.every(c=>knownSet.has(c['@id'])),
    conditionSubjectOfEdgesAdded:conditionSubjectOfEdges
  };
}
