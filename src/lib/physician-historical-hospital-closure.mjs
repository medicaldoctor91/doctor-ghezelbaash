/**
 * Hospital affiliation is historical. The physician's pre-existing former
 * hospital-medical-technical-director Role holds its 2020–2021 time scope.
 * The exact Google Maps listing supplied by the physician identifies the
 * hospital; neither the current practice nor employer relationships change.
 *
 * The external Maps URL is the Hospital @id, avoiding an invented local
 * page/route or an unreferenced extra canonical graph node.
 */
const ORIGIN='https://www.ghezelbaash.ir';
const DOCTOR=ORIGIN+'/#saeed-ghezelbash';
const ROLE=ORIGIN+'/role-former-hospital-medical-technical-director';
const MAPS='https://maps.app.goo.gl/cknJK2yufL2e9idHA';
const HOSPITAL=Object.freeze({
  '@id':MAPS,
  '@type':'Hospital',
  name:'بیمارستان آریا',
  alternateName:'Aria Hospital',
  identifier:'/g/1tdyd345',
  address:{'@type':'PostalAddress',addressLocality:'کرمانشاه',addressCountry:'IR'},
  geo:{'@type':'GeoCoordinates',latitude:34.3006168,longitude:47.0527056},
});
const ref=x=>({'@id':x});
const arr=x=>x==null?[]:Array.isArray(x)?x:[x];
const ids=x=>arr(x).map(v=>typeof v==='string'?v:v?.['@id']);
const SCHEMA_TYPED_IRIS=Object.freeze([
 'url','sameAs','image','contentUrl','thumbnailUrl','license',
 'codeRepository','serviceUrl','hasMap','isBasedOn','inDefinedTermSet',
 'additionalType','eventAttendanceMode','measuredProperty',
 'procedureType','dayOfWeek','target','acquireLicensePage',
]);

export function linkHistoricAriaHospital(source,physician) {
  const nodes=source?.graph?.['@graph'];
  const ctx=source?.graph?.['@context'];
  if(!Array.isArray(nodes) || nodes.length!==1916 ||
     physician?.['@id']!==DOCTOR || ctx?.['@vocab']!=='https://schema.org/' ||
     ctx.schema!=='https://schema.org/' || new Set(nodes.map(n=>n['@id'])).size!==1916)
    throw new Error('Unexpected canonical physician graph/context');
  const oldRole=nodes.find(n=>n['@id']===ROLE);
  if(!oldRole || !arr(oldRole['@type']).includes('Role') ||
     !ids(physician.holdsProfessionalRole).includes(ROLE) ||
     ids(oldRole.roleHolder)[0]!==DOCTOR ||
     oldRole['dcterms:temporal']!=='2020–2021' ||
     ids(oldRole.hasOccupation)[0]!==ORIGIN+'/occupation-hospital-medical-technical-director')
    throw new Error('Historical 2020–2021 hospital technical-director role missing');

  // No fabricated current hospital job. Use the existing historical role to
  // communicate the period for the otherwise timeless hospitalAffiliation.
  if(physician.hospitalAffiliation!==undefined &&
     JSON.stringify(physician.hospitalAffiliation)!==JSON.stringify(HOSPITAL))
    throw new Error('Unexpected hospital identity; refuse unrelated hospital');
  if(oldRole.roleContext!==undefined &&
     (ids(oldRole.roleContext).length!==1 || ids(oldRole.roleContext)[0]!==MAPS))
    throw new Error('Historical role points at a different hospital');

  const newHospital=physician.hospitalAffiliation===undefined;
  const newRole=oldRole.roleContext===undefined;
  physician.hospitalAffiliation=structuredClone(HOSPITAL);
  oldRole.roleContext=ref(MAPS);

  // JSON-LD 1.1: @vocab maps these 18 schema.org terms to the same IRIs
  // even when their redundant explicit @id is omitted. @type:'@id' remains,
  // so all URL-valued fields retain their IRI, not string-literal, meaning.
  // This frees ~481 bytes for the named Hospital without dropping any triples.
  let compacted=0;
  for(const term of SCHEMA_TYPED_IRIS){
    const entry=ctx[term];
    if(!entry || entry['@type']!=='@id' ||
       (entry['@id']!==undefined && entry['@id']!=='schema:'+term))
      throw new Error('Unreviewed URL-typed schema term mapping: '+term);
    if(entry['@id']!==undefined){
      delete entry['@id'];
      compacted++;
    }
  }
  const compactAliases=Object.values(ctx).filter(v=>v && typeof v==='object' &&
    !Array.isArray(v) && typeof v['@id']==='string' &&
    (v['@id'].startsWith('schema:') || v['@id'].startsWith('kg:'))).length;
  if(compactAliases!==26 || (compacted!==18 && compacted!==0))
    throw new Error('Lossless JSON-LD context compaction invariant failed');
  return {hospital:MAPS,role:ROLE,historicalPeriod:oldRole['dcterms:temporal'],
    hospitalAdded:newHospital,roleContextAdded:newRole,compactedSchemaTerms:compacted};
}
