import path from "node:path";
import { readFile } from "node:fs/promises";
import { hydrateReleaseAuthority } from "../../src/lib/canonical-authority.mjs";

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

export async function loadAuthoritativeRelease(root = process.cwd()) {
  const data = path.join(root, "src/data");
  const semantic = path.join(data, "semantic");
  const [rawRelease, graph, authorityProfile] = await Promise.all([
    readJson(path.join(data, "release.json")),
    readJson(path.join(semantic, "knowledge-graph.jsonld")),
    readJson(path.join(semantic, "authority-profile.json")),
  ]);
  return hydrateReleaseAuthority(rawRelease, graph, authorityProfile);
}

export async function loadAuthoritativeReleaseContext(root = process.cwd()) {
  const data = path.join(root, "src/data");
  const semantic = path.join(data, "semantic");
  const [rawRelease, graph, authorityProfile] = await Promise.all([
    readJson(path.join(data, "release.json")),
    readJson(path.join(semantic, "knowledge-graph.jsonld")),
    readJson(path.join(semantic, "authority-profile.json")),
  ]);
  return Object.freeze({
    rawRelease,
    graph,
    authorityProfile,
    release: hydrateReleaseAuthority(rawRelease, graph, authorityProfile),
  });
}
