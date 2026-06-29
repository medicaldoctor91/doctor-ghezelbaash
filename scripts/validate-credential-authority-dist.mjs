import fs from 'node:fs';
import path from 'node:path';
import { absoluteUrl } from '../src/data/site.mjs';

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

function typeList(node) {
  return refs(node?.['@type']);
}

function hasRef(entity, property, id) {
  return refIds(entity?.[property]).includes(id);
}

function hasIdentifier(entity, propertyID, value) {
  return refs(entity?.identifier).some((item) => item?.['@type'] === 'PropertyValue' && item.propertyID === propertyID && item.value === value);
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

    for (const requiredNeedle of [
      '/kg/organization#medical-council-of-canada',
      '/kg/organization#kermanshah-university-medical-sciences-school-of-medicine',
      '/kg/credential#medical-degree',
      '/kg/credential#mcc-doctor-of-medicine-equivalency',
      'Doctor of Medicine equivalency assessed by the Medical Council of Canada',
      'Canadian equivalency: Doctor of Medicine',
      'CAMD-0224-1997'
    ]) {
      if (!text.includes(requiredNeedle)) fail(`credential authority dist missing ${requiredNeedle}`);
    }

    for (const forbiddenNeedle of [
      'E0217736',
      'E94583066IMM',
      '1962-87530',
      'MyIntealth',
      'EICS',
      'ECA ID',
      'Educational Credential Assessment ID',
      'MCC candidate code',
      'LMCC',
      'licensed in Canada',
      'practice medicine in Canada',
      'immigration validity'
    ]) {
      if (text.includes(forbiddenNeedle)) fail(`workflow/application or non-authority MCC marker leaked into dist graph: ${forbiddenNeedle}`);
    }

    for (const node of nodes) {
      if (Object.prototype.hasOwnProperty.call(node, 'expires')) fail(`credential authority dist must not emit expires on ${node['@id'] || '(anonymous node)'}`);
    }

    const person = byId.get(absoluteUrl('/#dr-saeed-ghezelbash'));
    const physician = byId.get(absoluteUrl('/#physician'));
    const dataset = byId.get(absoluteUrl('/kg/#dataset'));
    const mcc = byId.get(absoluteUrl('/kg/organization#medical-council-of-canada'));
    const kums = byId.get(absoluteUrl('/kg/organization#kermanshah-university-medical-sciences-school-of-medicine'));
    const medicalDegree = byId.get(absoluteUrl('/kg/credential#medical-degree'));
    const mccEquivalency = byId.get(absoluteUrl('/kg/credential#mcc-doctor-of-medicine-equivalency'));

    if (!person) fail('missing person node in dist');
    if (!physician) fail('missing physician node in dist');
    if (!dataset) fail('missing dataset node in dist');

    if (!mcc) {
      fail('missing MCC organization node in dist');
    } else {
      if (!typeList(mcc).includes('Organization')) fail('MCC dist node must be Organization');
      if (mcc.url !== 'https://mcc.ca/') fail('MCC dist node missing official url');
    }

    if (!kums) {
      fail('missing KUMS node in dist');
    } else {
      if (!typeList(kums).includes('CollegeOrUniversity')) fail('KUMS dist node missing CollegeOrUniversity type');
      if (!typeList(kums).includes('EducationalOrganization')) fail('KUMS dist node missing EducationalOrganization type');
    }

    if (!medicalDegree) {
      fail('missing medical degree credential in dist');
    } else {
      if (!typeList(medicalDegree).includes('EducationalOccupationalCredential')) fail('medical degree dist node missing EducationalOccupationalCredential type');
      if (medicalDegree.educationalLevel !== 'Doctor of Medicine') fail('medical degree dist node has unexpected educationalLevel');
    }

    if (!mccEquivalency) {
      fail('missing MCC Doctor of Medicine equivalency credential in dist');
    } else {
      if (!typeList(mccEquivalency).includes('EducationalOccupationalCredential')) fail('MCC equivalency dist node missing EducationalOccupationalCredential type');
      if (mccEquivalency.credentialCategory !== 'Medical degree equivalency') fail('MCC equivalency dist node has unexpected credentialCategory');
      if (mccEquivalency.educationalLevel !== 'Doctor of Medicine') fail('MCC equivalency dist node has unexpected educationalLevel');
      if (mccEquivalency.datePublished !== '2020-09-17') fail('MCC equivalency dist node has unexpected datePublished');
      if (!hasRef(mccEquivalency, 'recognizedBy', absoluteUrl('/kg/organization#medical-council-of-canada'))) fail('MCC equivalency dist node missing recognizedBy MCC');
      if (refs(mccEquivalency.identifier).length) fail('MCC equivalency dist node should not expose report/workflow identifiers');
    }

    for (const entity of [person, physician].filter(Boolean)) {
      if (!hasIdentifier(entity, 'MINC', 'CAMD-0224-1997')) fail(`${entity['@id']} missing MINC identifier in dist`);
      if (!hasRef(entity, 'hasCredential', absoluteUrl('/kg/credential#mcc-doctor-of-medicine-equivalency'))) fail(`${entity['@id']} missing MCC equivalency credential in dist`);
      if (!hasRef(entity, 'hasCredential', absoluteUrl('/kg/credential#medical-degree'))) fail(`${entity['@id']} missing medical degree credential in dist`);
    }
  }
}

if (failed) process.exit(1);
console.log('Credential authority dist validation passed');
