import { assertRichResultsDocument } from "./rich-results-contract.mjs";
const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
export const browserContext = ["https://schema.org", {
  prov: "http://www.w3.org/ns/prov#", dcterms: "http://purl.org/dc/terms/", skos: "http://www.w3.org/2004/02/skos/core#",
}];
export function localizedText(value, language = "fa-IR") {
  const literals = values(value).filter((entry) => entry && typeof entry === "object" && "@value" in entry);
  if (!literals.length) return value;
  const base = language.split("-")[0];
  return (literals.find((entry) => entry["@language"] === language)
    ?? literals.find((entry) => entry["@language"]?.split("-")[0] === base)
    ?? literals.find((entry) => entry["@language"] === "en") ?? literals[0])["@value"];
}
/**
 * The canonical page already owns its browser discovery graph. Validate that
 * authored document; selection, localization and FAQ relationships are authored
 * in page.md rather than reconstructed at build time.
 */
export function validatePageJsonLd(scripts) {
  if (scripts.length !== 1) throw new Error("Canonical page requires one authored discovery graph");
  const document = scripts[0].document;
  const home = document?.["@graph"]?.find((node) =>
    node["@id"] === "https://www.ghezelbaash.ir/webpage");
  if (!home || !values(home["@type"]).includes("MedicalWebPage"))
    throw new Error("Primary MedicalWebPage missing");
  assertRichResultsDocument(document, { primaryPageId: home["@id"] });
  return scripts;
}
