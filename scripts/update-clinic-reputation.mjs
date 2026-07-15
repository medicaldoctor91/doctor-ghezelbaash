import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const entityPath = resolve('src/domain/entities.ts');
const historyPath = resolve('data/clinic-reputation-history.json');
const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key.startsWith('--')) continue;
  const next = process.argv[index + 1];
  args.set(key.slice(2), next && !next.startsWith('--') ? process.argv[++index] : true);
}

const required = ['rating', 'count', 'observed-at'];
if (args.has('help') || required.some((key) => !args.has(key))) {
  console.log('Usage: npm run reputation:update -- --rating 5 --count 164 --observed-at 2026-07-15 [--source-url URL] [--note TEXT] [--allow-count-decrease] [--dry-run]');
  process.exit(args.has('help') ? 0 : 1);
}

const ratingValue = Number(args.get('rating'));
const ratingCount = Number(args.get('count'));
const observedAt = String(args.get('observed-at'));
const dryRun = args.has('dry-run');
const allowCountDecrease = args.has('allow-count-decrease');
const source = readFileSync(entityPath, 'utf8');
const history = JSON.parse(readFileSync(historyPath, 'utf8'));

if (!Number.isFinite(ratingValue) || ratingValue < 1 || ratingValue > 5) throw new Error('rating must be a number from 1 to 5');
if (!Number.isInteger(ratingCount) || ratingCount < 0) throw new Error('count must be a non-negative integer');
if (!/^\d{4}-\d{2}-\d{2}$/u.test(observedAt) || Number.isNaN(Date.parse(`${observedAt}T00:00:00Z`))) throw new Error('observed-at must be a valid YYYY-MM-DD date');
if (new Date(`${observedAt}T23:59:59Z`) > new Date()) throw new Error('observed-at cannot be in the future');

const blockPattern = /googleBusinessProfile:\s*\{([\s\S]*?)\n\s*\},\n\s*sourceTruthObservedAt:/u;
const blockMatch = source.match(blockPattern);
if (!blockMatch) throw new Error('canonical googleBusinessProfile block was not found');
const currentBlock = blockMatch[1];
const readNumber = (field) => Number(currentBlock.match(new RegExp(`${field}:\\s*([0-9.]+)`, 'u'))?.[1]);
const readString = (field) => currentBlock.match(new RegExp(`${field}:\\s*'([^']+)'`, 'u'))?.[1] ?? '';
const current = {
  ratingValue: readNumber('ratingValue'),
  bestRating: readNumber('bestRating'),
  ratingCount: readNumber('ratingCount'),
  observedAt: readString('observedAt'),
  sourceName: readString('sourceName'),
  sourceUrl: readString('sourceUrl'),
};
if (!allowCountDecrease && ratingCount < current.ratingCount) throw new Error(`count decrease ${current.ratingCount} -> ${ratingCount} requires --allow-count-decrease`);
if (Date.parse(`${observedAt}T00:00:00Z`) < Date.parse(`${current.observedAt}T00:00:00Z`)) throw new Error('observed-at cannot be older than the current snapshot');

const sourceUrl = String(args.get('source-url') ?? current.sourceUrl);
if (!/^https:\/\/www\.google\.com\/maps/u.test(sourceUrl)) throw new Error('source-url must be an official Google Maps URL');
const note = String(args.get('note') ?? 'Manual Google Maps snapshot update through the guarded project command.');
const recordedAt = new Date().toISOString();

let updated = source;
const replaceField = (field, value) => {
  const valueText = typeof value === 'number' ? String(value) : `'${value}'`;
  updated = updated.replace(new RegExp(`(${field}:\\s*)(?:[0-9.]+|'[^']*')`, 'u'), `$1${valueText}`);
};
replaceField('ratingValue', ratingValue);
replaceField('ratingCount', ratingCount);
replaceField('observedAt', observedAt);
replaceField('sourceUrl', sourceUrl);
updated = updated.replace(/dateModified:\s*'[^']+'/u, `dateModified: '${observedAt}T16:30:00+03:30'`);
updated = updated.replace(/sourceTruthObservedAt:\s*'[^']+'/u, `sourceTruthObservedAt: '${observedAt}T16:30:00+03:30'`);

const nextRecord = {
  ratingValue,
  bestRating: 5,
  ratingCount,
  observedAt,
  sourceName: current.sourceName || 'Google Maps',
  sourceUrl,
  recordedAt,
  note,
};
const previous = history.at(-1);
const sameSnapshot = previous
  && previous.ratingValue === nextRecord.ratingValue
  && previous.ratingCount === nextRecord.ratingCount
  && previous.observedAt === nextRecord.observedAt
  && previous.sourceUrl === nextRecord.sourceUrl;
if (!sameSnapshot) history.push(nextRecord);

const result = { status: dryRun ? 'dry-run' : 'updated', current, next: nextRecord, historyEntries: history.length };
console.log(JSON.stringify(result, null, 2));
if (!dryRun) {
  writeFileSync(entityPath, updated);
  writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`);
}
