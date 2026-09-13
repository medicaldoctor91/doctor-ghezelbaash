import fs from "node:fs";
import { assertActiveAuthoredIdentifiers } from "./lib/active-identifier-contract.mjs";
import { assertMojavezEvidence, readMojavezObservation } from "./lib/mojavez-evidence.mjs";
import { assertSocialIdentity } from "./lib/social-identity-contract.mjs";

const BASE = "https://www.ghezelbaash.ir/";
const graph = JSON.parse(fs.readFileSync("src/data/semantic/knowledge-graph.jsonld", "utf8"));
const head = JSON.parse(fs.readFileSync("src/data/semantic/head-profile.json", "utf8"));
const support = JSON.parse(fs.readFileSync("src/data/semantic/support-profile.json", "utf8"));
const evidence = JSON.parse(fs.readFileSync("src/data/evidence-registry.json", "utf8"));
const media = JSON.parse(fs.readFileSync("src/data/media-metadata.json", "utf8"));
const release = JSON.parse(fs.readFileSync("src/data/release.json", "utf8"));
const authoredInputsChecked = await assertActiveAuthoredIdentifiers();
assertMojavezEvidence({ graph, registry: evidence, release, head, observation: await readMojavezObservation() });
const nodes = graph["@graph"] || [];
const ids = nodes.map((n) => n["@id"]).filter(Boolean);
if (new Set(ids).size !== ids.length) throw new Error("Duplicate canonical @id");
const byId = new Map(nodes.map((n) => [n["@id"], n]));
const arr = (v) => Array.isArray(v) ? v : v == null ? [] : [v];
const id = (v) => typeof v === "string" ? v : v?.["@id"];
const get = (suffix) => { const value = byId.get(`${BASE}${suffix}`); if (!value) throw new Error(`Missing node: ${suffix}`); return value; };
const PERSON = `${BASE}#saeed-ghezelbash`;
const CLINIC = `${BASE}#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah`;
const UNIVERSITY = `${BASE}#kermanshah-university-of-medical-sciences`;
const MEDICAL_CREDENTIAL = `${BASE}#irimc-credential-167430`;
const MEDICAL_LICENSE = "https://www.wikidata.org/entity/Q1566725";
const EDUCATION_EVIDENCE = `${BASE}#evidence-orcid-education-38054873`;
const EDUCATION_CLAIM = `${BASE}#claim-kums-education-period-2009-2018`;
const HISTORICAL_AFFILIATION_CLAIMS = [
  [`${BASE}#claim-kums-affiliation-2016`, "2016", `${BASE}#article-omega-3-bipolar-i-2016`],
  [`${BASE}#claim-kums-affiliation-2021`, "2021", `${BASE}#article-mdd-attachment-dissociation-trauma-2021`],
];
const person = byId.get(PERSON), clinic = byId.get(CLINIC);
if (!person || !clinic || person === clinic) throw new Error("Person/Clinic separation failure");
const city = get("#place-messe-berlin-citycube");
if (city.name !== "CityCube Berlin" || city.sameAs !== "https://www.wikidata.org/entity/Q15108815") throw new Error("CityCube identity contract failure");
const irimc = get("#organization-iran-medical-council");
if (irimc["@type"] !== "Organization" || irimc.sameAs !== "https://www.wikidata.org/entity/Q5944740") throw new Error("Iranian Medical Council identity contract failure");
if (arr(person.sameAs).map(id).includes(irimc.sameAs)) throw new Error("IRIMC QID leaked into Person.sameAs");
for (const alias of ["Ghezelbash MS", "Doctor Ghezelbaash"]) if (!arr(person.alternateName).includes(alias)) throw new Error(`Missing alias: ${alias}`);
if (head.nodes?.[PERSON]?.valueAllow && Object.hasOwn(head.nodes[PERSON].valueAllow, "alternateName")) throw new Error("Duplicate alternateName truth remains in head profile");
assertSocialIdentity({ graph, release });
if (byId.has(`${BASE}#profile-instagram-ghezelbaash`)) throw new Error("Unverified personal Instagram asserted");
const drdrId = get("#identifier-person-drdr");
if (drdrId.value !== "92014") throw new Error("DrDr structured identifier drift");
const wd = evidence.evidence.find((e) => e.id === `${BASE}#evidence-wikidata-doctor`);
if (JSON.stringify(wd?.supports) !== JSON.stringify(["person-identity", "canonical-name", "aliases"])) throw new Error("Wikidata evidence overclaims independence");
if (!evidence.evidence.some((e) => e.id === `${BASE}#evidence-drdr` && e.tier === "C")) throw new Error("DrDr evidence registry entry missing");
const team = media.imageProfiles.find((p) => arr(p.includes).includes("clinical-team"));
const semanticText = JSON.stringify([team, ...nodes.filter((n) => /clinical-team|clinic-team/.test(n?.["@id"] || ""))]);
for (const claim of ["clinical team", "medical team", "تیم بالینی", "اعضای تیم درمان"]) if (semanticText.toLowerCase().includes(claim.toLowerCase())) throw new Error(`Unsupported group-photo role claim remains: ${claim}`);
const irimcProfile = support.idProfiles?.[`${BASE}#organization-iran-medical-council`];
if (!irimcProfile?.include?.includes("sameAs")) throw new Error("IRIMC sameAs not projected");

// Wikidata/primary-source convergence is source-bound, not a blind mirror.
const credential = byId.get(MEDICAL_CREDENTIAL);
if (!credential) throw new Error("Canonical medical credential missing");
if (!arr(credential.credentialCategory).some((value) => id(value) === MEDICAL_LICENSE))
  throw new Error("Medical credential lost Q1566725 medical-license classification");
if (credential.expires !== "2029-02-20") throw new Error("Medical credential expiry drift");
if (graph["@context"]?.expires?.["@type"] !== "http://www.w3.org/2001/XMLSchema#date")
  throw new Error("Medical credential expiry must remain an RDF xsd:date");
const headCredentialProfile = head.nodes?.[MEDICAL_CREDENTIAL];
if (!headCredentialProfile?.include?.includes("credentialCategory")) throw new Error("Medical-license category is not projected");
if (headCredentialProfile.include.includes("expires"))
  throw new Error("License expiry must not enter homepage JSON-LD before the date is visible in page content");
if (arr(person.affiliation).map(id).includes(UNIVERSITY))
  throw new Error("Historical university evidence was flattened into an undated current affiliation");

const educationEvidence = byId.get(EDUCATION_EVIDENCE);
const educationRegistry = evidence.evidence.find((item) => item.id === EDUCATION_EVIDENCE);
if (!educationEvidence || educationEvidence.url !== educationRegistry?.url) throw new Error("ORCID education evidence binding missing");
if (educationRegistry.tier !== "P" || educationRegistry.role !== "identity-reference" ||
    JSON.stringify(educationRegistry.supports) !== JSON.stringify(["education-history-self-asserted"]))
  throw new Error("ORCID education evidence must remain explicitly self-asserted/non-independent");
const educationClaim = byId.get(EDUCATION_CLAIM);
if (!educationClaim || educationClaim["@type"] !== "Claim" || educationClaim.temporalCoverage !== "2009-09/2018-03")
  throw new Error("Education-period Claim missing or imprecise");
if (id(educationClaim.isBasedOn) !== EDUCATION_EVIDENCE || id(educationClaim["prov:wasDerivedFrom"]) !== EDUCATION_EVIDENCE)
  throw new Error("Education-period Claim provenance drift");
if (head.ids.includes(EDUCATION_CLAIM) || support.ids.includes(EDUCATION_CLAIM) ||
    head.ids.includes(EDUCATION_EVIDENCE) || support.ids.includes(EDUCATION_EVIDENCE))
  throw new Error("Self-asserted education detail leaked into homepage projection");
for (const [claimId, year, sourceId] of HISTORICAL_AFFILIATION_CLAIMS) {
  const claim = byId.get(claimId);
  if (!claim || claim["@type"] !== "Claim" || claim.temporalCoverage !== year ||
      id(claim.isBasedOn) !== sourceId || id(claim["prov:wasDerivedFrom"]) !== sourceId)
    throw new Error(`Historical university affiliation Claim drift: ${year}`);
  if (head.ids.includes(claimId) || support.ids.includes(claimId))
    throw new Error(`Historical university affiliation Claim leaked into homepage projection: ${year}`);
}
for (const [articleId, pmcid] of [
  [`${BASE}#article-omega-3-bipolar-i-2016`, "PMC4882968"],
  [`${BASE}#article-mdd-attachment-dissociation-trauma-2021`, "PMC8469763"],
]) {
  const article = byId.get(articleId);
  if (!arr(article?.identifier).includes(`PMCID:${pmcid}`)) throw new Error(`Article PMCID missing: ${pmcid}`);
  if (!arr(article?.sameAs).includes(`https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`)) throw new Error(`Article PMC URL missing: ${pmcid}`);
  if (support.idProfiles?.[articleId]?.include?.includes("sameAs"))
    throw new Error(`PMC identity mesh should remain full-graph-only: ${pmcid}`);
}
console.log(JSON.stringify({ valid: true, canonicalNodes: nodes.length, authoredInputsChecked, mojavez: "reviewed-person-license-scope", wikidataConvergence: "source-bound-temporal-claims", checked: "final-entity-contract-2026" }, null, 2));
