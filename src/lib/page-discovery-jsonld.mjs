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
/** Preserve the complete authored entity/type coverage and format browser values. */
export function projectPageJsonLd(scripts) {
  if (!scripts.length) throw new Error("Authored page JSON-LD missing");
  const all = scripts.flatMap((script) => script.document["@graph"]);
  const byId = new Map(all.map((node) => [node["@id"], node]));
  if (byId.size !== all.length) throw new Error("Duplicate authored entity");
  const home = all.find((node) => values(node["@type"]).includes("ProfilePage") && node.url === "https://www.ghezelbaash.ir/");
  if (!home) throw new Error("Primary ProfilePage missing");
  const language = values(home.inLanguage)[0] || "fa-IR";
  const clean = (value, key) => {
    const localized = localizedText(value, language);
    if (localized !== value) return clean(localized, key);
    if (Array.isArray(value)) return value.map((entry) => clean(entry, key));
    if (!value || typeof value !== "object") return value;
    if (["width", "height"].includes(key)) {
      const quantity = byId.get(value["@id"]) ?? value;
      if (values(quantity["@type"]).includes("QuantitativeValue")) return quantity.value;
    }
    if (Object.keys(value).length === 1 && value["@id"] && !byId.has(value["@id"]) &&
        ["image", "sameAs", "gender", "credentialCategory", "knowsAbout"].includes(key)) return value["@id"];
    return Object.fromEntries(Object.entries(value).map(([property, entry]) => [property, clean(entry, property)]));
  };
  const currentDataset = all.find((node) => values(node["@type"]).includes("Dataset") && node.description);
  const projected = all.map((node) => {
    const output = clean(node);
    if (values(output["@type"]).includes("ProfilePage")) {
      const entities = values(output.mainEntity);
      output.mainEntity = entities[0];
      if (entities.length > 1) output.about = [...values(output.about), ...entities.slice(1)];
      for (const key of ["dateCreated", "dateModified"])
        if (key in output && !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(output[key])) delete output[key];
    }
    if (values(output["@type"]).includes("Dataset") && !output.description && output.version && currentDataset)
      output.description = "Archived version " + output.version + " of " + localizedText(currentDataset.name, language) +
        ". Preserved release record: " + output.url + ".";
    return output;
  });
    const questions = projected.filter((node) => values(node["@type"]).includes("Question") && node.acceptedAnswer);
  if (questions.length) projected.push({
    "@id": home.url + "#questions", "@type": "FAQPage", url: home.url,
    name: "پرسش‌ها و پاسخ‌های راهنمای پزشکی زیبایی دکتر سعید قزلباش",
    isPartOf: { "@id": home["@id"] }, mainEntity: questions.map((node) => ({ "@id": node["@id"] })),
  });
  const document = { "@context": browserContext, "@graph": projected };
  assertRichResultsDocument(document, { primaryPageId: home["@id"] });
  return [{ id: scripts[0].id, document }];
}
