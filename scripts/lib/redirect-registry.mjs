import path from "node:path";
import { readFile } from "node:fs/promises";

const ALIAS_REGISTRY_PATH = "src/data/redirects.json";

export async function loadAliasRegistry(root = process.cwd()) {
  const registry = JSON.parse(
    await readFile(path.join(root, ALIAS_REGISTRY_PATH), "utf8"),
  );
  if (registry.schemaVersion !== 4)
    throw new Error(
      `Unsupported alias registry schema ${registry.schemaVersion}`,
    );
  if (
    registry.zone !== "ghezelbaash.ir" ||
    registry.canonicalOrigin !== "https://www.ghezelbaash.ir"
  )
    throw new Error("Alias registry authority drift");
  return registry;
}

export function canonicalHostAliasRows(registry) {
  const surface = registry.canonicalHostAliases;
  if (
    surface?.host !== "www.ghezelbaash.ir" ||
    !Array.isArray(surface.rules) ||
    !surface.rules.length
  )
    throw new Error("Canonical-host alias surface is missing");
  const seen = new Set();
  const rows = surface.rules.map((rule, index) => {
    if (
      !rule ||
      typeof rule.source !== "string" ||
      !rule.source.startsWith("/") ||
      rule.source.startsWith("//") ||
      /[\s?#]/u.test(rule.source)
    )
      throw new Error(
        `Invalid canonical-host alias source at index ${index}: ${rule?.source}`,
      );
    if (seen.has(rule.source))
      throw new Error(
        `Duplicate canonical-host alias source: ${rule.source}`,
      );
    seen.add(rule.source);
    if (
      typeof rule.target !== "string" ||
      !rule.target.startsWith("/") ||
      rule.target.startsWith("//") ||
      /[\s]/u.test(rule.target)
    )
      throw new Error(`Invalid canonical-host alias target: ${rule.target}`);
    const target = new URL(rule.target, registry.canonicalOrigin);
    if (target.origin !== registry.canonicalOrigin || target.search || target.hash)
      throw new Error(
        `Canonical-host alias target escaped its scope: ${rule.target}`,
      );
    const machineAlias = rule.target === "/graph.jsonld";
    const expectedStatus = machineAlias ? 200 : 301;
    if (rule.statusCode !== expectedStatus)
      throw new Error(
        machineAlias
          ? `Canonical graph alias must preserve its machine URL with a 200 rewrite: ${rule.source}`
          : `Canonical-host legacy alias must permanently redirect: ${rule.source}`,
      );
    return {
      source: rule.source,
      target: rule.target,
      statusCode: rule.statusCode,
    };
  });

  // Pages matches exact paths; registered directory aliases need both forms.
  // Keep explicit destinations and rule order, and never create a catchall.
  const bySource = new Map(rows.map((row) => [row.source, row]));
  return rows.flatMap((row) => {
    if (
      row.source === "/" ||
      !row.source.endsWith("/") ||
      /[*:]/u.test(row.source)
    )
      return [row];
    const source = row.source.slice(0, -1);
    if (
      normalizedAliasPath(source, registry.canonicalOrigin) ===
      normalizedAliasPath(row.target, registry.canonicalOrigin)
    )
      return [row];
    const existing = bySource.get(source);
    if (existing) {
      if (
        existing.target !== row.target ||
        existing.statusCode !== row.statusCode
      )
        throw new Error(
          `Canonical-host trailing-slash aliases disagree: ${source} and ${row.source}`,
        );
      return [row];
    }
    return [row, { ...row, source }];
  });
}

/**
 * Permanent legacy URLs must consolidate onto the promoted canonical surface,
 * not terminate at a focused route that is intentionally NOINDEX. Only actual
 * deployed content targets are changed. The nearest promoted authored ancestor
 * is used, with the original focused target preserved as a browser fragment so
 * direct-entry UX still lands on the same authored section or answer. Absence
 * of a promoted ancestor is an architecture error rather than a home fallback.
 */
export function consolidateContentRedirectTargets(rows, records, canonicalUrl) {
  if (!Array.isArray(rows) || !Array.isArray(records) || !records.length)
    throw new Error("Redirect consolidation requires rows and route records");
  const canonical = new URL(canonicalUrl);
  if (canonical.pathname !== "/" || canonical.search || canonical.hash)
    throw new Error("Redirect consolidation requires the canonical homepage URL");
  const byPath = new Map(records.map((record) => [record.path, record]));
  if (byPath.size !== records.length || records.some((record) => typeof record.indexable !== "boolean" || !record.navigation?.ancestors))
    throw new Error("Redirect consolidation requires uniquely classified authored routes");

  let retargeted = 0;
  const consolidatedRows = rows.map((row) => {
    if (![301, 308].includes(row.statusCode)) return { ...row };
    const targetUrl = new URL(row.target, canonical);
    if (targetUrl.origin !== canonical.origin || targetUrl.search || targetUrl.hash)
      throw new Error(`Permanent redirect target escaped canonical content scope: ${row.target}`);
    const target = byPath.get(targetUrl.pathname);
    if (!target || target.indexable) return { ...row };
    const ancestor = [...target.navigation.ancestors].reverse()
      .map((entry) => byPath.get(entry.path))
      .find((entry) => entry?.indexable);
    if (!ancestor)
      throw new Error(`NOINDEX redirect target has no promoted authored ancestor: ${row.source} -> ${row.target}`);
    retargeted++;
    return { ...row, target: `${ancestor.path}#${target.path.slice(1)}` };
  });
  return { rows: consolidatedRows, retargeted };
}

/** Render final Cloudflare rules: permanent content redirects plus exact machine rewrites. */
export function renderStaticRewrites(rows) {
  const sources = new Set();
  const lines = rows.map(({ source, target, statusCode }) => {
    if (!source?.startsWith("/") || source.startsWith("//") || /[\s?#\\*:]/u.test(source))
      throw new Error(`Invalid static alias source: ${source}`);
    if (!target?.startsWith("/") || target.startsWith("//") || /[\s\\]/u.test(target))
      throw new Error(`Invalid static rewrite destination: ${target}`);
    if (![200, 301, 308].includes(statusCode))
      throw new Error(`Unsupported static redirect/rewrite status: ${statusCode}`);
    if (sources.has(source)) throw new Error(`Duplicate static alias source: ${source}`);
    sources.add(source);
    const line = `${source} ${target} ${statusCode}`;
    if (line.length > 1_000)
      throw new Error(`Cloudflare _redirects line exceeds 1000 characters: ${source}`);
    return line;
  });
  if (lines.length > 2_000)
    throw new Error(`Cloudflare _redirects exceeds 2000 static rules: ${lines.length}`);
  return lines.join("\n") + "\n";
}

/** Metadata subjects are identifiers; their authoritative description is the graph. */
export function canonicalMetadataAliasRows(graph, canonicalUrl) {
  const origin = new URL(canonicalUrl).origin;
  // These two graph-only subjects are also advertised by the authored HTML head.
  const advertisedSubjects = new Set(["/website", "/medical-specialty-aesthetic-medicine"]);
  const paths = new Set();
  const collect = (value) => {
    if (Array.isArray(value)) return value.forEach(collect);
    if (!value || typeof value !== "object") return;
    const id = value["@id"];
    // Include actual named definitions, including nested provenance properties.
    // A reference consisting only of @id does not establish a new public route.
    if (typeof id === "string" && id.startsWith(`${origin}/`) &&
      Object.keys(value).some((key) => key !== "@id")) {
      const url = new URL(id);
      if (!url.search && !url.hash && (advertisedSubjects.has(url.pathname) ||
        /^\/(?:graph|provenance)\.jsonld\/[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/.test(url.pathname)))
        paths.add(url.pathname);
    }
    Object.values(value).forEach(collect);
  };
  collect(graph["@graph"]);
  return [...paths].sort().map((source) => ({ source, target: "/graph.jsonld", statusCode: 200 }));
}

export function normalizedAliasPath(
  value,
  origin = "https://www.ghezelbaash.ir",
) {
  return decodeURI(new URL(value, origin).pathname);
}

/** URL decoding must match browser pathname decoding without inventing routes. */
export function contentAliasTargets(rows, machinePaths) {
  const aliases = Object.create(null);
  for (const { source, target } of rows) {
    if (machinePaths.has(target)) continue;
    const key = normalizedAliasPath(source);
    if (Object.hasOwn(aliases, key) && aliases[key] !== target)
      throw new Error(`Decoded content aliases disagree: ${source}`);
    aliases[key] = target;
  }
  return aliases;
}
