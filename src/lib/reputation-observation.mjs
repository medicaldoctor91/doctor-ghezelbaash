const SCHEMA_VERSION = "1.0";
const SOURCE = "Google Places API (New)";
const SLOT = '<span data-clinic-reputation-slot></span>';

const isIsoSecond = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) &&
  !Number.isNaN(Date.parse(value));

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export function validateReputationObservation(observation, release) {
  if (!observation || typeof observation !== "object" || Array.isArray(observation))
    throw new Error("Clinic reputation observation must be an object");
  const rating = Number(observation.rating);
  const reviewCount = Number(observation.reviewCount);
  if (
    observation.schemaVersion !== SCHEMA_VERSION ||
    observation.source !== SOURCE ||
    observation.entity !== release?.clinic?.id ||
    observation.placeId !== release?.clinic?.placeId ||
    !Number.isFinite(rating) ||
    rating < 1 ||
    rating > 5 ||
    !Number.isSafeInteger(reviewCount) ||
    reviewCount < 1 ||
    !isIsoSecond(observation.valueObservedAt)
  )
    throw new Error("Clinic reputation observation drift");
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    source: SOURCE,
    entity: release.clinic.id,
    placeId: release.clinic.placeId,
    rating,
    reviewCount,
    valueObservedAt: observation.valueObservedAt,
  });
}

export function evaluateGoogleReputation({ place, current, release }) {
  const canonical = validateReputationObservation(current, release);
  const rating = Number(place?.rating);
  const reviewCount = Number(place?.userRatingCount);
  if (
    place?.id !== release.clinic.placeId ||
    place?.businessStatus !== "OPERATIONAL" ||
    place?.movedPlace ||
    place?.movedPlaceId ||
    !Number.isFinite(rating) ||
    rating < 1 ||
    rating > 5 ||
    !Number.isSafeInteger(reviewCount) ||
    reviewCount < 1
  )
    throw new Error("Google Places reputation response is invalid");
  return Object.freeze({
    rating,
    reviewCount,
    changed:
      rating !== canonical.rating || reviewCount !== canonical.reviewCount,
  });
}

export function composeReputationObservation({ evaluation, release, observedAt }) {
  if (!evaluation?.changed)
    throw new Error("Refusing to compose an unchanged reputation observation");
  const next = {
    schemaVersion: SCHEMA_VERSION,
    entity: release.clinic.id,
    placeId: release.clinic.placeId,
    rating: evaluation.rating,
    reviewCount: evaluation.reviewCount,
    valueObservedAt: observedAt,
    source: SOURCE,
  };
  return validateReputationObservation(next, release);
}

const faNumber = (value, digits = 0) =>
  new Intl.NumberFormat("fa-IR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: true,
  }).format(Number(value));

export function renderClinicReputationHtml({ observation, release, mapsUrl }) {
  const canonical = validateReputationObservation(observation, release);
  const url = new URL(mapsUrl);
  if (url.protocol !== "https:")
    throw new Error("Clinic Maps URL must use HTTPS");
  return `<span class="hero-caption-reputation" id="google-maps-clinic-reputation-current" data-clinic-reputation data-rating="${canonical.rating}" data-review-count="${canonical.reviewCount}"><strong><data data-clinic-rating value="${canonical.rating}">${faNumber(canonical.rating, 1)}</data> از ۵</strong> · بر پایهٔ <strong><data data-clinic-review-count value="${canonical.reviewCount}">${faNumber(canonical.reviewCount)}</data></strong> نظر در <a href="${escapeHtml(url.href)}" rel="external noopener"><span class="google-maps-attribution" translate="no">Google Maps</span></a></span>`;
}

export function bindClinicReputation(content, args) {
  const source = String(content);
  const count = source.split(SLOT).length - 1;
  if (count !== 1)
    throw new Error(`Expected one clinic reputation slot; found ${count}`);
  return source.replace(SLOT, renderClinicReputationHtml(args));
}

export function assertRenderedClinicReputation(html, args) {
  const expected = renderClinicReputationHtml(args);
  const source = String(html);
  if (source.split(expected).length - 1 !== 1 || source.includes(SLOT))
    throw new Error("Rendered clinic reputation block drift");
  return true;
}

export const reputationObservationContract = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  source: SOURCE,
  slot: SLOT,
  refreshCron: "23 */6 * * *",
  upstreamCallsPerRun: 1,
});
