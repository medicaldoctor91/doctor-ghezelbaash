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
export function serializeGoogleCompatibleCanonicalGraph(graph) {
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
  const aliases = [['description','d'],['inLanguage','l']];
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
  return serializeInlineJsonLd(compact);
}
