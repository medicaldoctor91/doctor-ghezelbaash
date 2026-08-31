import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { parseFragment, serialize } from "parse5";
import { sha256, valueText } from "../projection-context.mjs";
import { exactLanguageLiteral } from "../../../src/lib/semantic-projection.mjs";

const entityMap = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  nbsp: " ",
  zwnj: "‌",
};
const decode = (value) =>
  String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, key) => {
    if (key[0] === "#") {
      const number =
        key[1].toLowerCase() === "x"
          ? parseInt(key.slice(2), 16)
          : parseInt(key.slice(1), 10);
      return Number.isFinite(number) ? String.fromCodePoint(number) : match;
    }
    return entityMap[key.toLowerCase()] ?? match;
  });
const strip = (value) =>
  decode(
    String(value)
      .replace(/<!--[^]*?-->/g, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
const inline = (value) => {
  let source = String(value);
  source = source.replace(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_, href, text) => `[${strip(text)}](${decode(href)})`,
  );
  source = source
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*")
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");
  return decode(
    source.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
};
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

const bindLlmsTemplate = (template, bindings) => {
  const tokenPattern = /{{[A-Z0-9_]+}}/g;
  const known = new Set(Object.keys(bindings));
  const seen = new Set(template.match(tokenPattern) || []);
  for (const token of seen)
    if (!known.has(token))
      throw new Error(`llms.txt: unknown template token ${token}`);
  const output = String(template).replace(tokenPattern, (token) =>
    String(bindings[token]),
  );
  const unresolved = output.match(tokenPattern) || [];
  if (unresolved.length)
    throw new Error(
      `llms.txt: unresolved template token ${[...new Set(unresolved)].join(", ")}`,
    );
  return output;
};

export async function compileRetrievalCorpus(context, { answerRecords } = {}) {
  const {
    data,
    projections,
    generatedContent,
    release,
    invariants,
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
  if (!Array.isArray(answerRecords))
    throw new Error(
      "Retrieval compiler requires answerRecords[] from semantic compiler",
    );

  const home = await readFile(path.join(generatedContent, "home.md"), "utf8");
  const frontmatter = home.match(/^---\r?\n([\s\S]*?)\r?\n---\s*/);
  if (!frontmatter)
    throw new Error("Retrieval compiler requires Markdown frontmatter");
  const frontmatterLines = frontmatter[1].split(/\r?\n/);
  const frontmatterValue = (key) => {
    const matches = frontmatterLines.filter((line) =>
      line.startsWith(`${key}:`),
    );
    if (matches.length !== 1)
      throw new Error(`Retrieval frontmatter requires one ${key}`);
    const raw = matches[0].slice(key.length + 1).trim();
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error(`Retrieval frontmatter ${key} must be a JSON string`);
    }
    if (typeof value !== "string" || !value.trim())
      throw new Error(`Retrieval frontmatter ${key} must be nonempty`);
    return value;
  };
  const pageTitle = frontmatterValue("title");
  const pageLanguage = frontmatterValue("lang");
  const body = home
    .slice(frontmatter[0].length)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");
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
    "dt",
    "dd",
  ]);
  const attribute = (node, name) =>
    node.attrs?.find((candidate) => candidate.name === name)?.value;
  const visit = (node, inheritedLanguage) => {
    const ownLanguage = attribute(node, "lang");
    const language = ownLanguage === undefined ? inheritedLanguage : ownLanguage;
    const tag = node.tagName?.toLowerCase();
    if (blockTags.has(tag)) {
      const text = inline(serialize(node));
      if (text) {
        if (typeof language !== "string" || !language)
          throw new Error(`Retrieval block lacks a direct language: ${tag}`);
        blocks.push({
          tag,
          id: attribute(node, "id"),
          text,
          retrievalAlias: attribute(node, "data-retrieval-alias"),
          lang: language,
        });
      }
      return;
    }
    for (const child of node.childNodes ?? []) visit(child, language);
  };
  visit(parseFragment(body), pageLanguage);

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
    if (/^h[1-6]$/.test(block.tag)) {
      const level = Number(block.tag[1]);
      markdown += `${"#".repeat(level)} ${block.text}\n`;
      if (block.id)
        markdown += `<!-- anchor: ${release.canonicalUrl}#${block.id} -->\n`;
      if (block.retrievalAlias)
        markdown += `<!-- retrieval-alias: ${block.retrievalAlias} -->\n`;
      markdown += "\n";
    } else if (block.tag === "li") markdown += `- ${block.text}\n`;
    else if (block.tag === "dt" || block.tag === "summary")
      markdown += `**${block.text}**\n\n`;
    else markdown += `${block.text}\n\n`;
  }
  markdown = markdown.replace(/\n{3,}/g, "\n\n");
  await writeFile(path.join(projections, "index.md"), markdown);

  const sections = [];
  let current;
  const flush = () => {
    if (current?.parts.length) sections.push(current);
  };
  for (const block of blocks) {
    if (/^h[1-4]$/.test(block.tag)) {
      if (!block.id)
        throw new Error(`Retrieval heading lacks an ID: ${block.text}`);
      flush();
      current = {
        level: Number(block.tag[1]),
        title: block.text,
        id: block.id,
        retrievalAlias: block.retrievalAlias,
        lang: block.lang,
        parts: [],
      };
    } else if (["p", "li", "figcaption", "summary", "dd"].includes(block.tag)) {
      if (!current)
        throw new Error(`Retrieval content precedes its heading: ${block.tag}`);
      if (block.lang !== current.lang) {
        const previous = current;
        flush();
        current = {
          level: previous.level,
          title: block.tag === "summary" ? block.text : previous.title,
          id: block.id === undefined ? previous.id : block.id,
          retrievalAlias:
            block.retrievalAlias === undefined
              ? previous.retrievalAlias
              : block.retrievalAlias,
          lang: block.lang,
          parts: [],
        };
      }
      current.parts.push(block.text);
    }
  }
  flush();

  const maxPassage = invariants.maxRagPassageChars;
  if (!Number.isInteger(maxPassage) || maxPassage < 1)
    throw new Error("Release invariants lack a valid maxRagPassageChars value");
  const emitted = [];
  for (const section of sections) {
    const joined = section.parts
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!joined) continue;
    const chunks = sentenceChunks(joined, maxPassage);
    chunks.forEach((text, index) => {
      const anchor = `${release.canonicalUrl}#${section.id}`;
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
    `PRICE_RANGE: ${release.clinic.priceRange}`,
    `CANONICAL: ${release.canonicalUrl}`,
    `RELEASE: ${release.release}`,
    `MODIFIED: ${release.dateModified}`,
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
      `ANCHOR: ${passage.anchor}`,
      ...(passage.graphNodeIds.length
        ? [`GRAPH_NODE_IDS: ${passage.graphNodeIds.join(" | ")}`]
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
      "@id": `${release.canonicalUrl}provenance.jsonld#dataset`,
      "@type": ["Dataset", "prov:Entity"],
      name: `${englishPersonName} claim and passage provenance graph`,
      creator: { "@id": release.primaryEntity.id },
      publisher: { "@id": release.primaryEntity.id },
      about: [
        { "@id": release.primaryEntity.id },
        { "@id": release.clinic.id },
      ],
      version: release.release,
      dateModified: release.dateModified,
      isBasedOn: { "@id": `${release.canonicalUrl}graph.jsonld#dataset` },
      identifier: {
        "@type": "PropertyValue",
        propertyID: "Primary entity identity fingerprint SHA-256",
        value: identityFingerprintSha256,
      },
    },
  ];
  for (const evidence of evidenceRegistry.evidence) {
    if (!Array.isArray(evidence.supports))
      throw new Error(`Evidence supports[] missing: ${evidence.id}`);
    provenanceGraph.push({
      "@id": evidence.id,
      "@type": ["CreativeWork", "prov:Entity"],
      name: evidence.id,
      url: evidence.url,
      additionalType: `EvidenceTier${evidence.tier}`,
      identifier: {
        "@type": "PropertyValue",
        propertyID: "Evidence tier",
        value: evidence.tier,
      },
      dateModified: evidenceRegistry.verifiedAt,
      keywords: evidence.supports,
      additionalProperty: [
        {
          "@type": "PropertyValue",
          propertyID: "Evidence supports",
          value: evidence.supports.join(" | "),
        },
      ],
      about: [
        {
          "@id": evidence.supports.some((value) =>
            /clinic|place-id|cid|opening-hours|local-identity|local-corroboration/.test(
              value,
            ),
          )
            ? release.clinic.id
            : release.primaryEntity.id,
        },
      ],
    });
  }
  for (const passage of emitted) {
    provenanceGraph.push({
      "@id": `${release.canonicalUrl}provenance.jsonld#passage-${passage.hash}`,
      "@type": ["CreativeWork", "prov:Entity"],
      name: `Passage provenance — ${passage.title}`,
      url: passage.anchor,
      inLanguage: passage.lang,
      about: passage.entityIds.map((id) => ({ "@id": id })),
      isPartOf: { "@id": `${release.canonicalUrl}provenance.jsonld#dataset` },
      identifier: {
        "@type": "PropertyValue",
        propertyID: "SHA-256",
        value: sha256(Buffer.from(passage.text)),
      },
      ...(passage.graphNodeIds.length
        ? {
            isBasedOn: passage.graphNodeIds.map((id) => ({ "@id": id })),
          }
        : {}),
      "prov:wasDerivedFrom": [{ "@id": passage.anchor }],
      ...(passage.claimEvidenceIds.length
        ? {
            "prov:hadPrimarySource": passage.claimEvidenceIds.map((id) => ({
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
      dateModified: release.dateModified,
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
    provenanceGraph.push({
      "@id": `${release.canonicalUrl}provenance.jsonld#answer-${sourceHash.slice(0, 16)}`,
      "@type": ["CreativeWork", "prov:Entity"],
      name: `Answer provenance — ${valueText(q.name)}`,
      url: sourceUrl,
      about: [q.about].flat().filter(Boolean),
      isPartOf: { "@id": `${release.canonicalUrl}provenance.jsonld#dataset` },
      isBasedOn: graphNodeIds.map((id) => ({ "@id": id })),
      identifier: {
        "@type": "PropertyValue",
        propertyID: "SHA-256",
        value: sourceHash,
      },
      "prov:wasDerivedFrom": [{ "@id": sourceUrl }],
      ...(claimEvidenceIds.length
        ? {
            "prov:hadPrimarySource": claimEvidenceIds.map((id) => ({
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
      dateModified: release.dateModified,
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

  const template = await readFile(
    path.join(data, "templates/llms.template.txt"),
    "utf8",
  );
  const tiers = evidenceRegistry.tiers;
  if (!tiers || typeof tiers !== "object" || Array.isArray(tiers))
    throw new Error("llms.txt: evidence tiers are required");
  for (const tier of ["A", "B", "C"])
    if (typeof tiers[tier] !== "string" || !tiers[tier])
      throw new Error(
        `llms.txt: evidence tier ${tier} definition missing from evidence registry`,
      );
  const evidenceTierLine = `- Evidence tiers: Tier A = ${tiers.A}; Tier B = ${tiers.B}; Tier C = ${tiers.C}.`;
  const llms = bindLlmsTemplate(template, {
    "{{RELEASE}}": release.release,
    "{{REVIEW_DATE}}": release.dateModified,
    "{{OFFICIAL_ALIASES}}": release.primaryEntity.officialAliases.join(" | "),
    "{{RECONCILIATION_ALIASES}}":
      release.primaryEntity.reconciliationAliases.join(" | "),
    "{{RETRIEVAL_VARIANTS}}":
      release.primaryEntity.retrievalVariants.join(" | "),
    "{{ZENODO_CONCEPT_DOI}}": release.dataset.zenodo.conceptDoi,
    "{{ZENODO_CONCEPT_DOI_URL}}": `https://doi.org/${release.dataset.zenodo.conceptDoi}`,
    "{{ZENODO_VERSION_DOI}}": release.dataset.zenodo.versionDoi,
    "{{ZENODO_VERSION_DOI_URL}}": `https://doi.org/${release.dataset.zenodo.versionDoi}`,
    "{{ZENODO_RECORD_ID}}": String(release.dataset.zenodo.recordId),
    "{{HUGGING_FACE_DATASET}}": release.dataset.huggingFace.dataset,
    "{{EVIDENCE_TIER_LINE}}": evidenceTierLine,
  });
  await writeFile(path.join(projections, "llms.txt"), llms);

  return {
    markdownBytes: Buffer.byteLength(markdown),
    passages: emitted.length,
    maxPassageChars: Math.max(...emitted.map((item) => item.text.length), 0),
  };
}
