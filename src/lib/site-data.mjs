import { exactLanguageLiteral } from "./semantic-projection.mjs";
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

export function deriveSiteData(release, graph) {
  const facts = deriveCanonicalGraphFacts(release, graph);
  const { clinic, address } = facts;
  const phone = normalizePhone(clinic.telephone);
  if (!/^\+98\d{10}$/.test(phone))
    throw new Error(`Invalid canonical clinic telephone: ${clinic.telephone}`);
  const localPhone = `0${phone.slice(3)}`;
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
  const reputation = validateReputationObservation(graph, {
    canonicalUrl: release.canonicalUrl,
    clinic: {
      id: release.clinic.id,
      placeId: facts.identifiers.clinic.placeId,
    },
  });

  const directions = new URL("https://www.google.com/maps/dir/");
  directions.searchParams.set("api", "1");
  directions.searchParams.set("destination", `${clinicName}، ${locality}`);
  directions.searchParams.set(
    "destination_place_id",
    facts.identifiers.clinic.placeId,
  );

  return Object.freeze({
    phone,
    telHref: `tel:${phone}`,
    phoneDisplay: faDigits(localPhone),
    phoneDisplayGrouped: faDigits(groupLocalPhone(localPhone)),
    phoneDisplayInternational: groupInternationalPhone(phone),
    instagramUrl,
    instagramHandle,
    chatUrl: `https://ig.me/m/${instagramHandle}`,
    mapsUrl: `https://www.google.com/maps?cid=${facts.identifiers.clinic.cid}`,
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
    googleRating: reputation.rating,
    googleRatingFa: faNumber(reputation.rating, 1),
    googleReviewCount: reputation.reviewCount,
    googleReviewCountFa: faNumber(reputation.reviewCount),
    googleReputationObservedAt: reputation.valueObservedAt,
  });
}

const siteTokenPattern = /{{(?:CLINIC_[A-Z0-9_]+|OFFICIAL_[A-Z0-9_]+)}}/g;

function siteTokenValues(site) {
  if (
    !site?.telHref ||
    !site?.instagramUrl ||
    !site?.chatUrl ||
    !site?.mapsUrl ||
    !site?.hoursOpenFa ||
    !site?.hoursCloseFa
  )
    throw new Error("Invalid canonical site token source");
  return Object.freeze({
    "{{CLINIC_TEL_HREF}}": site.telHref,
    "{{CLINIC_PHONE_FA}}": site.phoneDisplayGrouped,
    "{{CLINIC_PHONE_INTL}}": site.phoneDisplayInternational,
    "{{OFFICIAL_INSTAGRAM_URL}}": site.instagramUrl,
    "{{OFFICIAL_CHAT_URL}}": site.chatUrl,
    "{{CLINIC_MAPS_URL}}": site.mapsUrl,
    "{{CLINIC_POSTAL_CODE_FA}}": faDigits(site.postalCode),
    "{{CLINIC_HOURS_OPEN_FA}}": site.hoursOpenFa,
    "{{CLINIC_HOURS_CLOSE_FA}}": site.hoursCloseFa,
    "{{CLINIC_HOURS_OPEN_COMPACT_FA}}": site.hoursOpenCompactFa,
    "{{CLINIC_HOURS_CLOSE_COMPACT_FA}}": site.hoursCloseCompactFa,
    "{{CLINIC_GOOGLE_RATING_RAW}}": String(site.googleRating),
    "{{CLINIC_GOOGLE_RATING_FA}}": site.googleRatingFa,
    "{{CLINIC_GOOGLE_REVIEW_COUNT_RAW}}": String(site.googleReviewCount),
    "{{CLINIC_GOOGLE_REVIEW_COUNT_FA}}": site.googleReviewCountFa,
  });
}

export function bindSiteTokens(content, site) {
  const source = String(content);
  const values = siteTokenValues(site);
  const seen = new Set(source.match(siteTokenPattern) || []);
  for (const token of seen)
    if (!Object.hasOwn(values, token))
      throw new Error(`Unknown site token: ${token}`);
  const bound = source.replace(siteTokenPattern, (token) =>
    String(values[token]),
  );
  const unresolved = bound.match(siteTokenPattern) || [];
  if (unresolved.length)
    throw new Error(
      `Unresolved site token: ${[...new Set(unresolved)].join(", ")}`,
    );
  return bound;
}
