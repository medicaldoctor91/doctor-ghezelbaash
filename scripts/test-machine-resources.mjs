import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import os from "node:os";
import { MIMEType } from "node:util";
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, mkdtemp, copyFile, cp, rm } from "node:fs/promises";
import {
  MACHINE_RESOURCES, HEAD_RESOURCES, machineResourceForPath,
  resourceContentType, quoteHttpParameter,
} from "../src/lib/resources.mjs";
import { compileHeadersTemplate } from "./lib/headers-template.mjs";
import { compileContactDiscovery, vCardEntityKind } from "./lib/projections/contact-discovery.mjs";
import { indexCanonicalGraph } from "../src/lib/semantic-projection.mjs";

const root = process.cwd();
const release = JSON.parse(await readFile(path.join(root, "src/data/release.json"), "utf8"));
const graph = JSON.parse(await readFile(path.join(root, "src/data/semantic/knowledge-graph.jsonld"), "utf8"));
const { byId } = indexCanonicalGraph(graph);
const bindings = {
  mainCsp: "default-src 'self'",
  csp404: "default-src 'none'",
  heroEarlyHintHref: "/hero.avif",
  httpResourceLinks: '<https://example.test/graph.jsonld>; rel="describedby"',
};

test("registry preserves existing graph distribution identities and distinct descriptor inventories", () => {
  const downloads = graph["@graph"].filter((node) => node["@id"].endsWith("#download"));
  assert.equal(downloads.length, 13);
  for (const download of downloads) {
    const relative = new URL(download.contentUrl).pathname.slice(1);
    assert.equal(machineResourceForPath(relative).distributionIri, download["@id"]);
  }
  assert.equal(MACHINE_RESOURCES.filter((resource) => resource.descriptorRoles.includes("dcat")).length, 11);
  for (const resource of MACHINE_RESOURCES.filter((item) => item.descriptorRoles.length))
    assert.ok(resource.distributionIri && resource.descriptorTitle);
  assert.equal(machineResourceForPath("croissant.json").descriptorRoles.length, 0);
});

test("profiled media type survives Content-Type, HTML discovery and nested HTTP quoting", async () => {
  const resource = machineResourceForPath("croissant.json");
  assert.equal(resource.mediaType, "application/ld+json");
  assert.equal(new MIMEType(resource.contentType).params.get("profile"), resource.profileIri);
  assert.equal(HEAD_RESOURCES.find((item) => item.path === resource.path).contentType, resource.contentType);
  const quoted = quoteHttpParameter(resource.contentType);
  const unquoted = quoted.slice(1, -1).replace(/\\([\\"])/g, "$1");
  assert.equal(new MIMEType(unquoted).params.get("profile"), resource.profileIri);
  assert.throws(() => quoteHttpParameter("text/plain\r\nInjected: true"), /printable string/);
  assert.throws(() => resourceContentType({ mediaType: "application/ld+json; profile=x" }), /bare media type/);
  const template = await readFile(path.join(root, "src/data/templates/headers.template"), "utf8");
  const headers = compileHeadersTemplate(template, bindings);
  const block = headers.split("\n/croissant.json\n")[1].split("\n\n")[0];
  const contentType = block.match(/Content-Type: (.+)/)[1];
  assert.equal(new MIMEType(contentType).params.get("profile"), resource.profileIri);
  assert.equal(new MIMEType(contentType).params.get("charset"), "utf-8");
  assert.match(block, /X-Robots-Tag: googlebot: noindex, follow/);
  assert.throws(() => compileHeadersTemplate(template.replace("CONTENT_TYPE:croissant.json", "CONTENT_TYPE:missing.json"), bindings), /Unknown machine resource/);
  assert.throws(() => compileHeadersTemplate(`${template}{{CONTENT_TYPE:croissant.json}}`, bindings), /expected exactly one/);
});

test("generated vCards preserve physician versus organization identity in RFC 6350 fields", async (t) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "ghezelbaash-contact-contract-"));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const generatedPublic = path.join(workspace, "public"), projections = path.join(workspace, "projections");
  await mkdir(projections, { recursive: true });
  await compileContactDiscovery({ root, generatedPublic, projections, release, graph, byId });
  for (const [file, entity, kind] of [["doctor.vcf", release.primaryEntity.id, "individual"], ["clinic.vcf", release.clinic.id, "org"]]) {
    const card = await readFile(path.join(generatedPublic, file), "utf8");
    const lines = card.split("\r\n");
    assert.ok(lines.every((line) => Buffer.byteLength(line, "utf8") <= 75));
    assert.doesNotMatch(card.replaceAll("\r\n", ""), /[\r\n]/);
    const unfolded = card.replace(/\r\n[ \t]/g, "").split("\r\n");
    assert.equal(unfolded.filter((line) => line.startsWith("KIND:")).length, 1);
    assert.ok(unfolded.includes(`KIND:${kind}`));
    assert.ok(unfolded.includes(`UID:${entity}`));
    assert.ok(unfolded.includes("VERSION:4.0"));
    assert.equal(vCardEntityKind(byId.get(entity)), kind);
  }
  assert.throws(() => vCardEntityKind({ "@type": ["Person", "MedicalClinic"] }), /ambiguous/);
  assert.throws(() => vCardEntityKind({ "@type": "CreativeWork" }), /unsupported/);
});

test("descriptor generator emits joinable RDF, correct typed hashes and usable Croissant references", async (t) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "ghezelbaash-descriptor-contract-"));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const inputs = new Set([
    "src/data/release.json", "src/data/retrieval/query-matrix-policy.json",
    "src/data/semantic/knowledge-graph.jsonld", "src/data/machine-resources.json",
    ".generated/semantic/rdf-lock.json",
    ...MACHINE_RESOURCES.filter((resource) => resource.descriptorRoles.length).map((resource) => resource.source),
  ]);
  for (const input of inputs) {
    await mkdir(path.dirname(path.join(workspace, input)), { recursive: true });
    await copyFile(path.join(root, input), path.join(workspace, input));
  }
  await cp(path.join(root, "public/media/video-tracks"), path.join(workspace, "public/media/video-tracks"), { recursive: true });
  const generated = spawnSync(process.execPath, [path.join(root, "scripts/generate-descriptors.mjs")], { cwd: workspace, encoding: "utf8" });
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);
  const output = path.join(workspace, ".generated/projections");
  const croissant = JSON.parse(await readFile(path.join(output, "croissant.json"), "utf8"));
  const dataPackage = JSON.parse(await readFile(path.join(output, "datapackage.json"), "utf8"));
  const linkset = JSON.parse(await readFile(path.join(output, "linkset.json"), "utf8"));
  const files = new Map(croissant.distribution.map((item) => [item.contentUrl, item]));
  assert.equal(dataPackage.$schema, "https://datapackage.org/profiles/2.0/datapackage.json");
  const contributor = dataPackage.contributors.find((item) => item.path === release.primaryEntity.id);
  assert.deepEqual(contributor.roles, ["author", "creator", "publisher", "rightsHolder"]);
  assert.ok(!Object.hasOwn(contributor, "role"));
  for (const resource of dataPackage.resources) {
    assert.equal(resource.$schema, "https://datapackage.org/profiles/2.0/dataresource.json");
    const file = files.get(new URL(resource.path, release.canonicalUrl).href);
    assert.equal(resource.id, file["@id"]);
    assert.equal(resource.hash, `sha256:${file.sha256}`);
    assert.equal(resource.bytes, Number(file.contentSize));
  }
  const csv = dataPackage.resources.find((resource) => resource.path === "entity-facts.csv");
  assert.equal(csv.schema.$schema, "https://datapackage.org/profiles/2.0/tableschema.json");
  assert.equal(csv.dialect.$schema, "https://datapackage.org/profiles/2.0/tabledialect.json");
  assert.deepEqual(csv.dialect.headerRows, [1]);
  assert.equal(csv.dialect.lineTerminator, "\n");
  for (const field of croissant.recordSet[0].field)
    assert.equal(field.source.fileObject["@id"], files.get(`${release.canonicalUrl}entity-facts.csv`)["@id"]);
  assert.equal(linkset.linkset[0].describedby.find((item) => item.href.endsWith("croissant.json")).type, machineResourceForPath("croissant.json").contentType);
  const rdf = spawnSync("python", ["-c", `
import hashlib,json,sys
from pathlib import Path
from rdflib import Graph,Namespace,RDF,URIRef,XSD
root=Path(sys.argv[1]); registry=json.loads((root/'src/data/machine-resources.json').read_text())
dcat=Namespace('http://www.w3.org/ns/dcat#');spdx=Namespace('http://spdx.org/rdf/terms#')
g=Graph().parse(root/'.generated/projections/dcat.ttl',format='turtle')
expected=[r for r in registry['resources'] if 'dcat' in r.get('descriptorRoles',[])]
assert len(set(g.subjects(RDF.type,dcat.Distribution)))==len(expected)==11
for resource in expected:
 node=URIRef(resource['distributionIri']); media=g.value(node,dcat.mediaType)
 assert isinstance(media,URIRef) and str(media)=='https://www.iana.org/assignments/media-types/'+resource['mediaType']
 data=(root/resource['source']).read_bytes(); size=g.value(node,dcat.byteSize)
 assert size.datatype==XSD.decimal and int(size)==len(data)
 checksum=g.value(node,spdx.checksum);value=g.value(checksum,spdx.checksumValue)
 assert value.datatype==XSD.hexBinary and str(value).lower()==hashlib.sha256(data).hexdigest()
 assert g.value(checksum,spdx.algorithm)==spdx.checksumAlgorithm_sha256
print('DCAT_RDF_CONSUMER_PASS')
`, workspace], { encoding: "utf8", env: { ...process.env, PYTHONPATH: path.join(root, ".python-deps") } });
  assert.equal(rdf.status, 0, rdf.stderr || rdf.stdout);
  assert.match(rdf.stdout, /DCAT_RDF_CONSUMER_PASS/);
  // Roles follow canonical attribution, rather than retaining claims after
  // a Dataset ownership or publication relationship changes.
  const otherPublisherGraph = structuredClone(graph);
  const dataset = otherPublisherGraph["@graph"].find((node) => node["@id"] === release.dataset.id);
  dataset.publisher = { "@id": "https://example.test/#publisher" };
  delete dataset.copyrightHolder;
  await writeFile(path.join(workspace, "src/data/semantic/knowledge-graph.jsonld"), JSON.stringify(otherPublisherGraph));
  const changed = spawnSync(process.execPath, [path.join(root, "scripts/generate-descriptors.mjs")], { cwd: workspace, encoding: "utf8" });
  assert.equal(changed.status, 0, changed.stderr || changed.stdout);
  const changedPackage = JSON.parse(await readFile(path.join(output, "datapackage.json"), "utf8"));
  assert.deepEqual(changedPackage.contributors.find((item) => item.path === release.primaryEntity.id).roles, ["author", "creator"]);
});
