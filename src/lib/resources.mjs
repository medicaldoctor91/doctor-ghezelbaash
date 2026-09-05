import registry from "../data/machine-resources.json" with { type: "json" };

export const quoteHttpParameter = (value) => {
  if (typeof value !== "string" || /[\r\n\u0000-\u001f\u007f]/.test(value))
    throw new Error("HTTP parameter must be a printable string");
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
};
export const resourceContentType = (resource) => {
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(resource.mediaType))
    throw new Error(`Machine resource requires a bare media type: ${resource.path}`);
  if (!resource.profileIri) return resource.mediaType;
  if (!/^https?:\/\/[^\s"<>]+$/.test(resource.profileIri))
    throw new Error(`Invalid machine resource profile IRI: ${resource.path}`);
  return `${resource.mediaType}; profile=${quoteHttpParameter(resource.profileIri)}`;
};

const resources = registry.resources.map((resource) =>
  Object.freeze({
    ...resource,
    contentType: resourceContentType(resource),
    targets: Object.freeze([...resource.targets]),
    descriptorRoles: Object.freeze([...(resource.descriptorRoles || [])]),
    ...(resource.head ? { head: Object.freeze({ ...resource.head }) } : {}),
  }),
);
const paths = new Set(resources.map((resource) => resource.path));
if (paths.size !== resources.length)
  throw new Error("Duplicate machine resource path");
if (
  resources.some(
    (resource) =>
      !resource.path ||
      !resource.source ||
      !resource.mediaType ||
      !resource.targets.length,
  )
)
  throw new Error("Incomplete machine resource registry entry");
const distributionIris = resources.map((resource) => resource.distributionIri).filter(Boolean);
if (new Set(distributionIris).size !== distributionIris.length)
  throw new Error("Duplicate machine distribution IRI");
for (const resource of resources) {
  if (resource.distributionIri && !/^https?:\/\/[^\s"<>]+#.+$/.test(resource.distributionIri))
    throw new Error(`Invalid distribution IRI: ${resource.path}`);
  if (resource.descriptorRoles.some((role) => !["dcat", "data-package", "croissant"].includes(role)))
    throw new Error(`Unknown descriptor role: ${resource.path}`);
  if (resource.descriptorRoles.length && (!resource.distributionIri || !resource.descriptorTitle))
    throw new Error(`Descriptor resource lacks identity or title: ${resource.path}`);
}

export const MACHINE_RESOURCES = Object.freeze(resources);
export const machineResourceForPath = (resourcePath) => {
  const resource = MACHINE_RESOURCES.find((item) => item.path === resourcePath);
  if (!resource) throw new Error(`Unknown machine resource: ${resourcePath}`);
  return resource;
};
export const resourcesForTarget = (target) =>
  Object.freeze(
    MACHINE_RESOURCES.filter((resource) => resource.targets.includes(target)),
  );
export const sourceForDistribution = (resource, dist = "dist") =>
  resource.targets.includes("website")
    ? `${String(dist).replace(/[\\/]+$/, "")}/${resource.path}`
    : resource.source;

export const STATIC_ARTIFACTS = Object.freeze(
  MACHINE_RESOURCES.filter((resource) => resource.materialize).map((resource) =>
    Object.freeze({
      source: resource.source,
      path: resource.path,
      mediaType: resource.mediaType,
      contentType: resource.contentType,
      ...(resource.head?.rel ? { headRel: resource.head.rel } : {}),
      ...(resource.head?.title ? { headTitle: resource.head.title } : {}),
      ...(resource.footerLabel ? { footerLabel: resource.footerLabel } : {}),
    }),
  ),
);

const byRoute = new Map(
  STATIC_ARTIFACTS.map((resource) => [`/${resource.path}`, resource]),
);
if (byRoute.size !== STATIC_ARTIFACTS.length)
  throw new Error("Duplicate static resource route");
export const staticArtifactForRoute = (route) =>
  byRoute.get(String(route)) ?? null;
export const HEAD_RESOURCES = Object.freeze(
  STATIC_ARTIFACTS.filter((resource) => "headRel" in resource),
);
export const FOOTER_RESOURCES = Object.freeze(
  STATIC_ARTIFACTS.filter((resource) => "footerLabel" in resource),
);
