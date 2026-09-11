import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extractMojavezRecord, readMojavezObservation, MOJAVEZ_URL } from "./lib/mojavez-evidence.mjs";

// Explicit read/verify/report command; never rewrites evidence or publishes assets.
const observation = await readMojavezObservation();
const args = process.argv.slice(2);
assert.ok(!args.length || (args.length === 2 && args[0] === "--html"), "Usage: node scripts/verify-mojavez-evidence.mjs [--html captured.html]");
let body;
if (args.length) body = await readFile(args[1]);
else {
  const response = await fetch(MOJAVEZ_URL, {
    headers: observation.requestHeaders, redirect: "error", signal: AbortSignal.timeout(45000),
  });
  assert.equal(response.status, 200, "Mojavez live record unavailable");
  assert.match(response.headers.get("content-type") || "", /^text\/html\b/i);
  body = Buffer.from(await response.arrayBuffer());
}
assert.deepEqual(extractMojavezRecord(body.toString("utf8")), observation.record,
  "Mojavez source fields changed: inspect the live record and review evidence scope");
console.log(JSON.stringify({ status: "PASS", mode: args.length ? "captured-html" : "live-no-cache",
  url: MOJAVEZ_URL, observedAt: new Date().toISOString(),
  bodySha256: createHash("sha256").update(body).digest("hex"),
  matched: "reviewed license fields only; clinic ownership is not established" }, null, 2));
