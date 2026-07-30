import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const EVENT_ID = 'https://www.ghezelbaash.ir/#event-wpa-xvii-world-congress-psychiatry-2017';
const EVENT_COMPLETED = 'https://schema.org/EventCompleted';
const HOME = 'https://www.ghezelbaash.ir/';
const PERSON = `${HOME}#saeed-ghezelbash`;

const paths = {
  sourcePage: path.join(root, 'src/pages/index.md'),
  markdownProjection: path.join(root, 'public/index.md'),
  graphJson: path.join(root, 'public/graph.jsonld'),
  graphTurtle: path.join(root, 'public/graph.ttl'),
  headGraph: path.join(root, 'src/data/semantic/head-graph.min.jsonld'),
  publicHeadGraph: path.join(root, 'public/head-graph.min.jsonld'),
  headers: path.join(root, 'public/_headers'),
  llms: path.join(root, 'public/llms.txt'),
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

  ttl = ttl
    .replace(/^[ \t]*(?:schema:eventStatus|<https:\/\/schema\.org\/eventStatus>)[ \t]+(?:schema:EventCompleted|<https:\/\/schema\.org\/EventCompleted>)[ \t]*[;.]?[ \t]*\r?\n/gm, '')
    .replace(/[ \t]*;[ \t]*(?:schema:eventStatus|<https:\/\/schema\.org\/eventStatus>)[ \t]+(?:schema:EventCompleted|<https:\/\/schema\.org\/EventCompleted>)/g, '')
    .replace(/(?:schema:eventStatus|<https:\/\/schema\.org\/eventStatus>)[ \t]+(?:schema:EventCompleted|<https:\/\/schema\.org\/EventCompleted>)[ \t]*;[ \t]*/g, '');

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

  return `---\ntitle: ${JSON.stringify(title)}\ncanonical: "${HOME}"\nlang: "fa-IR"\nabout: "${PERSON}"\nsource: "${HOME}"\n---\n\n${cleaned}\n`;
}

async function generateMarkdownProjection() {
  const source = await readFile(paths.sourcePage, 'utf8');
  const projection = buildMarkdownProjection(source);
  await writeFile(paths.markdownProjection, projection, 'utf8');
}

async function updateHeaders() {
  let headers = await readFile(paths.headers, 'utf8');
  const rootLink = '  Link: </graph.jsonld>; rel="describedby"; type="application/ld+json", </graph.ttl>; rel="describedby"; type="text/turtle", </index.md>; rel="alternate"; type="text/markdown"; hreflang="fa-IR", <https://www.ghezelbaash.ir/#saeed-ghezelbash>; rel="about"';

  headers = headers.replace(/(\/\n(?:  .*\n)*?)  Link:.*\n/, (block) => block.replace(/  Link:.*\n/, `${rootLink}\n`));
  headers = headers.replace(/(\/graph\.jsonld\n(?:  (?!Link:).*(?:\n|$))*)  Link:.*(?:\n|$)/, '$1  Link: </graph.ttl>; rel="alternate"; type="text/turtle"\n');
  headers = headers.replace(/(\/graph\.ttl\n(?:  (?!Link:).*(?:\n|$))*)  Link:.*(?:\n|$)/, '$1  Link: </graph.jsonld>; rel="alternate"; type="application/ld+json"\n');

  const indexBlock = `\n/index.md\n  Content-Type: text/markdown; charset=utf-8\n  X-Robots-Tag: noindex, follow\n  X-Content-Type-Options: nosniff\n  Link: <${HOME}>; rel="canonical"\n  Access-Control-Allow-Origin: *\n`;
  if (!/^\/index\.md$/m.test(headers)) headers = `${headers.trimEnd()}\n${indexBlock}`;

  await writeFile(paths.headers, headers, 'utf8');
}

async function updateLlms() {
  let llms = await readFile(paths.llms, 'utf8');
  const line = `- [Markdown page projection](${HOME}index.md): Structured Markdown projection of the canonical single-page website; non-canonical and excluded from search indexing.`;
  if (!llms.includes(line)) {
    const turtleLine = /^(- \[.*Turtle.*\]\([^\n]+\).*)$/mi;
    llms = turtleLine.test(llms) ? llms.replace(turtleLine, `$1\n${line}`) : `${llms.trimEnd()}\n${line}\n`;
  }
  await writeFile(paths.llms, llms, 'utf8');
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
await updateHeaders();
await updateLlms();
console.log('Semantic artifacts prepared: event status removed, Markdown projection generated, discovery surfaces synchronized.');
