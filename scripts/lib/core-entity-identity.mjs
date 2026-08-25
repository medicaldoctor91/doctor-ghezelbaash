const asArray=value=>Array.isArray(value)?value:(value==null?[]:[value]);
const refId=value=>typeof value==='string'?value:value?.['@id'];
const fail=message=>{throw new Error(message)};
const exactValues=(actual,expected)=>actual.length===expected.length&&actual.every((value,index)=>value===expected[index]);

/**
 * Enforces unambiguous ownership of the two public Wikidata identifiers used
 * by the core physician/clinic topology. This is deliberately data-driven:
 * release.json owns the identifiers, while the graph may only project them
 * onto the matching entity and matching PropertyValue node.
 */
export function validateCoreEntityIdentity({release,nodes}){
  if(!Array.isArray(nodes))fail('Core entity identity validation requires graph nodes');
  const personQ=String(release?.primaryEntity?.wikidata||'');
  const clinicQ=String(release?.dataset?.supportingClinicWikidata||'');
  if(!/^Q[1-9]\d*$/.test(personQ)||!/^Q[1-9]\d*$/.test(clinicQ)||personQ===clinicQ)fail('Core Wikidata identifiers are invalid or collapsed');

  const byId=new Map(nodes.filter(node=>typeof node?.['@id']==='string').map(node=>[node['@id'],node]));
  const person=byId.get(release.primaryEntity.id);
  const clinic=byId.get(release.clinic.id);
  if(!person||!clinic)fail('Core Person/Clinic identity nodes are missing');

  const personIri=`https://www.wikidata.org/entity/${personQ}`;
  const clinicIri=`https://www.wikidata.org/entity/${clinicQ}`;
  const wikidataIris=node=>asArray(node.sameAs).map(refId).filter(value=>/^https:\/\/www\.wikidata\.org\/entity\/Q[1-9]\d*$/.test(value||'')).sort();
  if(!exactValues(wikidataIris(person),[personIri]))fail('Physician Wikidata sameAs ownership drift');
  if(!exactValues(wikidataIris(clinic),[clinicIri]))fail('Clinic Wikidata sameAs ownership drift');

  const verifyIdentifier=(entity,nodeId,value,url,label)=>{
    if(!asArray(entity.identifier).map(refId).includes(nodeId))fail(`${label} does not reference its Wikidata PropertyValue`);
    const node=byId.get(nodeId);
    if(!node||node.propertyID!=='Wikidata item ID'||node.value!==value||node.url!==url)fail(`${label} Wikidata PropertyValue drift`);
  };
  verifyIdentifier(person,`${release.canonicalUrl}#identifier-person-wikidata`,personQ,personIri,'Physician');
  verifyIdentifier(clinic,`${release.canonicalUrl}#identifier-clinic-wikidata`,clinicQ,clinicIri,'Clinic');

  const releaseMesh=asArray(release.primaryEntity.verifiedWebIdentityMesh).filter(value=>/^https:\/\/www\.wikidata\.org\/entity\/Q[1-9]\d*$/.test(value)).sort();
  if(!exactValues(releaseMesh,[personIri]))fail('Release physician identity mesh Wikidata ownership drift');
  return Object.freeze({personQ,personIri,clinicQ,clinicIri});
}
