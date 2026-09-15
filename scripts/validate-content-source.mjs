import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const CONTENT_SOURCE_CONTRACT_PATH = "src/data/content-source-contract.json";
export const CANONICAL_PAGE_SOURCE = "src/content-source/page.md";

const exactKeys = (value, expected, label) => {
  const actual = Object.keys(value || {}).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted))
    throw new Error(`${label} fields are not canonical`);
};
const digest = (algorithm, value) =>
  createHash(algorithm).update(value).digest("hex");
const gitBlobSha1 = (bytes) => {
  const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
  return digest("sha1", Buffer.concat([header, bytes]));
};

export function inspectCanonicalPageSource(bytes, contract) {
  exactKeys(contract, ["policy", "schemaVersion", "source"], "content-source contract");
  if (contract.schemaVersion !== 1 || contract.policy !== "exact-canonical-page-source")
    throw new Error("Unsupported content-source contract");
  exactKeys(
    contract.source,
    ["approvedCommit", "bytes", "gitBlobSha1", "path", "sha256"],
    "content-source contract source",
  );
  const source = contract.source;
  if (source.path !== CANONICAL_PAGE_SOURCE)
    throw new Error(`Canonical page source path drift: ${source.path}`);
  if (!/^[0-9a-f]{40}$/u.test(source.approvedCommit || ""))
    throw new Error("Approved source commit is missing or invalid");
  if (!Number.isSafeInteger(source.bytes) || source.bytes <= 0)
    throw new Error("Approved source byte count is invalid");
  if (!/^[0-9a-f]{64}$/u.test(source.sha256 || ""))
    throw new Error("Approved source SHA-256 is missing or invalid");
  if (!/^[0-9a-f]{40}$/u.test(source.gitBlobSha1 || ""))
    throw new Error("Approved source Git blob SHA-1 is missing or invalid");

  const actual = {
    bytes: bytes.length,
    sha256: digest("sha256", bytes),
    gitBlobSha1: gitBlobSha1(bytes),
  };
  if (actual.bytes !== source.bytes)
    throw new Error(`Canonical page source byte drift: ${actual.bytes}/${source.bytes}`);
  if (actual.sha256 !== source.sha256)
    throw new Error(`Canonical page source SHA-256 drift: ${actual.sha256}/${source.sha256}`);
  if (actual.gitBlobSha1 !== source.gitBlobSha1)
    throw new Error(`Canonical page source Git blob drift: ${actual.gitBlobSha1}/${source.gitBlobSha1}`);
  return {
    contentSource: "PASS",
    path: source.path,
    approvedCommit: source.approvedCommit,
    ...actual,
    integrity: "PASS",
  };
}

export async function validateCanonicalPageSource(root = process.cwd()) {
  const contract = JSON.parse(
    await readFile(path.join(root, CONTENT_SOURCE_CONTRACT_PATH), "utf8"),
  );
  const bytes = await readFile(path.join(root, CANONICAL_PAGE_SOURCE));
  return inspectCanonicalPageSource(bytes, contract);
}

const invoked = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;
if (invoked) console.log(JSON.stringify(await validateCanonicalPageSource(), null, 2));
