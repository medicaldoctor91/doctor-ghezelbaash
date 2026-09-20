import path from "node:path";
import { readFile } from "node:fs/promises";

const REDIRECT_REGISTRY_PATH = "src/data/redirects.json";

export async function loadRedirectRegistry(root = process.cwd()) {
  const registry = JSON.parse(
    await readFile(path.join(root, REDIRECT_REGISTRY_PATH), "utf8"),
  );
  if (registry.schemaVersion !== 3)
    throw new Error(
      `Unsupported redirect registry schema ${registry.schemaVersion}`,
    );
  if (
    registry.zone !== "ghezelbaash.ir" ||
    registry.canonicalOrigin !== "https://www.ghezelbaash.ir"
  )
    throw new Error("Redirect registry authority drift");
  return registry;
}

export function canonicalHostRedirectRows(registry) {
  const surface = registry.canonicalHostRedirects;
  if (
    surface?.host !== "www.ghezelbaash.ir" ||
    !Array.isArray(surface.rules) ||
    !surface.rules.length
  )
    throw new Error("Canonical-host redirect surface is missing");
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
        `Invalid canonical-host redirect source at index ${index}: ${rule?.source}`,
      );
    if (seen.has(rule.source))
      throw new Error(
        `Duplicate canonical-host redirect source: ${rule.source}`,
      );
    seen.add(rule.source);
    if (
      typeof rule.target !== "string" ||
      !rule.target.startsWith("/") ||
      rule.target.startsWith("//") ||
      /[\s]/u.test(rule.target)
    )
      throw new Error(`Invalid canonical-host redirect target: ${rule.target}`);
    const target = new URL(rule.target, registry.canonicalOrigin);
    if (target.origin !== registry.canonicalOrigin || target.search)
      throw new Error(
        `Canonical-host redirect target escaped its scope: ${rule.target}`,
      );
    if (rule.statusCode !== 301)
      throw new Error(
        `Canonical-host redirect must be permanent: ${rule.source}`,
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
      normalizedRedirectPath(source, registry.canonicalOrigin) ===
      normalizedRedirectPath(row.target, registry.canonicalOrigin)
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

export function renderCanonicalHostRedirects(registry) {
  return (
    canonicalHostRedirectRows(registry)
      .map(
        ({ source, target, statusCode }) => `${source} ${target} ${statusCode}`,
      )
      .join("\n") + "\n"
  );
}

export function normalizedRedirectPath(
  value,
  origin = "https://www.ghezelbaash.ir",
) {
  return decodeURI(new URL(value, origin).pathname);
}
