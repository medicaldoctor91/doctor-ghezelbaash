// Google documents a 2 MB fetch limit for non-PDF URLs. The verifier
// requests identity encoding and accounts for the uncompressed body, observed
// response headers, and an explicit safety margin against that ceiling.
export const GOOGLEBOT_NON_PDF_FETCH_CEILING_BYTES = 2_000_000;

const positiveBytes = (value, label) => {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`Googlebot budget requires positive integer bytes: ${label}`);
};

export function assertGooglebotBudgetContract(invariants) {
  for (const key of [
    "googlebotFetchBudgetBytes",
    "googlebotReservedResponseHeaderBytes",
    "googlebotSafetyMarginBytes",
  ]) positiveBytes(invariants[key], key);
  if (invariants.googlebotFetchBudgetBytes > GOOGLEBOT_NON_PDF_FETCH_CEILING_BYTES)
    throw new Error("Googlebot fetch budget exceeds the documented 2 MB ceiling");
  if (
    invariants.googlebotReservedResponseHeaderBytes +
      invariants.googlebotSafetyMarginBytes >=
    invariants.googlebotFetchBudgetBytes
  )
    throw new Error("Googlebot header reserve and safety margin consume the fetch budget");
}

export function assertGooglebotResponseBudget(
  { bodyBytes, responseHeaderBytes },
  invariants,
) {
  assertGooglebotBudgetContract(invariants);
  positiveBytes(bodyBytes, "uncompressed body");
  positiveBytes(responseHeaderBytes, "response headers");
  if (responseHeaderBytes > invariants.googlebotReservedResponseHeaderBytes)
    throw new Error(
      `Observed response headers exceed reserved bytes: ${responseHeaderBytes}/${invariants.googlebotReservedResponseHeaderBytes}`,
    );
  const accountedBytes =
    bodyBytes + responseHeaderBytes + invariants.googlebotSafetyMarginBytes;
  if (accountedBytes >= invariants.googlebotFetchBudgetBytes)
    throw new Error(
      `Googlebot response reaches the fetch cutoff: ${accountedBytes}/${invariants.googlebotFetchBudgetBytes}`,
    );
  return {
    bodyBytes,
    responseHeaderBytes,
    safetyMarginBytes: invariants.googlebotSafetyMarginBytes,
    accountedBytes,
    remainingBytes: invariants.googlebotFetchBudgetBytes - accountedBytes,
  };
}
