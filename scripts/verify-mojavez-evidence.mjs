import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "parse5";

const MOJAVEZ_URL = "https://qr.mojavez.ir/track/19949827";
const MOJAVEZ_RECORD = ".release/evidence/mojavez-19949827.json";
const FIELD_LABELS = {
  licenseTitle: "عنوان مجوز",
  issuingAuthority: "مرجع صدور",
  trackingCode: "کد رهگیری",
  isicCode: "کد آیسیک",
  isicTitle: "عنوان آیسیک",
  issuedOrRenewedOn: "تاریخ صدور / تمدید",
  validUntil: "تاریخ اعتبار",
  province: "استان",
  county: "شهرستان",
};
const normalized = (value) => String(value).replace(/\s+/g, " ").trim();

function extractMojavezRecord(html) {
  const elements = [];
  const walk = (node) => {
    if (
      ["script", "style", "template", "noscript"].includes(node.tagName) ||
      node.attrs?.some(
        (attribute) =>
          attribute.name === "hidden" ||
          (attribute.name === "aria-hidden" && attribute.value === "true"),
      )
    )
      return;
    elements.push(node);
    for (const child of node.childNodes || []) walk(child);
  };
  walk(parse(html));
  const visible = new Set(elements);
  const text = (node) =>
    !visible.has(node)
      ? ""
      : node.nodeName === "#text"
        ? node.value
        : (node.childNodes || []).map(text).join("");
  const holders = elements.filter(
    (node) =>
      node.tagName === "div" &&
      ["text-center", "font-bold", "my-4", "mx-auto"].every((name) =>
        node.attrs
          ?.find((attribute) => attribute.name === "class")
          ?.value.split(/\s+/)
          .includes(name),
      ),
  );
  assert.equal(holders.length, 1, "Mojavez holder field missing or ambiguous");
  const record = { holderName: normalized(text(holders[0])) };
  for (const [field, label] of Object.entries(FIELD_LABELS)) {
    const labels = elements.filter(
      (node) => node.tagName === "span" && normalized(text(node)) === label,
    );
    assert.equal(labels.length, 1, `Mojavez label missing or ambiguous: ${label}`);
    const pair = labels[0].parentNode.childNodes.filter(
      (node) => node.tagName === "span",
    );
    assert.ok(
      pair.length === 2 && pair[0] === labels[0],
      `Mojavez field structure changed: ${label}`,
    );
    record[field] = normalized(text(pair[1]));
    assert.ok(record[field], `Mojavez field empty: ${label}`);
  }
  return record;
}

async function readMojavezObservation(root = process.cwd()) {
  return JSON.parse(await readFile(path.join(root, MOJAVEZ_RECORD), "utf8"));
}

// Explicit read/verify/report command; never rewrites evidence or publishes assets.
const observation = await readMojavezObservation();
const args = process.argv.slice(2);
assert.ok(
  !args.length || (args.length === 2 && args[0] === "--html"),
  "Usage: node scripts/verify-mojavez-evidence.mjs [--html captured.html]",
);
let body;
if (args.length) body = await readFile(args[1]);
else {
  const response = await fetch(MOJAVEZ_URL, {
    headers: observation.requestHeaders,
    redirect: "error",
    signal: AbortSignal.timeout(45000),
  });
  assert.equal(response.status, 200, "Mojavez live record unavailable");
  assert.match(response.headers.get("content-type") || "", /^text\/html\b/i);
  body = Buffer.from(await response.arrayBuffer());
}
assert.deepEqual(
  extractMojavezRecord(body.toString("utf8")),
  observation.record,
  "Mojavez source fields changed: inspect the live record and review evidence scope",
);
console.log(
  JSON.stringify(
    {
      status: "PASS",
      mode: args.length ? "captured-html" : "live-no-cache",
      url: MOJAVEZ_URL,
      observedAt: new Date().toISOString(),
      bodySha256: createHash("sha256").update(body).digest("hex"),
      matched: "reviewed license fields only; clinic ownership is not established",
    },
    null,
    2,
  ),
);
