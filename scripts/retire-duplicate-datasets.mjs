import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const GRAPH_PATHS = [
  path.join(ROOT, 'src/data/semantic/head-graph.min.jsonld'),
  path.join(ROOT, 'public/graph.jsonld'),
];

const PRIMARY_DATASET_ID = 'https://www.ghezelbaash.ir/graph.jsonld#dataset';
const LEGACY_HUGGINGFACE_DATASET_ID = 'https://www.ghezelbaash.ir/#project-huggingface-dataset';
const HISTORICAL_DISTRIBUTION_ID = 'https://www.ghezelbaash.ir/#historical-patient-origin-summary-json';
const HISTORICAL_DISTRIBUTION_URL = 'https://www.ghezelbaash.ir/datasets/historical-patient-origin-summary.json';
const HISTORICAL_PUBLIC_PATH = path.join(ROOT, 'public/datasets/historical-patient-origin-summary.json');
const REDIRECTS_PATH = path.join(ROOT, 'public/_redirects');
const HEADERS_PATH = path.join(ROOT, 'public/_headers');
const SITEMAP_PATH = path.join(ROOT, 'public/sitemap.xml');
const DOCUMENT_HEAD_PATH = path.join(ROOT, 'src/components/DocumentHead.astro');
const LLMS_PATH = path.join(ROOT, 'public/llms.txt');
const REDIRECT_RULE = '/datasets/historical-patient-origin-summary.json /graph.jsonld 301';
const RETIRED_DATASET_IDS = new Set([LEGACY_HUGGINGFACE_DATASET_ID, HISTORICAL_DISTRIBUTION_ID]);

const keyFor = (value) => {
  if (value && typeof value === 'object' && typeof value['@id'] === 'string') return `@id:${value['@id']}`;
  return JSON.stringify(value);
};

function unique(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyFor(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rewriteReferences(value) {
  if (Array.isArray(value)) return unique(value.map(rewriteReferences).filter(Boolean));
  if (!value || typeof value !== 'object') {
    return value === HISTORICAL_DISTRIBUTION_URL ? null : value;
  }
  if (value['@id'] === HISTORICAL_DISTRIBUTION_ID) return null;

  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === '@id' && child === LEGACY_HUGGINGFACE_DATASET_ID) output[key] = PRIMARY_DATASET_ID;
    else {
      const rewritten = rewriteReferences(child);
      if (rewritten != null) output[key] = rewritten;
    }
  }
  return output;
}

async function updateTextFile(filePath, transform) {
  const source = await readFile(filePath, 'utf8');
  const output = transform(source);
  if (output !== source) await writeFile(filePath, output, 'utf8');
}

function removeCloudflareRouteBlock(source, route) {
  const lines = source.split('\n');
  const output = [];
  let skipping = false;

  for (const line of lines) {
    if (!skipping && line.trim() === route) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (/^\S/.test(line) && line.trim() !== '') {
        skipping = false;
        output.push(line);
      }
      continue;
    }
    output.push(line);
  }
  return output.join('\n');
}

for (const filePath of GRAPH_PATHS) {
  const document = JSON.parse(await readFile(filePath, 'utf8'));
  if (!Array.isArray(document['@graph'])) throw new Error(`${path.relative(ROOT, filePath)} has no @graph array.`);

  const presentRetiredIds = new Set(
    document['@graph']
      .map((node) => node?.['@id'])
      .filter((id) => id && RETIRED_DATASET_IDS.has(id)),
  );

  document['@graph'] = document['@graph']
    .filter((node) => !RETIRED_DATASET_IDS.has(node?.['@id']))
    .map(rewriteReferences)
    .filter(Boolean);

  await writeFile(filePath, `${JSON.stringify(document)}\n`, 'utf8');
  console.log(
    `${path.relative(ROOT, filePath)}: retired ${presentRetiredIds.size} obsolete Dataset/distribution node(s)` +
      (presentRetiredIds.size ? ` — ${[...presentRetiredIds].join(', ')}` : ''),
  );
}

await rm(HISTORICAL_PUBLIC_PATH, { force: true });

await updateTextFile(REDIRECTS_PATH, (source) => {
  const normalized = source.trimEnd();
  if (normalized.split('\n').some((line) => line.trim() === REDIRECT_RULE)) return `${normalized}\n`;
  return `${normalized}\n${REDIRECT_RULE}\n`;
});

await updateTextFile(DOCUMENT_HEAD_PATH, (source) =>
  source
    .split('\n')
    .filter((line) => !line.includes(HISTORICAL_DISTRIBUTION_URL))
    .join('\n'),
);

await updateTextFile(SITEMAP_PATH, (source) =>
  source.replace(
    /\s*<url>\s*<loc>https:\/\/www\.ghezelbaash\.ir\/datasets\/historical-patient-origin-summary\.json<\/loc>[\s\S]*?<\/url>/g,
    '',
  ),
);

await updateTextFile(HEADERS_PATH, (source) => {
  let output = removeCloudflareRouteBlock(source, '/datasets/historical-patient-origin-summary.json');
  output = output
    .split('\n')
    .map((line) => {
      if (!line.includes(HISTORICAL_DISTRIBUTION_URL)) return line;
      return line
        .replace(
          new RegExp(`,? <${HISTORICAL_DISTRIBUTION_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}>; rel="related"; type="application/json"`, 'g'),
          '',
        )
        .replace(/Link:\s*,\s*/, 'Link: ')
        .replace(/,\s*$/, '');
    })
    .join('\n');
  return output;
});

await updateTextFile(LLMS_PATH, (source) =>
  source
    .split('\n')
    .filter((line) => !line.includes(HISTORICAL_DISTRIBUTION_URL))
    .join('\n'),
);

for (const [filePath, allowRedirect] of [
  [DOCUMENT_HEAD_PATH, false],
  [HEADERS_PATH, false],
  [SITEMAP_PATH, false],
  [LLMS_PATH, false],
  [REDIRECTS_PATH, true],
]) {
  const source = await readFile(filePath, 'utf8');
  if (!allowRedirect && source.includes(HISTORICAL_DISTRIBUTION_URL)) {
    throw new Error(`${path.relative(ROOT, filePath)} still references the retired historical distribution URL.`);
  }
  if (allowRedirect && !source.includes(REDIRECT_RULE)) {
    throw new Error('The permanent historical-distribution redirect was not materialized.');
  }
}

console.log('Retired standalone historical Dataset distribution and consolidated discovery signals into graph.jsonld.');
