const values = value => Array.isArray(value) ? value : value == null ? [] : [value];
const refId = value => typeof value === 'string' ? value : value?.['@id'];
const ids = value => [...new Set(values(value).map(refId).filter(Boolean))].sort();
const projectValue = value => {
  if (Array.isArray(value)) return value.map(projectValue);
  if (value && typeof value === 'object') {
    if (Object.hasOwn(value, '@value')) return value['@value'];
    if (Object.hasOwn(value, '@id')) return value['@id'];
    return structuredClone(value);
  }
  return value;
};
const label = value => {
  const entries = values(value);
  const selected = entries.find(entry => entry?.['@language'] === 'fa-IR' || entry?.['@language'] === 'fa') ?? entries[0];
  return projectValue(selected) ?? '';
};
const unique = entries => [...new Map(entries.map(entry => [JSON.stringify(entry), entry])).values()];
const summary = (records, keys, fallback) => {
  const found = unique(records.flatMap(record => keys.filter(key => Object.hasOwn(record, key)).map(key => projectValue(record[key]))));
  return found.length === 0 ? fallback : found.length === 1 ? found[0] : found;
};

// Assessment attribution describes who authored an assessment. It is never an
// issuer identity, an ownership class, or proof of independent corroboration.
function projectAssessment(node, byId) {
  const assessment = {
    id: node['@id'],
    aboutIds: ids(node.about),
    creatorIds: ids(node.creator),
    publisherIds: ids(node.publisher),
  };
  const members = values(node['prov:hadMember']).map(member => {
    const resolved = byId.get(refId(member));
    return resolved ? { ...resolved, ...(typeof member === 'object' ? member : {}) } : member;
  });
  for (const member of members) {
    if (member && typeof member === 'object' && typeof member.propertyID === 'string' && Object.hasOwn(member, 'value')) {
      assessment[member.propertyID] = structuredClone(member.value);
    }
  }
  // Direct assessment properties remain available alongside PropertyValue records.
  for (const key of ['authorityTier', 'verificationStatus', 'liveStatus', 'verifiedAt', 'observedAt', 'role', 'evidenceRole', 'expectedMarkers', 'observedMarkers', 'issuer', 'sourceIdentity', 'sourceOwnership', 'sourceOwnershipClass', 'independence', 'corroborationClass', 'sourceHashSha256', 'contentHashSha256']) {
    if (Object.hasOwn(node, key)) assessment[key] = projectValue(node[key]);
  }
  return assessment;
}

export function buildEvidenceSnapshot(source) {
  const subject = source.canonicalOrigin + '/#saeed-ghezelbash';
  const nodes = source.graph['@graph'];
  const byId = new Map(nodes.map(node => [node['@id'], node]));
  const person = byId.get(subject);
  const evidenceIds = new Set([...ids(person?.subjectOf), ...ids(person?.evidencedBy)]);
  const assessmentLinks = ['evidenceAssessment', 'verificationAssessment', 'assessment'];
  const linkedAssessmentIds = new Set(nodes.flatMap(node => assessmentLinks.flatMap(key => ids(node[key]))));
  const assessmentsByEvidence = new Map();
  for (const node of nodes) {
    const members = values(node['prov:hadMember']).map(member => byId.get(refId(member)) ?? member);
    if (!linkedAssessmentIds.has(node['@id']) && !members.some(member => typeof member?.propertyID === 'string')) continue;
    const targetIds = new Set([...ids(node.about), ...ids(node.isBasedOn)]);
    for (const evidence of nodes) {
      if (assessmentLinks.some(key => ids(evidence[key]).includes(node['@id']))) targetIds.add(evidence['@id']);
    }
    for (const id of targetIds) {
      if (!byId.has(id)) continue;
      evidenceIds.add(id);
      if (!assessmentsByEvidence.has(id)) assessmentsByEvidence.set(id, []);
      assessmentsByEvidence.get(id).push(projectAssessment(node, byId));
    }
  }
  const claimIdsByEvidence = new Map();
  for (const claim of nodes.filter(node => values(node['@type']).includes('Claim'))) {
    for (const id of new Set(['claimEvidence', 'supportedBy', 'isBasedOn', 'prov:wasDerivedFrom'].flatMap(key => ids(claim[key])))) {
      if (!claimIdsByEvidence.has(id)) claimIdsByEvidence.set(id, new Set());
      claimIdsByEvidence.get(id).add(claim['@id']);
    }
  }
  return {
    schemaVersion: 2,
    subject,
    edition: source.edition,
    // Canonical source currently authors no observation of the whole snapshot.
    observedAt: null,
    evidence: [...evidenceIds].filter(id => byId.has(id)).sort().map(id => {
      const node = byId.get(id);
      const assessments = (assessmentsByEvidence.get(id) ?? []).sort((a, b) => a.id.localeCompare(b.id));
      const records = [node, ...assessments];
      const supports = ids(node.supports);
      const supportedClaimIds = new Set([
        ...(claimIdsByEvidence.get(id) ?? []),
        ...ids(node.evidencesClaim),
        ...supports.filter(target => values(byId.get(target)?.['@type']).includes('Claim')),
      ]);
      return {
        id, type: values(node['@type']), name: label(node.name), url: projectValue(node.url) ?? '', dateModified: label(node.dateModified),
        issuer: summary(records, ['issuer'], null),
        sourceIdentity: summary(records, ['sourceIdentity'], null),
        sourceOwnership: summary(records, ['sourceOwnership', 'sourceOwnershipClass'], 'unknown'),
        authorityTier: summary(records, ['authorityTier', 'tier'], 'unknown'),
        // liveStatus is the authored reachability/observation result. Only an
        // explicit verificationStatus can assert issuer/claim verification.
        verificationStatus: summary(records, ['verificationStatus'], 'unassessed'),
        liveStatus: summary(records, ['liveStatus'], 'unknown'),
        independence: summary(records, ['independence'], 'unknown'),
        corroborationClass: summary(records, ['corroborationClass'], 'unknown'),
        verifiedAt: summary(records, ['verifiedAt'], null),
        observedAt: summary(records, ['observedAt'], null),
        evidenceRole: summary(records, ['evidenceRole', 'role'], 'unknown'),
        assessmentStatus: assessments.length ? 'assessed' : 'unassessed',
        assessmentIds: assessments.map(assessment => assessment.id),
        assessments,
        expectedMarkers: summary(records, ['expectedMarkers'], []),
        observedMarkers: summary(records, ['observedMarkers'], []),
        supports,
        assessmentSupports: summary(assessments, ['supports'], []),
        supportedClaimIds: [...supportedClaimIds].sort(),
        sourceHashSha256: summary(records, ['sourceHashSha256'], null),
        contentHashSha256: summary(records, ['contentHashSha256'], null),
      };
    }),
  };
}
