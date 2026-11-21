/**
 * Compact second JSON-LD document for the two explicitly physician-focused
 * profile pages. The complete clinical knowledge graph remains at /graph.jsonld.
 * Only expertise and services genuinely represented in the site are summarized.
 * Identifiers reuse the canonical entity graph; no duplicate new identities.
 */
const values = value => value == null ? [] : Array.isArray(value) ? value : [value];
const ref = id => ({'@id':id});
const skills=[
 'skill-botulinum-toxin-injection','skill-dermal-filler-injection','skill-thread-lifting',
 'skill-subcision','skill-hyaluronidase-filler-revision-complication-management',
 'skill-skin-rejuvenation','skill-acne-scar-assessment-multimodal-treatment-planning',
 'skill-hair-loss-evaluation-treatment-planning','skill-periprocedural-risk-complication-management',
 'skill-melasma-multimodal-planning','skill-facial-thread-vector-planning',
 'skill-tear-trough-filler-candidacy'
];
const clinicalServices=[
 'procedure-botulinum-toxin-aesthetic-treatment',
 'procedure-facial-and-lip-dermal-filler',
 'procedure-thread-lift','procedure-subcision',
 'procedure-skin-mesotherapy',
 'procedure-hair-loss-evaluation-and-treatment'
];
function localized(value,language){
 if(typeof value==='string') return value;
 const base=language.split('-')[0];
 const arr=values(value);
 return arr.find(item=>item?.['@language']===language)?.['@value']
   ??arr.find(item=>item?.['@language']===base)?.['@value']
   ??arr.find(item=>item?.['@language']==='en')?.['@value']
   ??arr[0]?.['@value']??'';
}
export function physicianAuthoritySupplement(graph,{origin='https://www.ghezelbaash.ir',language='fa-IR'}={}){
 const byId = new Map(graph['@graph'].map(node=>[node['@id'],node]));
 const pid=origin+'/#saeed-ghezelbash',catalogId=origin+'/physician-clinical-offer-catalog';
 const person=byId.get(pid),catalog=byId.get(catalogId);
 if(!person||!catalog)throw new Error('Clinical authority supplement requires canonical physician and offer catalog');
 const nodes=[];
 const skillNodes=skills.map(slug=>byId.get(origin+'/'+slug));
 const serviceNodes=clinicalServices.map(slug=>byId.get(origin+'/'+slug));
 if([...skillNodes,...serviceNodes].some(node=>!node))throw new Error('Clinical authority supplement references an unavailable entity');
 nodes.push({
   '@id':pid,'@type':'Person',
   skills:skillNodes.map(node=>ref(node['@id'])),
   availableService:serviceNodes.map(node=>ref(node['@id'])),
   hasOfferCatalog:ref(catalogId)
 });
 nodes.push({'@id':catalogId,'@type':'OfferCatalog',
   name:localized(catalog.name,language),
   numberOfItems:catalog.numberOfItems
 });
 for(const node of skillNodes)nodes.push({'@id':node['@id'],'@type':'DefinedTerm',
   name:localized(node.name,language),termCode:node.termCode});
 for(const node of serviceNodes){
   if(!values(node['@type']).includes('Service') ||
     !values(node['@type']).some(t=>['MedicalProcedure','MedicalTherapy','DiagnosticProcedure'].includes(t)))
     throw new Error('Profile service is not appropriately medically typed: '+node['@id']);
   nodes.push({'@id':node['@id'],
      '@type':values(node['@type']).filter(t=>t!=='Service'),
      name:localized(node.name,language)});
 }
 return {'@context':'https://schema.org','@graph':nodes};
}
