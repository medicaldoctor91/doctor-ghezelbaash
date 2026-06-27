import { site, absoluteUrl } from '../data/site.mjs';
import { location } from '../data/location.mjs';
import { publicDataset } from '../data/dataset.mjs';
import { researchProfile } from '../data/research.mjs';
import { authoritySignals } from '../data/authoritySignals.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.entity_hardening.astro.v1',
    canonicalWebsite: site.canonicalBase + '/',
    entities: {
      person: absoluteUrl('/#dr-saeed-ghezelbash'),
      clinic: absoluteUrl('/#clinic'),
      dataset: absoluteUrl('/kg/#dataset')
    },
    location: {
      address: location.canonicalAddressFa,
      maps: location.googleMapsCid,
      osm: location.openStreetMap
    },
    research: {
      orcid: researchProfile.orcid,
      bibliography: researchProfile.bibliographyUrl,
      identifiers: researchProfile.publications.map((item) => ({ doi: item.doi, pmid: item.pmid, pmcid: item.pmcid }))
    },
    dataset: {
      doi: publicDataset.doi,
      zenodo: publicDataset.zenodo,
      huggingFace: publicDataset.huggingFace,
      github: publicDataset.github
    },
    authoritySignals: authoritySignals.map((signal) => ({ key: signal.key, type: signal.type, entity: signal.entity, url: signal.url })),
    machineAssets: [
      absoluteUrl('/sameas.json'),
      absoluteUrl('/brand-kb.ghezelbaash.ai-public.json'),
      absoluteUrl('/location.json'),
      absoluteUrl('/research.json'),
      absoluteUrl('/dataset.json'),
      absoluteUrl('/authority-signals.json'),
      absoluteUrl('/service-taxonomy.json'),
      absoluteUrl('/profile-links.json')
    ]
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
