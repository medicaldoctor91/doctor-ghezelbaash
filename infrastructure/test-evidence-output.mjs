import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SOURCE, AUTHORED_BODY } from '../src/canonical/source.mjs';
import { buildEvidenceSnapshot } from '../src/lib/machine-output.mjs';
import { materializeMachineResources } from './materialize-machine-resources.mjs';

const values = value => Array.isArray(value) ? value : value == null ? [] : [value];
const refId = value => typeof value === 'string' ? value : value?.['@id'];
const nodes = SOURCE.graph['@graph'];
const originalGraph = JSON.stringify(SOURCE.graph);
const snapshot = buildEvidenceSnapshot(SOURCE);
const byId = new Map(snapshot.evidence.map(item => [item.id, item]));
const assessments = nodes.filter(node => values(node['prov:hadMember']).some(member => member.propertyID === 'tier'));
assert.equal(assessments.length, 45, 'The canonical assessment fixtures remain present');
for (const node of assessments) {
  const targetId = refId(node.about);
  const item = byId.get(targetId);
  assert.ok(item, `Assessment target ${targetId} is included`);
  const projected = item.assessments?.find(assessment => assessment.id === node['@id']);
  assert.ok(projected, `Canonical assessment ${node['@id']} survives projection`);
  assert.deepEqual(projected.creatorIds, values(node.creator).map(refId), 'Assessment creator is retained as attribution');
  for (const member of node['prov:hadMember']) {
    assert.deepEqual(projected[member.propertyID], member.value, `Assessment ${member.propertyID} preserves its canonical value`);
  }
  assert.deepEqual(item.authorityTier, node['prov:hadMember'].find(member => member.propertyID === 'tier').value);
}
assert.equal(byId.get(SOURCE.canonicalOrigin + '/evidence-orcid').liveStatus, 'reachable-requires-js');
assert.equal(byId.get(SOURCE.canonicalOrigin + '/evidence-orcid').verificationStatus, 'unassessed', 'Reachability does not imply issuer verification');
assert.equal(byId.get(SOURCE.canonicalOrigin + '/evidence-irimc').liveStatus, 'verified');
assert.equal(byId.get(SOURCE.canonicalOrigin + '/evidence-irimc').independence, 'unknown', 'Authority tier and live status do not imply independence');
const strongClaim = byId.get(SOURCE.canonicalOrigin + '/claim-aaam-abam-specialist-board-certification-aesthetic-medicine');
assert.equal(strongClaim.assessmentStatus, 'unassessed');
assert.equal(strongClaim.verificationStatus, 'unassessed');
assert.equal(strongClaim.independence, 'unknown');
assert.equal(strongClaim.issuer, null, 'Self-attribution cannot manufacture an issuer');

const origin = 'https://example.test';
const subject = origin + '/#saeed-ghezelbash';
const evidenceId = origin + '/evidence';
const claimId = origin + '/claim';
const unassessedId = origin + '/unassessed';
const fixture = {
  canonicalOrigin: origin, edition: '2026-08-07',
  graph: { '@graph': [
    { '@id': subject, subjectOf: [{ '@id': evidenceId }, { '@id': unassessedId }, { '@id': evidenceId }] },
    { '@id': evidenceId, '@type': 'CreativeWork', name: 'Explicit source', url: origin + '/source', issuer: { '@id': origin + '/issuer' }, sourceIdentity: { '@id': origin + '/source-owner' }, supports: [{ '@id': claimId }, { '@id': origin + '/credential' }], evidenceAssessment: { '@id': origin + '/assessment' } },
    { '@id': unassessedId, '@type': 'CreativeWork', name: 'Self-attributed credential', url: origin + '/own-source', creator: { '@id': subject }, 'prov:wasAttributedTo': { '@id': subject } },
    { '@id': claimId, '@type': 'Claim', claimEvidence: { '@id': evidenceId } },
    { '@id': origin + '/assessment', about: { '@id': evidenceId }, 'prov:hadMember': [
      { propertyID: 'tier', value: 'A' },
      { propertyID: 'liveStatus', value: 'reachable' },
      { propertyID: 'verificationStatus', value: 'issuer-verified' },
      { propertyID: 'sourceOwnership', value: 'issuer-controlled' },
      { propertyID: 'independence', value: 'independent' },
      { propertyID: 'corroborationClass', value: 'independent' },
      { propertyID: 'role', value: 'credential-reference' },
      { propertyID: 'verifiedAt', value: '2026-08-07' },
      { propertyID: 'observedAt', value: '2026-08-06' },
      { propertyID: 'expectedMarkers', value: ['credential'] },
      { propertyID: 'observedMarkers', value: ['credential', 'issuer'] },
      { '@id': origin + '/hash-property' },
    ] },
    { '@id': origin + '/hash-property', '@type': 'PropertyValue', propertyID: 'contentHashSha256', value: 'abc123' },
  ] },
};
const explicit = buildEvidenceSnapshot(fixture).evidence.find(item => item.id === evidenceId);
assert.equal(explicit.issuer, origin + '/issuer');
assert.equal(explicit.sourceIdentity, origin + '/source-owner');
assert.equal(explicit.sourceOwnership, 'issuer-controlled');
assert.equal(explicit.independence, 'independent');
assert.equal(explicit.corroborationClass, 'independent');
assert.equal(explicit.authorityTier, 'A');
assert.equal(explicit.verificationStatus, 'issuer-verified');
assert.equal(explicit.liveStatus, 'reachable');
assert.equal(explicit.evidenceRole, 'credential-reference');
assert.equal(explicit.verifiedAt, '2026-08-07');
assert.equal(explicit.observedAt, '2026-08-06');
assert.deepEqual(explicit.expectedMarkers, ['credential']);
assert.deepEqual(explicit.observedMarkers, ['credential', 'issuer']);
assert.equal(explicit.contentHashSha256, 'abc123');
assert.deepEqual(explicit.supportedClaimIds, [claimId]);
assert.deepEqual(explicit.supports, [claimId, origin + '/credential']);
const unassessed = buildEvidenceSnapshot(fixture).evidence.find(item => item.id === unassessedId);
assert.equal(unassessed.assessmentStatus, 'unassessed');
assert.equal(unassessed.verificationStatus, 'unassessed');
assert.equal(unassessed.independence, 'unknown');
assert.equal(unassessed.sourceOwnership, 'unknown');
assert.equal(unassessed.issuer, null);
assert.equal(unassessed.observedAt, null, 'Release edition is not an evidence observation date');
assert.equal(unassessed.verifiedAt, null);
assert.deepEqual(unassessed.assessments, []);

const directFixture = structuredClone(fixture);
directFixture.graph['@graph'] = directFixture.graph['@graph'].filter(node => ![origin + '/assessment', origin + '/hash-property'].includes(node['@id']));
Object.assign(directFixture.graph['@graph'].find(node => node['@id'] === evidenceId), {
  authorityTier: 'B', verificationStatus: 'explicitly-unverified', liveStatus: 'reachable', independence: 'self-attributed', sourceOwnership: 'first-party', sourceHashSha256: 'source123', observedAt: { '@value': '2026-07-01' },
});
const direct = buildEvidenceSnapshot(directFixture).evidence.find(item => item.id === evidenceId);
assert.equal(direct.authorityTier, 'B');
assert.equal(direct.verificationStatus, 'explicitly-unverified');
assert.equal(direct.independence, 'self-attributed');
assert.equal(direct.sourceOwnership, 'first-party');
assert.equal(direct.sourceHashSha256, 'source123');
assert.equal(direct.observedAt, '2026-07-01');
assert.deepEqual(direct.supportedClaimIds, [claimId]);

for (const node of nodes.filter(node => values(node['@type']).includes('Claim'))) {
  const ids = ['claimEvidence', 'supportedBy', 'isBasedOn', 'prov:wasDerivedFrom'].flatMap(key => values(node[key]).map(refId));
  for (const id of ids.filter(id => byId.has(id))) assert.ok(byId.get(id).supportedClaimIds.includes(node['@id']), 'Inverse claim support remains auditable');
}
assert.equal(JSON.stringify(SOURCE.graph), originalGraph, 'Projection never mutates canonical truth');
assert.equal(nodes.length, 1592);
assert.deepEqual(buildEvidenceSnapshot(SOURCE), snapshot, 'Identical canonical inputs produce identical snapshots');
const reversed = structuredClone(fixture);
reversed.graph['@graph'].reverse();
assert.deepEqual(buildEvidenceSnapshot(reversed), buildEvidenceSnapshot(fixture), 'Node ordering cannot change projection bytes');
const dedicated = await import('../src/lib/evidence-output.mjs');
assert.equal(dedicated.buildEvidenceSnapshot, buildEvidenceSnapshot, 'Machine output re-exports the dedicated generator');
const packageJson = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
assert.match(packageJson.scripts['test:machine'], /node infrastructure\/test-evidence-output\.mjs/);
const distDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ghezelbaash-evidence-'));
try {
  await materializeMachineResources({ source: SOURCE, authoredBody: AUTHORED_BODY, distDir });
  const first = await fs.readFile(path.join(distDir, 'evidence-snapshot.json'), 'utf8');
  assert.equal(first, JSON.stringify(snapshot) + '\n', 'Materialization publishes the dedicated evidence projection');
  await materializeMachineResources({ source: SOURCE, authoredBody: AUTHORED_BODY, distDir });
  assert.equal(await fs.readFile(path.join(distDir, 'evidence-snapshot.json'), 'utf8'), first);
} finally {
  await fs.rm(distDir, { recursive: true, force: true });
}
console.log(`Evidence output contract passed: ${assessments.length} canonical assessments preserved; no inferred verification or independence.`);
