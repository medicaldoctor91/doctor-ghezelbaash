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

  // Google Search Console reported Incorrect value type for precisely these
  // eighteen JSON-LD @id-coerced Schema.org terms. Keep the entire RDF graph
  // active on the homepage, but use explicit @id node objects rather than
  // term-level coercions in the Google-facing serialization. The expanded RDF
  // meaning of each property is unchanged; /graph.jsonld is untouched.
  const explicitIriTerms = [
    'image','url','sameAs','contentUrl','serviceUrl','dayOfWeek',
    'additionalType','codeRepository','target','hasMap','license',
    'measuredProperty','procedureType','thumbnailUrl','acquireLicensePage',
    'eventAttendanceMode','isBasedOn','inDefinedTermSet',
  ];
  if (context['@vocab'] !== 'https://schema.org/')
    throw new Error('Unexpected canonical @vocab; refusing non-equivalent Schema.org normalization');
  for (const key of explicitIriTerms) {
    const definition=context[key];
    if (!definition || Object.keys(definition).length !== 1 || definition['@type'] !== '@id')
      throw new Error('Unexpected IRI-coercion context for '+key);
    // @vocab already expands these exact Schema.org predicates to the same IRIs.
    delete context[key];
  }
  const explicitIri = value => Array.isArray(value)
    ? value.map(explicitIri)
    : typeof value === 'string' ? {'@id':value} : value;

  function visit(value) {
    if (!value || typeof value !== 'object' || Object.hasOwn(value, '@context')) return;
    if (Object.hasOwn(value, '@value')) {
      const type = value['@type'];
      if (typeof type === 'string' && type.startsWith(xsd)) value['@type'] = 'xsd:' + type.slice(xsd.length);
      return;
    }
    // Explicit node-object IRIs preserve the original expanded N-Quads.
    for (const key of explicitIriTerms)
      if (Object.hasOwn(value,key)) value[key]=explicitIri(value[key]);
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
