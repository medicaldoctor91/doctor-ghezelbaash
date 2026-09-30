import canonicalGraphRawSource from "../data/semantic/knowledge-graph.jsonld?raw";
export const canonicalGraph = JSON.parse(canonicalGraphRawSource);
if (!Array.isArray(canonicalGraph["@graph"])) throw new Error("Canonical graph lacks @graph");
