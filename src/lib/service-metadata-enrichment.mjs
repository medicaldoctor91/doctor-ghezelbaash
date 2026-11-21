/**
 * Evidence-bounded enrichment of EXISTING clinical Service and linked Offer nodes.
 * This does not create a service, offer, clinical claim, professional credential,
 * patient outcome, procedure availability or public page.
 * Published titles, source URLs, existing specialist types and 9 offer groups
 * are the only inputs used for derived descriptions and taxonomy.
 */
const values = value => value == null ? [] : Array.isArray(value) ? value : [value];
const id = value => typeof value === 'string' ? value : value?.['@id'];
const ref = value => ({'@id': value});
const text = (literal,language) => {
  if (typeof literal === 'string') return literal;
  const localized=values(literal).filter(x=>x&&typeof x==='object'&&x['@language']?.startsWith(language));
  return (localized.at(-1)??values(literal).find(x=>x&&typeof x==='object'&&x['@value']))?.['@value'];
};
const labels = (fa,en) => [{'@value':fa,'@language':'fa'},{'@value':en,'@language':'en'}];
const categories = {
  neuromodulators: {
    scopeFa:'درمان‌های مرتبط با بوتولینوم توکسین',
    scopeEn:'botulinum toxin-related clinical care',
    serviceType:'Botulinum toxin clinical service'
  },
  hair: {
    scopeFa:'ارزیابی و مراقبت‌های مرتبط با مو و پوست سر',
    scopeEn:'hair and scalp evaluation and care',
    serviceType:'Hair and scalp clinical service'
  },
  threads: {
    scopeFa:'ارزیابی و برنامه‌ریزی درمان با نخ',
    scopeEn:'thread-based treatment evaluation and planning',
    serviceType:'Thread-based clinical procedure'
  },
  fillers: {
    scopeFa:'ارزیابی و اقدامات مرتبط با حجم‌دهی و فیلر',
    scopeEn:'filler and volume-restoration assessment or treatment',
    serviceType:'Filler and volume-restoration clinical service'
  },
  'acne-scars': {
    scopeFa:'ارزیابی و درمان‌های مرتبط با آکنه، اسکار یا رنگدانه',
    scopeEn:'acne, scarring or pigment-related clinical assessment and treatment',
    serviceType:'Acne, scarring and pigmentation clinical service'
  },
  'skin-rejuvenation': {
    scopeFa:'ارزیابی و درمان‌های جوان‌سازی و کیفیت پوست',
    scopeEn:'skin-quality and rejuvenation assessment or treatment',
    serviceType:'Skin rejuvenation clinical service'
  },
  'surgical-assessment': {
    scopeFa:'ارزیابی مناسب‌بودن بیمار و گزینه‌های مرتبط با جراحی زیبایی',
    scopeEn:'candidacy assessment and decision-making about aesthetic surgical options',
    serviceType:'Aesthetic surgery evaluation and related clinical service'
  },
  'consultation-and-correction': {
    scopeFa:'مشاوره، ارزیابی و بررسی اصلاح درمان',
    scopeEn:'consultation, assessment and possible treatment revision',
    serviceType:'Aesthetic medical consultation, evaluation or revision'
  },
  'other-clinical-services': {
    scopeFa:'خدمات بالینی دیگر در پزشکی زیبایی',
    scopeEn:'other aesthetic medical clinical services',
    serviceType:'Other aesthetic medical service'
  }
};
export function enrichExistingClinicalServices(graph,physician,origin) {
  const all=new Map(graph.map(n=>[n['@id'],n]));
  const physicianId=physician['@id'];
  const services=graph.filter(n=>values(n['@type']).includes('Service') &&
    values(n.provider).length===1 && id(values(n.provider)[0])===physicianId);
  if(services.length!==124)throw new Error('Canonical service inventory unexpectedly changed');
  const sourceServices=new Map(services.map(s=>[s['@id'],s]));
  const catalog=all.get(origin+'/physician-clinical-offer-catalog');
  if(catalog?.['@type']!=='OfferCatalog')throw new Error('Physician OfferCatalog missing');
  const catalogGroups=values(catalog.itemListElement).map(item=>all.get(id(item)));
  if(catalogGroups.length!==9 || catalogGroups.some(x=>x?.['@type']!=='OfferCatalog'))
    throw new Error('Expected nine existing offer groups');
  const setId=origin+'/clinical-service-category-vocabulary';
  if(all.has(setId))throw new Error('Taxonomy @id already used');
  graph.push({'@id':setId,'@type':'DefinedTermSet',
    name:labels('دسته‌بندی خدمات بالینی موجود','Existing clinical service classification'),
    description:'Nine descriptive categories derived from the existing physician service-offer catalog; not qualifications or new service claims.'});
  const mapped=new Map();
  for(const group of catalogGroups){
    const key=group['@id'].split('#').at(-1),config=categories[key];
    if(!config)throw new Error('Unknown catalog group: '+key);
    const categoryId=origin+'/clinical-service-category-'+key;
    if(all.has(categoryId))throw new Error('Category @id already used: '+categoryId);
    graph.push({'@id':categoryId,'@type':'DefinedTerm',name:structuredClone(group.name),
      termCode:'CSVCAT-'+key.toUpperCase().replace(/-/g,'_'),inDefinedTermSet:ref(setId),
      description:'Clinical category reusing an existing catalog group; does not imply an additional specialty or independently certified skill.'});
    for(const element of values(group.itemListElement)){
      const offer=all.get(id(element.item)),service=sourceServices.get(id(offer?.itemOffered));
      if(!offer || !service || offer.offeredBy?.['@id']!==physicianId ||
          id(service.offers)!==offer['@id'])throw new Error('Broken catalog Offer/Service attribution');
      if(mapped.has(service['@id']))throw new Error('Service assigned to multiple primary categories: '+service['@id']);
      mapped.set(service['@id'],{key,categoryId,offer,config});
    }
  }
  if(mapped.size!==124)throw new Error('Existing catalog does not cover all services');

  // A direct offer URL is added only when the canonical medical page has this
  // very service as its main entity. Merely mentioning surgery or treatment
  // in a comparative/educational page never creates an offer landing URL.
  const directPages=new Map();
  for(const page of graph){
    if(!values(page['@type']).some(t=>['WebPage','MedicalWebPage','ProfilePage'].includes(t)) ||
        typeof page.url!=='string')continue;
    const main=values(page.mainEntity);
    if(main.length!==1)continue;
    const service=sourceServices.get(id(main[0]));
    if(service && service.url===page.url){
      if(directPages.has(service['@id']))throw new Error('Duplicate primary service page');
      directPages.set(service['@id'],page.url);
    }
  }
  let descriptionsAdded=0,serviceTypesAdded=0,categoriesAdded=0,offerUrlsAdded=0;
  for(const service of services){
    const group=mapped.get(service['@id']);
    const en=text(service.name,'en'),fa=text(service.name,'fa');
    if(!en||!fa)throw new Error('Missing bilingual canonical service title: '+service['@id']);
    const family=values(service['@type']);
    const assessment=family.includes('DiagnosticProcedure') || group.key==='surgical-assessment';
    const faScope=group.config.scopeFa,enScope=group.config.scopeEn;
    if(service.description==null) {
      // This is intentionally a conservative description of the existing
      // named service and its category, not an assertion of efficacy, price,
      // surgical capability or guaranteed procedure availability.
      const faDesc=assessment
        ? '«'+fa+'»: '+faScope+'؛ ماهیت اقدام، گزینه‌ها و مناسب‌بودن بیمار نیازمند تصمیم بالینی فردی است.'
        : '«'+fa+'»: '+faScope+'؛ انتخاب روش، محدودهٔ اقدام و مناسب‌بودن آن بر اساس ارزیابی بالینی فردی تعیین می‌شود.';
      const enDesc=assessment
        ? en+': '+enScope+'; the exact intervention, alternatives and suitability require individual clinical assessment.'
        : en+': '+enScope+'; the treatment scope, method and patient suitability are determined by individual clinical assessment.';
      service.description=labels(faDesc,enDesc);
      descriptionsAdded++;
    }
    if(service.serviceType==null) {
      // Keep the currently authored clinical node type unchanged. The
      // serviceType is a descriptive label, not a new MedicalSpecialty.
      const typePrefix=family.includes('DiagnosticProcedure')?'Clinical assessment':
        family.includes('MedicalTherapy')?'Medical therapy':
        family.includes('MedicalProcedure')?'Medical procedure':'Clinical consultation/service';
      service.serviceType=typePrefix+' — '+group.config.serviceType;
      serviceTypesAdded++;
    }
    const current=values(service.category),ids=new Set(current.map(id));
    // A pre-existing chronic-migraine service has an authored, narrowly
    // scoped SHACL contract that permits only two fixed DCTERMS subjects.
    // Keep its verified authored category, never broaden its subject list.
    const lockedMigraine=service['@id']===origin+'/service-botulinum-toxin-chronic-migraine';
    if(!lockedMigraine && !ids.has(group.categoryId)){
      service.category=[...current,ref(group.categoryId)];
      categoriesAdded++;
    }
    if(!lockedMigraine){
      // The canonical ServiceCategory SHACL shape requires the authored
      // category to also be an explicit DCTERMS subject of the same Service.
      const subjects=values(service['dcterms:subject']);
      if(!subjects.some(x=>id(x)===group.categoryId))
        service['dcterms:subject']=[...subjects,ref(group.categoryId)];
    }
    if(group.offer.url==null && directPages.has(service['@id'])) {
      group.offer.url=directPages.get(service['@id']);
      offerUrlsAdded++;
    }
  }
  if(descriptionsAdded!==118||serviceTypesAdded!==121||categoriesAdded<87||offerUrlsAdded!==8)
    throw new Error('Canonical baseline unexpectedly changed: '+JSON.stringify({descriptionsAdded,serviceTypesAdded,categoriesAdded,offerUrlsAdded}));
  return {descriptionsAdded,serviceTypesAdded,categoriesAdded,offerUrlsAdded,classified:services.length};
}
