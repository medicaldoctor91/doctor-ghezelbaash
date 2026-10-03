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

/** Validate the finite publication policy without loading source facts or HTML. */
export function assertUrlArchitecture(policy) {
  if (policy?.schemaVersion !== 1 || !Array.isArray(policy.resources) ||
      !Array.isArray(policy.decisions) || !policy.resources.length)
    throw new Error("Invalid URL architecture policy");
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
  if (!Array.isArray(policy.retiredPaths) || new Set(policy.retiredPaths).size !== policy.retiredPaths.length ||
      policy.retiredPaths.some((path) => !pathPattern.test(path) || resources.has(path)))
    throw new Error("Invalid retired content paths");
  const retired = new Set(policy.retiredPaths);
  const decisions = new Map();
  const validateTarget = (target) => {
    if (typeof target !== "string" || !target.startsWith("/") ||
        target.startsWith("//") || /[\s\u0000-\u001f\u007f]/u.test(target))
      throw new Error("Invalid content target: " + target);
    const parsed = new URL(target, policy.canonicalOrigin);
    if (parsed.origin !== policy.canonicalOrigin || parsed.search || !resources.has(parsed.pathname))
      throw new Error("Content target has no canonical owner: " + target);
    return parsed;
  };
  for (const decision of policy.decisions) {
    if (!pathPattern.test(decision.path) || decisions.has(decision.path) ||
        !["KEEP", "301_REDIRECT"].includes(decision.decision) || !decision.reason)
      throw new Error("Invalid or duplicate URL decision: " + decision.path);
    validateTarget(decision.target);
    if (decision.decision === "KEEP") {
      if (!resources.has(decision.path) || decision.target !== decision.path)
        throw new Error("KEEP decision differs from its canonical resource: " + decision.path);
    } else if (resources.has(decision.path) || decision.target === decision.path) {
      throw new Error("Canonical resource cannot redirect: " + decision.path);
    }
    decisions.set(decision.path, decision);
  }
  for (const resource of policy.resources)
    if (decisions.get(resource.path)?.decision !== "KEEP")
      throw new Error("Canonical resource lacks a KEEP decision: " + resource.path);
  for (const path of policy.retiredPaths)
    if (decisions.get(path)?.decision !== "301_REDIRECT")
      throw new Error("Retired content path lacks its permanent redirect: " + path);
  if (!policy.htmlIdTargets || typeof policy.htmlIdTargets !== "object" || Array.isArray(policy.htmlIdTargets))
    throw new Error("URL architecture lacks authored fragment targets");
  for (const [id, target] of Object.entries(policy.htmlIdTargets)) {
    if (!id || /[\s#\u0000-\u001f\u007f]/u.test(id))
      throw new Error("Invalid authored fragment ID: " + id);
    const parsed = validateTarget(target);
    if (parsed.hash && decodeURIComponent(parsed.hash.slice(1)) !== id)
      throw new Error("Authored fragment target changes its ID: " + id);
    if (!parsed.hash && resources.get(parsed.pathname)?.htmlId !== id)
      throw new Error("Authored target differs from its resource: " + id);
  }
  for (const resource of policy.resources)
    if (policy.htmlIdTargets[resource.htmlId] !== resource.path)
      throw new Error("Canonical resource lacks its authored target: " + resource.path);
  for (const decision of policy.decisions) {
    if (decision.decision !== "301_REDIRECT" || retired.has(decision.path)) continue;
    const id = decision.path.slice(1);
    if (policy.htmlIdTargets[id] !== decision.target)
      throw new Error("Noncanonical authored path lacks its canonical owner mapping: " + decision.path);
  }
  return true;
}

assertUrlArchitecture(architecture);
export const URL_ARCHITECTURE = freeze(architecture);

export function canonicalPaths(policy = URL_ARCHITECTURE) {
  return policy.resources.map((resource) => resource.path);
}

/** Every authored target and explicitly retired path has one finite decision. */
export function assertCoverage(paths, policy = URL_ARCHITECTURE) {
  assertUrlArchitecture(policy);
  const values = [...paths].map((value) => typeof value === "string" ? value : value.path);
  if (values.length && values.every((value) => !value.startsWith("/")))
    return assertHtmlTargets(values, policy);
  const legacy = new Set(values);
  if ([...legacy].some((path) => !pathPattern.test(path)))
    throw new Error("Invalid legacy content path in URL coverage");
  const expected = new Set([...legacy, ...canonicalPaths(policy)]);
  const actual = new Set(policy.decisions.map((decision) => decision.path));
  const missing = [...expected].filter((path) => !actual.has(path));
  const extra = [...actual].filter((path) => !expected.has(path));
  if (missing.length || extra.length)
    throw new Error("URL architecture coverage drift; missing: " + missing.join(", ") + "; unexpected: " + extra.join(", "));
  return true;
}

/** Validate the current authored anchor inventory after source links are migrated. */
export function assertHtmlTargets(ids, policy = URL_ARCHITECTURE) {
  assertUrlArchitecture(policy);
  const actual = new Set(ids);
  const mapped = new Set(Object.keys(policy.htmlIdTargets));
  const missing = [...actual].filter((id) => !mapped.has(id));
  const stale = [...mapped].filter((id) => !actual.has(id));
  if (missing.length || stale.length)
    throw new Error("Authored HTML target inventory drift; missing: " + missing.join(", ") + "; stale: " + stale.join(", "));
  const resources = new Set(canonicalPaths(policy));
  const retired = new Set(policy.retiredPaths);
  for (const resource of policy.resources)
    if (!actual.has(resource.htmlId)) throw new Error("Canonical resource target is absent: " + resource.path);
  for (const decision of policy.decisions) {
    if (!resources.has(decision.path) && !retired.has(decision.path) && !actual.has(decision.path.slice(1)))
      throw new Error("URL decision has no authored or retired source: " + decision.path);
    const target = new URL(decision.target, policy.canonicalOrigin);
    if (target.hash && !actual.has(decodeURIComponent(target.hash.slice(1))))
      throw new Error("URL decision fragment is absent: " + decision.path);
  }
  return true;
}

/** Resolve an authored target to its retained canonical document and original fragment. */
export function urlForHtmlId(htmlId, policy = URL_ARCHITECTURE) {
  const id = String(htmlId ?? "").replace(/^#/, "");
  if (!id) return "/";
  if (/[\s#\u0000-\u001f\u007f]/u.test(id)) throw new Error("Invalid HTML target ID: " + id);
  return Object.hasOwn(policy.htmlIdTargets, id) ? policy.htmlIdTargets[id] : "/#" + encodeURIComponent(id);
}

/**
 * Resolve a known content URL to its semantic/canonical owner. External and
 * machine-resource URLs survive unchanged; queries survive one-hop resolution.
 */
export function resolveContentUrl(value, { absolute = false, policy = URL_ARCHITECTURE } = {}) {
  if (typeof value !== "string" || !value) return value;
  let url;
  try { url = new URL(value, policy.canonicalOrigin + "/"); }
  catch { return value; }
  if (url.origin !== policy.canonicalOrigin) return value;
  const normalizedPath = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
  const decision = policy.decisions.find((item) => item.path === normalizedPath);
  if (!decision) return value;
  let target;
  if (url.hash) {
    let id;
    try { id = decodeURIComponent(url.hash.slice(1)); }
    catch { id = url.hash.slice(1); }
    target = Object.hasOwn(policy.htmlIdTargets, id) ? policy.htmlIdTargets[id] : undefined;
    if (!target && decision) {
      const destination = new URL(decision.target, policy.canonicalOrigin);
      target = policy.retiredPaths?.includes(normalizedPath) ? decision.target : destination.pathname + url.hash;
    }
  } else if (decision) target = decision.target;
  if (!target) return value;
  const resolved = new URL(target, policy.canonicalOrigin);
  resolved.search = url.search;
  return absolute ? resolved.href : resolved.pathname + resolved.search + resolved.hash;
}

/**
 * Normalize authored browser links without changing semantic ownership. The 72
 * canonical resources retain their real paths. Subordinate authored path aliases
 * behave like the earlier one-page page.md links: they navigate to /#id in the
 * comprehensive reader. Canonical/discovery consumers continue to use
 * resolveContentUrl() and htmlIdTargets for the true owning document.
 */
export function sourceNavigationUrl(value, { absolute = false, policy = URL_ARCHITECTURE } = {}) {
  if (typeof value !== "string" || !value) return value;
  let url;
  try { url = new URL(value, policy.canonicalOrigin + "/"); }
  catch { return value; }
  if (url.origin !== policy.canonicalOrigin) return value;
  const normalizedPath = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");

  // Explicit same-reader anchors are already in their final browser form.
  if (normalizedPath === "/" && url.hash) {
    const resolved = new URL("/", policy.canonicalOrigin);
    resolved.search = url.search;
    resolved.hash = url.hash;
    return absolute ? resolved.href : resolved.pathname + resolved.search + resolved.hash;
  }

  const decision = policy.decisions.find((item) => item.path === normalizedPath);
  if (!decision) return value;
  const retired = policy.retiredPaths?.includes(normalizedPath);
  if (decision.decision === "301_REDIRECT" && !retired) {
    let id = normalizedPath.slice(1);
    if (url.hash) {
      try {
        const candidate = decodeURIComponent(url.hash.slice(1));
        if (Object.hasOwn(policy.htmlIdTargets, candidate)) id = candidate;
      } catch { /* Keep the path-derived authored ID. */ }
    }
    const resolved = new URL("/#" + encodeURIComponent(id), policy.canonicalOrigin);
    resolved.search = url.search;
    return absolute ? resolved.href : resolved.pathname + resolved.search + resolved.hash;
  }
  return resolveContentUrl(value, { absolute, policy });
}

/** Authored noncanonical paths are root-fragment navigation aliases, not HTTP resources. */
export function fragmentRows(policy = URL_ARCHITECTURE) {
  const retired = new Set(policy.retiredPaths);
  return policy.decisions
    .filter((decision) => decision.decision === "301_REDIRECT" && !retired.has(decision.path))
    .map((decision) => ({ source: decision.path, target: sourceNavigationUrl(decision.path, { policy }) }));
}

/** Only explicitly retired canonical-source paths are emitted as HTTP redirects. */
export function redirectRows(policy = URL_ARCHITECTURE) {
  const retired = new Set(policy.retiredPaths);
  return policy.decisions
    .filter((decision) => decision.decision === "301_REDIRECT" && retired.has(decision.path))
    .map((decision) => ({ source: decision.path, target: decision.target, statusCode: 301 }));
}
