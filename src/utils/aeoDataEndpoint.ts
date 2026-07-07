import { getCollection, getEntry } from 'astro:content';
import { SITE } from '~/site.config';
import { jsonResponse } from '~/utils/jsonLd';

type AeoDataDocument = Record<string, any>;

const SITE_URL = SITE.site;

const toIsoDateTime = (value: unknown): unknown =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+03:30` : value;

const normalizeDateModifiedFields = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((item) => normalizeDateModifiedFields(item));

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        key === 'dateModified' ? toIsoDateTime(entryValue) : normalizeDateModifiedFields(entryValue),
      ])
    );
  }

  return value;
};

const contentTypes: Record<string, string> = {
  'google-maps-rating': 'application/json',
};

const countItems = (data: AeoDataDocument): number | undefined => {
  if (Array.isArray(data.answerUnits)) return data.answerUnits.length;
  if (Array.isArray(data.claims)) return data.claims.length;
  if (Array.isArray(data.routes)) return data.routes.length;
  if (Array.isArray(data.records)) return data.records.length;
  if (Array.isArray(data.videos)) return data.videos.length;
  if (Array.isArray(data.entities)) return data.entities.length;
  if (Array.isArray(data.services)) return data.services.length;
  if (typeof data.recordCount === 'number') return data.recordCount;
  if (typeof data.numberOfItems === 'number') return data.numberOfItems;
  return undefined;
};

const normalizeVideoManifest = (data: AeoDataDocument): AeoDataDocument => {
  if (!Array.isArray(data.videos)) return data;

  const videos = data.videos.map((video: AeoDataDocument) => {
    if (!Array.isArray(video.segments) || typeof video.durationSeconds !== 'number') return video;

    return {
      ...video,
      segments: video.segments.filter((segment: AeoDataDocument) => {
        const startOffset = Number(segment.startOffset);
        const endOffset = Number(segment.endOffset);

        return (
          Number.isFinite(startOffset) &&
          Number.isFinite(endOffset) &&
          startOffset < endOffset &&
          endOffset <= video.durationSeconds
        );
      }),
    };
  });

  return { ...data, videos };
};

export const normalizeAeoDataDocument = (id: string, data: AeoDataDocument): AeoDataDocument => {
  let normalized = data;
  if (id === 'video-manifest') normalized = normalizeVideoManifest(data);
  return normalizeDateModifiedFields(normalized) as AeoDataDocument;
};

export const getAeoDataContentType = (id: string): string => contentTypes[id] ?? 'application/ld+json';

export async function buildAeoDataIndex(): Promise<AeoDataDocument> {
  const entries = (await getCollection('aeoData')).filter((entry) => entry.id !== 'index');

  const itemListElement = entries
    .map((entry) => {
      const data = normalizeAeoDataDocument(entry.id, entry.data as AeoDataDocument);
      const url = `${SITE_URL}/data/${entry.id}.json`;

      return {
        '@type': 'DataDownload',
        name: typeof data.name === 'string' ? data.name : entry.id,
        contentUrl: url,
        encodingFormat: getAeoDataContentType(entry.id),
        dateModified: toIsoDateTime(data.dateModified ?? data.lastSynced),
        additionalProperty:
          countItems(data) === undefined
            ? undefined
            : {
                '@type': 'PropertyValue',
                name: 'recordCount',
                value: countItems(data),
              },
      };
    })
    .sort((left, right) => String(left.name).localeCompare(String(right.name), 'fa'))
    .map((item, index) => ({ ...item, position: index + 1 }));

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${SITE_URL}/data/index.json#itemlist`,
    url: `${SITE_URL}/data/index.json`,
    name: 'Machine-readable data feeds',
    inLanguage: 'fa-IR',
    numberOfItems: itemListElement.length,
    itemListElement,
  };
}

export const aeoDataResponse = async (id: string, contentType = getAeoDataContentType(id)): Promise<Response> => {
  if (id === 'index') return jsonResponse(await buildAeoDataIndex(), contentType);

  const entry = await getEntry('aeoData', id);

  if (!entry) {
    return new Response(`Missing AEO data collection entry: ${id}\n`, { status: 500 });
  }

  return jsonResponse(normalizeAeoDataDocument(id, entry.data as AeoDataDocument), contentType);
};
