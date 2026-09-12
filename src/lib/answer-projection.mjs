import { parseFragment } from "parse5";

const values = (value) =>
  Array.isArray(value) ? value : value == null ? [] : [value];
const refId = (value) =>
  value && typeof value === "object" && typeof value["@id"] === "string"
    ? value["@id"]
    : null;
const nodeTypes = (node) => values(node?.["@type"]);
const attr = (node, name) =>
  node?.attrs?.find((candidate) => candidate.name === name)?.value;
const hasClass = (node, name) =>
  String(attr(node, "class") || "")
    .split(/\s+/u)
    .filter(Boolean)
    .includes(name);
const headingLevel = (node) =>
  /^h[1-6]$/u.test(node?.tagName || "") ? Number(node.tagName[1]) : null;
const headingTags = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const answerBlockTags = new Set([
  "p",
  "li",
  "dd",
  "td",
  "blockquote",
  "figcaption",
  "summary",
]);

export const normalizeProjectedText = (value) =>
  String(value ?? "")
    .normalize("NFC")
    .replace(/[\u200b\u200c\u200d\u200e\u200f\u2060]/gu, "")
    .replace(/\u00a0/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

const textContent = (node) => {
  if (node?.nodeName === "#text") return node.value;
  if (["script", "style", "template"].includes(node?.tagName)) return "";
  return (node?.childNodes || []).map(textContent).join("");
};

const walkElements = (node, output = []) => {
  if (node?.tagName) output.push(node);
  for (const child of node?.childNodes || []) walkElements(child, output);
  return output;
};

const canonicalFragment = (url, label, canonicalDocument) => {
  if (typeof url !== "string" || !url.trim())
    throw new Error(`${label} must be an absolute URL: ${url}`);
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${label} must be an absolute URL: ${url}`);
  }
  if (!parsed.hash)
    throw new Error(`${label} lacks a visible fragment: ${url}`);
  const documentUrl = new URL(parsed);
  documentUrl.hash = "";
  if (documentUrl.href !== canonicalDocument.href)
    throw new Error(`${label} is outside the canonical document: ${url}`);
  return parsed.hash.slice(1);
};

const graphIndex = (graph) => {
  if (!Array.isArray(graph?.["@graph"]))
    throw new Error("Canonical graph lacks @graph");
  const byId = new Map();
  for (const node of graph["@graph"]) {
    const id = node?.["@id"];
    if (typeof id !== "string" || !id)
      throw new Error("Canonical graph contains a top-level node without @id");
    if (byId.has(id)) throw new Error(`Duplicate canonical graph ID: ${id}`);
    byId.set(id, node);
  }
  return { nodes: graph["@graph"], byId };
};

const subjectIds = (node) => values(node?.about).map(refId).sort();

export const canonicalAnswerHtmlId = (answerId, canonicalUrl) => {
  const document = new URL(canonicalUrl);
  const fragment = canonicalFragment(answerId, "Answer ID", document);
  if (!/^answer-[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(fragment))
    throw new Error(`Answer ID lacks the canonical answer fragment: ${answerId}`);
  return fragment;
};

/**
 * The graph is the only authored answer source. Every other answer surface
 * consumes the records returned here, including visible HTML and machine maps.
 */
export const deriveCanonicalAnswerProjection = (graph, release) => {
  const { nodes, byId } = graphIndex(graph);
  let canonicalDocument;
  try {
    canonicalDocument = new URL(release?.canonicalUrl);
  } catch {
    throw new Error("Answer projection requires a canonical URL");
  }
  canonicalDocument.hash = "";

  const questions = nodes.filter((node) => nodeTypes(node).includes("Question"));
  const graphAnswers = nodes.filter((node) => nodeTypes(node).includes("Answer"));
  const records = questions.map((question) => {
    const questionId = question?.["@id"];
    const answerId = refId(question?.acceptedAnswer);
    canonicalFragment(questionId, "Question ID", canonicalDocument);
    const sourceFragment = canonicalFragment(
      question?.url,
      "Question source URL",
      canonicalDocument,
    );
    const answerFragment = canonicalAnswerHtmlId(
      answerId,
      release.canonicalUrl,
    );
    const answer = byId.get(answerId);
    if (
      !answer ||
      !nodeTypes(answer).includes("Answer") ||
      typeof answer.text !== "string" ||
      !answer.text.trim()
    )
      throw new Error(
        `Question lacks a canonical Answer: ${questionId || "(missing ID)"}`,
      );
    if (
      typeof question.inLanguage !== "string" ||
      !question.inLanguage ||
      answer.inLanguage !== question.inLanguage ||
      answer.url !== question.url
    )
      throw new Error(`Question/Answer source or language drift: ${questionId}`);
    if (
      typeof question.name !== "string" ||
      !question.name.trim() ||
      question.name !== question.name.trim()
    )
      throw new Error(`Question requires a direct visible name: ${questionId}`);

    const questionSubjects = subjectIds(question);
    const answerSubjects = subjectIds(answer);
    if (
      questionSubjects.includes(null) ||
      answerSubjects.includes(null) ||
      new Set(questionSubjects).size !== questionSubjects.length ||
      new Set(answerSubjects).size !== answerSubjects.length ||
      questionSubjects.length !== answerSubjects.length ||
      questionSubjects.some((subject, index) => subject !== answerSubjects[index])
    )
      throw new Error(`Question/Answer subject drift: ${questionId}`);

    return {
      questionId,
      answerId,
      sourceUrl: question.url,
      sourceFragment,
      questionFragment: canonicalFragment(
        questionId,
        "Question ID",
        canonicalDocument,
      ),
      htmlId: answerFragment,
      htmlUrl: `${release.canonicalUrl}#${answerFragment}`,
      questionText: question.name,
      answerText: answer.text,
      language: question.inLanguage,
      aboutIds: questionSubjects,
    };
  });

  const answerIds = new Set(records.map((record) => record.answerId));
  const sourceUrls = new Set(records.map((record) => record.sourceUrl));
  if (answerIds.size !== records.length || sourceUrls.size !== records.length)
    throw new Error("Canonical Question/Answer topology is not one-to-one");
  if (
    graphAnswers.some(
      (node) => typeof node?.["@id"] !== "string" || !node["@id"],
    )
  )
    throw new Error("Every canonical Answer must have an ID");
  const graphAnswerIds = graphAnswers.map((node) => node["@id"]);
  if (
    graphAnswerIds.length !== records.length ||
    graphAnswerIds.some((answerId) => !answerIds.has(answerId))
  )
    throw new Error("Canonical Question/Answer topology is not one-to-one");

  return Object.freeze({
    schemaVersion: "1.0",
    source: "src/data/semantic/knowledge-graph.jsonld",
    answers: Object.freeze(records),
  });
};

const contentRegion = (content) => {
  const source = String(content);
  const frontmatter = source.match(/^---\r?\n[\s\S]*?\r?\n---\s*/u);
  return frontmatter
    ? {
        prefix: frontmatter[0],
        body: source.slice(frontmatter[0].length),
        offset: frontmatter[0].length,
      }
    : { prefix: "", body: source, offset: 0 };
};

const parsedContent = (content) => {
  const region = contentRegion(content);
  return {
    ...region,
    document: parseFragment(region.body, { sourceCodeLocationInfo: true }),
  };
};

const nextHeadingBoundary = (headings, heading) => {
  const level = headingLevel(heading);
  const start = heading.sourceCodeLocation?.startOffset ?? -1;
  return (
    headings.find(
      (candidate) =>
        (candidate.sourceCodeLocation?.startOffset ?? -1) > start &&
        headingLevel(candidate) <= level,
    )?.sourceCodeLocation?.startOffset ?? Infinity
  );
};

const locateAnswerSurface = (elements, headings, record) => {
  const matchingHeadings = headings.filter(
    (heading) => attr(heading, "id") === record.sourceFragment,
  );
  if (matchingHeadings.length !== 1)
    throw new Error(
      `Answer projection requires exactly one question heading: ${record.sourceUrl}`,
    );
  const heading = matchingHeadings[0];
  const end = nextHeadingBoundary(headings, heading);
  const headingEnd =
    heading.sourceCodeLocation?.endTag?.endOffset ??
    heading.sourceCodeLocation?.endOffset ??
    -1;
  const existing = elements.filter(
    (node) => attr(node, "id") === record.htmlId,
  );
  if (existing.length > 1)
    throw new Error(`Duplicate projected answer ID: ${record.htmlId}`);
  if (existing.length === 1) {
    if (!hasClass(existing[0], "answer-projection"))
      throw new Error(
        `Answer ID is reserved for the canonical projection: ${record.htmlId}`,
      );
    return { heading, node: existing[0], insertion: null };
  }
  const matchingBlocks = elements.filter((node) => {
    const start = node.sourceCodeLocation?.startOffset ?? -1;
    return (
      answerBlockTags.has(node.tagName) &&
      start >= headingEnd &&
      start < end &&
      normalizeProjectedText(textContent(node)) ===
        normalizeProjectedText(record.answerText) &&
      !attr(node, "id")
    );
  });
  if (matchingBlocks.length > 1)
    throw new Error(`Duplicate visible answer text for ${record.answerId}`);
  if (matchingBlocks.length === 1)
    return { heading, node: matchingBlocks[0], insertion: null };
  const insertion =
    heading.sourceCodeLocation?.endTag?.endOffset ??
    heading.sourceCodeLocation?.endOffset;
  if (!Number.isInteger(insertion))
    throw new Error(`Question heading lacks a source location: ${record.sourceUrl}`);
  return { heading, node: null, insertion };
};

const escapeHtmlText = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const addProjectionAttributes = (openingTag, node, htmlId) => {
  let source = openingTag;
  const close = source.endsWith("/>") ? "/>" : ">";
  let attributes = source.slice(0, -close.length);
  const classMatch = attributes.match(/\sclass\s*=\s*(["'])([\s\S]*?)\1/iu);
  if (classMatch) {
    const classes = classMatch[2]
      .split(/\s+/u)
      .filter(Boolean);
    if (!classes.includes("answer-projection")) classes.push("answer-projection");
    attributes =
      attributes.slice(0, classMatch.index) +
      classMatch[0].replace(classMatch[2], classes.join(" ")) +
      attributes.slice(classMatch.index + classMatch[0].length);
  } else attributes += ' class="answer-projection"';
  const currentId = attr(node, "id");
  if (currentId && currentId !== htmlId)
    throw new Error(`Visible answer already owns a different ID: ${htmlId}`);
  if (!currentId) attributes += ` id="${escapeHtmlText(htmlId)}"`;
  return attributes + close;
};

/** Adds stable answer IDs to existing visible answers and inserts only the
 * missing canonical answer atoms. The authored prose is otherwise preserved. */
export const projectCanonicalAnswerHtml = (content, projection) => {
  const source = String(content);
  const parsed = parsedContent(source);
  const elements = walkElements(parsed.document);
  const headings = elements.filter((node) => headingTags.has(node.tagName));
  const edits = [];
  for (const record of projection.answers) {
    const located = locateAnswerSurface(elements, headings, record);
    if (located.node) {
      const location = located.node.sourceCodeLocation?.startTag;
      if (!location)
        throw new Error(`Projected answer lacks an opening tag: ${record.htmlId}`);
      const openingTag = parsed.body.slice(location.startOffset, location.endOffset);
      edits.push({
        start: parsed.offset + location.startOffset,
        end: parsed.offset + location.endOffset,
        value: addProjectionAttributes(openingTag, located.node, record.htmlId),
      });
    } else {
      edits.push({
        start: parsed.offset + located.insertion,
        end: parsed.offset + located.insertion,
        value: `<p id="${escapeHtmlText(record.htmlId)}" class="answer-projection">${escapeHtmlText(record.answerText)}</p>`,
      });
    }
  }
  edits.sort((left, right) => right.start - left.start);
  let output = source;
  for (const edit of edits)
    output = output.slice(0, edit.start) + edit.value + output.slice(edit.end);
  validateProjectedAnswerHtml(output, projection);
  return output;
};

export const validateProjectedAnswerHtml = (content, projection) => {
  const parsed = parsedContent(content);
  const elements = walkElements(parsed.document);
  const headings = elements.filter((node) => headingTags.has(node.tagName));
  const surfaces = elements.filter((node) => hasClass(node, "answer-projection"));
  const expectedIds = new Set(projection.answers.map((record) => record.htmlId));
  const actualIds = surfaces.map((node) => attr(node, "id"));
  if (
    surfaces.length !== projection.answers.length ||
    new Set(actualIds).size !== actualIds.length ||
    actualIds.some((id) => !expectedIds.has(id))
  )
    throw new Error(
      `Visible answer projection cardinality drift: ${surfaces.length}/${projection.answers.length}`,
    );
  for (const record of projection.answers) {
    const nodes = surfaces.filter((node) => attr(node, "id") === record.htmlId);
    if (nodes.length !== 1)
      throw new Error(`Visible answer projection is missing: ${record.htmlId}`);
    if (
      normalizeProjectedText(textContent(nodes[0])) !==
      normalizeProjectedText(record.answerText)
    )
      throw new Error(`Visible answer text drift: ${record.answerId}`);
    const heading = headings.find(
      (candidate) => attr(candidate, "id") === record.sourceFragment,
    );
    if (!heading)
      throw new Error(`Visible answer question heading is missing: ${record.sourceUrl}`);
    const answerStart = nodes[0].sourceCodeLocation?.startOffset ?? -1;
    const headingEnd =
      heading.sourceCodeLocation?.endTag?.endOffset ??
      heading.sourceCodeLocation?.endOffset ??
      -1;
    const boundary = nextHeadingBoundary(headings, heading);
    if (!(answerStart >= headingEnd && answerStart < boundary))
      throw new Error(`Visible answer is outside its question region: ${record.answerId}`);
  }
  return {
    answers: surfaces.length,
    insertedOrTagged: surfaces.length,
    integrity: "PASS",
  };
};
