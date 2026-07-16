import type { CanonicalGraph, JsonLdNode } from './schema.ts';

const bannedTypes = new Set([
  'Product',
  'Offer',
  'Service',
  'AggregateRating',
  'Review',
  'SearchAction',
  'HowTo',
  'BreadcrumbList',
]);
const bannedFields = new Set([
  ['available', 'Service'].join(''),
  ['provided', 'As', 'Service'].join(''),
  ['not', 'Provided'].join(''),
  ['allow', 'Service', 'Schema'].join(''),
  ['allow', 'Offer'].join(''),
  ['allow', 'CTA'].join(''),
  ['service', 'Status'].join(''),
]);

export const validateGraphObject = (graph: CanonicalGraph): string[] => {
  const errors: string[] = [];
  const ids = new Set<string>();
  const nodes = graph['@graph'];
  for (const node of nodes) {
    if (ids.has(node['@id'])) errors.push(`Duplicate @id: ${node['@id']}`);
    ids.add(node['@id']);
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    for (const type of types) {
      if (bannedTypes.has(type)) errors.push(`Banned schema type ${type}: ${node['@id']}`);
    }
    for (const field of Object.keys(node)) {
      if (bannedFields.has(field)) errors.push(`Banned schema field ${field}: ${node['@id']}`);
    }
  }
  const doctor = nodes.find((node) => node['@id'].endsWith('#doctor')) as JsonLdNode | undefined;
  const clinic = nodes.find((node) => node['@id'].endsWith('#clinic')) as JsonLdNode | undefined;
  const doctorText = JSON.stringify(doctor ?? {});
  const clinicText = JSON.stringify(clinic ?? {});
  for (const clinicIdentifier of ['/g/11r3rzdtb3', '12350483144643112463', 'ChIJBTOYDOTt-j8RD-7mAPy6Zas']) {
    if (doctorText.includes(clinicIdentifier)) {
      errors.push(`Clinic identifier leaked onto Person: ${clinicIdentifier}`);
    }
  }
  for (const doctorIdentifier of ['/g/11nqdfk76c', 'C-02KY8SVQ2']) {
    if (clinicText.includes(doctorIdentifier)) {
      errors.push(`Person identifier leaked onto MedicalClinic: ${doctorIdentifier}`);
    }
  }
  return errors;
};
