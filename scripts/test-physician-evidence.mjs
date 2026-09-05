import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import jsonld from "jsonld";
import { assembleCanonicalContent } from "./lib/assemble-content.mjs";
import { inspectHtml } from "./lib/html-contract.mjs";
import { loadProjectionContext } from "./lib/projection-context.mjs";
import { deriveSitemapImageUrls } from "./lib/projections/contact-discovery.mjs";
import {
  assertHomepageAuthorityRoles,
  compileGraphProjections,
  projectSchemaContext,
} from "./lib/projections/graph-projections.mjs";
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
  const authoredIds = Object.entries(profile.idProfiles)
    .filter(([, policy]) => policy.authorityRole === "physicianAuthoredWork")
    .map(([id]) => id);
  assert.equal(authoredIds.length, 5);
  for (const id of authoredIds) {
    const source = context.byId.get(id), work = inline.get(id);
    assert.equal(source.image, undefined, "a physician portrait must not illustrate a research article");
    assert.deepEqual(work["@type"], source["@type"]);
    assert.equal(work.author["@id"], sourcePerson["@id"]);
    assert.equal(work.url, source.url);
    assert.equal(work.image, undefined);
    assert.equal(work.mainEntityOfPage, undefined);
    assert.ok(support.some((node) => node["@type"] === "WebPageElement" &&
      [node.citation, node.mentions].flat().some((reference) => reference?.["@id"] === id)),
    `scholarly work lost its citing section: ${id}`);
  }
});

test("a cited work cannot transfer physician coauthorship to the clinic", async (t) => {
  const context = await isolatedContext(t);
  const profile = JSON.parse(await readFile(path.join(context.semantic, "support-profile.json"), "utf8"));
  const [id] = Object.entries(profile.idProfiles)
    .find(([, policy]) => policy.authorityRole === "physicianAuthoredWork");
  context.byId.get(id).author = { "@id": context.release.clinic.id };
  await assert.rejects(
    () => compileGraphProjections(context),
    /Physician-authored work lacks its author or visible-section relationship/,
  );
});

test("a cited-work profile cannot reintroduce physician portraits as article imagery", async (t) => {
  const context = await isolatedContext(t);
  const profilePath = path.join(context.semantic, "support-profile.json");
  const profile = JSON.parse(await readFile(profilePath, "utf8"));
  const [id] = Object.entries(profile.idProfiles)
    .find(([, policy]) => policy.authorityRole === "physicianAuthoredWork");
  context.byId.get(id).image = structuredClone(context.byId.get(context.release.primaryEntity.id).image);
  profile.idProfiles[id].include.push("image");
  await writeFile(profilePath, JSON.stringify(profile));
  await assert.rejects(
    () => compileGraphProjections(context),
    /Physician work cannot borrow portrait imagery or page identity/,
  );
});

const canonicalize = (document) => jsonld.canonize(document, {
  algorithm: "RDFC-1.0",
  rejectURDNA2015: true,
  format: "application/n-quads",
});

test("each compact inline context preserves its full canonical RDF meaning", async (t) => {
  const context = await isolatedContext(t);
  const projection = await compileGraphProjections(context);
  for (const document of [projection.headDoc, projection.supportDoc]) {
    const canonicalContextDocument = {
      ...document,
      "@context": context.graph["@context"],
    };
    assert.equal(await canonicalize(document), await canonicalize(canonicalContextDocument));
    assert.ok(JSON.stringify(document["@context"]).length < JSON.stringify(context.graph["@context"]).length);
  }
  const invalid = structuredClone(projection.supportDoc);
  delete invalid["@context"].datePublished;
  assert.notEqual(await canonicalize(invalid), await canonicalize(projection.supportDoc),
    "RDF comparison must detect losing a used date coercion");
});

test("context selection closes term and prefix dependencies and keeps language defaults", async () => {
  const context = {
    "@version": 1.1,
    "@vocab": "https://schema.org/",
    "@language": "en",
    schema: "https://schema.org/",
    xsd: "http://www.w3.org/2001/XMLSchema#",
    recorded: { "@id": "schema:dateCreated", "@type": "xsd:date" },
    state: { "@id": "schema:creativeWorkStatus", "@type": "@vocab" },
    Draft: "schema:Draft",
    unused: { "@id": "schema:datePublished", "@type": "xsd:date" },
  };
  const nodes = [{ "@id": "https://example.test/work", "@type": "schema:Article", recorded: "2026-08-18", state: "Draft", name: "Example" }];
  const projected = projectSchemaContext(context, nodes);
  assert.equal(projected.unused, undefined);
  assert.equal(projected.xsd, context.xsd);
  assert.equal(projected.Draft, context.Draft);
  assert.equal(projected["@language"], "en");
  assert.equal(
    await canonicalize({ "@context": projected, "@graph": nodes }),
    await canonicalize({ "@context": context, "@graph": nodes }),
  );
});

test("authority projection preserves seven canonical edges and honest work roles", async (t) => {
  const context = await isolatedContext(t);
  const { headDoc, supportDoc } = await compileGraphProjections(context);
  const inline = new Map([...headDoc["@graph"], ...supportDoc["@graph"]].map((node) => [node["@id"], node]));
  const iri = (fragment) => `${context.release.canonicalUrl}#${fragment}`;
  const person = inline.get(context.release.primaryEntity.id);
  const issuerId = iri("organization-iran-medical-council");
  const interviewId = iri("evidence-iranmedlabs-interview");
  const sectionId = iri("saeed-ghezelbash-research-education-and-clinical-decisions");
  const refs = (value) => [value].flat().map((item) => item?.["@id"]).filter(Boolean);
  assert.ok(refs(person.memberOf).includes(issuerId));
  assert.ok(refs(person.hasCredential).some((id) => refs(inline.get(id)?.recognizedBy).includes(issuerId)));
  assert.ok(refs(person.subjectOf).includes(interviewId));
  assert.ok(refs(inline.get(sectionId).citation).includes(interviewId));
  for (const fragment of [
    "wikiversity-botulinum-toxin-aesthetic-medicine",
    "wikiversity-individualized-botulinum-toxin-focused-review",
    "wikiversity-facial-assessment-before-aesthetic-botulinum-toxin",
  ]) {
    const id = iri(fragment);
    assert.ok(refs(inline.get(sectionId).mentions).includes(id));
    assert.deepEqual(inline.get(id).author, { "@id": context.release.primaryEntity.id });
    assert.deepEqual(inline.get(id).about, context.byId.get(id).about);
  }
  const interview = inline.get(interviewId);
  assert.equal(interview.author, undefined);
  assert.deepEqual(interview.mainEntity, { "@id": context.release.primaryEntity.id });
  assert.equal(inline.get(iri("wikiversity-individualized-botulinum-toxin-focused-review")).creativeWorkStatus,
    "Preprint under public peer review");
});

test("a preprint projection cannot omit its status while retaining the article", async (t) => {
  const context = await isolatedContext(t);
  const profilePath = path.join(context.semantic, "support-profile.json");
  const profile = JSON.parse(await readFile(profilePath, "utf8"));
  const id = `${context.release.canonicalUrl}#wikiversity-individualized-botulinum-toxin-focused-review`;
  profile.idProfiles[id].include = profile.idProfiles[id].include.filter((field) => field !== "creativeWorkStatus");
  await writeFile(profilePath, JSON.stringify(profile));
  await assert.rejects(() => compileGraphProjections(context), /lost its publication status/);
});

test("an interview cannot be reassigned to the physician as its author", async (t) => {
  const context = await isolatedContext(t);
  const id = `${context.release.canonicalUrl}#evidence-iranmedlabs-interview`;
  context.byId.get(id).author = { "@id": context.release.primaryEntity.id };
  await assert.rejects(() => compileGraphProjections(context), /without inventing authorship/);
});

test("an external work with a role still needs its canonical DOI and visible citation", async (t) => {
  const context = await isolatedContext(t);
  const id = `${context.release.canonicalUrl}#article-omega-3-bipolar-i-2016`;
  context.byId.get(id).identifier = ["DOI:10.0000/wrong"];
  await assert.rejects(() => compileGraphProjections(context), /lost its canonical DOI identifier/);
});

test("the delivered graph validator rejects a work detached from its page section", async (t) => {
  const context = await isolatedContext(t);
  const projection = await compileGraphProjections(context);
  const nodes = [...projection.headDoc["@graph"], ...projection.supportDoc["@graph"]];
  const section = nodes.find((node) => node["@id"] === `${context.release.canonicalUrl}#saeed-ghezelbash-research-education-and-clinical-decisions`);
  delete section.mentions;
  const profiles = await Promise.all(["head-profile.json", "support-profile.json"].map(async (name) =>
    JSON.parse(await readFile(path.join(context.semantic, name), "utf8")),
  ));
  assert.throws(() => assertHomepageAuthorityRoles({
    nodes,
    canonicalNodes: context.graph["@graph"],
    profiles,
    physicianId: context.release.primaryEntity.id,
    canonicalOrigin: new URL(context.release.canonicalUrl).origin,
  }), /lacks its author or visible-section relationship/);
});

test("an omitted canonical destination cannot be silently replaced by its external URL", async (t) => {
  const context = await isolatedContext(t);
  const profilePath = path.join(context.semantic, "support-profile.json");
  const profile = JSON.parse(await readFile(profilePath, "utf8"));
  const id = `${context.release.canonicalUrl}#organization-iran-medical-council`;
  profile.ids = profile.ids.filter((selected) => selected !== id);
  delete profile.idProfiles[id];
  await writeFile(profilePath, JSON.stringify(profile));
  await assert.rejects(() => compileGraphProjections(context), /unresolved required inline reference/);
});
