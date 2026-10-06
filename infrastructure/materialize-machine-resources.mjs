import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { extractSourceObject } from './finalize-dist.mjs';
import {
  serializeGraphAsNTriples, serializeEntityFactsCsv, htmlToMarkdown, htmlToPlainText,
  buildAnswersText, buildFactMap, buildKnowledgeXml, buildProvenanceGraph, buildEvidenceSnapshot,
  buildVCard, buildLinkset, buildCsvMetadata, buildVoidTurtle, buildDcatTurtle, buildCroissantWithStats, buildDataPackage,
} from '../src/lib/machine-output.mjs';

export function extractAuthoredBody(sourceText) {
  const marker = 'export const AUTHORED_BODY = ';
  const at = sourceText.indexOf(marker);
  if (at < 0) throw new Error('AUTHORED_BODY marker missing');
  const expressionStart = at + marker.length;
  const endMarker = ';\nexport const DESIGN';
  const end = sourceText.indexOf(endMarker, expressionStart);
  if (end < 0) throw new Error('AUTHORED_BODY boundary missing');
  return vm.runInNewContext(sourceText.slice(expressionStart, end), Object.create(null), { timeout: 5000 });
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

export async function materializeMachineResources({ source, authoredBody, distDir }) {
  if (!source?.graph?.['@graph'] || !Array.isArray(source.machineResources)) throw new Error('Canonical source and machine resource registry required');
  if (typeof authoredBody !== 'string' || authoredBody.length < 1000) throw new Error('Complete authored body required');
  const outputs = new Map();
  const graphTtl = serializeGraphAsNTriples(source.graph);
  outputs.set('/graph.jsonld', json(source.graph));
  outputs.set('/graph.ttl', graphTtl);
  outputs.set('/shapes.ttl', source.validation.shaclSupplement.trimEnd() + '\n');
  outputs.set('/entity-facts.csv', serializeEntityFactsCsv(source.graph));
  outputs.set('/entity-facts.csv-metadata.json', json(buildCsvMetadata(source)));
  outputs.set('/answers.txt', buildAnswersText(source));
  outputs.set('/fact-map.json', json(buildFactMap(source)));
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
  return { paths };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sourceFile = path.join(root, 'src/pages/index.astro');
  const sourceText = await fs.readFile(sourceFile, 'utf8');
  const source = await extractSourceObject(sourceFile);
  const authoredBody = extractAuthoredBody(sourceText);
  const distDir = path.resolve(process.argv[2] ?? path.join(root, 'dist'));
  console.log(JSON.stringify(await materializeMachineResources({ source, authoredBody, distDir }), null, 2));
}
