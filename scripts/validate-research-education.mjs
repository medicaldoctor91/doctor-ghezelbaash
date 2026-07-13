import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { videos } from '../src/domain/media.mjs';
import { videoPageDetails } from '../src/domain/video-pages.mjs';

const root = join(process.cwd(), 'dist');
const site = 'https://www.ghezelbaash.ir/';
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const html = readFileSync(join(root, 'index.html'), 'utf8');
const nodes = JSON.parse(readFileSync(join(root, 'knowledge-graph.jsonld'), 'utf8'))['@graph'] ?? [];
const typeIncludes = (node, type) => (Array.isArray(node['@type']) ? node['@type'] : [node['@type']]).includes(type);

const person = nodes.find((node) => node['@id'] === `${site}#person`);
const works = nodes.filter((node) => typeIncludes(node, 'ScholarlyArticle'));
check(Boolean(person), 'canonical graph Person missing');
check(works.length === 2, `canonical graph expected 2 scholarly works, found ${works.length}`);
check((person?.sameAs ?? []).includes('https://orcid.org/0009-0001-9346-8475'), 'Person ORCID missing');
for (const work of works) {
  check(Boolean(work.doi || work.identifier), `${work['@id']}: scholarly work identifier missing`);
  check(JSON.stringify(person?.subjectOf ?? []).includes(work['@id']), `${work['@id']}: Person subjectOf edge missing`);
}

const professionalVideos = videos.filter((video) => videoPageDetails[video.id]?.education);
check(professionalVideos.length >= 2, 'professional education videos missing');
for (const video of professionalVideos) {
  const node = nodes.find((item) => item['@id'] === `${site}#video-${video.id}`);
  check(Boolean(node), `${video.id}: educational VideoObject missing`);
  check(html.includes(videoPageDetails[video.id].education.context), `${video.id}: professional education context not visible on homepage`);
}

if (failures.length) { console.error(JSON.stringify({ status: 'fail', failures }, null, 2)); process.exit(1); }
console.log(JSON.stringify({ status: 'pass', scholarlyWorks: works.length, orcid: true, professionalEducationVideos: professionalVideos.length, researchEmbeddedInCanonicalGraph: true }, null, 2));
