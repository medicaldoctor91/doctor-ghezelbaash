/**
 * Graph-only clinical intake and publisher-principles closure.
 * Medical content principles are an embedded CreativeWork (not a fabricated
 * public URL), summarizing the site's existing author/review/citation practice.
 * isAcceptingNewPatients is Boolean and valid on MedicalOrganization:
 * IndividualPhysician inherits Physician -> MedicalOrganization.
 */
const ORIGIN='https://www.ghezelbaash.ir';
const PERSON=ORIGIN+'/#saeed-ghezelbash';
const CLINIC=ORIGIN+'/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah';
const POLICY=Object.freeze({
  '@type':'CreativeWork',
  name:'Clinical editorial principles',
  text:'Physician-authored, medically reviewed and cited.'
});
const types=n=>Array.isArray(n?.['@type'])?n['@type']:[n?.['@type']];
export function closePhysicianPublishingAndPatientIntake(graph,physician) {
  if(!Array.isArray(graph)||physician?.['@id']!==PERSON ||
     !types(physician).includes('IndividualPhysician')||graph.length!==1916)
    throw new Error('Unexpected Person or medical graph');
  const map=new Map(graph.map(n=>[n['@id'],n]));
  if(map.size!==1916)throw new Error('Canonical identifiers duplicated');
  const clinic=map.get(CLINIC);
  if(!types(clinic).includes('PhysiciansOffice') ||
     clinic?.owner?.['@id']!==PERSON ||
     clinic?.founder?.['@id']!==PERSON ||
     physician.practicesAt?.['@id']!==CLINIC ||
     (physician.hospitalAffiliation!==undefined))
    throw new Error('Clinic ownership or historical hospital identity contract changed');

  // Acceptance at the sole physician/practice is a current operational flag,
  // not a new physician-provider entity or a hospital affiliation.
  for(const node of [physician,clinic]) {
    if(node.isAcceptingNewPatients!==undefined &&
       node.isAcceptingNewPatients!==true)
      throw new Error('Contradictory new-patient intake status: '+node['@id']);
    node.isAcceptingNewPatients=true;
  }

  // A graph-native editorial statement; do not claim a nonexistent policy
  // webpage, external publishing institution or independent clinical review.
  if(physician.publishingPrinciples!==undefined &&
     JSON.stringify(physician.publishingPrinciples)!==JSON.stringify(POLICY))
    throw new Error('Unexpected editorial policy content');
  physician.publishingPrinciples=structuredClone(POLICY);

  // A former hospital technical-director occupation does not identify a
  // specific Hospital. hospitalAffiliation is reserved for a named, grounded
  // Hospital and cannot validly be fabricated from that historical Role.
  return {publisherPolicy:'inline-CreativeWork',acceptingPhysician:true,
    acceptingPractice:true,hospitalAffiliationAdded:false};
}
