import { parseFragment } from "parse5";
import {
  normalizeProjectedText,
  projectCanonicalAnswerHtml,
} from "./answer-projection.mjs";

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
const attr = (node, name) =>
  node?.attrs?.find((candidate) => candidate.name === name)?.value;
const headingLevel = (node) =>
  /^h[1-6]$/u.test(node?.tagName || "") ? Number(node.tagName[1]) : null;
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
const contentRegion = (content) => {
  const source = String(content);
  const frontmatter = source.match(/^---\r?\n[\s\S]*?\r?\n---\s*/u);
  return frontmatter ? source.slice(frontmatter[0].length) : source;
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

export function missingCanonicalAnswerPlacements(content, projection) {
  const document = parseFragment(contentRegion(content), {
    sourceCodeLocationInfo: true,
  });
  const elements = walkElements(document);
  const headings = elements.filter((node) => headingTags.has(node.tagName));
  const missing = [];
  for (const record of projection.answers) {
    const matchingHeadings = headings.filter(
      (heading) => attr(heading, "id") === record.sourceFragment,
    );
    if (matchingHeadings.length !== 1) {
      missing.push({ ...record, reason: "question-heading" });
      continue;
    }
    const heading = matchingHeadings[0];
    const end = nextHeadingBoundary(headings, heading);
    const headingEnd =
      heading.sourceCodeLocation?.endTag?.endOffset ??
      heading.sourceCodeLocation?.endOffset ??
      -1;
    const existingProjected = elements.some(
      (node) => attr(node, "id") === record.htmlId,
    );
    if (existingProjected) continue;
    const matchingBlocks = elements.filter((node) => {
      const start = node.sourceCodeLocation?.startOffset ?? -1;
      return (
        answerBlockTags.has(node.tagName) &&
        start >= headingEnd &&
        start < end &&
        normalizeProjectedText(textContent(node)) ===
          normalizeProjectedText(record.answerText)
      );
    });
    if (matchingBlocks.length !== 1)
      missing.push({
        ...record,
        reason: matchingBlocks.length ? "duplicate-answer-text" : "missing-answer-text",
      });
  }
  return Object.freeze(missing);
}

/**
 * Production answer projection may tag an already-authored answer block, but
 * it must never synthesize new visible prose. Graph Answer.text remains the
 * semantic authority; page.md owns whether/where that text is visibly placed.
 */
export function projectCanonicalAnswerHtmlStrict(content, projection) {
  const missing = missingCanonicalAnswerPlacements(content, projection);
  if (missing.length)
    throw new Error(
      `Missing authored canonical answer placements (${missing.length}): ${missing
        .map((record) => `${record.sourceFragment}[${record.reason}]`)
        .join(", ")}`,
    );
  const before = textContent(parseFragment(String(content)));
  const output = projectCanonicalAnswerHtml(content, projection);
  const after = textContent(parseFragment(String(output)));
  if (after !== before)
    throw new Error("Strict answer projection changed visible text");
  return output;
}
