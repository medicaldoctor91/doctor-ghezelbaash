import path from "node:path";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { STATIC_ARTIFACTS } from "../src/lib/resources.mjs";
import { validateStableAliases } from "./lib/media-inventory.mjs";
import { FORBIDDEN_QIDS } from "./lib/active-identifier-contract.mjs";
import {
  canonicalHostRedirectRows,
  loadRedirectRegistry,
  renderCanonicalHostRedirects,
} from "./lib/redirect-registry.mjs";

const root = process.cwd();
const dist = path.resolve(root, process.argv[2] || "dist");
const pageSurface = (
  await readdir(path.join(root, "src/pages"), { withFileTypes: true })
)
  .map((entry) => entry.name)
  .sort();
if (
  JSON.stringify(pageSurface) !==
  JSON.stringify(["404.astro", "favicon.png.ts", "index.astro"])
)
  throw new Error(`Astro route surface drift: ${pageSurface.join(", ")}`);

const resolveInside = (base, relative, label) => {
  const target = path.resolve(base, String(relative));
  const rel = path.relative(base, target);
  if (!relative || rel.startsWith("..") || path.isAbsolute(rel))
    throw new Error(`${label} escapes its root: ${relative}`);
  return target;
};
const destinations = new Set();
const copyExact = async (sourceRelative, destinationRelative) => {
  if (destinations.has(destinationRelative))
    throw new Error(
      `Duplicate static artifact destination: ${destinationRelative}`,
    );
  destinations.add(destinationRelative);
  const source = resolveInside(root, sourceRelative, "Static artifact source");
  const destination = resolveInside(
    dist,
    destinationRelative,
    "Static artifact destination",
  );
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
};
const writeExact = async (destinationRelative, content) => {
  if (destinations.has(destinationRelative))
    throw new Error(
      `Duplicate static artifact destination: ${destinationRelative}`,
    );
  destinations.add(destinationRelative);
  const destination = resolveInside(
    dist,
    destinationRelative,
    "Static artifact destination",
  );
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content, "utf8");
};

const INTERNAL_RETIRED_IDENTIFIER_SHAPE =
  "\nex:RetiredIdentifierExclusionShape a sh:NodeShape ;";
const publishableShapes = async (sourceRelative) => {
  const sourcePath = resolveInside(root, sourceRelative, "SHACL source");
  const source = await readFile(sourcePath, "utf8");
  const marker = source.indexOf(INTERNAL_RETIRED_IDENTIFIER_SHAPE);
  if (marker < 0 || source.indexOf(INTERNAL_RETIRED_IDENTIFIER_SHAPE, marker + 1) >= 0)
    throw new Error("Internal retired-identifier SHACL marker missing or ambiguous");
  const tail = source.slice(marker + INTERNAL_RETIRED_IDENTIFIER_SHAPE.length);
  if (/\nex:[A-Za-z0-9_-]+\s+a\s+sh:NodeShape\b/.test(tail))
    throw new Error(
      "Internal retired-identifier SHACL constraint must remain the final shape before publication projection",
    );
  const published = `${source.slice(0, marker).trimEnd()}\n`;
  for (const qid of FORBIDDEN_QIDS)
    if (published.includes(qid))
      throw new Error(`Retired identifier ${qid} remains in public SHACL projection`);
  return published;
};

for (const artifact of STATIC_ARTIFACTS) {
  if (artifact.path === "shapes.ttl")
    await writeExact(artifact.path, await publishableShapes(artifact.source));
  else await copyExact(artifact.source, artifact.path);
}
const redirectRegistry = await loadRedirectRegistry(root);
const canonicalRedirects = canonicalHostRedirectRows(redirectRegistry);
await writeExact("_redirects", renderCanonicalHostRedirects(redirectRegistry));
const generatedPublic = path.join(root, ".generated/public");
const generatedPublicFiles = STATIC_ARTIFACTS.map(({ source }) => source)
  .filter((source) => path.posix.dirname(source) === ".generated/public")
  .map((source) => path.posix.basename(source))
  .sort();
const assetEntries = await readdir(path.join(generatedPublic, "assets"), {
  withFileTypes: true,
});
if (
  assetEntries.length !== 1 ||
  !assetEntries[0].isFile() ||
  !/^site\.[0-9a-f]{12}\.css$/.test(assetEntries[0].name)
)
  throw new Error(
    `Generated asset inventory drift: ${assetEntries.map((entry) => entry.name).join(", ")}`,
  );
const activeAssetName = assetEntries[0].name;
const distAssetDirectory = path.join(dist, "assets");
await mkdir(distAssetDirectory, { recursive: true });
const staleGeneratedAssets = (
  await readdir(distAssetDirectory, { withFileTypes: true })
).filter(
  (entry) =>
    entry.name !== activeAssetName &&
    /^site\.[0-9a-f]{12}\.css$/.test(entry.name),
);
for (const entry of staleGeneratedAssets) {
  if (!entry.isFile())
    throw new Error(`Generated CSS destination is not a file: ${entry.name}`);
  await rm(path.join(distAssetDirectory, entry.name));
}
await copyExact(
  path.posix.join(".generated/public/assets", activeAssetName),
  path.posix.join("assets", activeAssetName),
);
const generatedPublicEntries = (
  await readdir(generatedPublic, { withFileTypes: true })
)
  .map((entry) => entry.name)
  .sort();
const expectedGeneratedPublic = [...generatedPublicFiles, "assets"].sort();
if (
  JSON.stringify(generatedPublicEntries) !==
  JSON.stringify(expectedGeneratedPublic)
)
  throw new Error(
    `Generated public workspace contains undeclared artifacts: ${generatedPublicEntries.join(", ")}`,
  );

const stableMedia = JSON.parse(
  await readFile(path.join(root, "src/data/stable-media-aliases.json"), "utf8"),
);
for (const alias of validateStableAliases(stableMedia.aliases)) {
  const source = resolveInside(
    path.join(root, "public"),
    alias.target,
    "Stable media source",
  );
  const destination = resolveInside(
    dist,
    alias.path,
    "Stable media destination",
  );
  if (destinations.has(alias.path))
    throw new Error(
      `Stable media destination collides with generated/static artifact: ${alias.path}`,
    );
  destinations.add(alias.path);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

console.log(
  JSON.stringify(
    {
      materialized: true,
      astroRoutes: pageSurface,
      machineArtifacts: STATIC_ARTIFACTS.length,
      generatedPublicFiles: generatedPublicFiles.length + assetEntries.length,
      staleGeneratedAssetsRemoved: staleGeneratedAssets.length,
      stableMediaAliases: stableMedia.aliases.length,
      canonicalHostRedirects: canonicalRedirects.length,
      publicShaclRetiredIdentifiers: "ABSENT",
      destinations: destinations.size,
      deliveryMode: "static-assets",
    },
    null,
    2,
  ),
);
