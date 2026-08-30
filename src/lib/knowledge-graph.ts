import headGraphRawSource from "../../.generated/semantic/head-graph.json?raw";
import supportGraphRawSource from "../../.generated/semantic/support-graph.json?raw";

type ContextValue = string | number | boolean | Record<string, unknown>;
type Graph = {
  "@context"?: Record<string, ContextValue>;
  "@graph": unknown[];
  [key: string]: unknown;
};
function parse(source: string, label: string) {
  const parsed = JSON.parse(source) as Graph;
  if (!Array.isArray(parsed["@graph"]))
    throw new Error(`${label} lacks @graph`);
  const context = parsed["@context"];
  if (
    !context ||
    context["@version"] !== 1.1 ||
    context["@vocab"] !== "https://schema.org/" ||
    context.schema !== "https://schema.org/"
  )
    throw new Error(`${label} lost Schema.org context authority`);
  for (const [key, value] of Object.entries(context)) {
    if (key === "@version" || key === "@vocab" || key === "schema") continue;
    if (
      typeof value === "object" &&
      value !== null &&
      typeof value["@id"] === "string" &&
      value["@id"].startsWith("https://schema.org/")
    )
      continue;
    throw new Error(`${label} contains a non-Schema.org context term: ${key}`);
  }
  return parsed;
}
const head = parse(headGraphRawSource, "head graph");
parse(supportGraphRawSource, "support graph");
export const headGraph = head;
export const headGraphRaw = headGraphRawSource;
export const supportGraphRaw = supportGraphRawSource;
