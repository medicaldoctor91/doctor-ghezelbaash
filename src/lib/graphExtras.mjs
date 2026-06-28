import { absoluteUrl } from '../data/site.mjs';

export function buildGraphExtras() {
  return [
    {
      '@type': 'CreativeWork',
      '@id': absoluteUrl('/kg/policy#graph-extras'),
      name: 'Primary graph extra relationship policy',
      url: absoluteUrl('/graph-ghezelbaash-final.jsonld')
    }
  ];
}

export function applyGraphExtras(nodes) {
  return nodes;
}

export const graphExtrasVersion = 'v1';
