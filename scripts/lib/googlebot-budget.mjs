// Google documents 2 MB per non-PDF URL, including HTTP headers, before
// rendering. Use decimal MB conservatively; compression never extends it.
// https://developers.google.com/search/blog/2026/03/crawler-blog-post
export const GOOGLEBOT_NON_PDF_FETCH_CEILING_BYTES = 2_000_000;

const positiveBytes = (value, label) => {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`Googlebot budget requires positive integer bytes: ${label}`);
};

export function assertGooglebotBudgetContract(invariants) {
  for (const key of [
    "maxHtmlBytes",
    "googlebotFetchBudgetBytes",
    "googlebotReservedResponseHeaderBytes",
    "googlebotSafetyMarginBytes",
  ]) positiveBytes(invariants[key], key);
  if (invariants.googlebotFetchBudgetBytes > GOOGLEBOT_NON_PDF_FETCH_CEILING_BYTES)
    throw new Error("Googlebot fetch budget exceeds the conservative 2 MB ceiling");
  // The response-header reserve covers the whole response header section.
  // The additional safety margin reserves request overhead and future growth;
  // neither is permission to inflate the documented fetch ceiling.
  if (invariants.maxHtmlBytes +
      invariants.googlebotReservedResponseHeaderBytes +
      invariants.googlebotSafetyMarginBytes > invariants.googlebotFetchBudgetBytes)
    throw new Error("Response budget contract exceeds Googlebot budget");
}

export function assertGooglebotResponseBudget(
  { bodyBytes, responseHeaderBytes },
  invariants,
) {
  assertGooglebotBudgetContract(invariants);
  positiveBytes(bodyBytes, "uncompressed body");
  positiveBytes(responseHeaderBytes, "response headers");
  if (bodyBytes >= invariants.maxHtmlBytes)
    throw new Error(`HTML safety ceiling exceeded ${bodyBytes}/${invariants.maxHtmlBytes}`);
  if (responseHeaderBytes > invariants.googlebotReservedResponseHeaderBytes)
    throw new Error(`Observed response headers exceed reserved bytes: ${responseHeaderBytes}/${invariants.googlebotReservedResponseHeaderBytes}`);
  const accountedBytes = bodyBytes + responseHeaderBytes + invariants.googlebotSafetyMarginBytes;
  if (accountedBytes >= invariants.googlebotFetchBudgetBytes)
    throw new Error(`Googlebot response reaches the fetch cutoff: ${accountedBytes}/${invariants.googlebotFetchBudgetBytes}`);
  return {
    bodyBytes,
    responseHeaderBytes,
    safetyMarginBytes: invariants.googlebotSafetyMarginBytes,
    accountedBytes,
    remainingBytes: invariants.googlebotFetchBudgetBytes - accountedBytes,
  };
}
