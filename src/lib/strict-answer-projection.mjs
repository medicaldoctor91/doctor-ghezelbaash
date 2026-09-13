import { parseFragment } from "parse5";
import { projectCanonicalAnswerHtml } from "./answer-projection.mjs";

const visibleTextSequence = (source) => {
  const walk = (node) => {
    if (node?.nodeName === "#text") return node.value;
    if (["script", "style", "template"].includes(node?.tagName)) return "";
    return (node?.childNodes || []).map(walk).join("");
  };
  return walk(parseFragment(String(source)));
};

/**
 * Production answer projection may tag an already-authored answer block, but
 * it must never synthesize new visible prose. Graph Answer.text remains the
 * semantic authority; page.md owns whether/where that text is visibly placed.
 */
export function projectCanonicalAnswerHtmlStrict(content, projection) {
  const before = visibleTextSequence(content);
  const output = projectCanonicalAnswerHtml(content, projection);
  const after = visibleTextSequence(output);
  if (after !== before)
    throw new Error(
      "Answer projection attempted to synthesize visible text; author the canonical answer placement explicitly in page.md",
    );
  return output;
}
