/**
 * Graph-only standard Schema.org authority closure.
 *
 * Reuse ONLY canonical, existing physician→organization/clinic, degree and
 * contact facts; populate their correctly typed semantic counterparts.
 * No invented employment, registration, certification, venue or identity.
 * Private solo practice intentionally uses owner/founder/practicesAt rather
 * than Person.worksFor, Clinic.employee or Clinic.medicalSpecialty. The
 * existing SHACL explicitly prohibits those three counterproductive edges.
 */
const ROOT='https://www.ghezelbaash.ir';
const DOCTOR=ROOT+'/#saeed-ghezelbash';
const CLINIC=ROOT+'/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah';
const SCHOOL=ROOT+'/kermanshah-university-of-medical-sciences';
const MEDICINE=ROOT+'/medical-specialty-aesthetic-medicine';
const DEGREE=ROOT+'/credential-doctor-of-medicine';
const PROFESSION=ROOT+'/occupation-physician';
const list=x=>x==null?[]:Array.isArray(x)?x:[x];
const id=x=>typeof x==='string'?x:x?.['@id'];
const refs=x=>list(x).map(id).filter(Boolean);
const ref=x=>({'@id':x});
const type=(x,t)=>list(x?.['@type']).includes(t);
const addUnique=(node,pred,iri)=>{
  const vals=refs(node[pred]);
  if(vals.includes(iri))return 0;
  node[pred]=[...list(node[pred]),ref(iri)];
  return 1;
};
const setExactRef=(node,pred,iri)=>{
  if(node[pred]!==undefined) {
    if(refs(node[pred]).length!==1 || refs(node[pred])[0]!==iri)
      throw new Error('Conflicting authority relation '+node['@id']+' '+pred);
    return 0;
  }
  node[pred]=ref(iri);
  return 1;
};
const setExactText=(node,pred,value)=>{
  if(node[pred]!==undefined) {
    if(node[pred]!==value)
      throw new Error('Conflicting occupational identity '+node['@id']+' '+pred);
    return 0;
  }
  node[pred]=value;
  return 1;
};

export function closeNativePhysicianAuthoritySchema(graph,physician){
  if(!Array.isArray(graph) || physician?.['@id']!==DOCTOR ||
      !type(physician,'Person') || !type(physician,'IndividualPhysician'))
    throw new Error('Unexpected physician or graph');
  const nodes=new Map(graph.map(n=>[n['@id'],n]));
  if(nodes.size!==graph.length || graph.length!==1916)
    throw new Error('Graph identity inventory drift');
  const clinic=nodes.get(CLINIC);
  const university=nodes.get(SCHOOL);
  const degree=nodes.get(DEGREE);
  const profession=nodes.get(PROFESSION);
  const specialty=nodes.get(MEDICINE);
  const memberOf=refs(physician.memberOf);
  const contact=refs(clinic?.contactPoint)[0];
  if(!type(clinic,'PhysiciansOffice') || !type(university,'CollegeOrUniversity') ||
      !type(degree,'EducationalOccupationalCredential') ||
      !type(profession,'Occupation') || !type(specialty,'MedicalSpecialty') ||
      memberOf.length!==4 || new Set(memberOf).size!==4 ||
      !memberOf.every(u=>type(nodes.get(u),'Organization')) ||
      refs(physician.practicesAt).length!==1 ||
      refs(physician.practicesAt)[0]!==CLINIC ||
      !refs(physician.owns).includes(CLINIC) ||
      refs(clinic.owner)[0]!==DOCTOR || refs(clinic.founder)[0]!==DOCTOR ||
      !refs(physician.alumniOf).includes(SCHOOL) ||
      !refs(physician.hasCredential).includes(DEGREE) ||
      !refs(physician.hasOccupation).includes(PROFESSION) ||
      refs(physician.medicalSpecialty)[0]!==MEDICINE ||
      !type(nodes.get(contact),'ContactPoint'))
    throw new Error('Canonical employer, member, degree and contact entailment missing');

  const added={};
  const add=(name,delta)=>{added[name]=(added[name]||0)+delta;};
  for(const org of memberOf){
    add('Person.affiliation',addUnique(physician,'affiliation',org));
    add('Organization.member',addUnique(nodes.get(org),'member',DOCTOR));
  }
  add('Person.contactPoint',setExactRef(physician,'contactPoint',contact));
  add('Person.occupationalCategory',setExactText(physician,'occupationalCategory','Physician'));
  add('Person.honorificSuffix',setExactText(physician,'honorificSuffix','M.D.'));
  add('University.alumni',addUnique(university,'alumni',DOCTOR));

  // Preserve source-authoritative directed edge types. Reverse links must be
  // exact: never infer credentials or certify additional medical specialties.
  if(refs(physician.affiliation).length!==memberOf.length ||
     !memberOf.every(org=>refs(nodes.get(org).member).includes(DOCTOR)) ||
     physician.worksFor!==undefined ||
     clinic.employee!==undefined ||
     clinic.medicalSpecialty!==undefined ||
     refs(university.alumni).includes(DOCTOR)===false)
    throw new Error('Incomplete native Schema.org authority closure');
  return {added,totalNewEdges:Object.values(added).reduce((a,b)=>a+b,0)};
}
