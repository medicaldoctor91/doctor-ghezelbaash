const values=value=>Array.isArray(value)?value:value==null?[]:[value];
const refIds=value=>values(value).map(ref=>typeof ref==='string'?ref:ref?.['@id']).filter(Boolean);
const types=node=>values(node?.['@type']).map(type=>String(type).replace(/^https?:\/\/schema\.org\//,''));

/** Stable identities shared by the physician profile and the dependent practice. */
export function physicianIdentityIds(origin='https://www.ghezelbaash.ir') {
  const base=new URL(origin).origin;
  return {
    personId:base+'/#saeed-ghezelbash',
    practiceId:base+'/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah',
  };
}

/**
 * Resolve the canonical sole-provider practice, never the first owned asset or
 * arbitrary LocalBusiness. Inspect the full authored graph: bounded Search
 * documents deliberately omit reciprocal owner/founder edges to stay acyclic.
 * Return the original node without mutating it, or null when identity,
 * practice typing, or physician ownership does not agree.
 */
export function resolvePhysicianPractice(graph,{origin}={}) {
  const nodes=Array.isArray(graph)?graph:graph?.['@graph'];
  if(!Array.isArray(nodes))return null;
  const {personId,practiceId}=physicianIdentityIds(origin);
  const persons=nodes.filter(node=>node?.['@id']===personId);
  const practices=nodes.filter(node=>node?.['@id']===practiceId);
  if(persons.length!==1||practices.length!==1)return null;
  const person=persons[0],practice=practices[0],practiceTypes=types(practice);
  if(!types(person).includes('Person')||!practiceTypes.includes('PhysiciansOffice')||
      !practiceTypes.includes('LocalBusiness')||practiceTypes.includes('Person')||
      practiceTypes.includes('IndividualPhysician'))return null;
  const proprietors=[...refIds(practice.owner),...refIds(practice.founder)];
  if(!proprietors.length||proprietors.some(id=>id!==personId))return null;
  if(![...refIds(person.owns),...refIds(person.practicesAt)].includes(practiceId))return null;
  return practice;
}
