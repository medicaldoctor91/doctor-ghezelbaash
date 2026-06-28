import { absoluteUrl } from '../data/site.mjs';

export const machineAssets = [
  { name: 'Canonical JSON-LD graph', path: '/graph-ghezelbaash-final.jsonld', format: 'application/ld+json', role: 'primary-graph' },
  { name: 'Brand knowledge base', path: '/brand-kb.ghezelbaash.ai-public.json', format: 'application/json', role: 'thin-projection' },
  { name: 'AI discovery index', path: '/ai-discovery-index.json', format: 'application/json', role: 'audit-thin-or-merge' },
  { name: 'SameAs map', path: '/sameas.json', format: 'application/json', role: 'thin-projection' },
  { name: 'Authority signals', path: '/authority-signals.json', format: 'application/json', role: 'thin-projection' },
  { name: 'Profile links', path: '/profile-links.json', format: 'application/json', role: 'thin-projection' },
  { name: 'Location profile', path: '/location.json', format: 'application/json', role: 'thin-projection' },
  { name: 'Regulatory identity', path: '/regulatory.json', format: 'application/json', role: 'thin-projection' },
  { name: 'Dataset summary', path: '/dataset.json', format: 'application/json', role: 'thin-projection' },
  { name: 'Research profile', path: '/research.json', format: 'application/json', role: 'thin-projection' },
  { name: 'Services intent map', path: '/services.json', format: 'application/json', role: 'thin-projection' },
  { name: 'Service taxonomy', path: '/service-taxonomy.json', format: 'application/json', role: 'thin-projection' },
  { name: 'Aesthetic knowledge projection', path: '/aesthetic_medicine_knowledge_kermanshah_fa.json', format: 'application/json', role: 'thin-projection' },
  { name: 'Route registry', path: '/routes.json', format: 'application/json', role: 'discovery' },
  { name: 'Page context', path: '/page-context.json', format: 'application/json', role: 'discovery' },
  { name: 'Internal link graph', path: '/link-graph.json', format: 'application/json', role: 'discovery' },
  { name: 'SEO AEO index', path: '/seo-aeo-index.json', format: 'application/json', role: 'discovery' },
  { name: 'LLM discovery text', path: '/llms.txt', format: 'text/plain', role: 'discovery' },
  { name: 'Robots policy', path: '/robots.txt', format: 'text/plain', role: 'discovery' },
  { name: 'XML sitemap', path: '/sitemap.xml', format: 'application/xml', role: 'discovery' },
  { name: 'NAP CSV', path: '/nap.csv', format: 'text/csv', role: 'export' },
  { name: 'Entity hardening index', path: '/entity-hardening-index.json', format: 'application/json', role: 'audit-thin-or-merge' },
  { name: 'Local competitive landscape', path: '/local-competitive-landscape.json', format: 'application/json', role: 'audit-thin-or-merge' },
  { name: 'Dataset landing page', path: '/aesthetic-medicine-dataset.html', format: 'text/html', role: 'landing' }
];

export function machineAssetDataDownloads() {
  return machineAssets.map((asset) => ({
    '@type': 'DataDownload',
    name: asset.name,
    contentUrl: absoluteUrl(asset.path),
    encodingFormat: asset.format,
    additionalProperty: [
      {
        '@type': 'PropertyValue',
        propertyID: 'projectionRole',
        value: asset.role
      }
    ]
  }));
}

export function machineAssetCreativeWorks() {
  return machineAssets.map((asset) => ({
    '@type': asset.format === 'application/ld+json' ? 'DataDownload' : 'CreativeWork',
    name: asset.name,
    url: absoluteUrl(asset.path),
    encodingFormat: asset.format,
    additionalProperty: [
      {
        '@type': 'PropertyValue',
        propertyID: 'projectionRole',
        value: asset.role
      }
    ]
  }));
}

export function machineAssetUrlMap() {
  return Object.fromEntries(machineAssets.map((asset) => [asset.path, absoluteUrl(asset.path)]));
}
