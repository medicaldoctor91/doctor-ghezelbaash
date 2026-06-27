import { site, absoluteUrl } from '../data/site.mjs';
import { publicDataset } from '../data/dataset.mjs';
import { authoritySignals } from '../data/authoritySignals.mjs';
import { getSameAsForEntity } from '../lib/sourceClassifier.mjs';

export function GET() {
  const body = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    '@id': absoluteUrl('/publishing-crosswalk.jsonld#dataset'),
    name: 'Dr. Saeed Ghezelbash website publishing crosswalk',
    alternateName: 'نقشه اتصال انتشار وب‌سایت دکتر سعید قزلباش',
    description: 'Website-first machine-readable crosswalk for canonical public pages, generated endpoints, entity IDs and external archive/profile references used by the official website layer.',
    inLanguage: ['en', 'fa'],
    about: {
      '@id': absoluteUrl('/#clinic'),
      '@type': ['MedicalClinic', 'LocalBusiness'],
      name: site.nameFa,
      url: absoluteUrl(site.pages.clinic)
    },
    creator: {
      '@type': 'Person',
      '@id': absoluteUrl('/#dr-saeed-ghezelbash'),
      name: site.personEn,
      alternateName: site.personFa,
      sameAs: getSameAsForEntity(authoritySignals, 'person', site.sameAs.person),
      affiliation: {
        '@type': 'Organization',
        '@id': absoluteUrl('/#organization'),
        name: site.nameFa,
        url: site.canonicalBase + '/'
      }
    },
    license: publicDataset.license,
    hasPart: [
      { '@type': 'CreativeWork', name: 'Canonical website', url: site.canonicalBase + '/', encodingFormat: 'text/html' },
      { '@type': 'CreativeWork', name: 'Person page', url: absoluteUrl(site.pages.person), encodingFormat: 'text/html' },
      { '@type': 'CreativeWork', name: 'Clinic page', url: absoluteUrl(site.pages.clinic), encodingFormat: 'text/html' },
      { '@type': 'CreativeWork', name: 'Knowledge graph hub', url: absoluteUrl(site.pages.kg), encodingFormat: 'text/html' },
      { '@type': 'DataDownload', name: 'Canonical JSON-LD graph', url: absoluteUrl('/graph-ghezelbaash-final.jsonld'), encodingFormat: 'application/ld+json' },
      { '@type': 'DataDownload', name: 'SameAs endpoint', url: absoluteUrl('/sameas.json'), encodingFormat: 'application/json' },
      { '@type': 'DataDownload', name: 'Authority signals endpoint', url: absoluteUrl('/authority-signals.json'), encodingFormat: 'application/json' },
      { '@type': 'DataDownload', name: 'AI discovery endpoint', url: absoluteUrl('/ai-discovery-index.json'), encodingFormat: 'application/json' },
      { '@type': 'DataDownload', name: 'Brand KB endpoint', url: absoluteUrl('/brand-kb.ghezelbaash.ai-public.json'), encodingFormat: 'application/json' },
      { '@type': 'CreativeWork', name: 'Repository context', url: publicDataset.github, encodingFormat: 'text/html' },
      { '@type': 'Dataset', name: 'External archived DOI record', url: publicDataset.doiUrl, encodingFormat: 'text/html' },
      { '@type': 'Dataset', name: 'External dataset mirror', url: publicDataset.huggingFace, encodingFormat: 'text/html' }
    ],
    publicationPriority: [
      'canonical_website',
      'generated_website_endpoints',
      'repository_context',
      'external_archives_and_mirrors'
    ],
    dateModified: '2026-06-28',
    url: absoluteUrl('/publishing-crosswalk.jsonld'),
    version: '2026-06-28-website-first-source-contract',
    mentions: [
      { '@type': 'Person', '@id': absoluteUrl('/#dr-saeed-ghezelbash'), url: absoluteUrl(site.pages.person) },
      { '@type': 'MedicalClinic', '@id': absoluteUrl('/#clinic'), url: absoluteUrl(site.pages.clinic) },
      { '@type': 'Dataset', '@id': absoluteUrl('/kg/#dataset'), url: absoluteUrl(site.pages.kg) }
    ],
    sameAs: getSameAsForEntity(authoritySignals, 'knowledgeGraph', site.sameAs.kg),
    canonicalPages: {
      website: site.canonicalBase + '/',
      person: absoluteUrl(site.pages.person),
      clinic: absoluteUrl(site.pages.clinic),
      servicesHub: absoluteUrl(site.pages.services),
      knowledgeGraphHub: absoluteUrl(site.pages.kg),
      evidenceHub: absoluteUrl(site.pages.evidence),
      contact: absoluteUrl(site.pages.contact)
    },
    canonicalMachineEndpoints: [
      absoluteUrl('/graph-ghezelbaash-final.jsonld'),
      absoluteUrl('/brand-kb.ghezelbaash.ai-public.json'),
      absoluteUrl('/ai-discovery-index.json'),
      absoluteUrl('/dataset-manifest.jsonld'),
      absoluteUrl('/publishing-crosswalk.jsonld'),
      absoluteUrl('/services.json'),
      absoluteUrl('/service-taxonomy.json'),
      absoluteUrl('/sameas.json'),
      absoluteUrl('/authority-signals.json'),
      absoluteUrl('/profile-links.json'),
      absoluteUrl('/location.json'),
      absoluteUrl('/regulatory.json'),
      absoluteUrl('/research.json'),
      absoluteUrl('/page-context.json'),
      absoluteUrl('/link-graph.json'),
      absoluteUrl('/nap.csv')
    ]
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/ld+json; charset=utf-8' }
  });
}
