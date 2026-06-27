import { site, absoluteUrl } from '../data/site.mjs';
import { publicDataset } from '../data/dataset.mjs';
import { authoritySignals } from '../data/authoritySignals.mjs';
import { getSameAsForEntity } from '../lib/sourceClassifier.mjs';

export function GET() {
  const body = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    '@id': absoluteUrl('/kg/#dataset'),
    name: 'Dr. Saeed Ghezelbash public website machine-readable dataset',
    alternateName: [
      'دیتاست عمومی وب‌سایت دکتر سعید قزلباش',
      'Dr. Saeed Ghezelbash Aesthetic Clinic website entity dataset'
    ],
    description: 'Live website-first manifest for the public knowledge graph, service routing, entity identity, location, regulatory and authority endpoints of Dr. Saeed Ghezelbash / دکتر سعید قزلباش in Kermanshah.',
    inLanguage: ['fa', 'en'],
    license: publicDataset.license,
    creator: {
      '@type': 'Person',
      '@id': absoluteUrl('/#dr-saeed-ghezelbash'),
      name: site.personEn,
      alternateName: [site.personFa, 'Mohammad Saeed Ghezelbash'],
      url: absoluteUrl(site.pages.person),
      sameAs: getSameAsForEntity(authoritySignals, 'person', site.sameAs.person)
    },
    about: [
      { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
      { '@id': absoluteUrl('/#clinic') },
      { '@id': absoluteUrl('/kg/#dataset') }
    ],
    distribution: [
      { '@type': 'DataDownload', name: 'Canonical JSON-LD graph', contentUrl: absoluteUrl('/graph-ghezelbaash-final.jsonld'), encodingFormat: 'application/ld+json' },
      { '@type': 'DataDownload', name: 'Brand knowledge base', contentUrl: absoluteUrl('/brand-kb.ghezelbaash.ai-public.json'), encodingFormat: 'application/json' },
      { '@type': 'DataDownload', name: 'AI discovery index', contentUrl: absoluteUrl('/ai-discovery-index.json'), encodingFormat: 'application/json' },
      { '@type': 'DataDownload', name: 'SameAs map', contentUrl: absoluteUrl('/sameas.json'), encodingFormat: 'application/json' },
      { '@type': 'DataDownload', name: 'Authority signals', contentUrl: absoluteUrl('/authority-signals.json'), encodingFormat: 'application/json' },
      { '@type': 'DataDownload', name: 'Profile links', contentUrl: absoluteUrl('/profile-links.json'), encodingFormat: 'application/json' },
      { '@type': 'DataDownload', name: 'Location profile', contentUrl: absoluteUrl('/location.json'), encodingFormat: 'application/json' },
      { '@type': 'DataDownload', name: 'Regulatory identity', contentUrl: absoluteUrl('/regulatory.json'), encodingFormat: 'application/json' },
      { '@type': 'DataDownload', name: 'Research profile', contentUrl: absoluteUrl('/research.json'), encodingFormat: 'application/json' },
      { '@type': 'DataDownload', name: 'Services intent map', contentUrl: absoluteUrl('/services.json'), encodingFormat: 'application/json' },
      { '@type': 'DataDownload', name: 'Service taxonomy', contentUrl: absoluteUrl('/service-taxonomy.json'), encodingFormat: 'application/json' },
      { '@type': 'DataDownload', name: 'Route registry', contentUrl: absoluteUrl('/routes.json'), encodingFormat: 'application/json' },
      { '@type': 'DataDownload', name: 'Page context', contentUrl: absoluteUrl('/page-context.json'), encodingFormat: 'application/json' },
      { '@type': 'DataDownload', name: 'Internal link graph', contentUrl: absoluteUrl('/link-graph.json'), encodingFormat: 'application/json' },
      { '@type': 'DataDownload', name: 'NAP CSV', contentUrl: absoluteUrl('/nap.csv'), encodingFormat: 'text/csv' }
    ],
    sameAs: getSameAsForEntity(authoritySignals, 'knowledgeGraph', site.sameAs.kg),
    dateModified: '2026-06-28',
    url: absoluteUrl('/dataset-manifest.jsonld'),
    version: '2026-06-28-website-first-source-contract'
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/ld+json; charset=utf-8' }
  });
}
