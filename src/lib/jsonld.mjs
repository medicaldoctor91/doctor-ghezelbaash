const xsd = 'http://www.w3.org/2001/XMLSchema#';

function escapeScriptText(text) {
  return text.replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
}


/** Safe for Astro set:html and HTML's raw-text script parser. */
export function serializeInlineJsonLd(value) {
  return escapeScriptText(JSON.stringify(value));
}

/**
 * Losslessly compact the canonical RDF wire representation. Preserve every
 * public entity IRI and triple while reducing repeated provenance predicate
 * bytes in the Googlebot-limited homepage HEAD.
 */
export function serializeCanonicalGraph(graph) {
  if (graph['@context']?.xsd !== xsd) return serializeInlineJsonLd(graph);
  const compact = structuredClone(graph);
  const context = compact['@context'];
  const attribution = 'prov:wasAttributedTo';
  const alias = 'at';
  const term = context[attribution];
  if (context[alias] !== undefined ||
      term?.['@id'] !== 'http://www.w3.org/ns/prov#wasAttributedTo' ||
      term?.['@type'] !== '@id')
    throw new Error('Unexpected canonical provenance context; refusing lossy alias');
  // Explicit IRI and @id coercion make the short key exactly equivalent to
  // prov:wasAttributedTo. Never rewrite a scoped @context subtree.
  context[alias] = structuredClone(term);
  function visit(value) {
    if (!value || typeof value !== 'object' || Object.hasOwn(value, '@context')) return;
    if (Object.hasOwn(value, '@value')) {
      const type = value['@type'];
      if (typeof type === 'string' && type.startsWith(xsd)) value['@type'] = 'xsd:' + type.slice(xsd.length);
      return;
    }
    if (Object.hasOwn(value, attribution)) {
      if (Object.hasOwn(value, alias))
        throw new Error('Existing at property conflicts with provenance compaction');
      value[alias] = value[attribution];
      delete value[attribution];
    }
    for (const child of Object.values(value)) visit(child);
  }
  visit(compact['@graph']);
  return serializeInlineJsonLd(compact);
}

/**
 * An independent, standards-equivalent representation of the FULL canonical
 * RDF for the homepage only. Do not change serializeCanonicalGraph(): it
 * publishes /graph.jsonld, whose exact SHA-256 is shared by four platforms.
 * Explicit @id node objects avoid the 18 term-level @id coercions reported
 * by Google; short Schema.org term aliases keep the active graph inside 2MB.
 */
export function serializeGoogleCompatibleCanonicalGraph(graph, { compactHomepageReferences = false } = {}) {
  const originalContext = graph['@context'];
  if (originalContext?.['@vocab'] !== 'https://schema.org/')
    throw new Error('Refusing unexpected JSON-LD vocabulary');
  const provenance = originalContext?.['prov:wasAttributedTo'];
  if (provenance?.['@id'] !== 'http://www.w3.org/ns/prov#wasAttributedTo' ||
      provenance?.['@type'] !== '@id') throw new Error('Unexpected PROV context');
  const alreadyAliased = originalContext.at !== undefined;
  if (alreadyAliased &&
    (originalContext.at?.['@id'] !== provenance['@id'] ||
     originalContext.at?.['@type'] !== provenance['@type']))
    throw new Error('Wrong provenance alias');
  const compact = alreadyAliased ? structuredClone(graph) :
    JSON.parse(serializeCanonicalGraph(graph));
  const context = compact['@context'];
  const uriTerms = [
    'image','url','sameAs','contentUrl','serviceUrl','dayOfWeek',
    'additionalType','codeRepository','target','hasMap','license',
    'measuredProperty','procedureType','thumbnailUrl','acquireLicensePage',
    'eventAttendanceMode','isBasedOn','inDefinedTermSet',
  ];
  for (const key of uriTerms) {
    const definition = context[key];
    if (!definition || Object.keys(definition).length!==1 || definition['@type']!=='@id')
      throw new Error('Unexpected canonical IRI-coercion for '+key);
    delete context[key]; // @vocab maps this key to the same Schema.org predicate
  }
  const aliases = [
    ['description','d'],['inLanguage','l'],['isPartOf','ip'],
    ['position','p'],['dateModified','dm'],['propertyID','pid'],
    ['about','ab'],['publisher','pub'],['availableChannel','ac'],
    ['businessFunction','bf'],
  ];
  for (const [original,alias] of aliases) {
    if (Object.hasOwn(context,alias) || Object.hasOwn(context,original))
      throw new Error('Unsafe schema term alias '+alias);
    context[alias]='https://schema.org/'+original;
  }
  function convert(value) {
    return Array.isArray(value) ? value.map(convert)
      : typeof value==='string' ? {'@id':value} : value;
  }
  function visit(value) {
    if (!value || typeof value!=='object' || Object.hasOwn(value,'@context')) return;
    if (Object.hasOwn(value,'@value')) return;
    if (Array.isArray(value)) { for (const item of value) visit(item); return; }
    for (const key of uriTerms) if (Object.hasOwn(value,key)) value[key]=convert(value[key]);
    for (const [original,alias] of aliases) {
      if (Object.hasOwn(value,original)) {
        if (Object.hasOwn(value,alias)) throw new Error('Conflicting JSON-LD alias '+alias);
        value[alias]=value[original];delete value[original];
      }
    }
    for (const child of Object.values(value)) visit(child);
  }
  visit(compact['@graph']);
  if (compactHomepageReferences) {
    if (context.site !== 'https://www.ghezelbaash.ir/')
      throw new Error('Unexpected homepage IRI prefix');
    // Compact IRIs expand without the HTML document base.
    compactInternalReferences(compact['@graph'], uriTerms);
  }
  return serializeInlineJsonLd(compact);
}

function compactInternalReferences(nodes, urlProperties) {
  const origin = 'https://www.ghezelbaash.ir';
  const personId = origin + '/#saeed-ghezelbash';
  const clinicId = origin + '/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah';
  const fixedIds = new Set([personId, clinicId, origin + '/webpage', origin + '/']);
  const fixedNodes = new Set(fixedIds);
  const protectedTypes = new Set([
    'ProfilePage', 'ScholarlyArticle', 'EducationalOccupationalCredential',
    'PhysiciansOffice', 'MedicalClinic',
  ]);
  const person = nodes.find(node => node['@id'] === personId);
  if (!person) throw new Error('Homepage reference compaction requires the canonical physician');
  for (const field of ['identifier','hasCredential','hasOccupation','image','alumniOf','medicalSpecialty','nationality','address']) {
    for (const value of [person[field]].flat()) {
      if (value?.['@id']) fixedNodes.add(value['@id']);
    }
  }
  const urlFields = new Set(urlProperties);
  function visit(value, property) {
    if (!value || typeof value !== 'object' || '@context' in value || '@value' in value) return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, property);
      return;
    }
    const id = value['@id'];
    if (Object.keys(value).length === 1 && typeof id === 'string' &&
        id.startsWith(origin + '/') && !fixedIds.has(id) && !urlFields.has(property)) {
      value['@id'] = 'site:' + id.slice(origin.length + 1);
      return;
    }
    for (const [key, child] of Object.entries(value)) visit(child, key);
  }
  for (const node of nodes) {
    if (fixedNodes.has(node['@id']) || [node['@type']].flat().some(type => protectedTypes.has(type))) continue;
    visit(node);
  }
}
