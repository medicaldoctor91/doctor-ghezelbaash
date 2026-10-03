import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { inspectHtml } from "./html-contract.mjs";

const values = (value) => value == null ? [] : Array.isArray(value) ? value : [value];
const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value;
const hasClass = (node, name) => (attr(node, "class") || "").split(/\s+/).includes(name);
const types = (node) => values(node?.["@type"]).filter((value) => typeof value === "string").sort();
const refs = (value) => values(value).map((item) => typeof item === "string" ? item : item?.["@id"]).filter(Boolean);
const unique = (items) => [...new Set(items)];
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const normalizeText = (text) => text.normalize("NFC").replace(/\s+/gu, " ").trim();
const graphNodes = (graph) => Array.isArray(graph) ? graph : values(graph?.["@graph"]);
const graphIndex = (graph) => new Map(graphNodes(graph).map((node) => [node["@id"], node]));
const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));

function inheritedAttribute(node, name) {
  for (let current = node; current; current = current.parentNode) {
    const value = attr(current, name);
    if (value) return value;
  }
  return null;
}

function textContent(node) {
  if (["script", "style", "template"].includes(node.tagName)) return "";
  if (node.nodeName === "#text") return node.value || "";
  return (node.childNodes || []).map(textContent).join(" ");
}

function pageDocument(scoped) {
  const scripts = scoped.elements.filter((node) => node.tagName === "script" && attr(node, "type") === "application/ld+json");
  if (scripts.length !== 1) throw new Error(`Schema inventory requires one page JSON-LD document, found ${scripts.length}`);
  return JSON.parse(textContent({ childNodes: scripts[0].childNodes }));
}

/** Fingerprint the authored article body, excluding the generated route header. */
export function inspectSchemaInventoryScope(html, { scoped = inspectHtml(html), focused = false } = {}) {
  const article = scoped.elements.find((node) => node.tagName === "article" && hasClass(node, "medical-guide"));
  if (!article?.sourceCodeLocation?.startTag || !article.sourceCodeLocation.endTag)
    throw new Error("Schema inventory cannot locate the authored medical-guide article");
  const context = scoped.elements.find((node) => attr(node, "data-route-context") !== undefined);
  if (focused && !context?.sourceCodeLocation?.endOffset)
    throw new Error("Schema inventory cannot locate the focused route context boundary");
  const start = focused ? context.sourceCodeLocation.endOffset : article.sourceCodeLocation.startTag.endOffset;
  const end = article.sourceCodeLocation.endTag.startOffset;
  const elements = scoped.elements.filter((node) => {
    const location = node.sourceCodeLocation;
    return location && location.startOffset >= start && location.endOffset <= end;
  });
  const nodes = (article.childNodes || []).filter((node) => {
    const location = node.sourceCodeLocation;
    return location && location.startOffset >= start && location.endOffset <= end;
  });
  const text = normalizeText(nodes.map(textContent).join(" "));
  return {
    normalization: "parse5-text-nfc-whitespace-v1",
    textSha256: sha256(text),
    textLength: text.length,
    htmlIds: elements.map((node) => attr(node, "id")).filter(Boolean),
    headings: elements.filter((node) => /^h[1-6]$/.test(node.tagName)).map((node) => ({
      htmlId: attr(node, "id") || null,
      level: Number(node.tagName.slice(1)),
      lang: inheritedAttribute(node, "lang"),
    })),
    languageRegions: elements.filter((node) => attr(node, "lang")).map((node) => ({
      htmlId: attr(node, "id") || null,
      lang: attr(node, "lang"),
      dir: inheritedAttribute(node, "dir"),
    })),
  };
}

function resolvedReferences(value, scopedIndex, canonicalIndex) {
  return unique(refs(value)).map((id) => ({ id, types: types(scopedIndex.get(id) || canonicalIndex.get(id)) }));
}

function hierarchy(record) {
  return {
    parentPath: record?.navigation?.parent?.path || null,
    ancestorPaths: (record?.navigation?.ancestors || []).map((item) => item.path),
    childPaths: (record?.navigation?.children || []).map((item) => item.path),
    equivalentTo: record?.navigation?.equivalentTo || null,
    sourceOrder: record?.navigation?.sourceOrder ?? null,
  };
}

const relationshipProperties = [
  "about", "author", "creator", "publisher", "provider", "worksFor", "affiliation",
  "hasCredential", "subjectOf", "isBasedOn", "citation", "mainEntityOfPage", "hasPart",
];

function inventoryRow({ record, document, scope, canonicalGraph, canonicalUrl }) {
  const canonicalIndex = graphIndex(canonicalGraph);
  const nodes = graphNodes(document);
  const scopedIndex = graphIndex(document);
  const route = record?.path || "/";
  const url = record?.canonicalUrl || canonicalUrl;
  const pageId = record ? `${url}#webpage` : `${canonicalUrl}webpage`;
  const page = scopedIndex.get(pageId);
  if (!page) throw new Error(`Schema inventory cannot find page node for ${route}: ${pageId}`);
  const mainIds = refs(page.mainEntity);
  if (mainIds.length !== 1) throw new Error(`Schema inventory requires one main entity on ${route}`);
  const mainId = mainIds[0];
  const mainEntity = scopedIndex.get(mainId);
  if (!mainEntity) throw new Error(`Schema inventory main entity is absent from scoped graph on ${route}: ${mainId}`);
  if (record && (mainId !== record.entityId || !isDeepStrictEqual(types(mainEntity), [...record.entityTypes].sort()) || !types(page).includes(record.pageType)))
    throw new Error(`Schema inventory JSON-LD disagrees with the route record on ${route}`);
  const authored = canonicalIndex.get(mainId);
  const physicianTypes = types(authored);
  const pageTypes = types(page);
  const home = !record;
  const questions = nodes.filter((node) => types(node).includes("Question"));
  const videos = nodes.filter((node) => types(node).includes("VideoObject")).map((node) => node["@id"]).sort();
  const primaryVideoIds = types(mainEntity).includes("VideoObject") ? [mainId] : [];
  const relationships = Object.fromEntries(relationshipProperties.map((property) => [property, unique(refs(mainEntity[property]))]).filter(([, ids]) => ids.length));
  return {
    path: route,
    file: record?.file || "index.html",
    canonicalUrl: url,
    title: record?.title || null,
    pageId,
    pageTypes,
    mainEntity: {
      id: mainId,
      types: types(mainEntity),
      origin: authored ? "authored" : "derived",
      authoredTypes: types(authored),
      relationships,
    },
    entitySelection: clone(record?.entitySelection || (home ? {
      basis: "authored-entity-id", authoredSourceId: mainId, authoredSourceTypes: physicianTypes,
    } : undefined)),
    schemaClassification: clone(record?.schemaClassification || (home ? {
      reason: "authored-homepage-schema", purpose: "medical-guide-and-physician", sourceRoleIds: [pageId, mainId],
    } : undefined)),
    about: resolvedReferences(page.about, scopedIndex, canonicalIndex),
    mainEntityAbout: resolvedReferences(mainEntity.about, scopedIndex, canonicalIndex),
    topicSelection: clone(record?.topicSelection || (home ? {
      basis: "own-about", authoredSourceId: pageId,
      references: refs(page.about).map((id) => ({ "@id": id })),
    } : undefined)),
    scopedGraph: {
      nodeCount: nodes.length,
      nodes: nodes.map((node) => ({ id: node["@id"], types: types(node) })).sort((a, b) => a.id.localeCompare(b.id, "en")),
    },
    lang: record?.lang || values(page.inLanguage)[0] || null,
    dir: record?.dir || "rtl",
    hierarchy: hierarchy(record),
    scopeKind: record?.scopeKind || "complete-homepage",
    sourceHtmlId: record?.htmlId || null,
    scope,
    faq: {
      questionIds: questions.map((node) => node["@id"]).sort(),
      questions: questions.map((node) => ({
        id: node["@id"],
        acceptedAnswerIds: unique(refs(node.acceptedAnswer)),
        sourceUrls: unique(values(canonicalIndex.get(node["@id"])?.url || node.url).map((value) => typeof value === "string" ? value : value?.["@value"]).filter(Boolean)),
        origin: canonicalIndex.has(node["@id"]) ? "authored" : "derived",
      })).sort((a, b) => a.id.localeCompare(b.id, "en")),
    },
    primaryVideoIds,
    supportingVideoIds: videos.filter((id) => !primaryVideoIds.includes(id)),
  };
}

/** Build-only inventory: intentionally contains hashes and IDs, not article prose. */
export function createSchemaInventory({ homeHtml, records, canonicalGraph, canonicalUrl, scopeByPath }) {
  const scoped = inspectHtml(homeHtml);
  const home = inventoryRow({
    document: pageDocument(scoped),
    scope: inspectSchemaInventoryScope(homeHtml, { scoped }),
    canonicalGraph, canonicalUrl,
  });
  const rows = [home, ...records.map((record) => {
    const scope = scopeByPath instanceof Map ? scopeByPath.get(record.path) : scopeByPath?.[record.path];
    if (!scope) throw new Error(`Schema inventory requires the rendered authored scope for ${record.path}`);
    return inventoryRow({ record, document: record.document, scope, canonicalGraph, canonicalUrl });
  }).sort((a, b) => a.path.localeCompare(b.path, "en"))];
  const inventory = {
    formatVersion: 1,
    canonicalUrl,
    coverage: { homepage: 1, focusedPages: records.length, totalPages: rows.length },
    rows,
  };
  validateSchemaInventoryCoverage(inventory, { records, canonicalUrl });
  return inventory;
}

const csvCell = (value) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function serializeSchemaInventoryCsv(inventory) {
  const columns = ["route", "page_types", "main_entity_id", "main_entity_types", "main_entity_origin", "entity_selection_basis", "classification_reason", "purpose", "source_role_ids", "about_ids", "topic_selection_basis", "graph_node_count", "lang", "scope_kind", "scope_text_sha256", "primary_video_ids", "supporting_video_ids"];
  const rows = inventory.rows.map((row) => [
    row.path, row.pageTypes.join("|"), row.mainEntity.id, row.mainEntity.types.join("|"), row.mainEntity.origin,
    row.entitySelection?.basis, row.schemaClassification?.reason, row.schemaClassification?.purpose,
    row.schemaClassification?.sourceRoleIds?.join("|"), row.about.map((item) => item.id).join("|"),
    row.topicSelection?.basis, row.scopedGraph.nodeCount, row.lang, row.scopeKind, row.scope.textSha256,
    row.primaryVideoIds.join("|"), row.supportingVideoIds.join("|"),
  ]);
  return [columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function validateSchemaInventoryCoverage(inventory, { records, canonicalUrl }) {
  if (inventory?.formatVersion !== 1 || inventory.canonicalUrl !== canonicalUrl || !Array.isArray(inventory.rows))
    throw new Error("Schema inventory format or canonical URL mismatch");
  const expectedPaths = ["/", ...records.map((record) => record.path)].sort();
  const paths = inventory.rows.map((row) => row.path).sort();
  if (!isDeepStrictEqual(paths, expectedPaths) || new Set(paths).size !== paths.length)
    throw new Error("Schema inventory must cover the homepage and every focused route exactly once");
  const coverage = { homepage: 1, focusedPages: records.length, totalPages: records.length + 1 };
  if (!isDeepStrictEqual(inventory.coverage, coverage)) throw new Error("Schema inventory coverage count mismatch");
  for (const row of inventory.rows) {
    if (!row.pageTypes?.length || !row.mainEntity?.id || !row.mainEntity.types?.length || !["authored", "derived"].includes(row.mainEntity.origin))
      throw new Error(`Schema inventory lacks page or main entity classification on ${row.path}`);
    if (!row.entitySelection?.basis || !row.topicSelection?.basis || !row.schemaClassification?.reason || !Array.isArray(row.schemaClassification.sourceRoleIds))
      throw new Error(`Schema inventory lacks source selection evidence on ${row.path}`);
    if (!/^[0-9a-f]{64}$/.test(row.scope?.textSha256) || !Array.isArray(row.scope.htmlIds) || !Array.isArray(row.scope.headings))
      throw new Error(`Schema inventory lacks an authored scope fingerprint on ${row.path}`);
    if (row.scopedGraph?.nodeCount !== row.scopedGraph?.nodes?.length || new Set(row.scopedGraph.nodes.map((node) => node.id)).size !== row.scopedGraph.nodeCount)
      throw new Error(`Schema inventory scoped graph shape mismatch on ${row.path}`);
    const nodeIds = new Set(row.scopedGraph.nodes.map((node) => node.id));
    if (!nodeIds.has(row.pageId) || !nodeIds.has(row.mainEntity.id))
      throw new Error(`Schema inventory page or main entity absent from scoped graph on ${row.path}`);
    if (row.sourceHtmlId && !row.scope.htmlIds.includes(row.sourceHtmlId))
      throw new Error(`Schema inventory source target absent from initial authored scope on ${row.path}`);
    if (!isDeepStrictEqual(row.mainEntity.types, row.scopedGraph.nodes.find((node) => node.id === row.mainEntity.id)?.types) ||
        !isDeepStrictEqual(row.pageTypes, row.scopedGraph.nodes.find((node) => node.id === row.pageId)?.types))
      throw new Error(`Schema inventory page/main types disagree with scoped graph on ${row.path}`);
    if (row.mainEntity.origin === "authored" && row.entitySelection.authoredSourceId !== row.mainEntity.id ||
        row.mainEntity.origin === "derived" && row.entitySelection.authoredSourceId !== null)
      throw new Error(`Schema inventory main entity origin disagrees with authored source evidence on ${row.path}`);
    const aboutIds = new Set(row.about.map((item) => item.id));
    if (refs(row.topicSelection.references).some((id) => !aboutIds.has(id)))
      throw new Error(`Schema inventory selected topics are absent from page about references on ${row.path}`);
    const classification = row.schemaClassification;
    if (["reviewed-source-purpose", "dedicated-profile"].includes(classification.reason)) {
      const allowedSources = [row.path, ...row.hierarchy.ancestorPaths].map((route) => new URL(route, canonicalUrl).href);
      if (!classification.sourceRoleIds.length || classification.sourceRoleIds.some((id) => !allowedSources.includes(id)))
        throw new Error(`Schema inventory reviewed purpose is not bound to authored route ancestry on ${row.path}`);
    }
    if (classification.reason === "dedicated-profile" && (!row.mainEntity.types.includes("Person") || !row.pageTypes.includes("ProfilePage")))
      throw new Error(`Schema inventory dedicated profile lacks its Person/ProfilePage on ${row.path}`);
    if (classification.reason === "media-target" &&
        (!row.mainEntity.types.some((type) => ["VideoObject", "ImageObject"].includes(type)) || !isDeepStrictEqual(classification.sourceRoleIds, [row.mainEntity.id])))
      throw new Error(`Schema inventory media classification lacks its selected media evidence on ${row.path}`);
    if (["medical-about", "medical-registry-term"].includes(classification.reason) &&
        (!classification.sourceRoleIds.length || classification.sourceRoleIds.some((id) => !aboutIds.has(id))))
      throw new Error(`Schema inventory medical classification lacks direct about evidence on ${row.path}`);
    for (const question of row.faq.questions) {
      if (!nodeIds.has(question.id) || question.acceptedAnswerIds.some((id) => !nodeIds.has(id)))
        throw new Error(`Schema inventory FAQ question/answer absent from scoped graph on ${row.path}`);
    }
    if ([...row.primaryVideoIds, ...row.supportingVideoIds].some((id) => !row.scopedGraph.nodes.some((node) => node.id === id && node.types.includes("VideoObject"))))
      throw new Error(`Schema inventory selected video absent from scoped graph on ${row.path}`);
  }
  return { status: "PASS", ...coverage };
}

/** Reuse the caller's parsed elements when validating each physical document. */
export function validateSchemaInventoryRow(row, { record, html, scoped = inspectHtml(html), canonicalGraph, canonicalUrl }) {
  const expected = inventoryRow({
    record,
    document: pageDocument(scoped),
    scope: inspectSchemaInventoryScope(html, { scoped, focused: Boolean(record) }),
    canonicalGraph, canonicalUrl,
  });
  if (!isDeepStrictEqual(row, expected)) {
    const changed = unique([...Object.keys(row || {}), ...Object.keys(expected)]).filter((key) => !isDeepStrictEqual(row?.[key], expected[key]));
    throw new Error(`Schema inventory differs from physical JSON-LD/source scope on ${expected.path}: ${changed.join(", ")}`);
  }
  return { status: "PASS", path: expected.path, graphNodes: expected.scopedGraph.nodeCount };
}

/** Standalone validation, for callers without an existing per-document loop. */
export async function validateSchemaInventory(inventory, { records, homeHtml, canonicalGraph, canonicalUrl, dist }) {
  const coverage = validateSchemaInventoryCoverage(inventory, { records, canonicalUrl });
  const rowByPath = new Map(inventory.rows.map((row) => [row.path, row]));
  validateSchemaInventoryRow(rowByPath.get("/"), { html: homeHtml, canonicalGraph, canonicalUrl });
  for (const record of records) {
    const html = await readFile(path.join(dist, record.file), "utf8");
    validateSchemaInventoryRow(rowByPath.get(record.path), { record, html, canonicalGraph, canonicalUrl });
  }
  return coverage;
}
