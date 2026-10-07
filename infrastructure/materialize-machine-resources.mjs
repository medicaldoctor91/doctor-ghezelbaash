import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { extractSourceObject } from './finalize-dist.mjs';
import { discoverCriticalAssets } from './lib/dist-html.mjs';
import {
  serializeGraphAsNTriples, serializeEntityFactsCsv, htmlToMarkdown, htmlToPlainText,
  buildAnswersText, buildFactMap, buildKnowledgeXml, buildProvenanceGraph, buildEvidenceSnapshot,
  buildVCard, buildLinkset, buildCsvMetadata, buildVoidTurtle, buildDcatTurtle, buildCroissantWithStats, buildDataPackage,
} from '../src/lib/machine-output.mjs';

function extractExpression(sourceText, marker, endMarker, label) {
  const at = sourceText.indexOf(marker);
  if (at < 0) throw new Error(`${label} marker missing`);
  const expressionStart = at + marker.length;
  const end = sourceText.indexOf(endMarker, expressionStart);
  if (end < 0) throw new Error(`${label} boundary missing`);
  return vm.runInNewContext(sourceText.slice(expressionStart, end), Object.create(null), { timeout: 5000 });
}

export function extractAuthoredBody(sourceText) {
  return extractExpression(sourceText, 'export const AUTHORED_BODY = ', ';\nexport const DESIGN', 'AUTHORED_BODY');
}

export function extractDesign(sourceText) {
  return extractExpression(sourceText, 'export const DESIGN = ', ';\nexport const READER_RUNTIME', 'DESIGN');
}

const json = (value) => JSON.stringify(value) + '\n';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const ensureParent = async (file) => fs.mkdir(path.dirname(file), { recursive: true });
const write = async (distDir, resourcePath, content) => {
  const file = path.join(distDir, resourcePath.replace(/^\//,''));
  await ensureParent(file); await fs.writeFile(file, content); return file;
};

async function collectStats(distDir, source) {
  const stats = new Map();
  for (const resource of source.machineResources) {
    const file = path.join(distDir, resource.path.replace(/^\//,''));
    try {
      const bytes = await fs.readFile(file);
      stats.set(resource.path, { bytes: bytes.byteLength, sha256: sha256(bytes) });
    } catch {}
  }
  return stats;
}

async function materializeCriticalStylesheet({ sourceText, distDir }) {
  if (typeof sourceText !== 'string' || sourceText.length < 1000) throw new Error('Complete source text required to materialize stylesheet');
  const homeFile = path.join(distDir, 'index.html');
  const homeHtml = await fs.readFile(homeFile, 'utf8');
  const assets = discoverCriticalAssets(homeHtml);
  if (assets.css.length !== 1) throw new Error(`Expected one critical stylesheet reference, found ${assets.css.length}`);
  const cssPath = assets.css[0];
  if (!/^\/assets\/[a-z0-9._-]+\.css$/i.test(cssPath)) throw new Error(`Unexpected critical stylesheet path: ${cssPath}`);
  const design = extractDesign(sourceText);
  if (typeof design !== 'string' || design.length < 1000) throw new Error('Canonical DESIGN stylesheet is missing or unexpectedly small');
  await write(distDir, cssPath, design);
  return cssPath;
}

export async function materializeMachineResources({ source, sourceText, authoredBody, distDir }) {
  if (!source?.graph?.['@graph'] || !Array.isArray(source.machineResources)) throw new Error('Canonical source and machine resource registry required');
  if (typeof authoredBody !== 'string' || authoredBody.length < 1000) throw new Error('Complete authored body required');
  const stylesheetPath = await materializeCriticalStylesheet({ sourceText, distDir });
  const outputs = new Map();
  const graphTtl = serializeGraphAsNTriples(source.graph);
  outputs.set('/graph.jsonld', json(source.graph));
  outputs.set('/graph.ttl', graphTtl);
  outputs.set('/shapes.ttl', source.validation.shaclSupplement.trimEnd() + '\n');
  outputs.set('/entity-facts.csv', serializeEntityFactsCsv(source.graph));
  outputs.set('/entity-facts.csv-metadata.json', json(buildCsvMetadata(source)));
  outputs.set('/answers.txt', buildAnswersText(source));
  outputs.set('/fact-map.json', json(buildFactMap(source));
  outputs.set('/knowledge.xml', buildKnowledgeXml(source));
  outputs.set('/llms.txt', source.machineProjection.discoveryGuide.trimEnd() + '\n');
  outputs.set('/index.md', htmlToMarkdown(authoredBody));
  outputs.set('/llms-full.txt', `Canonical entity: ${source.canonicalOrigin}/#saeed-ghezelbash\nCanonical page: ${source.canonicalOrigin}/\nEdition: ${source.edition}\n\n${htmlToPlainText(authoredBody)}\n`);
  outputs.set('/provenance.jsonld', json(buildProvenanceGraph(source)));
  outputs.set('/evidence-snapshot.json', json(buildEvidenceSnapshot(source)));
  outputs.set('/doctor.vcf', buildVCard(source, 'physician'));
  outputs.set('/clinic.vcf', buildVCard(source, 'clinic'));
  outputs.set('/linkset.json', json(buildLinkset(source)));
  outputs.set('/void.ttl', buildVoidTurtle(source, graphTtl.split('\n').filter(Boolean).length));
  outputs.set('/dcat.ttl', buildDcatTurtle(source));

  for (const [resourcePath, content] of outputs) await write(distDir, resourcePath, content);
  let stats = await collectStats(distDir, source);
  await write(distDir, '/datapackage.json', json(buildDataPackage(source, stats)));
  stats = await collectStats(distDir, source);
  await write(distDir, '/croissant.json', json(buildCroissantWithStats(source, stats)));
  const paths = [...outputs.keys(), '/datapackage.json', '/croissant.json'];
  const declared = new Set(source.machineResources.map((resource) => resource.path));
  for (const resourcePath of paths) if (!declared.has(resourcePath)) throw new Error(`Materializer emitted undeclared resource: ${resourcePath}`);
  return { paths, stylesheetPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sourceFile = path.join(root, 'src/pages/index.astro');
  const sourceText = await fs.readFile(sourceFile, 'utf8');
  const source = await extractSourceObject(sourceFile);
  const authoredBody = extractAuthoredBody(sourceText);
  const distDir = path.resolve(process.argv[2] ?? path.join(root, 'dist'));
  console.log(JSON.stringify(await materializeMachineResources({ source, sourceText, authoredBody, distDir }), null, 2));
}
