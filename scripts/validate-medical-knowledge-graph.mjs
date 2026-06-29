import { absoluteUrl } from '../src/data/site.mjs';
import { services } from '../src/data/services.mjs';
import { buildGlobalGraph } from '../src/lib/globalGraph.mjs';
import {
  approvedMedicalOntologyCodePairs,
  approvedMedicalOntologySameAsUrls,
  serviceMedicalOntologyLinkMap
} from '../src/lib/medicalKnowledgeGraph.mjs';

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

function typeList(entity) {
  return refs(entity?.['@type']);
}

function visit(value, callback) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) visit(item, callback);
    return;
  }

  callback(value);
  for (const child of Object.values(value)) visit(child, callback);
}

const graph = buildGlobalGraph();
const nodes = graph?.['@graph'] || [];
const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));

const forbiddenPlanningKeys = new Set([
  'status',
  'risk',
  'action',
  'verified',
  'unverified',
  'exact',
  'related',
  'pending',
  'addNow',
  'addLater'
]);

visit(graph, (item) => {
  for (const key of Object.keys(item)) {
    if (forbiddenPlanningKeys.has(key)) fail(`planning metadata key leaked into graph: ${key}`);
  }
});

const requiredNodes = new Map([
  ['/kg/medical-knowledge#term-set', 'DefinedTermSet'],
  ['/kg/dermatology-hair#term-set', 'DefinedTermSet'],
  ['/kg/anatomy#term-set', 'DefinedTermSet'],
  ['/kg/medical-condition#term-set', 'DefinedTermSet'],
  ['/kg/medical-procedure#term-set', 'DefinedTermSet'],
  ['/kg/medical-material#term-set', 'DefinedTermSet'],
  ['/kg/research#medical-term-set', 'DefinedTermSet'],
  ['/kg/local-authority#term-set', 'DefinedTermSet'],
  ['/kg/medical-knowledge#dermatology', 'DefinedTerm'],
  ['/kg/medical-knowledge#aesthetic-medicine', 'DefinedTerm'],
  ['/kg/anatomy#skin', 'AnatomicalStructure'],
  ['/kg/anatomy#hair-follicle', 'AnatomicalStructure'],
  ['/kg/anatomy#face', 'AnatomicalStructure'],
  ['/kg/anatomy#submental-region', 'AnatomicalStructure'],
  ['/kg/medical-condition#acne-vulgaris', 'MedicalCondition'],
  ['/kg/medical-condition#acne-scar', 'MedicalCondition'],
  ['/kg/medical-condition#alopecia', 'MedicalCondition'],
  ['/kg/medical-condition#androgenetic-alopecia', 'MedicalCondition'],
  ['/kg/medical-condition#hyperpigmentation', 'MedicalCondition'],
  ['/kg/medical-condition#melasma', 'MedicalCondition'],
  ['/kg/medical-condition#skin-aging', 'MedicalCondition'],
  ['/kg/medical-condition#hyperhidrosis', 'MedicalCondition'],
  ['/kg/medical-condition#submental-fullness', 'MedicalCondition'],
  ['/kg/medical-procedure#cosmetic-botulinum-toxin-injection', 'MedicalProcedure'],
  ['/kg/medical-procedure#dermal-filler-injection', 'MedicalProcedure'],
  ['/kg/medical-procedure#subcision', 'MedicalProcedure'],
  ['/kg/medical-procedure#thread-lift', 'MedicalProcedure'],
  ['/kg/medical-procedure#submental-liposuction', 'MedicalProcedure'],
  ['/kg/medical-therapy#platelet-rich-plasma', 'MedicalTherapy'],
  ['/kg/medical-procedure#prp-hair-restoration', 'MedicalProcedure'],
  ['/kg/medical-procedure#mesotherapy', 'MedicalProcedure'],
  ['/kg/drug#botulinum-toxin', 'Drug'],
  ['/kg/drug#hyaluronic-acid', 'Drug'],
  ['/kg/medical-device#lifting-thread', 'MedicalDevice'],
  ['/kg/research#medical-research-literacy', 'DefinedTerm'],
  ['/kg/local-authority#kermanshah-physician', 'DefinedTerm']
]);

for (const [path, expectedType] of requiredNodes) {
  const id = absoluteUrl(path);
  const node = byId.get(id);
  if (!node) {
    fail(`missing medical ontology node ${id}`);
    continue;
  }
  const types = refs(node['@type']);
  if (!types.includes(expectedType)) fail(`medical ontology node ${id} missing type ${expectedType}`);
}

const medicalOntologyIdPrefixes = [
  absoluteUrl('/kg/medical-knowledge#'),
  absoluteUrl('/kg/dermatology-hair#'),
  absoluteUrl('/kg/anatomy#'),
  absoluteUrl('/kg/medical-condition#'),
  absoluteUrl('/kg/medical-procedure#'),
  absoluteUrl('/kg/medical-therapy#'),
  absoluteUrl('/kg/medical-process#'),
  absoluteUrl('/kg/drug#'),
  absoluteUrl('/kg/medical-device#'),
  absoluteUrl('/kg/research#'),
  absoluteUrl('/kg/local-authority#')
];

function isMedicalOntologyNode(node) {
  return medicalOntologyIdPrefixes.some((prefix) => node?.['@id']?.startsWith(prefix));
}

const approvedSameAs = new Set(approvedMedicalOntologySameAsUrls());
for (const node of nodes.filter(isMedicalOntologyNode)) {
  for (const sameAs of refs(node.sameAs)) {
    if (typeof sameAs !== 'string') continue;
    if (!approvedSameAs.has(sameAs)) fail(`unapproved medical ontology sameAs ${sameAs} on ${node['@id']}`);
  }
}

const approvedCodes = new Set(
  approvedMedicalOntologyCodePairs().map((item) => `${item.entity}|${item.codingSystem}|${item.codeValue}`)
);
for (const node of nodes.filter(isMedicalOntologyNode)) {
  for (const item of refs(node.code)) {
    const key = `${node['@id']}|${item?.codingSystem}|${item?.codeValue}`;
    if (!approvedCodes.has(key)) fail(`unapproved medical code ${key}`);
    if (item?.['@type'] !== 'MedicalCode') fail(`medical code must be MedicalCode on ${node['@id']}`);
  }
}

for (const node of nodes) {
  if (node.isRelatedTo) fail(`isRelatedTo is not allowed in the primary graph: ${node['@id'] || node.name}`);
}

for (const node of nodes.filter((item) => typeList(item).includes('MedicalProcedure'))) {
  for (const bodyLocation of refs(node.bodyLocation)) {
    if (typeof bodyLocation !== 'string') {
      fail(`MedicalProcedure.bodyLocation must be Text on ${node['@id']}`);
    }
  }
}

const forbiddenSameAsByNode = new Map([
  [absoluteUrl('/kg/medical-condition#acne-scar'), ['https://www.wikidata.org/wiki/Q206060']],
  [absoluteUrl('/kg/medical-condition#atrophic-acne-scar'), ['https://www.wikidata.org/wiki/Q206060']],
  [absoluteUrl('/kg/medical-procedure#prp-hair-restoration'), ['https://www.wikidata.org/wiki/Q613879']],
  [absoluteUrl('/kg/medical-procedure#prp-skin-rejuvenation'), ['https://www.wikidata.org/wiki/Q613879']],
  [absoluteUrl('/kg/medical-procedure#hair-mesotherapy'), ['https://www.wikidata.org/wiki/Q537918']],
  [absoluteUrl('/kg/medical-procedure#skin-mesotherapy'), ['https://www.wikidata.org/wiki/Q537918']]
]);

for (const [id, blockedUrls] of forbiddenSameAsByNode) {
  const node = byId.get(id);
  for (const blockedUrl of blockedUrls) {
    if (refs(node?.sameAs).includes(blockedUrl)) fail(`broader/related URL must not be sameAs on ${id}: ${blockedUrl}`);
  }
}

const person = byId.get(absoluteUrl('/#dr-saeed-ghezelbash'));
const physician = byId.get(absoluteUrl('/#physician'));
const clinic = byId.get(absoluteUrl('/#clinic'));
const website = byId.get(absoluteUrl('/#website'));
const dataset = byId.get(absoluteUrl('/kg/#dataset'));

for (const entity of [person, physician].filter(Boolean)) {
  for (const id of [
    absoluteUrl('/kg/medical-knowledge#term-set'),
    absoluteUrl('/kg/dermatology-hair#term-set'),
    absoluteUrl('/kg/medical-knowledge#dermatology'),
    absoluteUrl('/kg/medical-knowledge#aesthetic-medicine'),
    absoluteUrl('/kg/medical-condition#acne-vulgaris'),
    absoluteUrl('/kg/medical-condition#alopecia'),
    absoluteUrl('/kg/medical-procedure#dermal-filler-injection'),
    absoluteUrl('/kg/medical-therapy#platelet-rich-plasma')
  ]) {
    if (!hasRef(entity, 'knowsAbout', id)) fail(`${entity['@id']} missing knowsAbout ${id}`);
  }
}

for (const entity of [clinic, website, dataset].filter(Boolean)) {
  for (const id of [
    absoluteUrl('/kg/medical-knowledge#term-set'),
    absoluteUrl('/kg/dermatology-hair#term-set')
  ]) {
    const hasAny = hasRef(entity, 'about', id) || hasRef(entity, 'mentions', id) || hasRef(entity, 'hasPart', id) || hasRef(entity, 'knowsAbout', id);
    if (!hasAny) fail(`${entity['@id']} missing medical ontology reference ${id}`);
  }
}

if (dataset) {
  for (const id of requiredNodes.keys()) {
    if (!hasRef(dataset, 'hasPart', absoluteUrl(id))) fail(`dataset.hasPart missing medical ontology node ${id}`);
  }
}

const serviceLinks = serviceMedicalOntologyLinkMap();
for (const service of services) {
  const expectedLinks = serviceLinks[service.key] || [];
  const serviceNode = byId.get(absoluteUrl(`/${service.slug}/#service`));
  const pageNode = byId.get(absoluteUrl(`/${service.slug}/#webpage`));
  if (!expectedLinks.length) continue;

  if (!serviceNode) {
    fail(`missing service node for medical ontology links: ${service.slug}`);
    continue;
  }

  for (const linkedId of expectedLinks) {
    if (!hasRef(serviceNode, 'category', linkedId)) fail(`service ${service.slug} missing ontology category ${linkedId}`);
  }

  if (pageNode) {
    for (const linkedId of expectedLinks.slice(0, 5)) {
      if (!hasRef(pageNode, 'about', linkedId) && !hasRef(pageNode, 'mentions', linkedId)) fail(`page ${service.slug} missing ontology page relation ${linkedId}`);
    }
  }
}

const graphText = JSON.stringify(graph);
for (const privateNeedle of ['E94583066IMM', '1962-87530', 'E0217736', '1991-05-29', 'medicaldoctor91@gmail.com', 'Yazdan Alley', 'Delgosha street']) {
  if (graphText.includes(privateNeedle)) fail(`graph leaked private credential data: ${privateNeedle}`);
}

if (failed) process.exit(1);
console.log('Medical knowledge graph validation passed');
