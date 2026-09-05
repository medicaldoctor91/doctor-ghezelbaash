import path from "node:path";
import { readFile, readdir, stat } from "node:fs/promises";
import { parseFragment } from "parse5";
import ts from "typescript";

export const rasterPattern = /\.(?:avif|webp|jpe?g|png)$/i;
export const mediaPattern = /\.(?:avif|webp|jpe?g|png|svg|mp4|webm|vtt|woff2?)$/i;
export const fingerprintPattern = /\.([0-9a-f]{12})(\.[^.]+)$/i;
const localUrlPattern = /(?:https?:\/\/[^\s"'<>()[\],]+)?\/(?:media|fonts)\/[A-Za-z0-9._/-]+\.(?:avif|webp|jpe?g|png|svg|mp4|webm|vtt|woff2?)|\/(?:apple-touch-icon\.png|favicon\.(?:svg|png))/gi;
const values = (value) => Array.isArray(value) ? value : value === undefined ? [] : [value];
const inventoryOnlySources = new Set([
  "src/data/stable-media-aliases.json",
  "src/data/media-metadata.json",
  "src/data/media-dimensions.tsv",
  "src/data/machine-resources.json",
]);

export async function walkFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(file));
    else if (entry.isFile()) files.push(file);
  }
  return files.sort();
}

export function parseRasterDimensions(text) {
  const dimensions = new Map();
  for (const [index, line] of text.trim().split(/\r?\n/).entries()) {
    const [logical, widthRaw, heightRaw, ...rest] = line.split("|");
    const width = Number(widthRaw), height = Number(heightRaw);
    if (rest.length || !logical?.startsWith("public/media/") ||
      !rasterPattern.test(logical) || logical.includes("..") ||
      !Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0)
      throw new Error(`Invalid raster dimension row ${index + 1}: ${line}`);
    if (dimensions.has(logical)) throw new Error(`Duplicate logical raster: ${logical}`);
    dimensions.set(logical, { width, height });
  }
  return dimensions;
}

export async function loadRasterDimensions(root) {
  return parseRasterDimensions(await readFile(path.join(root, "src/data/media-dimensions.tsv"), "utf8"));
}

export function assertRasterInventory(rasters, dimensions, root) {
  const actual = new Set();
  for (const file of rasters) {
    const relative = path.relative(root, file).replaceAll(path.sep, "/");
    if (!fingerprintPattern.test(relative)) throw new Error(`Unfingerprinted raster: ${relative}`);
    const logical = relative.replace(fingerprintPattern, "$2");
    if (actual.has(logical)) throw new Error(`Duplicate physical raster: ${logical}`);
    actual.add(logical);
  }
  const missing = [...dimensions.keys()].filter((key) => !actual.has(key));
  const unexpected = [...actual].filter((key) => !dimensions.has(key));
  if (missing.length || unexpected.length)
    throw new Error(`Raster manifest boundary violation; missing=${missing.join(", ") || "none"}; unexpected=${unexpected.join(", ") || "none"}`);
}

export function mediaUrls(text, canonicalUrl) {
  const origin = new URL(canonicalUrl).origin;
  const paths = new Set();
  for (const match of String(text).matchAll(localUrlPattern)) {
    const url = new URL(match[0], canonicalUrl);
    if (url.origin === origin) paths.add(url.pathname);
  }
  return paths;
}

export function htmlMediaUrls(text, canonicalUrl) {
  const result = new Set();
  const visit = (node) => {
    for (const attr of node.attrs ?? []) {
      if (!["src", "srcset", "imagesrcset", "href", "poster", "content", "data-src", "data-srcset", "data-poster", "style"].includes(attr.name)) continue;
      for (const url of mediaUrls(attr.value, canonicalUrl)) result.add(url);
    }
    for (const child of node.childNodes ?? []) visit(child);
    if (node.content) visit(node.content);
  };
  visit(parseFragment(String(text)));
  for (const match of String(text).replace(/<!--[\s\S]*?-->/g, "").matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g))
    for (const url of mediaUrls(match[1], canonicalUrl)) result.add(url);
  return result;
}

export function htmlGraphReferences(text, canonicalUrl) {
  const references = new Set();
  const visit = (node) => {
    const attrs = Object.fromEntries((node.attrs ?? []).map(({ name, value }) => [name, value]));
    for (const value of [attrs.itemid, attrs.itemprop ? attrs.href : undefined]) {
      if (!value || value.includes("{{")) continue;
      const url = new URL(value, canonicalUrl);
      if (url.origin === new URL(canonicalUrl).origin && url.hash) references.add(url.href);
    }
    for (const child of node.childNodes ?? []) visit(child);
    if (node.content) visit(node.content);
  };
  visit(parseFragment(String(text)));
  return references;
}

export function reachableGraphNodes(graph, rootIds) {
  const byId = new Map((graph["@graph"] ?? []).map((node) => [node["@id"], node]));
  const pending = [...rootIds], reached = new Set();
  const references = (value) => {
    if (Array.isArray(value)) return value.flatMap(references);
    if (!value || typeof value !== "object") return [];
    return [value["@id"], ...Object.entries(value).filter(([key]) => key !== "@id" && key !== "@context").flatMap(([, nested]) => references(nested))].filter(Boolean);
  };
  for (const id of rootIds) if (!byId.has(id)) throw new Error(`Media graph root missing: ${id}`);
  while (pending.length) {
    const id = pending.pop();
    if (reached.has(id) || !byId.has(id)) continue;
    reached.add(id);
    pending.push(...references(byId.get(id)));
  }
  return new Map([...reached].map((id) => [id, byId.get(id)]));
}

export function validateStableAliases(aliases, { physicalPaths, canonicalUrl, graphById, reachableIds } = {}) {
  if (!Array.isArray(aliases) || !aliases.length) throw new Error("Stable media alias inventory is empty or invalid");
  const paths = new Set(), targets = new Set();
  for (const alias of aliases) {
    if (!alias || ![alias.path, alias.target, alias.imageId].every((value) => typeof value === "string" && value.length))
      throw new Error("Invalid stable media alias entry");
    if (![alias.path, alias.target].every((value) => value.startsWith("media/") && !value.includes("..") && !value.includes("\\") && path.posix.normalize(value) === value))
      throw new Error(`Unsafe stable media alias: ${alias.path}`);
    if (!rasterPattern.test(alias.path) || !fingerprintPattern.test(alias.target) ||
      alias.target.replace(fingerprintPattern, "$2") !== alias.path)
      throw new Error(`Stable media alias logical target mismatch: ${alias.path}`);
    if (paths.has(alias.path) || targets.has(alias.target)) throw new Error(`Duplicate stable media alias: ${alias.path}`);
    paths.add(alias.path); targets.add(alias.target);
    if (physicalPaths && (!physicalPaths.has(`/${alias.target}`) || physicalPaths.has(`/${alias.path}`)))
      throw new Error(`Stable media alias target missing or path occupied: ${alias.path}`);
    if (graphById) {
      const node = graphById.get(alias.imageId);
      if (!values(node?.["@type"]).includes("ImageObject") ||
        ![alias.path, alias.target].map((file) => new URL(file, canonicalUrl).href).includes(node.contentUrl))
        throw new Error(`Stable media alias ImageObject mismatch: ${alias.path}`);
      if (reachableIds && !reachableIds.has(alias.imageId))
        throw new Error(`Stable media alias has no reachable ImageObject: ${alias.path}`);
    }
  }
  return aliases;
}

export function validateMediaUsage({ physicalPaths, consumers, graph, rootIds, aliases, canonicalUrl }) {
  const graphById = new Map(graph["@graph"].map((node) => [node["@id"], node]));
  const semanticRoots = consumers.flatMap(({ graphIds }) => [...graphIds ?? []]).filter((id) => graphById.has(id));
  const reachable = reachableGraphNodes(graph, [...new Set([...rootIds, ...semanticRoots])]);
  validateStableAliases(aliases, { physicalPaths, canonicalUrl, graphById, reachableIds: new Set(reachable.keys()) });
  const published = new Set([...physicalPaths, ...aliases.map((alias) => `/${alias.path}`)]);
  // favicon.png is produced by the actual Astro endpoint; its input is scanned below.
  published.add("/favicon.png");
  const uses = new Map();
  const add = (file, source) => {
    if (!published.has(file)) throw new Error(`Missing first-party media reference: ${source}:${file}`);
    if (!uses.has(file)) uses.set(file, new Set());
    uses.get(file).add(source);
  };
  for (const { source, paths } of consumers) for (const file of paths) add(file, source);
  const graphMediaKeys = new Set(["contentUrl", "thumbnailUrl", "url", "image", "logo", "embedUrl"]);
  for (const [id, node] of reachable) {
    for (const [key, value] of Object.entries(node)) {
      if (!graphMediaKeys.has(key)) continue;
      for (const scalar of values(value)) if (typeof scalar === "string")
        for (const file of mediaUrls(scalar, canonicalUrl)) add(file, `graph:${id}:${key}`);
    }
  }
  for (const alias of aliases) {
    const source = `/${alias.path}`;
    if (uses.has(source)) add(`/${alias.target}`, `alias:${source}`);
    else throw new Error(`Unconsumed stable media alias: ${source}`);
  }
  const orphaned = [...physicalPaths].filter((file) => !uses.has(file));
  if (orphaned.length) throw new Error(`Orphan media without a reachable consumer:\n${orphaned.join("\n")}`);
  return { uses, reachableGraphNodes: reachable.size };
}

async function importedSourceFiles(root) {
  const pending = (await walkFiles(path.join(root, "src/pages"))).filter((file) => /\.(?:astro|[cm]?[jt]s)$/.test(file));
  const seen = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const text = await readFile(file, "utf8");
    const imports = [...text.matchAll(/\b(?:import|export)\s+(?:[^;]*?\s+from\s*)?["']([^"']+)["']/g), ...text.matchAll(/@import\s+["']([^"']+)["']/g)];
    for (const [, specifier] of imports) {
      if (!specifier.startsWith(".")) continue;
      const candidate = path.resolve(path.dirname(file), specifier.split("?")[0]);
      if (!candidate.startsWith(path.join(root, "src") + path.sep)) continue;
      const candidates = path.extname(candidate) ? [candidate] : [candidate, ...[".ts", ".mjs", ".js", ".json", "/index.ts"].map((suffix) => candidate + suffix)];
      let resolved;
      for (const item of candidates) if (await stat(item).then((info) => info.isFile()).catch(() => false)) { resolved = item; break; }
      if (!resolved) throw new Error(`Media consumer import cannot resolve: ${file}:${specifier}`);
      if (!/\.jsonld$/.test(resolved)) pending.push(resolved);
    }
  }
  return [...seen].sort();
}

function scriptStrings(text) {
  const strings = [];
  const ast = ts.createSourceFile("consumer.ts", text, ts.ScriptTarget.Latest, true);
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) strings.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return strings;
}

export async function inspectSourceMedia(root) {
  const publicRoot = path.join(root, "public");
  const physicalFiles = (await walkFiles(publicRoot)).filter((file) => mediaPattern.test(file));
  const physicalPaths = new Set(physicalFiles.map((file) => `/${path.relative(publicRoot, file).replaceAll(path.sep, "/")}`));
  const [release, graph, stable] = await Promise.all(["release.json", "semantic/knowledge-graph.jsonld", "stable-media-aliases.json"].map(async (file) => JSON.parse(await readFile(path.join(root, "src/data", file), "utf8"))));
  const sourceFiles = await importedSourceFiles(root);
  sourceFiles.push(path.join(root, "src/content-source/page.md"));
  const consumers = [];
  let webmanifestLinked = false;
  for (const file of sourceFiles) {
    const text = await readFile(file, "utf8");
    const source = path.relative(root, file).replaceAll(path.sep, "/");
    let paths = new Set(), graphIds = new Set();
    if (/\.(?:astro|md|html)$/.test(file)) {
      paths = htmlMediaUrls(text, release.canonicalUrl);
      graphIds = htmlGraphReferences(text, release.canonicalUrl);
      const frontmatter = text.match(/^---\s*\n([\s\S]*?)\n---/);
      for (const literal of scriptStrings(frontmatter?.[1] ?? ""))
        for (const url of mediaUrls(literal, release.canonicalUrl)) paths.add(url);
    } else if (/\.css$/.test(file)) {
      for (const match of text.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/url\(([^)]+)\)/g))
        for (const url of mediaUrls(match[1], release.canonicalUrl)) paths.add(url);
    } else if (/\.json$/.test(file) && !inventoryOnlySources.has(source)) {
      paths = mediaUrls(JSON.stringify(JSON.parse(text)), release.canonicalUrl);
    } else if (!inventoryOnlySources.has(source)) {
      for (const literal of scriptStrings(text))
        for (const url of mediaUrls(literal, release.canonicalUrl)) paths.add(url);
    }
    if (text.includes("/site.webmanifest")) webmanifestLinked = true;
    consumers.push({ source, paths, graphIds });
  }
  if (webmanifestLinked) {
    const manifest = JSON.parse(await readFile(path.join(publicRoot, "site.webmanifest"), "utf8"));
    const icons = [...values(manifest.icons), ...values(manifest.shortcuts).flatMap((shortcut) => values(shortcut.icons))];
    consumers.push({ source: "public/site.webmanifest:icons", paths: mediaUrls(icons.map((icon) => icon.src).join("\n"), release.canonicalUrl) });
  }
  const result = validateMediaUsage({ physicalPaths, consumers, graph, rootIds: [`${release.canonicalUrl}#webpage`, release.primaryEntity.id], aliases: stable.aliases, canonicalUrl: release.canonicalUrl });
  return { ...result, physicalFiles, physicalPaths, consumers, sourceFiles, aliases: stable.aliases };
}
