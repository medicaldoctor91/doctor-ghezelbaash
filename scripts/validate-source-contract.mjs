import { authoritySignals } from '../src/data/authoritySignals.mjs';
import { externalProfiles } from '../src/data/externalProfiles.mjs';
import { assertSourceContract } from '../src/lib/sourceClassifier.mjs';

const requiredSignalKeys = [
  'aboutme-profile',
  'huggingface-profile',
  'neshan-map',
  'balad-map',
  'yandex-maps',
  'foursquare-venue',
  'pubmed-27280013',
  'pubmed-34574943',
  'mdpi-healthcare-1169',
  'mdpi-review-report',
  'iranmedlabs-interview',
  'ninisite-article-18112',
  'ninisite-discussion-16693096',
  'ninisite-tag-9240',
  'rokna-1149379',
  'namnak-skin-beauty-tag'
];

const allowedUses = new Set([
  'sameAs',
  'entityIdentifier',
  'researchProfile',
  'externalProfile',
  'authoritySignal',
  'conversionTarget',
  'codeRepository',
  'datasetDistribution',
  'datasetArchive',
  'citation',
  'subjectOf',
  'hasMap',
  'napCorroboration',
  'directoryProfile',
  'serviceEvidence',
  'interviewEvidence',
  'discussionEvidence',
  'topicalContext'
]);

const requiredFields = ['key', 'type', 'entity', 'publisher', 'url'];
const blockedSameAsTypes = ['mediaMention', 'mediaInterview', 'forumDiscussion', 'topicalTag', 'generalTopicPage'];
const errors = assertSourceContract({ authoritySignals, externalProfiles });
const signalKeys = new Set(authoritySignals.map((signal) => signal.key));
const signalUrls = new Set(authoritySignals.map((signal) => signal.url));

for (const key of requiredSignalKeys) {
  if (!signalKeys.has(key)) errors.push(`missing required key: ${key}`);
}

for (const signal of authoritySignals) {
  for (const field of requiredFields) {
    if (!signal[field]) errors.push(`authority signal ${signal.key || '(missing key)'} missing ${field}`);
  }

  if (!Array.isArray(signal.useAs) || signal.useAs.length === 0) {
    errors.push(`authority signal ${signal.key} must declare useAs roles`);
  }

  for (const use of signal.useAs || []) {
    if (!allowedUses.has(use)) errors.push(`authority signal ${signal.key} has unknown useAs role: ${use}`);
  }

  if (blockedSameAsTypes.includes(signal.type) && signal.useAs?.includes('sameAs')) {
    errors.push(`invalid sameAs role: ${signal.key}`);
  }

  if (signal.useAs?.includes('hasMap') && !['clinic', 'personAndClinic', 'clinicAndServices'].includes(signal.entity)) {
    errors.push(`invalid hasMap entity for ${signal.key}: ${signal.entity}`);
  }
}

for (const url of externalProfiles.verifiedSameAs || []) {
  const isWikidataSeed = url.includes('wikidata.org/wiki/Q');
  const hasSignal = signalUrls.has(url);
  if (!isWikidataSeed && !hasSignal) {
    errors.push(`verifiedSameAs without authority signal: ${url}`);
  }
}

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log('Source contract validation passed');
