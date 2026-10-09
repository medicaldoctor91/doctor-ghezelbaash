import {croissantContext} from './croissant-context.mjs';
export { buildEvidenceSnapshot } from './evidence-output.mjs';
export { buildRetrievalRecords, serializeAnswersText, buildAnswersText, buildFactMap, buildProvenanceGraph } from './retrieval-output.mjs';
import { createHash } from 'node:crypto';

const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function expandTerm(term, context) {
  if (typeof term !== 'string') return String(term);
  if (/^https?:\/\//.test(term)) return term;
  if (term.startsWith('_:')) return term;
  const direct = context?.[term];
  if (typeof direct === 'string') {
    if (/^https?:\/\//.test(direct)) return direct;
    if (direct.includes(':')) return expandTerm(direct, context);
  }
  if (direct && typeof direct === 'object' && typeof direct['@id'] === 'string') return expandTerm(direct['@id'], context);
  const colon = term.indexOf(':');
  if (colon > 0) {
    const prefix = term.slice(0, colon), suffix = term.slice(colon + 1), base = context?.[prefix];
    if (typeof base === 'string' && /^https?:\/\//.test(base)) return base + suffix;
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(term)) return term;
  }
  const vocab = context?.['@vocab'];
  return typeof vocab === 'string' ? vocab + term : term;
}

function iriTerm(value) {
  if (value.startsWith('_:')) return value;
  return `<${value.replaceAll('>', '%3E')}>`;
}

function literalTerm(value, { datatype, language } = {}) {
  if (typeof value === 'boolean') return `"${value ? 'true' : 'false'}"^^<http://www.w3.org/2001/XMLSchema#boolean>`;
  if (typeof value === 'number') {
    const type = Number.isInteger(value) ? 'integer' : 'double';
    const lexical = type === 'double' ? value.toExponential(15).replace(/(\d)0*e\+?/, '$1E') : String(value);
    return `"${lexical}"^^<http://www.w3.org/2001/XMLSchema#${type}>`;
  }
  const quoted = JSON.stringify(String(value)).replace(/\\\//g, '/');
  if (language) return `${quoted}@${language}`;
  if (datatype) return `${quoted}^^${iriTerm(datatype)}`;
  return quoted;
}

function propertyExpectsId(property, context) {
  const definition = context?.[property];
  return Boolean(definition && typeof definition === 'object' && definition['@type'] === '@id');
}

export function graphFactRows(graph) {
  const context = graph?.['@context'] ?? {};
  const rows = [];
  const seenExpanded = new Set();
  const seenFacts = new Set();
  const add = ({ subject, predicate, object, objectKind, datatype = '', language = '' }) => {
    if(objectKind==='literal') {
      if(typeof object==='boolean') {
        datatype ||= 'http://www.w3.org/2001/XMLSchema#boolean';
        object=object?'true':'false';
      } else if((typeof object==='number'&&(String(object).includes('.')||Math.abs(object)>=1e21))||datatype==='http://www.w3.org/2001/XMLSchema#double') {
        // Match jsonld's RDF lexical conversion, including explicit double values.
        datatype ||= 'http://www.w3.org/2001/XMLSchema#double';
        object=Number.parseFloat(object).toExponential(15).replace(/(\d)0*e\+?/, '$1E');
      } else if(typeof object==='number') {
        datatype ||= 'http://www.w3.org/2001/XMLSchema#integer';
        object=object.toFixed(0);
      } else object=String(object);
    }
    const raw = `${subject}\u0000${predicate}\u0000${object}\u0000${objectKind}\u0000${datatype}\u0000${language}`;
    if(seenFacts.has(raw))return;
    seenFacts.add(raw);
    rows.push({ row_id: `sha256:${sha256(raw)}`, subject, predicate, object, object_kind: objectKind, datatype, language });
  };
  const blankId = (path) => `_:b${sha256(path).slice(0, 20)}`;
  const emitNode = (node, subject, path) => {
    if (!node || typeof node !== 'object') return;
    const expansionKey = `${subject}\u0000${path}`;
    if (seenExpanded.has(expansionKey)) return;
    seenExpanded.add(expansionKey);
    for (const type of values(node['@type'])) {
      if (typeof type !== 'string') continue;
      add({ subject, predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', object: expandTerm(type, context), objectKind: 'iri' });
    }
    for (const [property, rawValue] of Object.entries(node)) {
      if (property.startsWith('@')) continue;
      const predicate = expandTerm(property, context);
      values(rawValue).forEach((entry, index) => {
        const childPath = `${path}/${property}/${index}`;
        if (entry && typeof entry === 'object' && Object.hasOwn(entry, '@value')) {
          add({ subject, predicate, object: entry['@value'], objectKind: 'literal', datatype: entry['@type'] ? expandTerm(entry['@type'], context) : '', language: entry['@language'] ?? '' });
          return;
        }
        if (entry && typeof entry === 'object') {
          const target = typeof entry['@id'] === 'string' ? entry['@id'] : blankId(childPath);
          add({ subject, predicate, object: target, objectKind: target.startsWith('_:') ? 'blank' : 'iri' });
          if (Object.keys(entry).some((key) => key !== '@id')) emitNode(entry, target, childPath);
          return;
        }
        if (typeof entry === 'string' && propertyExpectsId(property, context)) {
          add({ subject, predicate, object: expandTerm(entry, context), objectKind: 'iri' });
          return;
        }
        add({ subject, predicate, object: entry, objectKind: 'literal' });
      });
    }
  };
  for (const [index, node] of values(graph?.['@graph']).entries()) {
    if (!node || typeof node !== 'object') continue;
    const subject = typeof node['@id'] === 'string' ? node['@id'] : blankId(`/@graph/${index}`);
    emitNode(node, subject, `/@graph/${index}`);
  }
  rows.sort((a, b) => a.subject.localeCompare(b.subject) || a.predicate.localeCompare(b.predicate) || String(a.object).localeCompare(String(b.object)) || a.object_kind.localeCompare(b.object_kind) || a.datatype.localeCompare(b.datatype) || a.language.localeCompare(b.language));
  return rows;
}

export function serializeGraphAsNTriples(graph) {
  return graphFactRows(graph).map((row) => {
    const subject = iriTerm(row.subject);
    const predicate = iriTerm(row.predicate);
    const object = row.object_kind === 'iri' || row.object_kind === 'blank'
      ? iriTerm(String(row.object))
      : literalTerm(row.object, { datatype: row.datatype || undefined, language: row.language || undefined });
    return `${subject} ${predicate} ${object} .`;
  }).join('\n') + '\n';
}

const csvCell = (value) => {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function serializeEntityFactsCsv(graph) {
  const headers = ['row_id','subject','predicate','object','object_kind','datatype','language'];
  const rows=graphFactRows(graph);
  return headers.join(',') + '\n' + rows.map((row) => headers.map((key) => csvCell(row[key])).join(',')).join('\n') + '\n';
}

function literal(value, language = 'fa-IR') {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  const list = values(value);
  const base = language.split('-')[0];
  const chosen = list.find((entry) => entry && typeof entry === 'object' && entry['@language'] === language)
    ?? list.find((entry) => entry && typeof entry === 'object' && entry['@language']?.split('-')[0] === base)
    ?? list.find((entry) => entry && typeof entry === 'object' && !entry['@language'])
    ?? list[0];
  return chosen && typeof chosen === 'object' && Object.hasOwn(chosen, '@value') ? String(chosen['@value']) : chosen == null ? '' : String(chosen);
}

const stripTags = (html) => html
  .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/\s+/g, ' ').trim();

export function htmlToMarkdown(html) {
  let out = html.replace(/<!--([\s\S]*?)-->/g, '');
  out = out.replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, body) => `[${stripTags(body)}](${href})`);
  out = out.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, body) => `\n\n${'#'.repeat(Number(level))} ${stripTags(body)}\n\n`);
  out = out.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, body) => `\n- ${stripTags(body)}`);
  out = out.replace(/<(?:p|div|section|article|header|footer|nav|aside|details|summary|tr|table|ul|ol|blockquote)\b[^>]*>/gi, '\n');
  out = out.replace(/<br\s*\/?\s*>/gi, '\n');
  out = out.replace(/<[^>]+>/g, ' ');
  out = out.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
  return out.split('\n').map((line) => line.replace(/[\t ]+/g, ' ').trim()).filter((line, index, arr) => line || (index && arr[index - 1])).join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function htmlToPlainText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(?:h[1-6]|p|li|div|section|article|br|tr|details|summary)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

const xmlEscape = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
export function buildKnowledgeXml(source) {
  const nodes = source.graph['@graph'];
  const person = nodes.find((node) => node['@id'] === source.canonicalOrigin + '/#saeed-ghezelbash');
  const clinic = nodes.find((node) => values(node['@type']).includes('MedicalClinic'));
  const services = nodes.filter((node) => values(node['@type']).includes('Service'));
  const videos = nodes.filter((node) => values(node['@type']).includes('VideoObject'));
  const questions = nodes.filter((node) => values(node['@type']).includes('Question'));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<knowledge origin="${xmlEscape(source.canonicalOrigin)}">\n` +
    `  <physician id="${xmlEscape(person?.['@id'])}" url="${xmlEscape(person?.url)}"><name>${xmlEscape(literal(person?.name))}</name></physician>\n` +
    `  <clinic id="${xmlEscape(clinic?.['@id'])}"><name>${xmlEscape(literal(clinic?.name))}</name></clinic>\n` +
    `  <services>${services.map((node) => `<service id="${xmlEscape(node['@id'])}">${xmlEscape(literal(node.name))}</service>`).join('')}</services>\n` +
    `  <videos>${videos.map((node) => `<video id="${xmlEscape(node['@id'])}" url="${xmlEscape(node.url)}" contentUrl="${xmlEscape(node.contentUrl)}">${xmlEscape(literal(node.name))}</video>`).join('')}</videos>\n` +
    `  <questions>${questions.map((node) => `<question id="${xmlEscape(node['@id'])}">${xmlEscape(literal(node.name))}</question>`).join('')}</questions>\n` +
    `</knowledge>\n`;
}


const vEscape = (value) => String(value ?? '').replaceAll('\\','\\\\').replaceAll('\n','\\n').replaceAll(';','\\;').replaceAll(',','\\,');
const refId = (value) => typeof value === 'string' ? value : value?.['@id'];
export function buildVCard(source, kind) {
  const nodes = source.graph['@graph'];
  const person = nodes.find((node) => node['@id'] === source.canonicalOrigin + '/#saeed-ghezelbash');
  const clinic = nodes.find((node) => values(node['@type']).includes('MedicalClinic'));
  const entity = kind === 'physician' ? person : clinic;
  const address = entity?.address && typeof entity.address === 'object' && !entity.address['@id'] ? entity.address : nodes.find((node) => node['@id'] === refId(entity?.address));
  const lines = ['BEGIN:VCARD','VERSION:4.0',`UID:${vEscape(entity?.['@id'])}`];
  if (kind === 'physician') lines.push(`FN:${vEscape(literal(person?.name))}`,`N:${vEscape(literal(person?.familyName))};${vEscape(literal(person?.givenName))};;;`);
  else lines.push(`FN:${vEscape(literal(clinic?.name))}`,`ORG:${vEscape(literal(clinic?.name))}`);
  for (const phone of values(entity?.telephone ?? clinic?.telephone)) if (phone) lines.push(`TEL;TYPE=voice:${vEscape(phone)}`);
  if (entity?.email) lines.push(`EMAIL:${vEscape(entity.email)}`);
  if (entity?.url) lines.push(`URL:${vEscape(entity.url)}`);
  if (address) lines.push(`ADR:;;${vEscape(address.streetAddress)};${vEscape(address.addressLocality)};${vEscape(address.addressRegion)};${vEscape(address.postalCode)};${vEscape(address.addressCountry?.name ?? address.addressCountry)}`);
  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}

export function buildLinkset(source) {
  const person = source.graph['@graph'].find((node) => node['@id'] === source.canonicalOrigin + '/#saeed-ghezelbash');
  return { linkset: [{
    anchor: source.canonicalOrigin + '/',
    author: [{ href: person['@id'] }],
    about: [{ href: person['@id'] }],
    describedby: source.machineResources.filter((resource) => resource.discoverable && resource.rel === 'describedby').map((resource) => ({ href: source.canonicalOrigin + resource.path, type: resource.mediaType })),
    alternate: source.machineResources.filter((resource) => resource.discoverable && resource.rel === 'alternate').map((resource) => ({ href: source.canonicalOrigin + resource.path, type: resource.mediaType })),
    me: values(person.sameAs).map((href) => ({ href })),
  }] };
}

const DCT = 'http://purl.org/dc/terms/';
const PROV = 'http://www.w3.org/ns/prov#';
const SCHEMA = 'https://schema.org/';
const datasetNode = source => source.graph['@graph'].find(node => node['@id'] === source.canonicalOrigin + '/graph.jsonld/dataset');
const projectionReferences = source => ['/answers.txt', '/fact-map.json', '/provenance.jsonld'].map(path => ({'@id': source.canonicalOrigin + path}));
const factColumns = () => [
  {name: 'row_id', datatype: 'string', [DCT + 'description']: 'Stable SHA-256 identifier of the complete RDF statement tuple; the primary key of this unique-statement table.'},
  {name: 'subject', datatype: 'string', [DCT + 'description']: 'RDF subject IRI or deterministic blank-node identifier, preserving the canonical statement subject.'},
  {name: 'predicate', datatype: 'anyURI', [DCT + 'description']: 'Expanded absolute RDF predicate IRI identifying the relationship or property asserted by the statement.'},
  {name: 'object', datatype: 'string', [DCT + 'description']: 'RDF object IRI, blank-node identifier or literal lexical value; interpret together with object_kind, datatype and language.'},
  {name: 'object_kind', datatype: 'string', [DCT + 'description']: 'RDF object term kind: iri, blank or literal; distinguishes resources from literal lexical values.'},
  {name: 'datatype', datatype: 'string', [DCT + 'description']: 'RDF literal datatype IRI when explicit or native; an empty value leaves RDF plain or language-tagged literal semantics unchanged.'},
  {name: 'language', datatype: 'string', [DCT + 'description']: 'RDF literal language tag when present; an empty value means this statement has no language tag.'},
];

export function buildCsvMetadata(source) {
  const dataset = datasetNode(source);
  return {
    '@context': 'http://www.w3.org/ns/csvw',
    '@id': source.canonicalOrigin + '/entity-facts.csv-metadata.json',
    url: source.canonicalOrigin + '/entity-facts.csv',
    [DCT + 'title']: literal(dataset.name),
    [DCT + 'description']: literal(dataset.description),
    [DCT + 'isPartOf']: {'@id': dataset['@id']},
    [SCHEMA + 'version']: dataset.version,
    ...(dataset.datePublished ? {[DCT + 'issued']: literal(dataset.datePublished)} : {}),
    ...(dataset.dateModified ? {[DCT + 'modified']: literal(dataset.dateModified)} : {}),
    ...(dataset['dcat:hasCurrentVersion'] ? {[DCT + 'hasVersion']: dataset['dcat:hasCurrentVersion']} : {}),
    [DCT + 'creator']: dataset.creator,
    [DCT + 'publisher']: dataset.publisher,
    [DCT + 'license']: {'@id': dataset.license},
    [PROV + 'wasDerivedFrom']: {'@id': source.canonicalOrigin + '/graph.jsonld'},
    [DCT + 'references']: projectionReferences(source),
    notes: `Release edition: ${source.edition}. One row per unique canonical RDF statement. Read object_kind, datatype and language together to reconstruct RDF terms; join entity IRIs to the canonical graph and linked retrieval/provenance resources.`,
    tableSchema: {primaryKey: 'row_id', columns: factColumns()},
  };
}

function catalogDatasetLines(source, types) {
  const dataset = datasetNode(source);
  const terms = [
    `a ${types.join(', ')}`,
    `dcterms:title ${literalTerm(literal(dataset.name))}`,
    `dcterms:description ${literalTerm(literal(dataset.description))}`,
    `dcterms:identifier ${literalTerm(dataset['@id'])}, ${literalTerm('edition:' + source.edition)}`,
    `dcat:version ${literalTerm(dataset.version)}`,
    `dcterms:creator ${iriTerm(refId(dataset.creator))}`,
    `dcterms:publisher ${iriTerm(refId(dataset.publisher))}`,
    `dcterms:license ${iriTerm(dataset.license)}`,
    `dcat:landingPage ${iriTerm(dataset.url)}`,
    `prov:wasDerivedFrom ${iriTerm(source.canonicalOrigin + '/graph.jsonld')}`,
    `dcterms:provenance ${iriTerm(source.canonicalOrigin + '/provenance.jsonld')}`,
    `dcterms:references ${projectionReferences(source).map(ref => iriTerm(ref['@id'])).join(', ')}`,
  ];
  for (const [property, value] of [['dcterms:issued', dataset.datePublished], ['dcterms:modified', dataset.dateModified]]) {
    if (value) terms.push(`${property} ${literalTerm(literal(value), {datatype: value['@type']})}`);
  }
  if (dataset['dcat:hasCurrentVersion']) terms.push(`dcat:hasCurrentVersion ${iriTerm(refId(dataset['dcat:hasCurrentVersion']))}`);
  const versions = values(dataset['dcat:hasVersion']).map(ref => iriTerm(refId(ref)));
  if (versions.length) terms.push(`dcat:hasVersion ${versions.join(', ')}`);
  for (const property of ['prov:wasAttributedTo', 'prov:wasGeneratedBy', 'prov:wasDerivedFrom', 'dcterms:provenance']) {
    for (const ref of values(dataset[property])) terms.push(`${property} ${iriTerm(refId(ref))}`);
  }
  return [`@prefix dcat: <http://www.w3.org/ns/dcat#> .`, `@prefix dcterms: <${DCT}> .`, `@prefix prov: <${PROV}> .`, `<${dataset['@id']}> ${terms.join(' ;\n  ')} .`];
}

function catalogDistributionLines(source) {
  const dataset = datasetNode(source);
  return source.machineResources.filter(resource => resource.distributionIri).flatMap(resource => [
    `<${dataset['@id']}> dcat:distribution <${resource.distributionIri}> .`,
    `<${resource.distributionIri}> a dcat:Distribution, prov:Entity ; dcat:downloadURL <${source.canonicalOrigin}${resource.path}> ; dcat:mediaType ${literalTerm(resource.mediaType)} ; dcat:version ${literalTerm(dataset.version)} ; prov:wasDerivedFrom <${dataset['@id']}> .`,
  ]);
}

export function buildVoidTurtle(source, tripleCount) {
  const dataset = datasetNode(source);
  return [
    '@prefix void: <http://rdfs.org/ns/void#> .',
    ...catalogDatasetLines(source, ['void:Dataset', 'dcat:Dataset', 'prov:Entity']),
    `<${dataset['@id']}> void:triples ${tripleCount} ; void:dataDump <${source.canonicalOrigin}/graph.jsonld>, <${source.canonicalOrigin}/graph.ttl> ; void:vocabulary <https://schema.org/>, <http://www.w3.org/ns/prov#>, <http://www.w3.org/ns/shacl#> .`,
    ...catalogDistributionLines(source),
  ].join('\n') + '\n';
}

export function buildDcatTurtle(source) {
  return [...catalogDatasetLines(source, ['dcat:Dataset', 'prov:Entity']), ...catalogDistributionLines(source)].join('\n') + '\n';
}

export function buildCroissant(source) {
  const dataset = datasetNode(source);
  const columns = factColumns();
  return {
    '@context': {...croissantContext, prov: PROV},
    '@id': dataset['@id'],
    '@type': 'sc:Dataset',
    name: literal(dataset.name),
    description: literal(dataset.description),
    conformsTo: 'http://mlcommons.org/croissant/1.1',
    url: dataset['@id'],
    identifier: [dataset['@id'], {'@type': 'sc:PropertyValue', propertyID: 'Release edition', value: source.edition}],
    creator: dataset.creator,
    publisher: dataset.publisher,
    license: dataset.license,
    citeAs: dataset['@id'],
    ...(dataset.datePublished ? {datePublished: literal(dataset.datePublished)} : {}),
    ...(dataset.dateModified ? {dateModified: literal(dataset.dateModified)} : {}),
    ...(dataset.version ? {version: dataset.version} : {}),
    ...(dataset['dcat:hasCurrentVersion'] ? {'dct:hasVersion': dataset['dcat:hasCurrentVersion']} : {}),
    'prov:wasDerivedFrom': {'@id': source.canonicalOrigin + '/graph.jsonld'},
    'dct:references': projectionReferences(source),
    distribution: source.machineResources.filter(resource => !['/index.html', '/croissant.json'].includes(resource.path)).map(resource => ({
      '@type': 'cr:FileObject', '@id': resource.path.slice(1), name: resource.path.slice(1), contentUrl: source.canonicalOrigin + resource.path, encodingFormat: resource.mediaType,
      ...(resource.title ? {description: resource.title} : {}),
    })),
    recordSet: [{
      '@type': 'cr:RecordSet', '@id': 'entity-facts', name: 'entity-facts',
      description: 'One row per unique canonical RDF statement; RDF object kind, datatype and language preserve term identity.',
      key: {'@id': 'entity-facts/row_id'},
      field: columns.map(column => ({
        '@type': 'cr:Field', '@id': 'entity-facts/' + column.name, name: column.name, description: column[DCT + 'description'], dataType: 'sc:Text',
        source: {fileObject: {'@id': 'entity-facts.csv'}, extract: {column: column.name}},
      })),
    }],
  };
}

export function buildDataPackage(source, fileStats = new Map()) {
  const dataset = datasetNode(source);
  const contributor = (ref, role) => {
    const entity = source.graph['@graph'].find(node => node['@id'] === refId(ref));
    return {title: literal(entity?.name, 'en') || refId(ref), path: refId(ref), role};
  };
  return {
    profile: 'data-package',
    id: dataset['@id'],
    name: 'dr-saeed-ghezelbash-public-knowledge-graph',
    title: literal(dataset.name),
    description: literal(dataset.description),
    homepage: dataset.url,
    keywords: dataset.keywords,
    version: dataset.version,
    edition: source.edition,
    ...(dataset.datePublished ? {datePublished: literal(dataset.datePublished)} : {}),
    ...(dataset.dateModified ? {dateModified: literal(dataset.dateModified)} : {}),
    contributors: [contributor(dataset.creator, 'author'), contributor(dataset.publisher, 'publisher')],
    sources: [{title: 'Canonical graph', path: source.canonicalOrigin + '/graph.jsonld'}, ...projectionReferences(source).map(ref => ({title: ref['@id'].split('/').at(-1), path: ref['@id']}))],
    licenses: [{name: 'CC-BY-4.0', path: dataset.license}],
    resources: source.machineResources.filter(resource => resource.path !== '/index.html').map(resource => {
      const stat = fileStats.get(resource.path);
      return {
        name: resource.path.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, ''), path: source.canonicalOrigin + resource.path, mediatype: resource.mediaType,
        ...(resource.title ? {title: resource.title, description: resource.title} : {}),
        ...(resource.path === '/entity-facts.csv' ? {profile: 'tabular-data-resource', schema: {primaryKey: 'row_id', fields: factColumns().map(column => ({name: column.name, type: 'string', description: column[DCT + 'description']}))}} : {}),
        ...(stat ? {bytes: stat.bytes, hash: `sha256:${stat.sha256}`} : {}),
      };
    }),
  };
}

export function buildCroissantWithStats(source, fileStats = new Map()) {
  const output = buildCroissant(source);
  output.distribution = output.distribution.map((file) => {
    const resource = source.machineResources.find((item) => source.canonicalOrigin + item.path === file.contentUrl);
    const stat = resource ? fileStats.get(resource.path) : undefined;
    return { ...file, ...(stat ? { sha256: stat.sha256, contentSize: `${stat.bytes} B` } : {}) };
  });
  return output;
}
