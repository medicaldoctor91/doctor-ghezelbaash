const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const typeOf = (node, type) => values(node?.["@type"]).includes(type);
const languageCodes = { fa: "fa", en: "en", ar: "ar", ckb: "ku", ku: "ku" };
const routePattern = /^\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Declare equivalents only from reviewed source groups and existing authored Q&A. */
export function applyTranslationAlternates(records, groups = [], { canonicalUrl, graph }) {
  if (!Array.isArray(records) || !Array.isArray(groups) || !Array.isArray(graph?.["@graph"]))
    throw new Error("Translation alternates require route records, source groups and the canonical graph");
  const canonical = new URL(canonicalUrl);
  if (canonical.protocol !== "https:" || canonical.username || canonical.password || canonical.search || canonical.hash || canonical.pathname !== "/")
    throw new Error("Translation alternates require the canonical HTTPS homepage");
  const byPath = new Map();
  const output = records.map((record) => {
    if (!routePattern.test(record.path) || byPath.has(record.path))
      throw new Error("Translation alternates require unique authored paths: " + record.path);
    const copy = { ...record, alternates: [] };
    if (record.canonicalUrl !== canonical.origin + record.path)
      throw new Error("Translation route canonical does not match its authored path: " + record.path);
    byPath.set(record.path, copy);
    return copy;
  });
  const byId = new Map(graph["@graph"].map((node) => [node["@id"], node]));
  const questions = graph["@graph"].filter((node) => typeOf(node, "Question"));
  const assigned = new Set();
  for (const group of groups) {
    if (!Array.isArray(group?.members) || group.members.length < 2 || group.members.length > 50)
      throw new Error("Translation group requires 2 to 50 reviewed members");
    const paths = new Set(), languages = new Set();
    const members = group.members.map((member) => {
      const record = byPath.get(member.path);
      if (!record || assigned.has(member.path) || paths.has(member.path))
        throw new Error("Translation group has a missing, repeated or overlapping authored route: " + member.path);
      if (typeof member.lang !== "string" || !/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(member.lang) || record.lang !== member.lang)
        throw new Error("Translation member language differs from its visible route: " + member.path);
      const [base, region] = member.lang.split("-");
      const expectedHreflang = languageCodes[base] && languageCodes[base] + (region ? "-" + region : "");
      if (!expectedHreflang || member.hreflang !== expectedHreflang || languages.has(member.hreflang))
        throw new Error("Translation group has an unsupported or repeated hreflang: " + member.path);
      if (group.kind === "equivalent-guide") {
        const entity = byId.get(record.entityId);
        if (!entity || !values(entity.inLanguage).includes(member.lang) || !record.bodyHtml)
          throw new Error("Translation guide must resolve to its authored language and content: " + member.path);
        paths.add(member.path); languages.add(member.hreflang);
        return { record, href: record.canonicalUrl, hrefLang: member.hreflang };
      }
      const matches = questions.filter((node) => node.url === record.canonicalUrl && values(node.inLanguage).includes(member.lang));
      if (matches.length !== 1 || matches[0]["@id"] !== record.entityId)
        throw new Error("Translation route must describe its authored Question in the declared language: " + member.path);
      const answerRefs = values(matches[0].acceptedAnswer);
      const answer = answerRefs.length === 1 && byId.get(answerRefs[0]?.["@id"]);
      if (!typeOf(answer, "Answer") || !values(answer.inLanguage).includes(member.lang) || !answer.text)
        throw new Error("Translation Question requires its authored accepted Answer: " + member.path);
      paths.add(member.path); languages.add(member.hreflang);
      return { record, href: record.canonicalUrl, hrefLang: member.hreflang };
    });
    const alternates = members.map(({ href, hrefLang }) => ({ href, hrefLang }));
    for (const member of members) {
      member.record.alternates = alternates.map((alternate) => ({ ...alternate }));
      assigned.add(member.record.path);
    }
  }
  return output;
}
