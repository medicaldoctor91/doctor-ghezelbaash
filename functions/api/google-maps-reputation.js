import release from "../../src/data/release.json" with { type: "json" };

const FIELD_MASK = [
  "id",
  "rating",
  "userRatingCount",
  "attributions",
  "businessStatus",
  "movedPlace",
  "movedPlaceId",
].join(",");

const responseHeaders = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Cloudflare-CDN-Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
  Expires: "0",
  "Referrer-Policy": "no-referrer",
  Vary: "Accept, Sec-Fetch-Site, Sec-Fetch-Mode, Sec-Fetch-Dest",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
});

const emptyResponse = (status = 204) =>
  new Response(null, { status, headers: responseHeaders });

const safeHttpsUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
};

const normalizeAttributions = (value) =>
  (Array.isArray(value) ? value : [])
    .map((item) => ({
      provider:
        typeof item?.provider === "string"
          ? item.provider.replace(/\s+/g, " ").trim().slice(0, 120)
          : "",
      providerUri: safeHttpsUrl(item?.providerUri),
    }))
    .filter((item) => item.provider)
    .slice(0, 8);

export function normalizeGoogleMapsReputation(value) {
  const rating = Number(value?.rating),
    userRatingCount = Number(value?.userRatingCount);
  if (
    value?.id !== release.clinic.placeId ||
    value?.businessStatus !== "OPERATIONAL" ||
    value?.movedPlace ||
    value?.movedPlaceId ||
    !Number.isFinite(rating) ||
    rating < 1 ||
    rating > 5 ||
    !Number.isSafeInteger(userRatingCount) ||
    userRatingCount < 1
  )
    return null;
  return {
    rating,
    userRatingCount,
    attributions: normalizeAttributions(value.attributions),
  };
}

const isSameOriginPageFetch = (request) => {
  if (
    !request.headers.get("Accept")?.split(",").some((value) =>
      value.trim().toLowerCase().startsWith("application/json"),
    ) ||
    request.headers.get("Sec-Fetch-Site") !== "same-origin" ||
    request.headers.get("Sec-Fetch-Mode") !== "cors" ||
    request.headers.get("Sec-Fetch-Dest") !== "empty"
  )
    return false;
  try {
    const requestUrl = new URL(request.url),
      referrer = new URL(request.headers.get("Referer")),
      canonicalOrigin = new URL(release.canonicalUrl).origin;
    return (
      requestUrl.pathname === "/api/google-maps-reputation" &&
      requestUrl.origin === canonicalOrigin &&
      referrer.origin === canonicalOrigin
    );
  } catch {
    return false;
  }
};

export async function onRequestGet({ env, request }) {
  if (!isSameOriginPageFetch(request)) return emptyResponse(404);

  const apiKey = env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) return emptyResponse();

  const endpoint = new URL(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(release.clinic.placeId)}`,
  );
  endpoint.searchParams.set("languageCode", "fa");
  endpoint.searchParams.set("regionCode", "IR");

  try {
    const upstream = await fetch(endpoint, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      redirect: "error",
      signal: AbortSignal.timeout(4500),
    });
    if (!upstream.ok) return emptyResponse(503);
    const reputation = normalizeGoogleMapsReputation(await upstream.json());
    if (!reputation) return emptyResponse(503);
    return Response.json(reputation, {
      headers: {
        ...responseHeaders,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch {
    return emptyResponse(503);
  }
}
