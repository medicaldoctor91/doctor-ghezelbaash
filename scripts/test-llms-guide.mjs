import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parseFragment } from "parse5";
import { loadProjectionContext } from "./lib/projection-context.mjs";
import { renderLlmsGuide } from "./lib/projections/retrieval-corpus.mjs";
import { compileKnowledgeXml } from "./lib/knowledge-xml.mjs";

const context = await loadProjectionContext();
const template = await readFile(
  path.join(context.data, "templates/llms.template.txt"),
  "utf8",
);
const guide = renderLlmsGuide(template, context);

// Independent syntax check for the file-list grammar in llmstxt.org proposal v2.
function parseFileGuide(source) {
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  assert.match(lines.shift(), /^# [^#\s].+$/);
  const introduction = [];
  const sections = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.startsWith("## ")) {
      sections.push({ name: line.slice(3), entries: [] });
      continue;
    }
    assert.doesNotMatch(line, /^#{1,6}\s/, "No nested or repeated H1 heading");
    if (!sections.length) introduction.push(line);
    else {
      const entry = line.match(/^- \[([^\]]+)\]\((https:\/\/[^\s)]+)\)(?:: (.+))?$/);
      assert.ok(entry, `Every H2 content line is a URL list entry: ${line}`);
      const url = new URL(entry[2]);
      assert.equal(url.username, "");
      assert.equal(url.password, "");
      sections.at(-1).entries.push({ name: entry[1], url, notes: entry[3] ?? "" });
    }
  }
  assert.match(introduction[0], /^> .+$/);
  assert.ok(sections.length);
  assert.equal(sections.at(-1).name, "Optional");
  assert.equal(new Set(sections.map((section) => section.name)).size, sections.length);
  assert.ok(sections.every((section) => section.entries.length));
  return { introduction: introduction.join("\n"), sections };
}

function htmlIds(source) {
  const ids = new Set();
  const visit = (node) => {
    const id = node.attrs?.find((attribute) => attribute.name === "id")?.value;
    if (id) ids.add(id);
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(parseFragment(source));
  return ids;
}

const parsed = parseFileGuide(guide);
const entries = parsed.sections.flatMap((section) => section.entries);
const urls = new Set(entries.map((entry) => entry.url.href));

test("llms v2 keeps prose before file lists and preserves physician attribution and evidence roles", () => {
  for (const required of [
    context.release.primaryEntity.id,
    context.release.release,
    "clinic and structured-data project are distinct supporting entities",
    "not independent corroboration",
    "not treated as independent evidence of treatment efficacy",
    "immutable release snapshot",
    "Googlebot-scoped noindex, follow",
  ]) assert.ok(parsed.introduction.includes(required), required);
  for (const field of ["officialAliases", "reconciliationAliases", "retrievalVariants"])
    for (const alias of context.release.primaryEntity[field])
      assert.ok(parsed.introduction.includes(alias), `${field}: ${alias}`);
  for (const [tier, description] of Object.entries(context.evidenceRegistry.tiers))
    assert.ok(parsed.introduction.includes(`Tier ${tier} = ${description}`));
  for (const required of [
    `https://www.wikidata.org/wiki/${context.release.primaryEntity.wikidata}`,
    `https://www.google.com/search?kgmid=${context.release.primaryEntity.googleKnowledgeGraphId}`,
    `https://orcid.org/${context.release.primaryEntity.orcid}`,
    context.release.dataset.huggingFace.dataset,
    `https://doi.org/${context.release.dataset.zenodo.versionDoi}`,
    `https://doi.org/${context.release.dataset.zenodo.conceptDoi}`,
  ]) assert.ok(urls.has(required), required);
  assert.ok(entries.some((entry) => entry.url.searchParams.get("kgmid") === context.release.clinic.googleLocalKgmid));
  assert.doesNotMatch(guide, /{{[A-Z0-9_]+}}|^###\s/m);
});

test("guide destinations resolve to registered files, shipped media or canonical entities and page anchors", async () => {
  const home = await readFile(path.join(context.generatedContent, "home.md"), "utf8");
  const ids = htmlIds(home);
  const registry = JSON.parse(await readFile(path.join(context.data, "machine-resources.json"), "utf8"));
  const resources = new Set(registry.resources.filter((entry) => entry.targets.includes("website")).map((entry) => entry.path));
  for (const { url } of entries) {
    if (url.origin !== new URL(context.release.canonicalUrl).origin) continue;
    if (url.pathname === "/") {
      assert.ok(!url.hash || ids.has(url.hash.slice(1)) || context.byId.has(url.href), url.href);
    } else if (url.pathname.startsWith("/media/")) {
      await access(path.join(context.root, "public", url.pathname));
    } else {
      assert.ok(resources.has(url.pathname.slice(1)), url.href);
      if (url.hash) assert.ok(context.byId.has(url.href), url.href);
    }
  }
  for (const filename of [
    "index.md", "answers.txt", "llms-full.txt", "graph.jsonld", "graph.ttl",
    "entity-facts.csv", "knowledge.xml", "datapackage.json", "croissant.json",
    "linkset.json", "provenance.jsonld", "evidence-snapshot.json", "shapes.ttl",
    "void.ttl", "dcat.ttl",
  ]) assert.ok(urls.has(`${context.release.canonicalUrl}${filename}`), filename);
  const intents = parsed.sections.find((section) => section.name === "Canonical search-intent clusters");
  assert.ok(intents);
  for (const entry of intents.entries) assert.ok(ids.has(entry.url.hash.slice(1)), entry.url.href);
  const knowledge = compileKnowledgeXml({ ...context, intentSource: template });
  const clusters = knowledge.match(/<intentClusters count="(\d+)">([\s\S]*?)<\/intentClusters>/);
  assert.ok(clusters);
  assert.equal(Number(clusters[1]), intents.entries.length);
  assert.equal([...clusters[2].matchAll(/<intent /g)].length, intents.entries.length);
  for (const entry of intents.entries) {
    assert.ok(clusters[2].includes(`url="${entry.url.href}"`), entry.url.href);
    assert.ok(clusters[2].includes(`<label>${entry.name}</label>`), entry.name);
  }
});

test("guide binding rejects unresolved metadata and missing first-party evidence tier", () => {
  assert.throws(() => renderLlmsGuide(`${template}\n{{UNBOUND_GUIDE_FIELD}}`, context), /unknown template token/);
  const incomplete = structuredClone(context.evidenceRegistry);
  delete incomplete.tiers.P;
  assert.throws(() => renderLlmsGuide(template, { ...context, evidenceRegistry: incomplete }), /tier P definition missing/);
  assert.throws(() => parseFileGuide(`${guide}\nUnstructured appendix prose.`), /Every H2 content line/);
  assert.throws(() => parseFileGuide(`${guide}\n### Repeated answer\n`), /No nested or repeated H1 heading/);
});
