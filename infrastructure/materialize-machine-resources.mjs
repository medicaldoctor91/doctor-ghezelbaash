import {AUTHORED_BODY as canonicalBody} from '../src/canonical/source.mjs';
import {SOURCE as canonicalSource} from '../src/canonical/source.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import {
  serializeGraphAsNTriples, serializeEntityFactsCsv, htmlToMarkdown, htmlToPlainText,
  buildRetrievalRecords, serializeAnswersText, buildFactMap, buildKnowledgeXml, buildProvenanceGraph,
  buildVCard, buildLinkset, buildCsvMetadata, buildVoidTurtle, buildDcatTurtle, buildCroissantWithStats, buildDataPackage,
} from '../src/lib/machine-output.mjs';
import { buildEvidenceSnapshot } from '../src/lib/evidence-output.mjs';


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
  if (typeof authoredBody !== 'string' || !authoredBody.trim()) throw new Error('Complete authored body required');
  const outputs = new Map();
  const graphTtl = serializeGraphAsNTriples(source.graph);
  outputs.set('/graph.jsonld', json(source.graph));
  outputs.set('/graph.ttl', graphTtl);
  outputs.set('/shapes.ttl', source.validation.shaclSupplement.trimEnd() + '\n');
  outputs.set('/entity-facts.csv', serializeEntityFactsCsv(source.graph));
  outputs.set('/entity-facts.csv-metadata.json', json(buildCsvMetadata(source)));
  const retrievalRecords = buildRetrievalRecords(source);
  outputs.set('/answers.txt', serializeAnswersText(retrievalRecords));
  outputs.set('/fact-map.json', json(buildFactMap(source, retrievalRecords)));
  outputs.set('/knowledge.xml', buildKnowledgeXml(source));
  outputs.set('/llms.txt', source.machineProjection.discoveryGuide.trimEnd() + '\n');
  outputs.set('/index.md', htmlToMarkdown(authoredBody));
  outputs.set('/llms-full.txt', `Canonical entity: ${source.canonicalOrigin}/#saeed-ghezelbash\nCanonical page: ${source.canonicalOrigin}/\nEdition: ${source.edition}\n\n${htmlToPlainText(authoredBody)}\n`);
  outputs.set('/provenance.jsonld', json(buildProvenanceGraph(source, retrievalRecords)));
  outputs.set('/evidence-snapshot.json', json(buildEvidenceSnapshot(source)));
  outputs.set('/doctor.vcf', buildVCard(source, 'physician'));
  outputs.set('/clinic.vcf', buildVCard(source, 'clinic'));
  outputs.set('/linkset.json', json(buildLinkset(source)));
  outputs.set('/void.ttl', buildVoidTurtle(source, graphTtl.split('\n').filter(Boolean).length));
  outputs.set('/dcat.ttl', buildDcatTurtle(source));

  for (const [resourcePath, content] of outputs) await write(distDir, resourcePath, content);
  let stats = await collectStats(distDir, source);
  // Never hash stale/self-referential catalog output left by a prior run.
  stats.delete('/datapackage.json');stats.delete('/croissant.json');
  await write(distDir, '/datapackage.json', json(buildDataPackage(source, stats)));
  stats = await collectStats(distDir, source);
  stats.delete('/croissant.json');
  await write(distDir, '/croissant.json', json(buildCroissantWithStats(source, stats)));
  const paths = [...outputs.keys(), '/datapackage.json', '/croissant.json'];
  const declared = new Set(source.machineResources.map((resource) => resource.path));
  for (const resourcePath of paths) if (!declared.has(resourcePath)) throw new Error(`Materializer emitted undeclared resource: ${resourcePath}`);
  return { paths };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const source = canonicalSource;
  const authoredBody = canonicalBody;
  const distDir = path.resolve(process.argv[2] ?? path.join(root, 'dist'));
  console.log(JSON.stringify(await materializeMachineResources({ source, authoredBody, distDir }), null, 2));
}
