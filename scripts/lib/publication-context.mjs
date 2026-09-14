import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  composePublicationData,
  deriveCanonicalAuthority,
} from "../../src/lib/canonical-authority.mjs";

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

export async function loadPublicationData(root = process.cwd()) {
  return (await loadPublicationContext(root)).publicationData;
}

export async function loadPublicationContext(root = process.cwd()) {
  const data = path.join(root, "src/data");
  const semantic = path.join(data, "semantic");
  const [lifecycle, graph, authorityProfile, clinicAssertionProvenance] =
    await Promise.all([
      readJson(path.join(data, "release.json")),
      readJson(path.join(semantic, "knowledge-graph.jsonld")),
      readJson(path.join(semantic, "authority-profile.json")),
      readJson(path.join(semantic, "clinic-assertion-provenance.json")),
    ]);
  const authority = deriveCanonicalAuthority(lifecycle, graph, authorityProfile);
  const publicationData = composePublicationData(
    lifecycle,
    authority,
    clinicAssertionProvenance,
  );
  return Object.freeze({
    lifecycle,
    graph,
    authorityProfile,
    clinicAssertionProvenance,
    authority,
    publicationData,
  });
}
