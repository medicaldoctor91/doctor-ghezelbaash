import { site, absoluteUrl } from '../data/site.mjs';
import { publicDataset } from '../data/dataset.mjs';
import { authoritySignals } from '../data/authoritySignals.mjs';
import { machineAssetCreativeWorks } from '../lib/machineAssets.mjs';
import { getSameAsForEntity } from '../lib/sourceClassifier.mjs';

export function GET() {
  const body = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    '@id': absoluteUrl('/publishing-crosswalk.jsonld#dataset'),
    name: 'Dr. Saeed Ghezelbash website publishing crosswalk',
    description: 'Thin website-first crosswalk for canonical pages, generated website endpoints, and external archive/profile references.',
    inLanguage: ['en', 'fa'],
    about: [
      { '@id': absoluteUrl('/#clinic') },
      { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
      { '@id': absoluteUrl('/kg/#dataset') },
      { '@id': absoluteUrl('/kg/entity-crosswalk#dataset') }
    ],
    creator: {
      '@type': 'Person',
      '@id': absoluteUrl('/#dr-saeed-ghezelbash'),
      name: site.personEn,
      alternateName: site.personFa,
      sameAs: getSameAsForEntity(authoritySignals, 'person', site.sameAs.person)
    },
    license: publicDataset.license,
    hasPart: [
      { '@type': 'CreativeWork', name: 'Canonical website', url: site.canonicalBase + '/', encodingFormat: 'text/html' },
      { '@type': 'CreativeWork', name: 'Person page', url: absoluteUrl(site.pages.person), encodingFormat: 'text/html' },
      { '@type': 'CreativeWork', name: 'Clinic page', url: absoluteUrl(site.pages.clinic), encodingFormat: 'text/html' },
      { '@type': 'CreativeWork', name: 'Knowledge graph hub', url: absoluteUrl(site.pages.kg), encodingFormat: 'text/html' },
      ...machineAssetCreativeWorks(),
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
    sameAs: getSameAsForEntity(authoritySignals, 'knowledgeGraph', site.sameAs.kg)
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/ld+json; charset=utf-8' }
  });
}
