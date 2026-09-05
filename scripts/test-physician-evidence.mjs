import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assembleCanonicalContent } from "./lib/assemble-content.mjs";
import { inspectHtml } from "./lib/html-contract.mjs";
import { loadProjectionContext } from "./lib/projection-context.mjs";
import { deriveSitemapImageUrls } from "./lib/projections/contact-discovery.mjs";
import { compileGraphProjections } from "./lib/projections/graph-projections.mjs";
import { indexCanonicalGraph } from "../src/lib/semantic-projection.mjs";

async function isolatedContext(t) {
  const context = await loadProjectionContext();
  const temporary = await mkdtemp(path.join(os.tmpdir(), "physician-evidence-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  for (const name of ["head-profile.json", "support-profile.json"])
    await writeFile(
      path.join(temporary, name),
      await readFile(path.join(context.semantic, name)),
    );
  const graph = structuredClone(context.graph);
  return {
    ...context,
    graph,
    byId: indexCanonicalGraph(graph).byId,
    semantic: temporary,
    generatedSemantic: path.join(temporary, "generated"),
  };
}

const attr = (node, name) =>
  node?.attrs?.find((attribute) => attribute.name === name)?.value;
const ownerScope = (node) => {
  for (let parent = node.parentNode; parent; parent = parent.parentNode)
    if (attr(parent, "itemscope") !== undefined) return parent;
  return null;
};

test("physician portraits and scholarly citations survive the canonical HTML projection", async (t) => {
  const context = await isolatedContext(t);
  const sourcePerson = context.byId.get(context.release.primaryEntity.id);
  const expectedImageIds = sourcePerson.image.map((image) => image["@id"]);
  const expectedImageUrls = expectedImageIds.map((id) => context.byId.get(id).contentUrl);
  assert.equal(expectedImageIds.length, 4);

  const compiled = await compileGraphProjections(context);
  const head = JSON.parse(compiled.headRaw)["@graph"];
  const support = JSON.parse(compiled.supportRaw)["@graph"];
  const inline = new Map([...head, ...support].map((node) => [node["@id"], node]));
  assert.equal(inline.size, head.length + support.length, "inline blocks overlap");
  assert.deepEqual(inline.get(sourcePerson["@id"]).image, sourcePerson.image);
  for (const [index, id] of expectedImageIds.entries())
    assert.equal(inline.get(id)?.contentUrl, expectedImageUrls[index]);

  const { content } = await assembleCanonicalContent({ root: context.root, graph: context.graph });
  assert.doesNotMatch(content, />\s*\r?\n\s*</, "bound tokens must pass the same delivery compaction as authored markup");
  const elements = inspectHtml(content, { wrapMain: true }).elements;
  const microdataImages = elements.filter((node) =>
    attr(node, "itemprop")?.split(/\s+/).includes("image") &&
    attr(ownerScope(node), "itemid") === sourcePerson["@id"],
  );
  assert.deepEqual(microdataImages.map((node) => attr(node, "href")), expectedImageUrls);
  assert.ok(microdataImages.every((node) => node.tagName === "link"));
  const sitemapImages = deriveSitemapImageUrls({ ...context, content });
  for (const url of expectedImageUrls)
    assert.ok(sitemapImages.includes(url), `physician image absent from sitemap: ${url}`);
  const clinicLogo = context.byId.get(context.byId.get(context.release.clinic.id).logo["@id"]);
  assert.ok(!sitemapImages.includes(clinicLogo.contentUrl), "clinic logo is not a page photograph");
  for (const fragment of [
    "image-saeed-ghezelbash-portrait",
    "image-saeed-ghezelbash-clinical-examination",
    "image-saeed-ghezelbash-clinic-team",
  ])
    assert.ok(sitemapImages.includes(context.byId.get(`${context.release.canonicalUrl}#${fragment}`).contentUrl),
      `visible high-resolution picture was lost: ${fragment}`);

  const profile = JSON.parse(await readFile(path.join(context.semantic, "support-profile.json"), "utf8"));
  assert.equal(profile.citedScholarlyWorkIds.length, 2);
  for (const id of profile.citedScholarlyWorkIds) {
    const source = context.byId.get(id), work = inline.get(id);
    assert.equal(source.image, undefined, "a physician portrait must not illustrate a research article");
    assert.equal(work["@type"], "ScholarlyArticle");
    assert.equal(work.author["@id"], sourcePerson["@id"]);
    assert.equal(work.url, source.url);
    assert.equal(work.image, undefined);
    assert.equal(work.mainEntityOfPage, undefined);
    assert.ok(support.some((node) => node["@type"] === "WebPageElement" &&
      node.citation?.some((citation) => citation["@id"] === id)),
    `scholarly work lost its citing section: ${id}`);
  }
});

test("a cited work cannot transfer physician coauthorship to the clinic", async (t) => {
  const context = await isolatedContext(t);
  const profile = JSON.parse(await readFile(path.join(context.semantic, "support-profile.json"), "utf8"));
  context.byId.get(profile.citedScholarlyWorkIds[0]).author = { "@id": context.release.clinic.id };
  await assert.rejects(
    () => compileGraphProjections(context),
    /Cited scholarly work lacks its physician, DOI or visible-section relationship/,
  );
});

test("a cited-work profile cannot reintroduce physician portraits as article imagery", async (t) => {
  const context = await isolatedContext(t);
  const profilePath = path.join(context.semantic, "support-profile.json");
  const profile = JSON.parse(await readFile(profilePath, "utf8"));
  const id = profile.citedScholarlyWorkIds[0];
  context.byId.get(id).image = structuredClone(context.byId.get(context.release.primaryEntity.id).image);
  profile.idProfiles[id].include.push("image");
  await writeFile(profilePath, JSON.stringify(profile));
  await assert.rejects(
    () => compileGraphProjections(context),
    /Cited scholarly work must use the minimal authorship projection/,
  );
});
