/**
 * Disambiguate the shared practice reception from direct physician online
 * assessment, using exactly the phone, e-mail and DM route already in the
 * canonical graph and the official practice contact page/Wikidata record.
 *
 * The reception ContactPoint stays a single named shared contact endpoint.
 * The doctor additionally receives a dedicated INLINE ContactPoint describing
 * how to request an initial physician assessment over the published DM route.
 * This is a separate CONTACT PURPOSE, NOT a new phone number, clinic, doctor,
 * guaranteed response time, clinical service or board certification.
 *
 * Do not introduce an extra @id: the 1.3.6 immutable graph inventory remains
 * fixed at 1,916 entities and the complete homepage graph stays within 2 MB.
 */
const ROOT='https://www.ghezelbaash.ir';
const PERSON=ROOT+'/#saeed-ghezelbash';
const CLINIC=ROOT+'/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah';
const RECEPTION=ROOT+'/online-consultation-contact-point';
const ONLINE=ROOT+'/online-consultation-channel';
const ON_SITE=ROOT+'/in-person-clinic-service-channel';
const ONLINE_ACTION=ROOT+'/action-online-initial-consultation';
const RECEPTION_ACTION=ROOT+'/action-contact-clinic';
const PHONE='+989308209494';
const EMAIL='doctor@ghezelbaash.ir';
const DM='https://ig.me/m/doctor.ghezelbaash';
const arr=x=>x==null?[]:Array.isArray(x)?x:[x];
const id=x=>typeof x==='string'?x:x?.['@id'];
const refs=x=>arr(x).map(id).filter(Boolean);
const ref=x=>({'@id':x});
const typed=(node,t)=>arr(node?.['@type']).includes(t);

const physicianDirectContact=Object.freeze({
  '@type':'ContactPoint',
  'contactType':'physician online initial assessment inquiries',
  'telephone':PHONE,
  'email':EMAIL,
  'url':DM,
  'availableLanguage':['fa-IR','en'],
});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export function closePhysicianAndPracticeContactGraph(graph,physician){
  if(!Array.isArray(graph) || graph.length!==1916 ||
      physician?.['@id']!==PERSON || !typed(physician,'IndividualPhysician'))
    throw new Error('Unexpected graph size or physician identity');
  const byId=new Map(graph.map(n=>[n['@id'],n]));
  if(byId.size!==graph.length)throw new Error('Duplicate contact graph IDs');
  const clinic=byId.get(CLINIC),reception=byId.get(RECEPTION),
    online=byId.get(ONLINE),onSite=byId.get(ON_SITE),
    action=byId.get(ONLINE_ACTION),book=byId.get(RECEPTION_ACTION);
  if(!typed(clinic,'PhysiciansOffice') || !typed(reception,'ContactPoint') ||
     !typed(online,'ServiceChannel') || !typed(onSite,'ServiceChannel') ||
     !typed(action,'CommunicateAction') || !typed(book,'CommunicateAction') ||
     clinic.telephone!==PHONE || physician.telephone!==PHONE ||
     reception.telephone!==PHONE ||
     refs(clinic.contactPoint).length!==1 ||
     refs(clinic.contactPoint)[0]!==RECEPTION ||
     !refs(physician.contactPoint).includes(RECEPTION) ||
     !arr(physician.email).includes('mailto:'+EMAIL) ||
     online.serviceUrl!==DM || action.target!==DM ||
     refs(action.recipient)[0]!==PERSON ||
     book.target!=='tel:'+PHONE || refs(book.recipient)[0]!==CLINIC ||
     !arr(online.availableLanguage).includes('en') ||
     !arr(online.availableLanguage).includes('fa-IR'))
    throw new Error('Unverified person/clinic contact source or recipient');

  // Wikidata clinic item and the public contact page agree on this address.
  if(clinic.email!==undefined && clinic.email!==EMAIL)
    throw new Error('Conflicting clinic public email');
  if(reception.email!==undefined && reception.email!==EMAIL)
    throw new Error('Conflicting practice reception email');
  clinic.email=EMAIL;
  reception.email=EMAIL;

  // Keep the EXISTING reception path for both person and office, while the
  // physician's own direct DM route is described by a separate ContactPoint.
  // This is an inline blank node; it does not claim a second physical office.
  const previous=arr(physician.contactPoint);
  const inline=previous.filter(x=>x && typeof x==='object' &&
    typed(x,'ContactPoint') && !x['@id']);
  if(inline.length>1 || (inline.length===1&&!same(inline[0],physicianDirectContact)) ||
     previous.filter(x=>id(x)===RECEPTION).length!==1 ||
     previous.length>2)
    throw new Error('Unexpected preexisting physician contact routes');
  if(inline.length===0)
    physician.contactPoint=[ref(RECEPTION),structuredClone(physicianDirectContact)];

  // The published clinic switchboard is a valid contact endpoint for
  // the existing IN-PERSON service channel, which already points at this
  // practice. Do not claim the switchboard is available 24/7.
  if(refs(onSite.serviceLocation).length!==1 ||
     refs(onSite.serviceLocation)[0]!==CLINIC)
    throw new Error('In-person service is not physically at this practice');
  if(onSite.servicePhone!==undefined &&
     (refs(onSite.servicePhone).length!==1 ||
      refs(onSite.servicePhone)[0]!==RECEPTION))
    throw new Error('Unexpected in-person ServiceChannel phone');
  onSite.servicePhone=ref(RECEPTION);
  if(refs(online.servicePhone).length)throw new Error('Online DM channel must not be turned into a second phone line');

  if(refs(physician.contactPoint).length!==1 ||
     refs(physician.contactPoint)[0]!==RECEPTION ||
     arr(physician.contactPoint).length!==2 ||
     !same(arr(physician.contactPoint)[1],physicianDirectContact) ||
     clinic.email!==reception.email)
    throw new Error('Incomplete doctor vs office contact disambiguation');
  return {doctorContactModes:2,clinicContactModes:1,sharedTelephone:PHONE,
    distinctDirectOnlineContact:true,additionalGraphEntityIds:0};
}
