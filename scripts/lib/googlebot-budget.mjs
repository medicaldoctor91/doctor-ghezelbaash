// Google documents a 2 MB fetch cutoff per non-PDF URL. Keep the project
// contract equal to that documented ceiling; do not subtract private reserves.
// https://developers.google.com/search/blog/2026/03/crawler-blog-post
export const GOOGLEBOT_NON_PDF_FETCH_CEILING_BYTES = 2_000_000;

const bytes = (value, label, { allowZero = false } = {}) => {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    (!allowZero && value === 0)
  )
    throw new Error(`Googlebot budget requires integer bytes: ${label}`);
  return value;
};

export function assertGooglebotBudgetContract(invariants) {
  const fetchBudgetBytes = bytes(
    invariants.googlebotFetchBudgetBytes,
    "googlebotFetchBudgetBytes",
  );
  if (fetchBudgetBytes !== GOOGLEBOT_NON_PDF_FETCH_CEILING_BYTES)
    throw new Error(
      `Googlebot fetch budget must equal the documented ${GOOGLEBOT_NON_PDF_FETCH_CEILING_BYTES}-byte ceiling`,
    );
  return { fetchBudgetBytes };
}

export function assertGooglebotResponseBudget(
  { bodyBytes, responseHeaderBytes = 0 },
  invariants,
) {
  const { fetchBudgetBytes } = assertGooglebotBudgetContract(invariants);
  const body = bytes(bodyBytes, "uncompressed body");
  const headers = bytes(responseHeaderBytes, "response headers", {
    allowZero: true,
  });
  const accountedBytes = body + headers;
  if (accountedBytes > fetchBudgetBytes)
    throw new Error(
      `Googlebot fetch ceiling exceeded: ${accountedBytes}/${fetchBudgetBytes}`,
    );
  return {
    bodyBytes: body,
    responseHeaderBytes: headers,
    accountedBytes,
    remainingBytes: fetchBudgetBytes - accountedBytes,
  };
}
