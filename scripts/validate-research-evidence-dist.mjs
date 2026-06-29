import fs from 'node:fs';
import path from 'node:path';
import { absoluteUrl } from '../src/data/site.mjs';
import { services } from '../src/data/services.mjs';
import { articleAestheticMentionUrls } from '../src/lib/researchEvidenceGraph.mjs';

const file = path.join(process.cwd(), 'dist', 'graph-ghezelbaash-final.jsonld');
let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

function refs(value) {
  return Array.isArray(value) ? value : [value].filter(Boolean);
}

function refIds(value) {
  return refs(value).map((item) => item?.['@id']).filter(Boolean);
}

function hasRef(entity, property, id) {
  return refIds(entity?.[property]).includes(id);
}

if (!fs.existsSync(file)) {
  fail('missing dist/graph-ghezelbaash-final.jsonld');
} else {
  const text = fs.readFileSync(file, 'utf8');
  let graph;

  try {
    graph = JSON.parse(text);
  } catch (error) {
    fail(`dist primary graph is not valid JSON: ${error.message}`);
  }

  if (graph) {
    const nodes = graph['@graph'] || [];
    const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));

    for (const needle of [
      '/kg/research-evidence#term-set',
      '/kg/research-topic#major-depressive-disorder',
      '/kg/research-topic#bipolar-i-disorder',
      '/kg/research-topic#omega-3-supplementation',
      '/kg/research-method#peer-reviewed-publication',
      '/kg/research-method#pubmed-indexed-publication',
      '/kg/medical-knowledge#aesthetic-medicine',
      '/kg/research#evidence-based-aesthetic-medicine',
      '/kg/medical-knowledge#physician-led-assessment',
      '/kg/medical-knowledge#patient-selection',
      '/kg/research#risk-communication',
      '/research/#healthcare-2021-1169',
      '/research/#ijpm-2016-77'
    ]) {
      if (!text.includes(needle)) fail(`research evidence dist missing ${needle}`);
    }

    const healthcare = byId.get('https://www.ghezelbaash.ir/research/#healthcare-2021-1169');
    const bipolar = byId.get('https://www.ghezelbaash.ir/research/#ijpm-2016-77');
    const collection = byId.get('https://www.ghezelbaash.ir/research/#collection');
    const dataset = byId.get('https://www.ghezelbaash.ir/kg/#dataset');

    if (!healthcare) fail('missing healthcare research article in dist');
    if (!bipolar) fail('missing bipolar research article in dist');
    if (!collection) fail('missing research collection in dist');
    if (!dataset) fail('missing dataset in dist');

    if (healthcare) {
      for (const id of [
        'https://www.ghezelbaash.ir/kg/research-topic#major-depressive-disorder',
        'https://www.ghezelbaash.ir/kg/research-topic#attachment-style',
        'https://www.ghezelbaash.ir/kg/research-topic#dissociative-identity-symptoms',
        'https://www.ghezelbaash.ir/kg/research-topic#adult-traumatic-events'
      ]) {
        if (!hasRef(healthcare, 'about', id) && !hasRef(healthcare, 'mentions', id)) fail(`healthcare article missing dist topic ${id}`);
      }
    }

    if (bipolar) {
      for (const id of [
        'https://www.ghezelbaash.ir/kg/research-topic#bipolar-i-disorder',
        'https://www.ghezelbaash.ir/kg/research-topic#omega-3-supplementation'
      ]) {
        if (!hasRef(bipolar, 'about', id) && !hasRef(bipolar, 'mentions', id)) fail(`bipolar article missing dist topic ${id}`);
      }
    }

    const protectedAestheticAboutIds = [
      absoluteUrl('/kg/medical-procedure#cosmetic-botulinum-toxin-injection'),
      absoluteUrl('/kg/medical-procedure#dermal-filler-injection'),
      absoluteUrl('/kg/medical-procedure#thread-lift'),
      absoluteUrl('/kg/medical-procedure#submental-liposuction'),
      ...services.map((service) => absoluteUrl(`/${service.slug}/#service`))
    ];

    for (const article of [healthcare, bipolar].filter(Boolean)) {
      for (const id of protectedAestheticAboutIds) {
        if (hasRef(article, 'about', id)) {
          fail(`dist article must not use about for non-primary aesthetic service/procedure topic ${article['@id']} ${id}`);
        }
      }

      for (const id of articleAestheticMentionUrls()) {
        if (!hasRef(article, 'mentions', id)) {
          fail(`dist article missing aesthetic/research mention ${article['@id']} ${id}`);
        }
      }
    }

    for (const entity of [collection, dataset].filter(Boolean)) {
      for (const id of [
        absoluteUrl('/kg/medical-knowledge#aesthetic-medicine'),
        absoluteUrl('/kg/research#evidence-based-aesthetic-medicine'),
        absoluteUrl('/kg/medical-knowledge#physician-led-assessment'),
        absoluteUrl('/kg/medical-knowledge#patient-selection'),
        absoluteUrl('/kg/research#risk-communication')
      ]) {
        if (!hasRef(entity, 'about', id) && !hasRef(entity, 'mentions', id) && !hasRef(entity, 'hasPart', id)) {
          fail(`dist research collection/dataset missing aesthetic bridge ${entity['@id']} ${id}`);
        }
      }
    }
  }
}

if (failed) process.exit(1);
console.log('Research evidence dist validation passed');
