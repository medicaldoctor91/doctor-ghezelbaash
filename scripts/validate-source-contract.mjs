import { authoritySignals } from '../src/data/authoritySignals.mjs';
import { externalProfiles } from '../src/data/externalProfiles.mjs';
import { regulatoryIdentity } from '../src/data/regulatory.mjs';
import { assertSourceContract } from '../src/lib/sourceClassifier.mjs';

const requiredSignalKeys = [
  'aboutme-profile',
  'huggingface-profile',
  'facebook-profile',
  'pinterest-profile',
  'neshan-map',
  'balad-map',
  'yandex-maps',
  'foursquare-venue',
  'doctor-yab-profile',
  'doctoreto-profile',
  'paziresh24-profile',
  'drdr-profile',
  'nobat-ir-profile',
  'drnext-profile',
  'nobatnet-profile',
  'tabibino-profile',
  'pubmed-27280013',
  'pubmed-34574943',
  'mdpi-healthcare-1169',
  'mdpi-review-report',
  'iranmedlabs-interview',
  'ninisite-article-18112',
  'ninisite-discussion-16693096',
  'ninisite-tag-9240',
  'rokna-1149379',
  'namnak-skin-beauty-tag',
  'pezeshk-yab-coverage',
  'niniban-coverage',
  'gadgetnews-coverage'
];

const directorySignalKeys = [
  'doctor-yab-profile',
  'doctoreto-profile',
  'paziresh24-profile',
  'drdr-profile',
  'nobat-ir-profile',
  'drnext-profile',
  'nobatnet-profile',
  'tabibino-profile'
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
const directIdentityUrls = new Set([
  regulatoryIdentity.irimc.url,
  regulatoryIdentity.mojavez.url
]);

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

for (const key of directorySignalKeys) {
  const signal = authoritySignals.find((item) => item.key === key);
  if (!signal) continue;
  if (signal.type !== 'medicalDirectoryProfile') errors.push(`${key} must be medicalDirectoryProfile`);
  for (const requiredUse of ['subjectOf', 'directoryProfile', 'authoritySignal', 'napCorroboration']) {
    if (!signal.useAs?.includes(requiredUse)) errors.push(`${key} missing ${requiredUse}`);
  }
  if (signal.useAs?.includes('sameAs')) errors.push(`${key} must not be used as sameAs`);
  if (!signal.identifier) errors.push(`${key} missing directory identifier`);
}

for (const key of ['facebook-profile', 'pinterest-profile']) {
  const signal = authoritySignals.find((item) => item.key === key);
  if (!signal?.useAs?.includes('sameAs')) errors.push(`${key} must be usable as sameAs`);
  if (signal?.type !== 'socialProfile') errors.push(`${key} must be socialProfile`);
}

for (const key of ['iranmedlabs-interview', 'pezeshk-yab-coverage', 'niniban-coverage']) {
  const signal = authoritySignals.find((item) => item.key === key);
  if (!signal?.title) errors.push(`${key} must preserve web-discovered title metadata`);
  if (!signal?.language) errors.push(`${key} must preserve language metadata`);
  if (!Array.isArray(signal?.about) || signal.about.length < 3) errors.push(`${key} must preserve topic metadata`);
  if (signal?.useAs?.includes('sameAs')) errors.push(`${key} must not be used as sameAs`);
}

for (const url of externalProfiles.verifiedSameAs || []) {
  const isWikidataSeed = url.includes('wikidata.org/wiki/Q');
  const hasSignal = signalUrls.has(url);
  const isDirectRegulatoryIdentity = directIdentityUrls.has(url);
  if (!isWikidataSeed && !hasSignal && !isDirectRegulatoryIdentity) {
    errors.push(`verifiedSameAs without authority signal: ${url}`);
  }
}

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log('Source contract validation passed');
