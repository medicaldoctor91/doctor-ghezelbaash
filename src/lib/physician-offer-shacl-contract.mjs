/**
 * Compile the canonical supplemental SHACL for the Schema.org-correct
 * physician Service / Offer graph. source.mjs contains the historical embedded
 * supplement; all published SHACL is compiled through this fail-closed patch.
 *
 * Schema.org availableService is NOT defined for Person and generic Service;
 * its domain is Physician / Hospital / MedicalClinic and range is
 * MedicalProcedure / MedicalTest / MedicalTherapy.
 */
const historicalAvailableService=
  '  sh:property [ sh:path schema:availableService ; sh:minCount 1 ] ;';
const correctedPhysicianContract=`  # Preserve physician authorship while enforcing the Schema.org range/domain.
  sh:property [ sh:path schema:availableService ; sh:maxCount 0 ] ;
  sh:property [ sh:path schema:makesOffer ; sh:class schema:Offer ; sh:minCount 124 ; sh:maxCount 124 ] ;
  sh:property [ sh:path schema:hasOfferCatalog ; sh:class schema:OfferCatalog ; sh:minCount 1 ; sh:maxCount 1 ] ;`;
const historicalShape='ex:AvailableServiceProviderShape a sh:NodeShape ;';
const nextShape='\n\nex:ImageLicenseShape a sh:NodeShape ;';
const validatedOfferShape=`ex:PhysicianOfferProviderLoopShape a sh:NodeShape ;
  sh:targetObjectsOf schema:makesOffer ;
  sh:class schema:Offer ;
  sh:property [ sh:path schema:offeredBy ; sh:hasValue <https://www.ghezelbaash.ir/#saeed-ghezelbash> ; sh:minCount 1 ; sh:maxCount 1 ] ;
  sh:property [ sh:path schema:itemOffered ; sh:class schema:Service ; sh:minCount 1 ; sh:maxCount 1 ] .`;

export function enforcePhysicianOfferShaclContract(source) {
  const validation=source?.validation;
  if(typeof validation?.shaclSupplement!=='string')
    throw new TypeError('Source supplemental SHACL required');
  const original=validation.shaclSupplement;
  if(original.includes('ex:PhysicianOfferProviderLoopShape') &&
     original.includes('sh:path schema:availableService ; sh:maxCount 0') &&
     !original.includes('sh:targetObjectsOf schema:availableService'))
    return false; // Idempotent. Canonical graph may be materialized repeatedly.

  const count=original.split(historicalAvailableService).length-1;
  const start=original.indexOf(historicalShape);
  const end=original.indexOf(nextShape,start);
  if(count!==1 || start<0 || end<0 || original.includes('ex:PhysicianOfferProviderLoopShape'))
    throw new Error('Unknown SHACL baseline: refuse weakening clinical validation');
  let updated=original.replace(historicalAvailableService,correctedPhysicianContract);
  const a=updated.indexOf(historicalShape),b=updated.indexOf(nextShape,a);
  updated=updated.slice(0,a)+validatedOfferShape+updated.slice(b);
  if(updated.includes('sh:targetObjectsOf schema:availableService') ||
     !updated.includes('sh:targetObjectsOf schema:makesOffer') ||
     !updated.includes('sh:path schema:availableService ; sh:maxCount 0'))
    throw new Error('Failed to migrate obsolete supplemental validation contract');
  validation.shaclSupplement=updated;
  return true;
}
