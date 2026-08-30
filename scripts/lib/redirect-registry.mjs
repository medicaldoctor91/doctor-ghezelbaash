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
  singleRedirectRows(registry);
  return registry;
}

const apexTargetExpression = (registry) =>
  `concat("${registry.canonicalOrigin}", http.request.uri.path)`;

export function singleRedirectRows(registry) {
  const surface = registry.singleRedirects;
  if (
    surface?.cloudflareProduct !== "Single Redirects" ||
    surface.planRuleLimit !== 10 ||
    !Array.isArray(surface.rules) ||
    !surface.rules.length ||
    surface.rules.length > surface.planRuleLimit
  )
    throw new Error("Invalid Single Redirect registry");
  const refs = new Set();
  const hosts = new Set();
  const rows = surface.rules.map((rule, index) => {
    if (
      !rule ||
      typeof rule.ref !== "string" ||
      !/^[a-z0-9_]+$/.test(rule.ref) ||
      refs.has(rule.ref)
    )
      throw new Error(
        `Invalid Single Redirect ref at index ${index}: ${rule?.ref}`,
      );
    refs.add(rule.ref);
    if (
      typeof rule.host !== "string" ||
      (rule.host !== registry.zone &&
        !rule.host.endsWith(`.${registry.zone}`)) ||
      hosts.has(rule.host)
    )
      throw new Error(
        `Invalid Single Redirect host at index ${index}: ${rule?.host}`,
      );
    hosts.add(rule.host);
    if (
      rule.match !== "allPaths" ||
      rule.statusCode !== 301 ||
      typeof rule.preserveQueryString !== "boolean"
    )
      throw new Error(`Invalid Single Redirect behavior: ${rule.ref}`);
    const hasTarget = Object.hasOwn(rule, "target");
    const hasExpression = Object.hasOwn(rule, "targetExpression");
    if (hasTarget === hasExpression)
      throw new Error(
        `Single Redirect must declare one target form: ${rule.ref}`,
      );
    if (hasTarget) {
      const target = new URL(rule.target);
      if (target.protocol !== "https:" || target.username || target.password)
        throw new Error(`Invalid Single Redirect target: ${rule.ref}`);
    } else if (
      rule.host !== registry.zone ||
      rule.targetExpression !== apexTargetExpression(registry) ||
      rule.preserveQueryString !== true
    ) {
      throw new Error(`Invalid apex redirect expression: ${rule.ref}`);
    }
    return { ...rule };
  });
  if (rows.filter((rule) => rule.host === registry.zone).length !== 1)
    throw new Error("Apex redirect registry is missing or ambiguous");
  return rows;
}

export function resolveSingleRedirectTarget(registry, rule, source) {
  const request = new URL(source);
  if (request.hostname !== rule.host)
    throw new Error(
      `Single Redirect source host mismatch: ${request.hostname}`,
    );
  const target = Object.hasOwn(rule, "target")
    ? new URL(rule.target)
    : new URL(request.pathname, registry.canonicalOrigin);
  if (rule.preserveQueryString) target.search = request.search;
  return target.href;
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
  return surface.rules.map((rule, index) => {
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

export function projectGithubPagesBridge(registry) {
  const surface = registry.githubPagesBridge;
  if (
    !surface ||
    !Array.isArray(surface.humanRoutes) ||
    !surface.humanRoutes.length ||
    !Array.isArray(surface.machineRoutes) ||
    !surface.machineRoutes.length
  )
    throw new Error("GitHub Pages bridge routes are missing");
  const canonical = new URL("/", registry.canonicalOrigin).href;
  const origin = new URL(surface.origin);
  if (
    origin.protocol !== "https:" ||
    origin.search ||
    origin.hash ||
    origin.href !== surface.origin ||
    !origin.pathname.endsWith("/")
  )
    throw new Error("Invalid GitHub Pages bridge origin");
  const paths = new Set(["404.html", "llms.txt", "nap.csv", ".nojekyll"]);
  const projectPath = (value, type, index) => {
    if (
      typeof value !== "string" ||
      !value ||
      value.startsWith("/") ||
      value.includes("..") ||
      value.includes("//") ||
      !/^[a-z0-9._/-]+$/i.test(value)
    )
      throw new Error(
        `Invalid ${type} GitHub Pages bridge path at index ${index}: ${value}`,
      );
    if (paths.has(value))
      throw new Error(`Duplicate GitHub Pages bridge path: ${value}`);
    paths.add(value);
    return value;
  };
  const projectTarget = (value, type, index) => {
    if (
      typeof value !== "string" ||
      !value.startsWith("/") ||
      value.startsWith("//") ||
      /[\s?]/u.test(value)
    )
      throw new Error(
        `Invalid ${type} GitHub Pages bridge target at index ${index}: ${value}`,
      );
    const target = new URL(value, canonical);
    if (target.origin !== registry.canonicalOrigin)
      throw new Error(
        `GitHub Pages bridge target escaped the canonical origin: ${value}`,
      );
    if (type === "human" && target.pathname !== "/")
      throw new Error(
        `Human GitHub Pages bridge target must resolve to the canonical page: ${value}`,
      );
    if (type === "machine" && (target.pathname === "/" || target.hash))
      throw new Error(
        `Machine GitHub Pages bridge target must resolve to a canonical resource: ${value}`,
      );
    return target.href;
  };
  const humanRoutes = surface.humanRoutes.map((route, index) => {
    const routePath = projectPath(route?.path, "human", index);
    if (
      !routePath.endsWith(".html") ||
      typeof route.title !== "string" ||
      !route.title.trim()
    )
      throw new Error(
        `Invalid human GitHub Pages bridge route at index ${index}`,
      );
    return {
      path: routePath,
      target: projectTarget(route.target, "human", index),
      title: route.title,
    };
  });
  const machineRoutes = surface.machineRoutes.map((route, index) => {
    const routePath = projectPath(route?.path, "machine", index);
    if (!/\.json(?:ld)?$/.test(routePath))
      throw new Error(
        `Invalid machine GitHub Pages bridge route at index ${index}`,
      );
    return {
      path: routePath,
      target: projectTarget(route.target, "machine", index),
    };
  });
  if (
    !humanRoutes.some(
      (route) => route.path === "index.html" && route.target === canonical,
    )
  )
    throw new Error("GitHub Pages bridge root route is missing");
  return { canonical, origin: origin.href, humanRoutes, machineRoutes };
}
