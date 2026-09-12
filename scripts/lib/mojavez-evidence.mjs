import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "parse5";

export const MOJAVEZ_ID = "https://www.ghezelbaash.ir/#evidence-mojavez-clinic-ownership";
export const MOJAVEZ_URL = "https://qr.mojavez.ir/track/19949827";
export const MOJAVEZ_RECORD = ".release/evidence/mojavez-19949827.json";
export const MOJAVEZ_NAME = "Mojavez medical practice license record";
const CLAIM_FIELDS = {
  "medical-practice-license": ["holderName", "licenseTitle", "issuingAuthority", "trackingCode"],
  "legal-professional-name": ["holderName"],
  "practice-jurisdiction": ["province", "county"],
};
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
const arr = (v) => Array.isArray(v) ? v : v == null ? [] : [v];
const refs = (v) => arr(v).map((n) => typeof n === "string" ? n : n?.["@id"]);
const normalized = (v) => String(v).replace(/\s+/g, " ").trim();

// Read the visible server-rendered record, never hydration scripts or a URL marker.
export function extractMojavezRecord(html) {
  const elements = [];
  const walk = (node) => {
    if (["script", "style", "template", "noscript"].includes(node.tagName) ||
        node.attrs?.some((a) => a.name === "hidden" || (a.name === "aria-hidden" && a.value === "true"))) return;
    elements.push(node);
    for (const child of node.childNodes || []) walk(child);
  };
  walk(parse(html));
  const visible = new Set(elements);
  const text = (n) => !visible.has(n) ? "" : n.nodeName === "#text" ? n.value :
    (n.childNodes || []).map(text).join("");
  const holders = elements.filter((n) => n.tagName === "div" &&
    ["text-center", "font-bold", "my-4", "mx-auto"].every((c) =>
      n.attrs?.find((a) => a.name === "class")?.value.split(/\s+/).includes(c)));
  assert.equal(holders.length, 1, "Mojavez holder field missing or ambiguous");
  const record = { holderName: normalized(text(holders[0])) };
  for (const [field, label] of Object.entries(FIELD_LABELS)) {
    const labels = elements.filter((n) => n.tagName === "span" && normalized(text(n)) === label);
    assert.equal(labels.length, 1, `Mojavez label missing or ambiguous: ${label}`);
    const pair = labels[0].parentNode.childNodes.filter((n) => n.tagName === "span");
    assert.ok(pair.length === 2 && pair[0] === labels[0], `Mojavez field structure changed: ${label}`);
    record[field] = normalized(text(pair[1]));
    assert.ok(record[field], `Mojavez field empty: ${label}`);
  }
  return record;
}

export async function readMojavezObservation(root = process.cwd()) {
  return JSON.parse(await readFile(path.join(root, MOJAVEZ_RECORD), "utf8"));
}

export function assertMojavezEvidence({ graph, registry, release, observation, head }) {
  const byId = new Map(graph["@graph"].map((n) => [n["@id"], n]));
  const entries = registry.evidence.filter((e) => e.id === MOJAVEZ_ID);
  assert.equal(entries.length, 1, "Mojavez stable evidence ID must occur exactly once");
  const entry = entries[0], page = byId.get(MOJAVEZ_ID);
  const person = byId.get(release.primaryEntity.id), clinic = byId.get(release.clinic.id);
  assert.ok(page && person && clinic, "Mojavez canonical subjects missing");
  assert.equal(observation.schemaVersion, 1, "Mojavez observation schema drift");
  assert.equal(observation.evidenceId, MOJAVEZ_ID, "Mojavez observation evidence drift");
  assert.equal(observation.url, MOJAVEZ_URL, "Mojavez observed URL drift");
  assert.equal(observation.subjectId, person["@id"], "Mojavez observed subject drift");
  assert.equal(observation.response.status, 200, "Mojavez observation was not an HTTP 200 record");
  assert.match(observation.response.bodySha256, /^[a-f0-9]{64}$/, "Mojavez response digest missing");
  assert.deepEqual(observation.requestHeaders, { "Cache-Control": "no-cache", Pragma: "no-cache" });
  assert.ok(Number.isFinite(Date.parse(observation.observedAt)), "Mojavez observation date missing");
  assert.deepEqual(observation.claimFields, CLAIM_FIELDS, "Mojavez reviewed claim bindings changed");
  assert.equal(observation.clinicOwnershipEstablished, false, "Mojavez ownership needs a new source review");
  const record = observation.record;
  for (const field of ["holderName", ...Object.keys(FIELD_LABELS)])
    assert.ok(typeof record[field] === "string" && record[field].trim(), `Mojavez observed field missing: ${field}`);
  assert.ok(release.primaryEntity.officialAliases.includes(record.holderName), "Mojavez holder is not the canonical physician");
  assert.equal(record.licenseTitle, "پروانه طبابت", "Mojavez record is not a medical practice license");
  assert.equal(record.trackingCode, "19949827", "Mojavez tracking record drift");
  assert.equal(record.issuingAuthority, "سازمان نظام پزشکی ج.ا.ا - معاونت فنی و نظارت نظام پزشکی");
  assert.equal(record.province, "کرمانشاه");
  assert.equal(record.county, "کرمانشاه");
  assert.equal(entry.verificationRecord, MOJAVEZ_RECORD, "Mojavez reproducible observation missing");
  assert.equal(entry.url, MOJAVEZ_URL, "Mojavez registry URL drift");
  assert.equal(entry.liveStatus, "verified-live-source", "Mojavez cannot use generic declared evidence status");
  assert.equal(entry.verifiedAt, observation.observedAt.slice(0, 10), "Mojavez verification date drift");
  assert.deepEqual(entry.supports, Object.keys(CLAIM_FIELDS), "Mojavez claimed scope exceeds reviewed source");
  assert.deepEqual(entry.expectedMarkers, [record.holderName, record.licenseTitle, record.trackingCode, record.province]);
  assert.equal(page["@type"], "WebPage");
  assert.equal(page.name, MOJAVEZ_NAME, "Mojavez evidence title must stay neutral");
  assert.equal(page.url, MOJAVEZ_URL, "Mojavez graph URL drift");
  assert.equal(page.identifier, `Mojavez:${record.trackingCode}`);
  assert.deepEqual(refs(page.mainEntity), [person["@id"]], "Mojavez main subject drift");
  assert.deepEqual(refs(page.about), [person["@id"]], "Mojavez cannot assert Clinic as its subject");
  assert.ok(refs(person.subjectOf).includes(MOJAVEZ_ID), "Mojavez physician evidence link missing");
  assert.ok(!refs(clinic.subjectOf).includes(MOJAVEZ_ID), "Mojavez Clinic ownership evidence link must not return");
  if (head) assert.ok(!refs(head.nodes?.[clinic["@id"]]?.refAllow?.subjectOf).includes(MOJAVEZ_ID),
    "Mojavez Clinic evidence selector must not return");
}
