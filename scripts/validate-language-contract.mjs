import { readFile } from "node:fs/promises";
import { parseFragment } from "parse5";
import {
  CONTENT_LANGUAGES,
  MULTILINGUAL_REGIONS,
  PRIMARY_DOCUMENT_LANGUAGE,
} from "../src/lib/language-contract.mjs";
import {
  deriveGooglePageMicrodata,
  deriveGooglePageNode,
} from "../src/lib/google-page-microdata.mjs";
import { projectNode } from "../src/lib/semantic-projection.mjs";

const fail = (message) => {
  throw new Error(message);
};
const [source, baseLayout, documentHead, knowledgeGraph, headProfile] =
  await Promise.all([
    readFile("src/content-source/page.md", "utf8"),
    readFile("src/layouts/BaseLayout.astro", "utf8"),
    readFile("src/components/DocumentHead.astro", "utf8"),
    readFile("src/data/semantic/knowledge-graph.jsonld", "utf8").then(
      JSON.parse,
    ),
    readFile("src/data/semantic/head-profile.json", "utf8").then(JSON.parse),
  ]);

if (PRIMARY_DOCUMENT_LANGUAGE !== "fa-IR")
  fail("Primary document language must remain fa-IR");
if (
  JSON.stringify(CONTENT_LANGUAGES) !==
  JSON.stringify(["fa-IR", "ar-IQ", "en", "ckb"])
)
  fail("Single-page language inventory drift");
if (new Set(CONTENT_LANGUAGES).size !== CONTENT_LANGUAGES.length)
  fail("Duplicate content language declaration");

const fragment = parseFragment(
  source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ""),
);
const attributes = (node) =>
  Object.fromEntries(
    (node.attrs || []).map((attribute) => [attribute.name, attribute.value]),
  );
const nodes = [];
const visit = (node) => {
  if (node?.tagName) nodes.push(node);
  for (const child of node?.childNodes || []) visit(child);
};
visit(fragment);
const authoredRegions = nodes.filter(
  (node) =>
    node.tagName === "details" &&
    (attributes(node).class || "")
      .split(/\s+/)
      .includes("multilingual-aesthetic-section"),
);
if (authoredRegions.length !== MULTILINGUAL_REGIONS.length)
  fail(
    `Authored multilingual region inventory drift: ${authoredRegions.length}`,
  );
for (let index = 0; index < MULTILINGUAL_REGIONS.length; index++) {
  const expected = MULTILINGUAL_REGIONS[index],
    node = authoredRegions[index],
    actual = attributes(node);
  if (
    actual.id !== expected.id ||
    actual.lang !== expected.lang ||
    actual.dir !== expected.dir
  )
    fail(`Authored multilingual container contract drift: ${expected.key}`);
  const declaredLanguage = CONTENT_LANGUAGES.find(
    (language) =>
      expected.lang === language || expected.lang.startsWith(`${language}-`),
  );
  if (!declaredLanguage)
    fail(
      `Multilingual region is outside the page language inventory: ${expected.key}`,
    );
  const nestedLanguages = [];
  const collectLanguages = (current) => {
    for (const child of current.childNodes || []) {
      const lang = attributes(child).lang;
      if (lang) nestedLanguages.push(lang);
      collectLanguages(child);
    }
  };
  collectLanguages(node);
  if (nestedLanguages.some((language) => language !== expected.lang))
    fail(
      `Nested language declaration escapes its authored container: ${expected.key}`,
    );
}
const webpageId = "https://www.ghezelbaash.ir/#webpage";
const canonicalPage = (knowledgeGraph["@graph"] || []).find(
  (node) => node?.["@id"] === webpageId,
);
if (!canonicalPage) fail("Canonical WebPage node missing");
if (
  JSON.stringify(canonicalPage.inLanguage) !== JSON.stringify(CONTENT_LANGUAGES)
)
  fail("Canonical WebPage language inventory drift");
const website = (knowledgeGraph["@graph"] || []).find(
  (node) => node?.["@id"] === "https://www.ghezelbaash.ir/#website",
);
if (JSON.stringify(website?.inLanguage) !== JSON.stringify(CONTENT_LANGUAGES))
  fail("Canonical WebSite language inventory drift");
const googlePage = deriveGooglePageNode(knowledgeGraph, headProfile, webpageId);
const personId = googlePage.mainEntity?.["@id"];
const canonicalPerson = (knowledgeGraph["@graph"] || []).find(
  (node) => node?.["@id"] === personId,
);
const googlePerson = projectNode(
  canonicalPerson,
  headProfile.nodes?.[personId],
);
const googlePageMicrodata = deriveGooglePageMicrodata(
  { "@graph": [googlePage, googlePerson] },
  webpageId,
);
const microdataLanguages = googlePageMicrodata.meta
  .filter((item) => item.itemprop === "inLanguage")
  .map((item) => item.content);
if (
  JSON.stringify(microdataLanguages) !== JSON.stringify(CONTENT_LANGUAGES) ||
  !baseLayout.includes(
    "import { deriveGooglePageMicrodata } from '../lib/google-page-microdata.mjs'",
  ) ||
  !baseLayout.includes("deriveGooglePageMicrodata(headGraph") ||
  !baseLayout.includes("googlePageMicrodata.meta.map")
)
  fail("Graph-derived multilingual WebPage/Microdata wiring missing");
const physicianHeader = nodes.find(
  (node) =>
    node.tagName === "header" &&
    attributes(node).itemid === "https://www.ghezelbaash.ir/#saeed-ghezelbash",
);
const physicianHeaderAttributes = attributes(physicianHeader || {});
const physicianRelations = new Set(
  (physicianHeaderAttributes.itemprop || "").split(/\s+/).filter(Boolean),
);
if (
  physicianHeaderAttributes.itemtype !== "https://schema.org/Person" ||
  !Object.hasOwn(physicianHeaderAttributes, "itemscope") ||
  JSON.stringify([...physicianRelations].sort()) !==
    JSON.stringify(["about", "author", "mainEntity", "publisher", "reviewedBy"])
)
  fail("Visible physician Microdata ownership drift");
if (/\bhreflang\s*=/.test(documentHead))
  fail("Single-URL document must not emit localized-alternate hreflang");

console.log(
  JSON.stringify(
    {
      stage: "LANGUAGE_CONTRACT",
      primary: PRIMARY_DOCUMENT_LANGUAGE,
      languages: CONTENT_LANGUAGES,
      regions: MULTILINGUAL_REGIONS,
      languageOwner: "authored-containers",
      pageProjection: "graph-derived",
      hreflang: "ABSENT_SINGLE_URL",
      status: "PASS",
    },
    null,
    2,
  ),
);
