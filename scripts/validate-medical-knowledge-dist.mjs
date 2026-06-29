import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'dist', 'graph-ghezelbaash-final.jsonld');
let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

function refs(value) {
  return Array.isArray(value) ? value : [value].filter(Boolean);
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
    const possibleTreatmentAllowedTypes = new Set([
      'Drug',
      'DrugClass',
      'LifestyleModification',
      'MedicalTherapy'
    ]);

    const requiredNeedles = [
      '/kg/medical-knowledge#term-set',
      '/kg/dermatology-hair#term-set',
      '/kg/anatomy#term-set',
      '/kg/medical-condition#term-set',
      '/kg/medical-procedure#term-set',
      '/kg/medical-material#term-set',
      '/kg/research#medical-term-set',
      '/kg/local-authority#term-set',
      '/kg/medical-knowledge#dermatology',
      '/kg/medical-knowledge#aesthetic-medicine',
      '/kg/anatomy#skin',
      '/kg/anatomy#hair-follicle',
      '/kg/anatomy#submental-region',
      '/kg/medical-condition#acne-vulgaris',
      '/kg/medical-condition#acne-scar',
      '/kg/medical-condition#alopecia',
      '/kg/medical-condition#melasma',
      '/kg/medical-condition#hyperhidrosis',
      '/kg/medical-procedure#cosmetic-botulinum-toxin-injection',
      '/kg/medical-procedure#dermal-filler-injection',
      '/kg/medical-procedure#subcision',
      '/kg/medical-procedure#thread-lift',
      '/kg/medical-procedure#submental-liposuction',
      '/kg/medical-therapy#platelet-rich-plasma',
      '/kg/drug#botulinum-toxin',
      '/kg/drug#hyaluronic-acid',
      'SNOMED CT',
      'D000152',
      'D053657',
      'D003880',
      'https://www.wikidata.org/wiki/Q171171',
      'https://www.wikidata.org/wiki/Q3332453',
      'https://www.wikidata.org/wiki/Q79928',
      'https://www.wikidata.org/wiki/Q613879'
    ];

    for (const needle of requiredNeedles) {
      if (!text.includes(needle)) fail(`medical ontology dist missing ${needle}`);
    }

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
        if (forbiddenPlanningKeys.has(key)) fail(`planning metadata key leaked into dist graph: ${key}`);
      }
    });

    for (const node of nodes) {
      if (node.isRelatedTo) fail(`dist graph must not emit isRelatedTo: ${node['@id'] || node.name}`);
    }

    for (const node of nodes.filter((item) => typeList(item).includes('MedicalProcedure'))) {
      for (const bodyLocation of refs(node.bodyLocation)) {
        if (typeof bodyLocation !== 'string') {
          fail(`dist MedicalProcedure.bodyLocation must be Text on ${node['@id']}`);
        }
      }
    }

    for (const node of nodes.filter((item) => typeList(item).includes('MedicalCondition'))) {
      for (const treatmentRef of refs(node.possibleTreatment)) {
        const treatment = byId.get(treatmentRef?.['@id']);
        if (!treatment) {
          fail(`dist possibleTreatment target missing for ${node['@id']}: ${treatmentRef?.['@id']}`);
          continue;
        }
        if (!typeList(treatment).some((type) => possibleTreatmentAllowedTypes.has(type))) {
          fail(`dist possibleTreatment target has invalid Schema.org type for ${node['@id']}: ${treatment['@id']}`);
        }
      }
    }

    const forbiddenSameAsByNode = new Map([
      ['https://www.ghezelbaash.ir/kg/medical-condition#acne-scar', 'https://www.wikidata.org/wiki/Q206060'],
      ['https://www.ghezelbaash.ir/kg/medical-procedure#prp-hair-restoration', 'https://www.wikidata.org/wiki/Q613879'],
      ['https://www.ghezelbaash.ir/kg/medical-procedure#hair-mesotherapy', 'https://www.wikidata.org/wiki/Q537918']
    ]);

    for (const [id, blockedSameAs] of forbiddenSameAsByNode) {
      const node = byId.get(id);
      if (refs(node?.sameAs).includes(blockedSameAs)) fail(`dist graph has broader/related sameAs on ${id}: ${blockedSameAs}`);
    }

    const nodesWithRequiredMedicalCode = [
      ['acne', byId.get('https://www.ghezelbaash.ir/kg/medical-condition#acne-vulgaris')],
      ['hyperhidrosis', byId.get('https://www.ghezelbaash.ir/kg/medical-condition#hyperhidrosis')]
    ];

    for (const [label, node] of nodesWithRequiredMedicalCode) {
      if (!node) {
        fail(`missing parsed dist node ${label}`);
        continue;
      }
      if (!refs(node.code).some((item) => item?.['@type'] === 'MedicalCode')) fail(`dist node missing MedicalCode ${label}`);
    }
  }

  for (const privateNeedle of ['E94583066IMM', '1962-87530', 'E0217736', '1991-05-29', 'medicaldoctor91@gmail.com', 'Yazdan Alley', 'Delgosha street']) {
    if (text.includes(privateNeedle)) fail(`medical ontology dist leaked private credential data: ${privateNeedle}`);
  }
}

if (failed) process.exit(1);
console.log('Medical knowledge dist validation passed');
