import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const GRAPH_PATHS = [
  path.join(ROOT, 'src/data/semantic/head-graph.min.jsonld'),
  path.join(ROOT, 'public/graph.jsonld'),
];

const PRIMARY_DATASET_ID = 'https://www.ghezelbaash.ir/graph.jsonld#dataset';
const LEGACY_HUGGINGFACE_DATASET_ID = 'https://www.ghezelbaash.ir/#project-huggingface-dataset';
const RETIRED_DATASET_IDS = new Set([LEGACY_HUGGINGFACE_DATASET_ID]);

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
  if (Array.isArray(value)) return unique(value.map(rewriteReferences));
  if (!value || typeof value !== 'object') return value;

  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === '@id' && RETIRED_DATASET_IDS.has(child)) output[key] = PRIMARY_DATASET_ID;
    else output[key] = rewriteReferences(child);
  }
  return output;
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
    .map(rewriteReferences);

  await writeFile(filePath, `${JSON.stringify(document)}\n`, 'utf8');
  console.log(
    `${path.relative(ROOT, filePath)}: retired ${presentRetiredIds.size} known duplicate Dataset node(s)` +
      (presentRetiredIds.size ? ` — ${[...presentRetiredIds].join(', ')}` : ''),
  );
}
