import path from "node:path";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { STATIC_ARTIFACTS } from "../src/lib/resources.mjs";
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

for (const artifact of STATIC_ARTIFACTS)
  await copyExact(artifact.source, artifact.path);
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
await copyExact(
  path.posix.join(".generated/public/assets", assetEntries[0].name),
  path.posix.join("assets", assetEntries[0].name),
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
if (!Array.isArray(stableMedia.aliases) || stableMedia.aliases.length !== 6)
  throw new Error(
    `Stable media alias inventory drift: ${stableMedia.aliases?.length ?? "invalid"}`,
  );
for (const alias of stableMedia.aliases) {
  if (
    !alias ||
    typeof alias.path !== "string" ||
    typeof alias.target !== "string"
  )
    throw new Error("Invalid stable media alias entry");
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
      stableMediaAliases: stableMedia.aliases.length,
      canonicalHostRedirects: canonicalRedirects.length,
      destinations: destinations.size,
      routeWrappers: 0,
    },
    null,
    2,
  ),
);
