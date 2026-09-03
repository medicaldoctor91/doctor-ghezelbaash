import { readFile } from "node:fs/promises";
import { nodeTypes, refIds } from "./lib/projection-context.mjs";

const fail = (message) => {
  throw new Error(message);
};
const asArray = (value) =>
  Array.isArray(value) ? value : value == null ? [] : [value];
const refId = (value) =>
  value && typeof value === "object" && typeof value["@id"] === "string"
    ? value["@id"]
    : typeof value === "string"
      ? value
      : null;
const exactTypes = (node, expected) => {
  const actual = [...new Set(nodeTypes(node))].sort();
  const wanted = [...expected].sort();
  return (
    actual.length === wanted.length &&
    actual.every((value, index) => value === wanted[index])
  );
};
const includesRef = (value, id) => asArray(value).some((item) => refId(item) === id);
const collectPrefixedKeys = (value, currentPath = "$") => {
  if (Array.isArray(value))
    return value.flatMap((item, index) =>
      collectPrefixedKeys(item, `${currentPath}[${index}]`),
    );
  if (!value || typeof value !== "object") return [];
  const offenders = [];
  for (const [key, nested] of Object.entries(value)) {
    const next = `${currentPath}.${key}`;
    if (!key.startsWith("@") && key.includes(":")) offenders.push(next);
    offenders.push(...collectPrefixedKeys(nested, next));
  }
  return offenders;
};
const assertSchemaContext = (document, label) => {
  const context = document?.["@context"];
  if (
    !context ||
    context["@version"] !== 1.1 ||
    context["@vocab"] !== "https://schema.org/" ||
    context.schema !== "https://schema.org/"
  )
    fail(`${label} lacks the canonical Schema.org 1.1 context`);
  for (const [key, value] of Object.entries(context)) {
    if (["@version", "@vocab", "schema"].includes(key)) continue;
    if (
      !value ||
      typeof value !== "object" ||
      typeof value["@id"] !== "string" ||
      !value["@id"].startsWith("https://schema.org/")
    )
      fail(`${label} context leaks a non-Schema mapping: ${key}`);
  }
};
const byId = (document) =>
  new Map((document?.["@graph"] || []).map((node) => [node?.["@id"], node]));

const [release, canonical, head, support] = await Promise.all([
  readFile("src/data/release.json", "utf8").then(JSON.parse),
  readFile("src/data/semantic/knowledge-graph.jsonld", "utf8").then(JSON.parse),
  readFile(".generated/semantic/head-graph.json", "utf8").then(JSON.parse),
  readFile(".generated/semantic/support-graph.json", "utf8").then(JSON.parse),
]);

assertSchemaContext(head, "Head");
assertSchemaContext(support, "Support");
for (const [label, document] of [
  ["Head", head],
  ["Support", support],
]) {
  const prefixedKeys = collectPrefixedKeys(document["@graph"] || []);
  if (prefixedKeys.length)
    fail(
      `${label} Google-facing JSON-LD contains unresolved/non-Schema prefixed properties: ${prefixedKeys.join(", ")}`,
    );
}

const canonicalById = byId(canonical),
  headById = byId(head),
  supportById = byId(support),
  physicianId = release.primaryEntity.id,
  clinicId = release.clinic.id,
  canonicalPhysician = canonicalById.get(physicianId),
  homepagePhysician = headById.get(physicianId),
  homepageClinic = headById.get(clinicId);
if (!canonicalPhysician || !homepagePhysician || !homepageClinic)
  fail("Canonical/homepage physician or clinic node is missing");

// Preserve the complete canonical medical model while presenting Google's
// ProfilePage mainEntity as an unambiguous Person. IndividualPhysician inherits
// Organization/LocalBusiness/Place in Schema.org, so it must not type the same
// homepage mainEntity that Google is expected to resolve as a person.
if (
  !nodeTypes(canonicalPhysician).includes("Person") ||
  !nodeTypes(canonicalPhysician).includes("IndividualPhysician")
)
  fail("Canonical physician lost Person + IndividualPhysician semantics");
for (const property of ["practicesAt", "medicalSpecialty", "availableService"])
  if (!Object.hasOwn(canonicalPhysician, property))
    fail(`Canonical physician lost medical provider property ${property}`);
if (!exactTypes(homepagePhysician, ["Person"]))
  fail(
    `Google-facing physician must be exactly Person, received ${nodeTypes(homepagePhysician).join(", ") || "none"}`,
  );
for (const property of [
  "areaServed",
  "availableService",
  "medicalSpecialty",
  "practicesAt",
  "priceRange",
])
  if (Object.hasOwn(homepagePhysician, property))
    fail(`Google-facing Person carries provider/business-only property ${property}`);

for (const property of ["worksFor", "affiliation", "workLocation", "owns"])
  if (!includesRef(homepagePhysician[property], clinicId))
    fail(`Google-facing Person lost physician→clinic relation ${property}`);
for (const property of ["owner", "founder", "employee"])
  if (!includesRef(homepageClinic[property], physicianId))
    fail(`Google-facing clinic lost clinic→physician relation ${property}`);
if (!nodeTypes(homepageClinic).includes("MedicalClinic"))
  fail("Google-facing clinic lost MedicalClinic type");
if (nodeTypes(homepageClinic).includes("Person"))
  fail("Google-facing clinic is incorrectly typed as Person");

const requiredPersonIdentifiers = [
  "https://www.ghezelbaash.ir/#identifier-person-google-kgid",
  "https://www.ghezelbaash.ir/#identifier-person-wikidata",
  "https://www.ghezelbaash.ir/#identifier-person-irimc",
  "https://www.ghezelbaash.ir/#identifier-person-orcid",
];
for (const id of requiredPersonIdentifiers)
  if (!refIds(homepagePhysician.identifier).includes(id))
    fail(`Google-facing Person lost identity identifier ${id}`);
for (const url of [
  "https://www.wikidata.org/entity/Q140287622",
  "https://orcid.org/0009-0001-9346-8475",
])
  if (!asArray(homepagePhysician.sameAs).includes(url))
    fail(`Google-facing Person lost identity sameAs ${url}`);

const supportServices = [...supportById.values()].filter((node) =>
  nodeTypes(node).includes("Service"),
);
if (supportServices.length < 30)
  fail(`Google-facing service graph unexpectedly sparse: ${supportServices.length}`);
for (const service of supportServices)
  if (!includesRef(service.provider, physicianId))
    fail(`Service lost direct physician provider relation: ${service["@id"]}`);

const eventTypes = new Set(["CourseInstance", "EventSeries", "Festival", "Hackathon"]);
const isEventType = (type) =>
  type === "Event" ||
  (typeof type === "string" && type.endsWith("Event")) ||
  eventTypes.has(type);
for (const [label, document] of [
  ["Head", head],
  ["Support", support],
]) {
  const events = (document["@graph"] || []).filter((node) =>
    nodeTypes(node).some(isEventType),
  );
  if (events.length)
    fail(`${label} homepage graph exposes Event-family nodes`);
}

console.log(
  JSON.stringify(
    {
      googleStructuredData: "PASS",
      canonicalPhysicianTypes: nodeTypes(canonicalPhysician),
      homepagePhysicianTypes: nodeTypes(homepagePhysician),
      homepageClinicTypes: nodeTypes(homepageClinic),
      directPhysicianServiceProviders: supportServices.length,
      unresolvedPrefixedProperties: false,
      homepageEventCandidates: false,
    },
    null,
    2,
  ),
);
