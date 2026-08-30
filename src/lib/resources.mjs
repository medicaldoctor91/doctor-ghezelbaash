import registry from "../data/machine-resources.json" with { type: "json" };

const resources = registry.resources.map((resource) =>
  Object.freeze({
    ...resource,
    targets: Object.freeze([...resource.targets]),
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

export const MACHINE_RESOURCES = Object.freeze(resources);
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
