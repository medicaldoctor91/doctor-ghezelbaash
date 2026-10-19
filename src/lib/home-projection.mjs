/** Preserve the complete canonical graph in the homepage's inline JSON-LD. */
export function projectHomeGraph(graph) {
  return structuredClone(graph);
}
