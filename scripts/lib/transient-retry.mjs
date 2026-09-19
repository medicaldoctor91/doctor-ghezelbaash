import { fetchRepresentation } from "./http-representation.mjs";

const TRANSIENT_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const TRANSIENT_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);
const TRANSIENT_TEXT_PATTERNS = [
  /\bECONNRESET\b/i,
  /<urlopen error \[Errno 104\] Connection reset by peer>/i,
  /\bECONNREFUSED\b/i,
  /\bEPIPE\b/i,
  /\bETIMEDOUT\b/i,
  /\bEAI_AGAIN\b/i,
  /\bENETUNREACH\b/i,
  /\bEHOSTUNREACH\b/i,
  /\bUND_ERR_(?:CONNECT_TIMEOUT|HEADERS_TIMEOUT|SOCKET)\b/i,
  /\b(?:AbortError|TimeoutError|ABORT_ERR)\b/i,
  /\bstatus=(?:429|500|502|503|504)\b/i,
  /\bHTTP (?:429|500|502|503|504)\b/i,
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const errorChain = (error) => {
  const chain = [];
  let current = error;
  for (let depth = 0; current && depth < 6; depth += 1) {
    chain.push(current);
    current = current.cause;
  }
  return chain;
};

export const transientReason = (value) => {
  if (typeof value === "string") {
    const match = TRANSIENT_TEXT_PATTERNS.find((pattern) => pattern.test(value));
    return match ? match.source : null;
  }
  for (const error of errorChain(value)) {
    const code = String(error?.code || "").trim();
    if (TRANSIENT_CODES.has(code)) return code;
    const name = String(error?.name || "").trim();
    if (["AbortError", "TimeoutError"].includes(name)) return name;
    const message = String(error?.message || "");
    const match = TRANSIENT_TEXT_PATTERNS.find((pattern) => pattern.test(message));
    if (match) return match.source;
  }
  return null;
};

export const isTransientHttpStatus = (status) =>
  TRANSIENT_HTTP_STATUS.has(Number(status));

export async function fetchRepresentationWithRetry(
  input,
  options = {},
  { attempts = 4, baseDelayMs = 350 } = {},
) {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 8)
    throw new Error("Transient fetch attempts must be an integer from 1 to 8");
  let lastTransient = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await fetchRepresentation(input, options);
      if (!isTransientHttpStatus(result.r.status)) return result;
      lastTransient = `HTTP ${result.r.status}`;
    } catch (error) {
      const reason = transientReason(error);
      if (!reason) throw error;
      lastTransient = reason;
    }
    if (attempt === attempts) break;
    const delayMs = baseDelayMs * 2 ** (attempt - 1);
    console.error(
      `TRANSIENT_HTTP_RETRY attempt=${attempt}/${attempts} delayMs=${delayMs} reason=${lastTransient} url=${String(input)}`,
    );
    await sleep(delayMs);
  }
  throw new Error(
    `TRANSPORT_UNSTABLE exhausted=${attempts} reason=${lastTransient} url=${String(input)}`,
  );
}
