/** Safe for Astro set:html and HTML's raw-text script parser; preserves JSON values. */
export function serializeInlineJsonLd(value) {
  return JSON.stringify(value).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
}
