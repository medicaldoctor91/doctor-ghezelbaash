import { site, absoluteUrl } from '../data/site.mjs';
import { publicDataset } from '../data/dataset.mjs';
import { authoritySignals } from '../data/authoritySignals.mjs';
import { machineAssetDataDownloads } from '../lib/machineAssets.mjs';
import { getSameAsForEntity } from '../lib/sourceClassifier.mjs';

export function GET() {
  const body = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    '@id': absoluteUrl('/kg/#dataset'),
    name: 'Dr. Saeed Ghezelbash public website machine-readable dataset',
    description: 'Thin website-first manifest for generated public machine-readable assets. The canonical entity graph remains graph-ghezelbaash-final.jsonld.',
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
      { '@id': absoluteUrl('/kg/#dataset') },
      { '@id': absoluteUrl('/kg/entity-crosswalk#dataset') }
    ],
    isBasedOn: { '@id': absoluteUrl('/graph-ghezelbaash-final.jsonld') },
    distribution: machineAssetDataDownloads(),
    sameAs: getSameAsForEntity(authoritySignals, 'knowledgeGraph', site.sameAs.kg),
    dateModified: '2026-06-28',
    url: absoluteUrl('/dataset-manifest.jsonld'),
    version: '2026-06-28-website-first-source-contract'
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/ld+json; charset=utf-8' }
  });
}
