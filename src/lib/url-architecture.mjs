import architecture from "../data/url-architecture.json" with { type: "json" };

const pathPattern = /^(?:\/|\/[A-Za-z0-9][A-Za-z0-9._-]*)$/;
const scopes = new Set(["topic", "hub", "profile", "contact", "language", "media"]);
const freeze = (value) => {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

/** Validate canonical documents and in-document fragment ownership only. */
export function assertUrlArchitecture(policy) {
  if (policy?.schemaVersion !== 1 || !Array.isArray(policy.resources) || !policy.resources.length)
    throw new Error("Invalid URL architecture policy");
  if (Object.hasOwn(policy, "decisions") || Object.hasOwn(policy, "retiredPaths"))
    throw new Error("URL architecture must not encode HTTP redirect history");
  const canonical = new URL(policy.canonicalOrigin);
  if (canonical.origin !== policy.canonicalOrigin || canonical.protocol !== "https:" ||
      canonical.pathname !== "/" || canonical.search || canonical.hash)
    throw new Error("URL architecture requires an HTTPS canonical origin");

  const resources = new Map();
  const ids = new Set();
  for (const resource of policy.resources) {
    if (!pathPattern.test(resource.path) || resources.has(resource.path) ||
        typeof resource.htmlId !== "string" || !resource.htmlId || ids.has(resource.htmlId) ||
        !scopes.has(resource.scope) || !resource.reason || !resource.title)
      throw new Error("Invalid or duplicate canonical resource: " + resource.path);
    resources.set(resource.path, resource);
    ids.add(resource.htmlId);
  }
  if (!resources.has("/")) throw new Error("URL architecture requires the comprehensive homepage");

  if (!policy.htmlIdTargets || typeof policy.htmlIdTargets !== "object" || Array.isArray(policy.htmlIdTargets))
    throw new Error("URL architecture lacks authored fragment targets");
  for (const [id, target] of Object.entries(policy.htmlIdTargets)) {
    if (!id || /[\s#\u0000-\u001f\u007f]/u.test(id))
      throw new Error("Invalid authored fragment ID: " + id);
    if (typeof target !== "string" || !target.startsWith("/") || target.startsWith("//") ||
        /[\s\u0000-\u001f\u007f]/u.test(target))
      throw new Error("Invalid content target: " + target);
    const parsed = new URL(target, policy.canonicalOrigin);
    if (parsed.origin !== policy.canonicalOrigin || parsed.search || !resources.has(parsed.pathname))
      throw new Error("Content target has no canonical owner: " + target);
    if (parsed.hash && decodeURIComponent(parsed.hash.slice(1)) !== id)
      throw new Error("Authored fragment target changes its ID: " + id);
    if (!parsed.hash && resources.get(parsed.pathname)?.htmlId !== id)
      throw new Error("Authored target differs from its resource: " + id);
  }
  for (const resource of policy.resources)
    if (policy.htmlIdTargets[resource.htmlId] !== resource.path)
      throw new Error("Canonical resource lacks its authored target: " + resource.path);
  return true;
}

assertUrlArchitecture(architecture);
export const URL_ARCHITECTURE = freeze(architecture);

export function canonicalPaths(policy = URL_ARCHITECTURE) {
  return policy.resources.map((resource) => resource.path);
}

/** Validate either the canonical document inventory or the authored HTML-ID inventory. */
export function assertCoverage(paths, policy = URL_ARCHITECTURE) {
  assertUrlArchitecture(policy);
  const values = [...paths].map((value) => typeof value === "string" ? value : value.path);
  if (values.length && values.every((value) => !value.startsWith("/")))
    return assertHtmlTargets(values, policy);
  const actual = new Set(values);
  if ([...actual].some((path) => !pathPattern.test(path)))
    throw new Error("Invalid canonical path in URL coverage");
  const expected = new Set(canonicalPaths(policy));
  const missing = [...expected].filter((path) => !actual.has(path));
  const extra = [...actual].filter((path) => !expected.has(path));
  if (missing.length || extra.length)
    throw new Error("URL architecture coverage drift; missing: " + missing.join(", ") + "; unexpected: " + extra.join(", "));
  return true;
}

/** Validate the current authored anchor inventory. */
export function assertHtmlTargets(ids, policy = URL_ARCHITECTURE) {
  assertUrlArchitecture(policy);
  const actual = new Set(ids);
  const mapped = new Set(Object.keys(policy.htmlIdTargets));
  const missing = [...actual].filter((id) => !mapped.has(id));
  const stale = [...mapped].filter((id) => !actual.has(id));
  if (missing.length || stale.length)
    throw new Error("Authored HTML target inventory drift; missing: " + missing.join(", ") + "; stale: " + stale.join(", "));
  for (const resource of policy.resources)
    if (!actual.has(resource.htmlId)) throw new Error("Canonical resource target is absent: " + resource.path);
  for (const [id, target] of Object.entries(policy.htmlIdTargets)) {
    const parsed = new URL(target, policy.canonicalOrigin);
    if (parsed.hash && !actual.has(id))
      throw new Error("Authored fragment target is absent: " + id);
  }
  return true;
}

/** Resolve an authored HTML ID to its canonical document/fragment owner. */
export function urlForHtmlId(htmlId, policy = URL_ARCHITECTURE) {
  const id = String(htmlId ?? "").replace(/^#/, "");
  if (!id) return "/";
  if (/[\s#\u0000-\u001f\u007f]/u.test(id)) throw new Error("Invalid HTML target ID: " + id);
  return Object.hasOwn(policy.htmlIdTargets, id) ? policy.htmlIdTargets[id] : "/#" + encodeURIComponent(id);
}

/**
 * Resolve an authored local reference to the canonical document/fragment that owns
 * it. This is semantic/content normalization only; it does not create an HTTP route.
 */
export function resolveContentUrl(value, { absolute = false, policy = URL_ARCHITECTURE } = {}) {
  if (typeof value !== "string" || !value) return value;
  let url;
  try { url = new URL(value, policy.canonicalOrigin + "/"); }
  catch { return value; }
  if (url.origin !== policy.canonicalOrigin) return value;

  const normalizedPath = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
  const canonical = new Set(canonicalPaths(policy));
  let target;

  if (url.hash) {
    let id;
    try { id = decodeURIComponent(url.hash.slice(1)); }
    catch { id = url.hash.slice(1); }
    if (Object.hasOwn(policy.htmlIdTargets, id)) target = policy.htmlIdTargets[id];
  }
  if (!target && !canonical.has(normalizedPath)) {
    const id = normalizedPath.slice(1);
    if (id && Object.hasOwn(policy.htmlIdTargets, id)) target = policy.htmlIdTargets[id];
  }
  if (!target && canonical.has(normalizedPath)) target = normalizedPath + url.hash;
  if (!target) return value;

  const resolved = new URL(target, policy.canonicalOrigin);
  resolved.search = url.search;
  return absolute ? resolved.href : resolved.pathname + resolved.search + resolved.hash;
}

/**
 * Normalize authored browser navigation. A same-document ID may use a root
 * fragment in the comprehensive reader without inventing a slash-path alias.
 */
export function sourceNavigationUrl(value, { absolute = false, policy = URL_ARCHITECTURE } = {}) {
  if (typeof value !== "string" || !value) return value;
  let url;
  try { url = new URL(value, policy.canonicalOrigin + "/"); }
  catch { return value; }
  if (url.origin !== policy.canonicalOrigin) return value;
  const normalizedPath = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");

  if (normalizedPath === "/" && url.hash) {
    const resolved = new URL("/", policy.canonicalOrigin);
    resolved.search = url.search;
    resolved.hash = url.hash;
    return absolute ? resolved.href : resolved.pathname + resolved.search + resolved.hash;
  }

  const canonical = new Set(canonicalPaths(policy));
  if (!canonical.has(normalizedPath)) {
    const id = normalizedPath.slice(1);
    if (id && Object.hasOwn(policy.htmlIdTargets, id)) {
      const resolved = new URL("/#" + encodeURIComponent(id), policy.canonicalOrigin);
      resolved.search = url.search;
      return absolute ? resolved.href : resolved.pathname + resolved.search + resolved.hash;
    }
  }
  return resolveContentUrl(value, { absolute, policy });
}
