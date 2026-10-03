import { URL_ARCHITECTURE, resolveContentUrl } from "../../src/lib/url-architecture.mjs";
import { contentAliasTargets } from "./redirect-registry.mjs";

/** Keep the reader's DOM lookup map small; HTTP handles the retired route set. */
export function readerRouteAliases(legacyRows, machinePaths, { policy = URL_ARCHITECTURE } = {}) {
  const aliases = contentAliasTargets(legacyRows.map((row) => ({
    ...row, target: resolveContentUrl(row.target, { policy }),
  })), machinePaths);
  for (const resource of policy.resources) {
    if (resource.path === "/" || resource.path === "/" + resource.htmlId) continue;
    const target = "/#" + encodeURIComponent(resource.htmlId);
    if (Object.hasOwn(aliases, resource.path) && aliases[resource.path] !== target)
      throw new Error("Canonical reader target disagrees with a legacy alias: " + resource.path);
    aliases[resource.path] = target;
  }
  return aliases;
}
