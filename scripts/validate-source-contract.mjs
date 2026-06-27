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

const errors = assertSourceContract({ authoritySignals, externalProfiles });
const signalKeys = new Set(authoritySignals.map((signal) => signal.key));

for (const key of requiredSignalKeys) {
  if (!signalKeys.has(key)) errors.push(`missing required key: ${key}`);
}

for (const signal of authoritySignals) {
  const blockedType = ['mediaMention', 'mediaInterview', 'forumDiscussion', 'topicalTag', 'generalTopicPage'].includes(signal.type);
  if (blockedType && signal.useAs?.includes('sameAs')) {
    errors.push(`invalid sameAs role: ${signal.key}`);
  }
}

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log('Source contract validation passed');
