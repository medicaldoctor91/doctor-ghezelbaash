const xsd = 'http://www.w3.org/2001/XMLSchema#';

function escapeScriptText(text) {
  return text.replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
}

/** Safe for Astro set:html and HTML's raw-text script parser. */
export function serializeInlineJsonLd(value) {
  return escapeScriptText(JSON.stringify(value));
}

/** Compact only literal datatypes, keeping all public entity IDs and triples. */
export function serializeCanonicalGraph(graph) {
  if (graph['@context']?.xsd !== xsd) return serializeInlineJsonLd(graph);
  const compact = structuredClone(graph);
  function visit(value) {
    // A nested context may redefine xsd. Its complete subtree stays expanded.
    if (!value || typeof value !== 'object' || Object.hasOwn(value, '@context')) return;
    if (Object.hasOwn(value, '@value')) {
      const type = value['@type'];
      if (typeof type === 'string' && type.startsWith(xsd)) value['@type'] = 'xsd:' + type.slice(xsd.length);
      return;
    }
    for (const child of Object.values(value)) visit(child);
  }
  visit(compact['@graph']);
  return serializeInlineJsonLd(compact);
}
