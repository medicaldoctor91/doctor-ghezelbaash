const SAME_AS_BLOCKED_TYPES = new Set([
  'mediaMention',
  'mediaInterview',
  'forumDiscussion',
  'topicalTag',
  'editorialCoverage',
  'generalTopicPage'
]);

const ENTITY_ALIASES = {
  person: new Set(['person', 'personAndClinic']),
  clinic: new Set(['clinic', 'clinicAndServices', 'personAndClinic']),
  knowledgeGraph: new Set(['knowledgeGraph']),
  service: new Set(['service', 'clinicAndServices'])
};

function uniqueByValue(values) {
  return [...new Set(values.filter(Boolean))];
}

export function entityMatches(signal, entity) {
  return ENTITY_ALIASES[entity]?.has(signal.entity) || signal.entity === entity;
}

export function canUseAsSameAs(signal) {
  return signal.useAs?.includes('sameAs') && !SAME_AS_BLOCKED_TYPES.has(signal.type);
}

export function getSignalsForEntity(signals, entity) {
  return signals.filter((signal) => entityMatches(signal, entity));
}

export function getUrlsByUse(signals, entity, use) {
  return uniqueByValue(
    getSignalsForEntity(signals, entity)
      .filter((signal) => signal.useAs?.includes(use))
      .map((signal) => signal.url)
  );
}

export function getSameAsForEntity(signals, entity, base = []) {
  const signalSameAs = getSignalsForEntity(signals, entity)
    .filter(canUseAsSameAs)
    .map((signal) => signal.url);

  return uniqueByValue([...base, ...signalSameAs]);
}

export function getSubjectOfForEntity(signals, entity) {
  return getSignalsForEntity(signals, entity)
    .filter((signal) => signal.useAs?.includes('subjectOf') || signal.useAs?.includes('citation'))
    .map((signal) => ({
      '@type': 'WebPage',
      name: signal.title || `${signal.publisher} ${signal.type}`,
      url: signal.url
    }));
}

export function getMapUrlsForClinic(signals, location) {
  return uniqueByValue([
    location.googleMapsCid,
    location.googleMapsPlace,
    location.openStreetMap,
    ...(location.additionalMapProfiles || []).map((profile) => profile.url),
    ...getUrlsByUse(signals, 'clinic', 'hasMap')
  ]);
}

export function assertSourceContract({ authoritySignals = [], externalProfiles = {} } = {}) {
  const errors = [];
  const keys = new Set();
  const blockedSameAsHosts = [
    'iranmedlabs.com',
    'ninisite.com',
    'rokna.net',
    'namnak.com',
    'khabaronline.ir',
    'gadgetnews.net',
    'niniban.com'
  ];

  for (const signal of authoritySignals) {
    if (!signal.key) errors.push('authority signal without key');
    if (!signal.url) errors.push(`authority signal ${signal.key || '(missing key)'} without url`);
    if (keys.has(signal.key)) errors.push(`duplicate authority signal key: ${signal.key}`);
    keys.add(signal.key);

    if (SAME_AS_BLOCKED_TYPES.has(signal.type) && signal.useAs?.includes('sameAs')) {
      errors.push(`blocked sameAs use for ${signal.key}: ${signal.type}`);
    }
  }

  for (const url of externalProfiles.verifiedSameAs || []) {
    if (blockedSameAsHosts.some((host) => url.includes(host))) {
      errors.push(`media/editorial URL must not be verifiedSameAs: ${url}`);
    }
  }

  return errors;
}
