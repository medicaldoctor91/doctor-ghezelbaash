import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import { buildAeoDataIndex, getAeoDataContentType, normalizeAeoDataDocument } from '~/utils/aeoDataEndpoint';
import { jsonResponse } from '~/utils/jsonLd';

export const prerender = true;

const legacyAliases = [
  'brand-kb.ghezelbaash.ai-public',
  'entity-hardening-index',
  'dataset',
  'services',
  'sameas',
  'location',
  'regulatory',
  'research',
  'authority-signals',
  'profile-links',
  'service-taxonomy',
] as const;

type LegacyAlias = (typeof legacyAliases)[number];
type AeoEntry = CollectionEntry<'aeoData'>;

const aliasHints: Record<LegacyAlias, string[]> = {
  'brand-kb.ghezelbaash.ai-public': ['brand', 'kb', 'knowledge', 'entity', 'dataset'],
  'entity-hardening-index': ['entity-hardening', 'hardening', 'entity'],
  dataset: ['dataset', 'entity-dataset'],
  services: ['services', 'service-catalog', 'service'],
  sameas: ['sameas', 'same-as', 'profile-links'],
  location: ['location', 'address', 'clinic'],
  regulatory: ['regulatory', 'credential', 'license'],
  research: ['research', 'evidence', 'citation'],
  'authority-signals': ['authority', 'signals', 'evidence'],
  'profile-links': ['profile-links', 'sameas', 'links'],
  'service-taxonomy': ['service-taxonomy', 'taxonomy', 'services'],
};

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const pickEntry = (entries: AeoEntry[], alias: LegacyAlias): AeoEntry | undefined => {
  const hints = aliasHints[alias].map(normalize);
  return entries.find((entry) => hints.some((hint) => normalize(entry.id).includes(hint)));
};

export const getStaticPaths: GetStaticPaths = async () =>
  legacyAliases.map((alias) => ({
    params: { legacyData: alias },
    props: { alias },
  }));

export const GET: APIRoute = async ({ props, params }) => {
  const alias = String((props as { alias?: string } | undefined)?.alias ?? params.legacyData ?? '') as LegacyAlias;
  const entries = await getCollection('aeoData');
  const entry = pickEntry(entries, alias);

  if (entry) {
    return jsonResponse(
      {
        ...normalizeAeoDataDocument(entry.id, entry.data),
        legacyAlias: `${alias}.json`,
        generatedFrom: `src/content/aeo-data/${entry.id}.json`,
      },
      getAeoDataContentType(entry.id)
    );
  }

  return jsonResponse(
    {
      ...(await buildAeoDataIndex()),
      legacyAlias: `${alias}.json`,
      note: 'No exact collection entry matched this legacy alias; this fallback index is generated from src/content/aeo-data/*.json.',
    },
    'application/json'
  );
};
