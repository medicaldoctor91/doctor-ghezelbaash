import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const EVENT_ID = 'https://www.ghezelbaash.ir/#event-wpa-xvii-world-congress-psychiatry-2017';
const EVENT_COMPLETED = 'https://schema.org/EventCompleted';

const paths = {
  sourcePage: path.join(root, 'src/pages/index.md'),
  markdownProjection: path.join(root, 'public/index.md'),
  graphJson: path.join(root, 'public/graph.jsonld'),
  graphTurtle: path.join(root, 'public/graph.ttl'),
  headGraph: path.join(root, 'src/data/semantic/head-graph.min.jsonld'),
  publicHeadGraph: path.join(root, 'public/head-graph.min.jsonld'),
};

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function graphNodes(document) {
  return Array.isArray(document?.['@graph']) ? document['@graph'] : [];
}

async function removeInvalidEventStatusFromJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  const document = JSON.parse(raw);
  const event = graphNodes(document).find((node) => node?.['@id'] === EVENT_ID);

  if (event) {
    delete event.eventStatus;
    requireCondition(event.startDate === '2017-10-08', `${filePath}: unexpected WPA XVII startDate`);
    requireCondition(event.endDate === '2017-10-12', `${filePath}: unexpected WPA XVII endDate`);
  }

  for (const node of graphNodes(document)) {
    requireCondition(node?.eventStatus !== EVENT_COMPLETED, `${filePath}: invalid EventCompleted remains on ${node?.['@id'] ?? 'unknown node'}`);
  }

  await writeFile(filePath, `${JSON.stringify(document)}\n`, 'utf8');
}

async function removeInvalidEventStatusFromTurtle(filePath) {
  let ttl = await readFile(filePath, 'utf8');

  // Handles a standalone triple, a semicolon-delimited predicate, or an IRI-valued predicate.
  ttl = ttl
    .replace(/^.*(?:schema:eventStatus|<https:\/\/schema\.org\/eventStatus>).*EventCompleted.*\n?/gm, '')
    .replace(/\s*;\s*(?:schema:eventStatus|<https:\/\/schema\.org\/eventStatus>)\s+(?:schema:EventCompleted|<https:\/\/schema\.org\/EventCompleted>)/g, '')
    .replace(/(?:schema:eventStatus|<https:\/\/schema\.org\/eventStatus>)\s+(?:schema:EventCompleted|<https:\/\/schema\.org\/EventCompleted>)\s*;\s*/g, '');

  requireCondition(!ttl.includes('EventCompleted'), `${filePath}: EventCompleted remains after normalization`);
  await writeFile(filePath, ttl, 'utf8');
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  requireCondition(match, 'src/pages/index.md: frontmatter is missing');
  const titleMatch = match[1].match(/^title:\s*["']?(.*?)["']?\s*$/m);
  requireCondition(titleMatch?.[1], 'src/pages/index.md: title is missing');
  return { title: titleMatch[1], body: markdown.slice(match[0].length) };
}

function buildMarkdownProjection(source) {
  const { title, body } = parseFrontmatter(source);
  const cleaned = body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*\/\s*>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  requireCondition(!/<script\b/i.test(cleaned), 'index.md projection contains script markup');
  requireCondition(!/<style\b/i.test(cleaned), 'index.md projection contains style markup');
  requireCondition(!/application\/ld\+json/i.test(cleaned), 'index.md projection contains JSON-LD');
  requireCondition(/<h1\s+id=/i.test(cleaned), 'index.md projection is missing the canonical H1');

  return `---\ntitle: ${JSON.stringify(title)}\ncanonical: "https://www.ghezelbaash.ir/"\nlang: "fa-IR"\nabout: "https://www.ghezelbaash.ir/#saeed-ghezelbash"\nsource: "https://www.ghezelbaash.ir/"\n---\n\n${cleaned}\n`;
}

async function generateMarkdownProjection() {
  const source = await readFile(paths.sourcePage, 'utf8');
  const projection = buildMarkdownProjection(source);
  await writeFile(paths.markdownProjection, projection, 'utf8');
}

await removeInvalidEventStatusFromJson(paths.graphJson);
await removeInvalidEventStatusFromTurtle(paths.graphTurtle);

for (const optionalGraphPath of [paths.headGraph, paths.publicHeadGraph]) {
  try {
    await removeInvalidEventStatusFromJson(optionalGraphPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

await generateMarkdownProjection();
console.log('Semantic artifacts prepared: EventCompleted removed and public/index.md generated.');
