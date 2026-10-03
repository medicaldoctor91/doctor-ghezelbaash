import path from "node:path";
import { datasetRevisionDate, validRevisionDate } from "../release-graph.mjs";
import { contentRoutePaths } from "../content-routes.mjs";
import { writeFile } from "node:fs/promises";
import { parseFragment } from "parse5";
import {
  sha256,
  valueText,
} from "../projection-context.mjs";
import { exactLanguageLiteral } from "../../../src/lib/semantic-projection.mjs";

const attribute = (node, name) =>
  node.attrs?.find((candidate) => candidate.name === name)?.value;
const absoluteLink = (href, canonicalUrl) => {
  const url = new URL(href, canonicalUrl);
  if (!["https:", "http:", "mailto:", "tel:"].includes(url.protocol))
    throw new Error(`Retrieval link has an unsupported scheme: ${href}`);
  return url.href.replaceAll("(", "%28").replaceAll(")", "%29");
};
const inlineText = (node, canonicalUrl) => {
  if (node.nodeName === "#text") return node.value;
  if (["script", "style", "template"].includes(node.tagName)) return "";
  if (node.tagName === "br") return "\n";
  const text = (node.childNodes ?? [])
    .map((child) => inlineText(child, canonicalUrl))
    .join("");
  if (node.tagName === "a" && attribute(node, "href"))
    return `[${text.trim()}](${absoluteLink(attribute(node, "href"), canonicalUrl)})`;
  if (["strong", "b"].includes(node.tagName)) return `**${text}**`;
  if (["em", "i"].includes(node.tagName)) return `*${text}*`;
  if (node.tagName === "code") return `\`${text}\``;
  // List items inside a block keep their boundaries even when nested.
  if (node.tagName === "li") return `\n- ${text}\n`;
  if (["p", "div"].includes(node.tagName)) return `\n${text}\n`;
  return text;
};
const blockText = (node, canonicalUrl) =>
  inlineText(node, canonicalUrl)
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();

const hasNestedLanguage = (node, language) => {
  if (["script", "style", "template"].includes(node.tagName)) return false;
  const ownLanguage = attribute(node, "lang");
  return (ownLanguage !== undefined && ownLanguage !== language) ||
    (node.childNodes ?? []).some((child) => hasNestedLanguage(child, language));
};

// A caption or paragraph can contain a separately authored language group.
// Render each contiguous group under its actual language and source ID while
// retaining inline links and formatting, including wrappers around the group.
const languageRuns = (node, base, canonicalUrl, blockTags) => {
  const append = (runs, run) => {
    if (!run.text) return;
    const previous = runs.at(-1);
    if (previous && previous.lang === run.lang && previous.id === run.id)
      previous.text += run.text;
    else runs.push({ ...run });
  };
  const render = (current, inheritedLanguage, inheritedId) => {
    const tag = current.tagName;
    if (["script", "style", "template"].includes(tag)) return [];
    const ownLanguage = attribute(current, "lang");
    const lang = ownLanguage === undefined ? inheritedLanguage : ownLanguage;
    const ownId = attribute(current, "id");
    const id = ownId !== undefined &&
      ((ownLanguage !== undefined && lang !== inheritedLanguage) || blockTags.has(tag))
      ? ownId : inheritedId;
    if (current.nodeName === "#text") return [{ lang, id, text: current.value }];
    if (tag === "br") return [{ lang, id, text: "\n" }];
    const runs = [];
    for (const child of current.childNodes ?? [])
      for (const run of render(child, lang, id)) append(runs, run);
    return runs.map((run) => {
      let text = run.text;
      if (tag === "a" && attribute(current, "href") && text.trim())
        text = `[${text.trim()}](${absoluteLink(attribute(current, "href"), canonicalUrl)})`;
      else if (["strong", "b"].includes(tag) && text.trim()) text = `**${text}**`;
      else if (["em", "i"].includes(tag) && text.trim()) text = `*${text}*`;
      else if (tag === "code" && text.trim()) text = `\`${text}\``;
      else if (tag === "li") text = `\n- ${text}\n`;
      else if (["p", "div"].includes(tag)) text = `\n${text}\n`;
      return { ...run, text };
    });
  };
  return render(node, base.lang, base.id).map((run) => {
    let text = run.text.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
    if (base.tag === "li") text = text.replace(/^- /, "");
    return { ...base, ...run, text, languageGroup: true };
  }).filter((run) => run.text);
};

const headingTag = (tag) => /^h[1-6]$/.test(tag ?? "");
const containsHeading = (node) =>
  headingTag(node.tagName) ||
  (!["script", "style", "template"].includes(node.tagName) &&
    (node.childNodes ?? []).some(containsHeading));

const inlineProseTags = new Set([
  "a", "b", "br", "code", "em", "i", "small", "span", "strong", "sub", "sup", "time",
]);
const proseContainer = (node) =>
  node.nodeName === "#document-fragment" ||
  ["article", "main", "section"].includes(node.tagName) ||
  (node.tagName === "div" && String(attribute(node, "class") ?? "")
    .split(/\s+/u).some((name) => ["render-chunk", "content-section", "medical-guide"].includes(name)));

// Both text distributions consume this single structural representation of HTML.
// Unsupported structural shapes fail here instead of silently losing content.
export function buildRetrievalBlocks(html, { canonicalUrl, language }) {
  const blocks = [];
  const blockTags = new Set([
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "li",
    "figcaption",
    "summary",
    "address",
  ]);
  const visit = (node, inheritedLanguage) => {
    const ownLanguage = attribute(node, "lang");
    const lang = ownLanguage === undefined ? inheritedLanguage : ownLanguage;
    const tag = node.tagName;
    if (["script", "style", "template"].includes(tag)) return;
    // A details summary may contain a real heading. Preserve that heading's
    // source ID and language instead of flattening it into anonymous summary text.
    if (tag === "summary" && (node.childNodes ?? []).some(containsHeading)) {
      for (const child of node.childNodes ?? []) visit(child, lang);
      return;
    }
    const base = {
      tag,
      id: attribute(node, "id"),
      retrievalAlias: attribute(node, "data-retrieval-alias"),
      answerId:
        String(attribute(node, "class") || "")
          .split(/\s+/u)
          .includes("answer-projection")
          ? attribute(node, "id")
          : undefined,
      lang,
    };
    if (tag === "table") {
      const captions = [],
        rows = [];
      const scan = (child) => {
        if (child !== node && child.tagName === "table")
          throw new Error("Retrieval does not accept nested tables");
        if (child.tagName === "caption")
          captions.push(blockText(child, canonicalUrl));
        else if (child.tagName === "tr") {
          const cells = (child.childNodes ?? []).filter((cell) =>
            ["th", "td"].includes(cell.tagName),
          );
          if (
            cells.some((cell) =>
              ["colspan", "rowspan"].some(
                (key) => Number(attribute(cell, key) ?? 1) !== 1,
              ),
            )
          )
            throw new Error(
              "Retrieval table spans require explicit header-to-cell mapping",
            );
          rows.push(
            cells.map((cell) => ({
              header: cell.tagName === "th",
              text: blockText(cell, canonicalUrl),
            })),
          );
        } else for (const nested of child.childNodes ?? []) scan(nested);
      };
      scan(node);
      if (
        captions.length > 1 ||
        !rows.length ||
        !rows[0].length ||
        rows.some((row) => row.length !== rows[0].length) ||
        !rows[0].every((cell) => cell.header)
      )
        throw new Error("Retrieval table requires one rectangular header grid");
      blocks.push({ ...base, caption: captions[0] ?? "", rows });
      return;
    }
    if (tag === "dl") {
      let terms = [],
        definitions = [];
      const flush = () => {
        if (!terms.length || !definitions.length)
          throw new Error(
            "Retrieval definition list has an unpaired term or definition",
          );
        blocks.push({ ...base, tag: "definition", terms, definitions });
        terms = [];
        definitions = [];
      };
      for (const child of node.childNodes ?? []) {
        if (child.nodeName === "#text" && !child.value.trim()) continue;
        if (child.tagName === "dt") {
          if (definitions.length) flush();
          terms.push(blockText(child, canonicalUrl));
        } else if (child.tagName === "dd")
          definitions.push(blockText(child, canonicalUrl));
        else if (child.nodeName !== "#comment")
          throw new Error(
            "Retrieval definition list contains unsupported structure",
          );
      }
      if (terms.length || definitions.length) flush();
      return;
    }
    if (blockTags.has(tag)) {
      // Heading ancestry and canonical answer atoms retain their authored
      // document language. Ordinary prose/captions can carry language islands.
      if (!headingTag(tag) && !base.answerId && hasNestedLanguage(node, lang)) {
        blocks.push(...languageRuns(node, base, canonicalUrl, blockTags));
        return;
      }
      let text = blockText(node, canonicalUrl);
      if (tag === "li") text = text.replace(/^- /, "");
      if (text) blocks.push({ ...base, text });
      return;
    }
    if (proseContainer(node)) {
      // HTML also permits meaningful text between paragraph elements. Keep
      // those inline runs under the nearest real heading, without exporting
      // unrelated button labels, trust controls or video fallback messages.
      let inline = [];
      const flushInline = () => {
        if (inline.length) visit({ tagName: "p", attrs: [], childNodes: inline }, lang);
        inline = [];
      };
      for (const child of node.childNodes ?? []) {
        if (child.nodeName === "#text" ||
          (inlineProseTags.has(child.tagName) && !containsHeading(child))) inline.push(child);
        else {
          flushInline();
          visit(child, lang);
        }
      }
      flushInline();
      return;
    }
    for (const child of node.childNodes ?? []) visit(child, lang);
  };
  visit(parseFragment(html), language);
  for (const block of blocks)
    if (typeof block.lang !== "string" || !block.lang)
      throw new Error(`Retrieval block lacks a direct language: ${block.tag}`);
  return blocks;
}

const bold = (text) =>
  text.startsWith("**") && text.endsWith("**") ? text : `**${text}**`;

export function renderRetrievalBlock(block) {
  if (block.tag === "table") {
    const row = (cells) =>
      `| ${cells.map((cell) => cell.text.replaceAll("|", "\\|").replaceAll("\n", "<br>")).join(" | ")} |`;
    return [
      block.caption,
      "",
      row(block.rows[0]),
      row(block.rows[0].map(() => ({ text: "---" }))),
      ...block.rows.slice(1).map(row),
    ]
      .join("\n")
      .trim();
  }
  if (block.tag === "definition")
    return [...block.terms.map(bold), ...block.definitions].join("\n");
  if (/^h[1-6]$/.test(block.tag))
    return `${"#".repeat(Number(block.tag[1]))} ${block.text}`;
  if (block.tag === "li") return `- ${block.text}`;
  if (block.tag === "summary") return bold(block.text);
  return block.text;
}
const sentenceChunks = (text, max) => {
  const units = String(text)
    .split(/(?<=[.!؟!?])\s+|\n+/u)
    .map((value) => value.trim())
    .filter(Boolean);
  const out = [];
  let buffer = "";
  for (const unitSource of units) {
    const unit = unitSource;
    if (unit.length > max) {
      if (buffer) {
        out.push(buffer);
        buffer = "";
      }
      for (let index = 0; index < unit.length; index += max)
        out.push(unit.slice(index, index + max));
      continue;
    }
    const candidate = buffer ? `${buffer} ${unit}` : unit;
    if (candidate.length > max) {
      if (buffer) out.push(buffer);
      buffer = unit;
    } else buffer = candidate;
  }
  if (buffer) out.push(buffer);
  return out;
};

/** Topic boundaries and visible heading ancestry shared by passage exports. */
export function buildRetrievalSections(blocks) {
  const sections = [], headingPath = [];
  let current;
  const flush = () => {
    if (current?.parts.length) sections.push(current);
  };
  for (const block of blocks) {
    if (headingTag(block.tag)) {
      if (!block.id)
        throw new Error(`Retrieval heading lacks an ID: ${block.text}`);
      flush();
      const level = Number(block.tag[1]);
      while (headingPath.length && headingPath.at(-1).level >= level)
        headingPath.pop();
      headingPath.push({
        level, title: block.text, id: block.id, lang: block.lang,
      });
      current = {
        level,
        title: block.text,
        id: block.id,
        retrievalAlias: block.retrievalAlias,
        lang: block.lang,
        headingPath: [...headingPath],
        parts: [],
      };
    } else {
      if (!current)
        throw new Error(`Retrieval content precedes its heading: ${block.tag}`);
      if (block.lang !== current.lang) {
        const previous = current;
        const languageHeading = previous.headingPath.findLast(
          (heading) => heading.lang === block.lang,
        );
        flush();
        current = {
          level: previous.level,
          title: block.tag === "summary" ? block.text : previous.title,
          id: block.id === undefined ? languageHeading?.id ?? previous.id : block.id,
          retrievalAlias:
            block.retrievalAlias === undefined
              ? previous.retrievalAlias
              : block.retrievalAlias,
          lang: block.lang,
          headingPath: [...previous.headingPath],
          parts: [],
        };
      }
      current.parts.push({
        text: renderRetrievalBlock(block),
        atomic: ["table", "definition"].includes(block.tag) ||
          Boolean(block.answerId),
        answerId: block.answerId,
      });
    }
  }
  flush();
  return sections;
}

export async function compileRetrievalCorpus(context, { answerRecords } = {}) {
  const {
    projections,
    pageBody,
    pageFrontmatter,
    release,
    retrievalPolicy,
    graph,
    byId,
    sourceNodesForUrl,
    evidenceRegistry,
    evidenceSnapshot,
    evidenceByUrl,
    tierAEvidenceIds,
    evidenceRefsForNode,
    identityFingerprintSha256,
  } = context;
  const currentDatasetDate = datasetRevisionDate(graph, release);
  if (!Array.isArray(answerRecords))
    throw new Error(
      "Retrieval compiler requires answerRecords[] from semantic compiler",
    );

  const pageTitle = pageFrontmatter.title;
  const pageLanguage = pageFrontmatter.lang;
  if (![pageTitle, pageLanguage].every((value) => typeof value === "string" && value.trim()))
    throw new Error("Canonical page requires a nonempty title and lang");
  const blocks = buildRetrievalBlocks(pageBody, {
    canonicalUrl: release.canonicalUrl,
    language: pageLanguage,
  });
  const sourcePaths = new Set(contentRoutePaths(pageBody, release.canonicalUrl));
  const sourceUrlForId = (id) => new URL(
    sourcePaths.has(`/${id}`) ? id : `#${id}`,
    release.canonicalUrl,
  ).href;

  let markdown = [
    `# ${pageTitle}`,
    "",
    `> Canonical human source: ${release.canonicalUrl}`,
    `> Primary entity: ${release.primaryEntity.id} | Google KG ${release.primaryEntity.googleKnowledgeGraphId} | Wikidata ${release.primaryEntity.wikidata}`,
    `> Release: ${release.release} | Reviewed: ${release.medicalReviewedAt}`,
    "",
    "",
  ].join("\n");
  for (const block of blocks) {
    markdown += `${renderRetrievalBlock(block)}\n`;
    if (headingTag(block.tag) || block.languageGroup) {
      if (block.id)
        markdown += `<!-- anchor: ${sourceUrlForId(block.id)} -->\n`;
      if (block.retrievalAlias)
        markdown += `<!-- retrieval-alias: ${block.retrievalAlias} -->\n`;
    }
    if (block.answerId)
      markdown += `<!-- answer-id: ${new URL(block.answerId, release.canonicalUrl).href} -->\n`;
    markdown += "\n";
  }
  markdown = markdown.replace(/\n{3,}/g, "\n\n");
  await writeFile(path.join(projections, "index.md"), markdown);

  const sections = buildRetrievalSections(blocks);

  const maxPassage = retrievalPolicy.maxPassageChars;
  if (!Number.isInteger(maxPassage) || maxPassage < 1)
    throw new Error("Canonical page retrieval.maxPassageChars must be a positive integer");
  const emitted = [];
  for (const section of sections) {
    const chunks = [];
    let pending = "";
    let pendingAnswerIds = [];
    const flushPending = () => {
      if (!pending) return;
      chunks.push({ text: pending, answerIds: pendingAnswerIds });
      pending = "";
      pendingAnswerIds = [];
    };
    for (const part of section.parts) {
      const units = part.atomic
        ? [part.text]
        : sentenceChunks(part.text, maxPassage);
      if (part.answerId) {
        flushPending();
        for (const text of units)
          chunks.push({
            text,
            answerIds: [`${new URL(part.answerId, release.canonicalUrl).href}`],
          });
        continue;
      }
      for (const text of units) {
        if (text.length > maxPassage)
          throw new Error(
            `Retrieval atomic structure exceeds passage budget: ${section.id}`,
          );
        const candidate = pending ? `${pending}\n${text}` : text;
        if (candidate.length > maxPassage) {
          flushPending();
          pending = text;
        } else pending = candidate;
      }
    }
    flushPending();
    chunks.forEach(({ text, answerIds }, index) => {
      const anchor = sourceUrlForId(section.id);
      for (const answerId of answerIds) {
        const answer = byId.get(answerId);
        if (!answer || answer.url !== anchor)
          throw new Error(`Retrieval answer source binding drift: ${answerId}`);
      }
      const hash = sha256(Buffer.from(`${anchor}|${index}|${text}`)).slice(
        0,
        16,
      );
      const entityIds = [release.primaryEntity.id];
      if (/کلینیک|clinic|کلینیکەکە/i.test(text))
        entityIds.push(release.clinic.id);
      const graphNodes = sourceNodesForUrl(anchor);
      const graphNodeIds = graphNodes.map((node) => node["@id"]);
      const inlineEvidenceIds = [...evidenceByUrl]
        .filter(([url]) => text.includes(url))
        .map(([, id]) => id);
      const claimEvidenceIds = [
        ...new Set([
          ...graphNodes
            .filter(
              (node) =>
                node["@id"] !== release.primaryEntity.id &&
                node["@id"] !== release.clinic.id,
            )
            .flatMap(evidenceRefsForNode),
          ...inlineEvidenceIds,
        ]),
      ];
      const entityEvidenceIds = [
        ...new Set(
          entityIds.flatMap((id) => evidenceRefsForNode(byId.get(id))),
        ),
      ];
      const evidenceIds = [
        ...new Set([...claimEvidenceIds, ...entityEvidenceIds]),
      ];
      const tierA = evidenceIds.filter((id) => tierAEvidenceIds.has(id));
      emitted.push({
        ...section,
        text,
        anchor,
        part: index + 1,
        partsTotal: chunks.length,
        hash,
        lang: section.lang,
        entityIds,
        graphNodeIds,
        evidenceIds,
        claimEvidenceIds,
        entityEvidenceIds,
        tierAEvidenceIds: tierA,
        answerIds,
      });
    });
  }

  const person = byId.get(release.primaryEntity.id);
  if (!person) throw new Error("Retrieval graph lacks the canonical physician");
  const englishPersonName = exactLanguageLiteral(
    person.name,
    "en",
    "Canonical physician name",
  );
  const persianPersonName = exactLanguageLiteral(
    person.name,
    "fa",
    "Canonical physician name",
  );
  let full = [
    "# ENTITY",
    `NAME: ${englishPersonName}`,
    `PERSIAN_NAME: ${persianPersonName}`,
    `ENTITY_ID: ${release.primaryEntity.id}`,
    `GOOGLE_KG: ${release.primaryEntity.googleKnowledgeGraphId}`,
    `WIKIDATA: ${release.primaryEntity.wikidata}`,
    `OWNED_CLINIC: ${release.clinic.id}`,
    `CLINIC_KG: ${release.clinic.googleLocalKgmid}`,
    `PLACE_ID: ${release.clinic.placeId}`,
    `CID: ${release.clinic.cid}`,
    `POSTAL_CODE: ${release.clinic.postalCode}`,
    `HOURS: ${release.clinic.hours}`,
    ...(release.clinic.priceRange ? [`PRICE_RANGE: ${release.clinic.priceRange}`] : []),
    `CANONICAL: ${release.canonicalUrl}`,
    `RELEASE: ${release.release}`,
    `MODIFIED: ${currentDatasetDate}`,
    `MEDICALLY_REVIEWED: ${release.medicalReviewedAt}`,
    `IDENTITY_FINGERPRINT_SHA256: ${identityFingerprintSha256}`,
    `PASSAGE_COUNT: ${emitted.length}`,
    "",
    "",
  ].join("\n");
  for (const passage of emitted) {
    full += [
      "[PASSAGE]",
      `PASSAGE_ID: ${passage.hash}`,
      `LEVEL: H${passage.level}`,
      `TITLE: ${passage.title}`,
      `HEADING_PATH: ${passage.headingPath.map((heading) => `H${heading.level} ${heading.title}`).join(" | ")}`,
      `HEADING_IDS: ${passage.headingPath.map((heading) => new URL(heading.id, release.canonicalUrl).href).join(" | ")}`,
      `ANCHOR: ${passage.anchor}`,
      ...(passage.graphNodeIds.length
        ? [`GRAPH_NODE_IDS: ${passage.graphNodeIds.join(" | ")}`]
        : []),
      ...(passage.answerIds.length
        ? [`ANSWER_IDS: ${passage.answerIds.join(" | ")}`]
        : []),
      `PART: ${passage.part}/${passage.partsTotal}`,
      `LANGUAGE: ${passage.lang}`,
      `ENTITY_IDS: ${passage.entityIds.join(" | ")}`,
      `SOURCE_HASH_SHA256: ${sha256(Buffer.from(passage.text))}`,
      `EVIDENCE_IDS: ${passage.evidenceIds.join(" | ")}`,
      `CLAIM_EVIDENCE_IDS: ${passage.claimEvidenceIds.join(" | ")}`,
      `ENTITY_EVIDENCE_IDS: ${passage.entityEvidenceIds.join(" | ")}`,
      `TIER_A_EVIDENCE_IDS: ${passage.tierAEvidenceIds.join(" | ")}`,
      "PROVENANCE_CLASS: first-party physician-reviewed canonical content",
      `PROVENANCE: ${release.canonicalUrl} visible canonical HTML`,
      `REVIEWED_BY: ${release.reviewedBy}`,
      `REVIEWED_AT: ${release.medicalReviewedAt}`,
      ...(passage.retrievalAlias
        ? [`RETRIEVAL_ALIASES: ${passage.retrievalAlias}`]
        : []),
      "TEXT:",
      passage.text,
      "[/PASSAGE]",
      "",
      "",
    ].join("\n");
  }
  await writeFile(path.join(projections, "llms-full.txt"), full);

  const provenanceGraph = [
    {
      "@id": `${release.canonicalUrl}provenance.jsonld/dataset`,
      "@type": ["Dataset", "prov:Entity"],
      name: `${englishPersonName} claim and passage provenance graph`,
      creator: { "@id": release.primaryEntity.id },
      publisher: { "@id": release.primaryEntity.id },
      about: [
        { "@id": release.primaryEntity.id },
        { "@id": release.clinic.id },
      ],
      version: release.release,
      dateModified: currentDatasetDate,
      isBasedOn: { "@id": release.dataset.id },
      identifier: {
        "@type": "PropertyValue",
        propertyID: "Primary entity identity fingerprint SHA-256",
        value: identityFingerprintSha256,
      },
    },
  ];
  for (const evidence of evidenceRegistry.evidence) {
    if (!Array.isArray(evidence.supports) || !evidence.role)
      throw new Error(`Evidence supports[] or role missing: ${evidence.id}`);
    const source = byId.get(evidence.id);
    const sourceTypes = [source?.["@type"] ?? "CreativeWork"].flat();
    const sourceSubjects =
      source?.about ?? evidence.subjectIds?.map((id) => ({ "@id": id }));
    // This stable IRI already denotes the cited source in the canonical graph.
    // Its publisher, modification date, and subject must not become our assessment metadata.
    provenanceGraph.push({
      "@id": evidence.id,
      "@type": [...new Set([...sourceTypes, "prov:Entity"])],
      ...(source?.name ? { name: source.name } : {}),
      url: evidence.url,
      ...(sourceSubjects?.length || sourceSubjects?.["@id"]
        ? { about: sourceSubjects }
        : {}),
    });
    provenanceGraph.push(byId.get(evidence.assessmentId));
  }
  provenanceGraph.push(...evidenceRegistry.tierNodes, evidenceRegistry.registryNode);
  for (const passage of emitted) {
    // A passage inherits only explicitly recorded revisions of its bound
    // canonical sources. The archived release date is not its revision date.
    const sourceIds = [...new Set([
      ...passage.graphNodeIds,
      ...passage.answerIds,
    ])];
    const sourceRevisions = sourceIds
      .map((id) => byId.get(id)?.dateModified)
      .filter((date) => date !== undefined);
    if (sourceRevisions.some((date) =>
      !validRevisionDate(date) || date > currentDatasetDate,
    ))
      throw new Error(`Invalid passage source revision: ${passage.anchor}`);
    const passageModifiedAt = sourceRevisions.sort().at(-1);
    provenanceGraph.push({
      "@id": `${release.canonicalUrl}provenance.jsonld/passage-${passage.hash}`,
      "@type": ["CreativeWork", "prov:Entity"],
      name: `Passage provenance — ${passage.title}`,
      url: passage.anchor,
      inLanguage: passage.lang,
      about: passage.entityIds.map((id) => ({ "@id": id })),
      isPartOf: { "@id": `${release.canonicalUrl}provenance.jsonld/dataset` },
      identifier: {
        "@type": "PropertyValue",
        propertyID: "SHA-256",
        value: sha256(Buffer.from(passage.text)),
      },
      ...(sourceIds.length
        ? {
            isBasedOn: sourceIds.map((id) => ({ "@id": id })),
          }
        : {}),
      "prov:wasDerivedFrom": [{ "@id": passage.anchor }],
      ...(passage.claimEvidenceIds.length
        ? {
            citation: passage.claimEvidenceIds.map((id) => ({
              "@id": id,
            })),
          }
        : {}),
      additionalProperty: [
        {
          "@type": "PropertyValue",
          propertyID: "Entity evidence IDs",
          value: passage.entityEvidenceIds.join(" | "),
        },
      ],
      ...(passageModifiedAt ? { dateModified: passageModifiedAt } : {}),
    });
  }
  for (const {
    q,
    sourceUrl,
    graphNodeIds,
    claimEvidenceIds,
    entityEvidenceIds,
    sourceHash,
    executiveSummaryHash,
  } of answerRecords) {
    // A recorded Q/A metadata revision is distinct from both medical review and
    // the revision of the entire Dataset. Unchanged records keep their date.
    const answerModifiedAt = q.dateModified ?? release.dateModified;
    if (!validRevisionDate(answerModifiedAt) || answerModifiedAt > currentDatasetDate)
      throw new Error(`Invalid answer provenance revision date: ${q["@id"]}`);
    provenanceGraph.push({
      "@id": `${release.canonicalUrl}provenance.jsonld/answer-${sourceHash.slice(0, 16)}`,
      "@type": ["CreativeWork", "prov:Entity"],
      name: `Answer provenance — ${valueText(q.name)}`,
      url: sourceUrl,
      about: [q.about].flat().filter(Boolean),
      isPartOf: { "@id": `${release.canonicalUrl}provenance.jsonld/dataset` },
      isBasedOn: graphNodeIds.map((id) => ({ "@id": id })),
      identifier: {
        "@type": "PropertyValue",
        propertyID: "SHA-256",
        value: sourceHash,
      },
      "prov:wasDerivedFrom": [{ "@id": sourceUrl }],
      ...(claimEvidenceIds.length
        ? {
            citation: claimEvidenceIds.map((id) => ({
              "@id": id,
            })),
          }
        : {}),
      additionalProperty: [
        {
          "@type": "PropertyValue",
          propertyID: "Entity evidence IDs",
          value: entityEvidenceIds.join(" | "),
        },
        ...(executiveSummaryHash
          ? [
              {
                "@type": "PropertyValue",
                propertyID: "Executive summary SHA-256",
                value: executiveSummaryHash,
              },
            ]
          : []),
      ],
      dateModified: answerModifiedAt,
    });
  }
  await writeFile(
    path.join(projections, "provenance.jsonld"),
    `${JSON.stringify({ "@context": graph["@context"], "@graph": provenanceGraph })}\n`,
  );
  await writeFile(
    path.join(projections, "evidence-snapshot.json"),
    `${JSON.stringify(evidenceSnapshot, null, 2)}\n`,
  );

  await writeFile(path.join(projections, "llms.txt"), pageFrontmatter.llmsGuide);

  return {
    markdownBytes: Buffer.byteLength(markdown),
    passages: emitted.length,
    maxPassageChars: Math.max(...emitted.map((item) => item.text.length), 0),
  };
}
