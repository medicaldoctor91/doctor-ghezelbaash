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
import { canonicalGraph, canonicalLifecycle, pageFrontmatter } from "../src/lib/canonical-inputs.mjs";
import { contentRoutePaths } from "./lib/content-routes.mjs";
import { applyTranslationAlternates } from "./lib/translation-alternates.mjs";
import { deriveIndependentPages, renderIndependentPage, routeDocumentFile } from "./lib/independent-pages.mjs";
import {
  canonicalHostAliasRows,
  canonicalMetadataAliasRows,
  loadAliasRegistry,
  renderStaticRewrites,
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
  JSON.stringify(["404.astro", "build-info.json.ts", "favicon.png.ts", "index.astro"])
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
const validateStableAliases = (aliases) => {
  if (!Array.isArray(aliases) || !aliases.length)
    throw new Error("Stable media alias inventory is empty or invalid");
  const fingerprint = /\.([0-9a-f]{12})(\.[^.]+)$/i;
  const raster = /\.(?:avif|webp|jpe?g|png)$/i;
  const paths = new Set();
  const targets = new Set();
  for (const alias of aliases) {
    if (
      !alias ||
      ![alias.path, alias.target].every(
        (value) => typeof value === "string" && value.length,
      )
    )
      throw new Error("Invalid stable media alias entry");
    if (
      ![alias.path, alias.target].every(
        (value) =>
          value.startsWith("media/") &&
          !value.includes("..") &&
          !value.includes("\\") &&
          path.posix.normalize(value) === value,
      )
    )
      throw new Error(`Unsafe stable media alias: ${alias.path}`);
    if (
      !raster.test(alias.path) ||
      !fingerprint.test(alias.target) ||
      alias.target.replace(fingerprint, "$2") !== alias.path
    )
      throw new Error(`Stable media alias logical target mismatch: ${alias.path}`);
    if (paths.has(alias.path) || targets.has(alias.target))
      throw new Error(`Duplicate stable media alias: ${alias.path}`);
    paths.add(alias.path);
    targets.add(alias.target);
  }
  return aliases;
};

for (const artifact of STATIC_ARTIFACTS)
  await copyExact(artifact.source, artifact.path);
const aliasRegistry = await loadAliasRegistry(root);
const legacyAliases = canonicalHostAliasRows(aliasRegistry);
const homeHtml = await readFile(path.join(dist, "index.html"), "utf8");
const contentPaths = contentRoutePaths(homeHtml, canonicalLifecycle.canonicalUrl);
const independentPages = applyTranslationAlternates(
  deriveIndependentPages(homeHtml, canonicalGraph, canonicalLifecycle.canonicalUrl),
  pageFrontmatter.discovery?.translationGroups ?? [],
  { canonicalUrl: canonicalLifecycle.canonicalUrl, graph: canonicalGraph },
);
for (const record of independentPages) await writeExact(record.file, renderIndependentPage(homeHtml, record));
await writeFile(path.join(root, ".generated/independent-pages.json"), JSON.stringify(independentPages.map(({ bodyHtml, document, ...record }) => record)));
const registeredSources = new Set(legacyAliases.map((row) => row.source));
if (contentPaths.some((route) => registeredSources.has(route)))
  throw new Error("Authored content path collides with a legacy alias");
const contentSources = new Set(contentPaths);
for (const { source, target } of legacyAliases) {
  const targetPath = new URL(target, canonicalLifecycle.canonicalUrl).pathname;
  if (targetPath !== "/" && !contentSources.has(targetPath) && !destinations.has(targetPath.slice(1)))
    throw new Error(`Legacy alias has no deployed destination: ${source} -> ${target}`);
}
const metadataAliases = canonicalMetadataAliasRows(canonicalGraph, canonicalLifecycle.canonicalUrl)
  .filter(({ source }) => !contentSources.has(source));
await writeExact("_redirects", renderStaticRewrites([
  ...legacyAliases.filter(({ source }) => source !== "/index.html")
    .map((row) => ({ ...row, target: row.target === "/" ? "/index.html" : row.target })),
  ...metadataAliases,
]));
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
      legacyAliases: legacyAliases.length,
      contentRoutes: contentPaths.length,
      independentlyRenderedPages: independentPages.length,
      metadataAliases: metadataAliases.length,
      destinations: destinations.size,
      deliveryMode: "static-assets",
    },
    null,
    2,
  ),
);
