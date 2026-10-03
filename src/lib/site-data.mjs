import { exactLanguageLiteral } from "./graph-core.mjs";
import { deriveCanonicalGraphFacts } from "./canonical-authority.mjs";
import { validateReputationObservation } from "./reputation-observation.mjs";

const faDigits = (value) =>
  String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
const exactText = (value, label) => {
  if (typeof value !== "string" || !value.length)
    throw new Error(`Canonical graph requires ${label}`);
  return value;
};
const normalizePhone = (value) => `+${String(value).replace(/\D/g, "")}`;
const groupLocalPhone = (value) =>
  `${value.slice(0, 4)} ${value.slice(4, 7)} ${value.slice(7)}`;
const groupInternationalPhone = (value) =>
  `+${value.slice(1, 3)} ${value.slice(3, 6)} ${value.slice(6, 9)} ${value.slice(9)}`;
const formatDate = (value, calendar) =>
  new Intl.DateTimeFormat(`fa-IR-u-ca-${calendar}`, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
const faNumber = (value, digits = 0) =>
  new Intl.NumberFormat("fa-IR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: true,
  }).format(Number(value));

function deriveSiteContactDataFromFacts(facts) {
  const { clinic, address } = facts;
  const phone = normalizePhone(clinic.telephone);
  if (!/^\+98\d{10}$/.test(phone))
    throw new Error(`Invalid canonical clinic telephone: ${clinic.telephone}`);
  const localPhone = `0${phone.slice(3)}`;
  const actions = [...new Set([clinic.potentialAction, facts.person.potentialAction].flat(2).map((ref) => ref?.["@id"]).filter(Boolean))].map((id) => facts.byId.get(id));
  const actionTarget = (type, recipient, predicate) => {
    const matches = actions.filter((node) => [node?.["@type"]].flat().includes(type) &&
      node.recipient?.["@id"] === recipient && predicate(node.target));
    if (matches.length !== 1) throw new Error(`Canonical action is ambiguous: ${type} ${recipient}`);
    return matches[0].target;
  };
  const chatUrl = actionTarget("CommunicateAction", facts.person["@id"], (target) => target?.startsWith("https://ig.me/"));
  const telHref = actionTarget("CommunicateAction", clinic["@id"], (target) => target?.startsWith("tel:"));
  const maps = actions.filter((node) => [node?.["@type"]].flat().includes("ViewAction") && node.object?.["@id"] === clinic["@id"]);
  if (maps.length !== 1) throw new Error("Canonical clinic map action is missing");
  const instagramUrl = facts.instagramUrl;
  const instagramHandle = new URL(instagramUrl).pathname
    .split("/")
    .filter(Boolean)[0];
  const clinicName = exactLanguageLiteral(
    clinic.name,
    "fa",
    "Canonical clinic name",
  );
  const locality = exactText(address.addressLocality, "clinic locality");
  const street = exactText(address.streetAddress, "clinic street address");
  const hoursOpenFa = faDigits(facts.clinicHours.open);
  const hoursCloseFa = faDigits(facts.clinicHours.close);

  const directions = new URL("https://www.google.com/maps/dir/");
  directions.searchParams.set("api", "1");
  directions.searchParams.set("destination", `${clinicName}، ${locality}`);
  directions.searchParams.set(
    "destination_place_id",
    facts.identifiers.clinic.placeId,
  );

  return Object.freeze({
    phone,
    telHref,
    phoneDisplay: faDigits(localPhone),
    phoneDisplayGrouped: faDigits(groupLocalPhone(localPhone)),
    phoneDisplayInternational: groupInternationalPhone(phone),
    instagramUrl,
    instagramHandle,
    chatUrl,
    mapsUrl: maps[0].target,
    directionsUrl: directions.toString(),
    clinicName,
    street,
    locality,
    postalCode: exactText(String(address.postalCode), "clinic postalCode"),
    hoursOpenFa,
    hoursCloseFa,
    hoursOpenCompactFa: hoursOpenFa.replace(":۰۰", ""),
    hoursCloseCompactFa: hoursCloseFa.replace(":۰۰", ""),
    medicalReviewedAt: facts.medicalReviewedAt,
    medicalReviewedPersian: formatDate(facts.medicalReviewedAt, "persian"),
    medicalReviewedGregorian: formatDate(facts.medicalReviewedAt, "gregory"),
  });
}

export function deriveSiteContactData(release, graph) {
  return deriveSiteContactDataFromFacts(deriveCanonicalGraphFacts(release, graph));
}

export function deriveSiteData(release, graph) {
  const facts = deriveCanonicalGraphFacts(release, graph);
  const contact = deriveSiteContactDataFromFacts(facts);
  const reputation = validateReputationObservation(graph, {
    canonicalUrl: release.canonicalUrl,
    clinic: {
      id: release.clinic.id,
      placeId: facts.identifiers.clinic.placeId,
    },
  });

  return Object.freeze({
    ...contact,
    googleRating: reputation.rating,
    googleRatingFa: faNumber(reputation.rating, 1),
    googleReputationObservedAt: reputation.valueObservedAt,
  });
}

