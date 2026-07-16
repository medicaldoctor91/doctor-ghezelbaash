export type JsonLdNode = {
  '@id': string;
  '@type': string | string[];
  [key: string]: unknown;
};

export type CanonicalGraph = {
  '@context': 'https://schema.org';
  '@graph': JsonLdNode[];
};

export const asId = (id: string): { '@id': string } => ({ '@id': id });

export const asPropertyValue = (identifier: {
  propertyID: string;
  value: string;
  url?: string;
}): Record<string, unknown> => ({
  '@type': 'PropertyValue',
  propertyID: identifier.propertyID,
  value: identifier.value,
  ...(identifier.url ? { url: identifier.url } : {}),
});

export const assertSafeJsonLd = (value: unknown): void => {
  const serialized = JSON.stringify(value);
  if (/<\/script/iu.test(serialized)) {
    throw new Error('JSON-LD contains an unsafe closing script token.');
  }
};
