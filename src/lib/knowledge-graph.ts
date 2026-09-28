import canonicalGraphRawSource from "../data/semantic/knowledge-graph.jsonld?raw";
import headGraphRawSource from "../../.generated/semantic/head-graph.json?raw";
import supportGraphRawSource from "../../.generated/semantic/support-graph.json?raw";

type ContextValue = string | number | boolean | Record<string, unknown>;
type Graph = {
  "@context"?: string | Record<string, ContextValue>;
  "@graph": unknown[];
  [key: string]: unknown;
};

function parseCanonical(source: string) {
  const parsed = JSON.parse(source) as Graph;
  if (!Array.isArray(parsed["@graph"]))
    throw new Error("canonical graph lacks @graph");
  return parsed;
}

function parseProjection(source: string, label: string) {
  const parsed = JSON.parse(source) as Graph;
  if (!Array.isArray(parsed["@graph"]))
    throw new Error(`${label} lacks @graph`);
  if (parsed["@context"] !== "https://schema.org")
    throw new Error(`${label} must use the public Schema.org context`);
  return parsed;
}

export const canonicalGraph = parseCanonical(canonicalGraphRawSource);
const head = parseProjection(headGraphRawSource, "head graph");
parseProjection(supportGraphRawSource, "support graph");
export const headGraph = head;
export const headGraphRaw = headGraphRawSource;
export const supportGraphRaw = supportGraphRawSource;
