/**
 * Compile the supplemental SHACL from the immutable authored source baseline.
 * IndividualPhysician inherits Physician.availableService, but targets must
 * be medically typed (MedicalProcedure/MedicalTherapy/MedicalTest).
 * The 124 Service/Offer loops remain independently required.
 */
const historicalAvailableService='  sh:property [ sh:path schema:availableService ; sh:minCount 1 ] ;';
const physicianContract=`  # IndividualPhysician is a subclass of Physician, and may use availableService.
  # Every availableService object must satisfy the MedicalProcedure / MedicalTherapy
  # / MedicalTest ontology, and 9 assessment-only surgical subjects are excluded.
  sh:property [ sh:path schema:availableService ; sh:minCount 113 ; sh:maxCount 113 ] ;
  sh:property [ sh:path schema:makesOffer ; sh:class schema:Offer ; sh:minCount 124 ; sh:maxCount 124 ] ;
  sh:property [ sh:path schema:hasOfferCatalog ; sh:class schema:OfferCatalog ; sh:minCount 1 ; sh:maxCount 1 ] ;`;
const historicalShape='ex:AvailableServiceProviderShape a sh:NodeShape ;';
const nextShape='\n\nex:ImageLicenseShape a sh:NodeShape ;';
const sourceExcluded=[
  'procedure-blepharoplasty','procedure-central-lip-lift',
  'procedure-buccal-fat-removal','procedure-submental-liposuction',
  'procedure-rhinoplasty','procedure-facelift','procedure-neck-lift',
  'procedure-body-aesthetic-surgery','procedure-autologous-fat-grafting',
  'procedure-cryolipolysis-localized-fat-reduction',
];
const medicalShape=`ex:IndividualPhysicianAvailableMedicalCareShape a sh:NodeShape ;
  sh:targetObjectsOf schema:availableService ;
  sh:or (
    [ sh:class schema:MedicalProcedure ]
    [ sh:class schema:DiagnosticProcedure ]
    [ sh:class schema:MedicalTherapy ]
    [ sh:class schema:MedicalTest ]
  ) ;
  sh:not [ sh:in ( ${sourceExcluded.map(s=>'ex:'+s).join(' ')} ) ] ;
  sh:or (
    [ sh:property [ sh:path schema:provider ;
        sh:hasValue <https://www.ghezelbaash.ir/#saeed-ghezelbash> ;
        sh:minCount 1 ; sh:maxCount 1 ] ]
    [ sh:in ( ex:procedure-botulinum-toxin-chronic-migraine ) ;
      sh:property [ sh:path [ sh:inversePath dct:subject ] ;
        sh:hasValue ex:service-botulinum-toxin-chronic-migraine ;
        sh:minCount 1 ] ]
  ) .

ex:PhysicianOfferProviderLoopShape a sh:NodeShape ;
  sh:targetObjectsOf schema:makesOffer ;
  sh:class schema:Offer ;
  sh:property [ sh:path schema:offeredBy ;
    sh:hasValue <https://www.ghezelbaash.ir/#saeed-ghezelbash> ;
    sh:minCount 1 ; sh:maxCount 1 ] ;
  sh:property [ sh:path schema:itemOffered ; sh:class schema:Service ;
    sh:minCount 1 ; sh:maxCount 1 ] .`;

export function enforcePhysicianOfferShaclContract(source) {
  const validation=source?.validation;
  if(typeof validation?.shaclSupplement!=='string')
    throw new TypeError('Source supplemental SHACL required');
  const original=validation.shaclSupplement;
  if(original.includes('ex:IndividualPhysicianAvailableMedicalCareShape')) {
    const valid=original.includes(physicianContract) &&
      original.includes(medicalShape) &&
      !original.includes(historicalAvailableService) &&
      !original.includes('sh:path schema:availableService ; sh:maxCount 0');
    if(!valid)throw new Error('Unknown SHACL baseline: medical or Offer contract weakened');
    return false;
  }
  // ClinicAssetShape intentionally forbids availableService, because the clinic
  // is a dependent location; that existing maxCount=0 must remain untouched.
  if(original.includes('ex:PhysicianOfferProviderLoopShape') ||
      original.split(historicalAvailableService).length!==2)
    throw new Error('Unknown SHACL baseline: refuse weak or obsolete clinical contract');
  const a=original.indexOf(historicalShape),b=original.indexOf(nextShape,a);
  if(a<0||b<0)throw new Error('Missing historical medical availability SHACL anchor');
  let updated=original.replace(historicalAvailableService,physicianContract);
  const x=updated.indexOf(historicalShape),y=updated.indexOf(nextShape,x);
  updated=updated.slice(0,x)+medicalShape+updated.slice(y);
  if (!updated.includes(medicalShape) || !updated.includes(physicianContract) ||
      updated.includes(historicalShape))
    throw new Error('Failed to compile exact medical and provider SHACL');
  validation.shaclSupplement=updated;
  return true;
}
