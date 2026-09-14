export const values = (value) =>
  Array.isArray(value) ? value : value == null ? [] : [value];

export const refId = (value) =>
  value && typeof value === "object" && typeof value["@id"] === "string"
    ? value["@id"]
    : null;

export const nodeTypes = (node) => values(node?.["@type"]);

export const directLanguageLiterals = (value, language, label) => {
  const matches = values(value).filter(
    (item) => item?.["@language"] === language,
  );
  if (
    !matches.length ||
    matches.some(
      (item) =>
        typeof item?.["@value"] !== "string" ||
        !item["@value"].trim() ||
        item["@value"] !== item["@value"].trim(),
    )
  )
    throw new Error(`${label} requires a direct ${language} literal`);
  const literals = matches.map((item) => item["@value"]);
  if (new Set(literals).size !== literals.length)
    throw new Error(`${label} contains duplicate ${language} literals`);
  return literals;
};

export const exactLanguageLiteral = (value, language, label) => {
  const literals = directLanguageLiterals(value, language, label);
  if (literals.length !== 1)
    throw new Error(
      `${label} requires exactly one ${language} literal; found ${literals.length}`,
    );
  return literals[0];
};

export const indexCanonicalGraph = (graph) => {
  const nodes = graph?.["@graph"];
  if (!Array.isArray(nodes)) throw new Error("Canonical graph lacks @graph");
  const byId = new Map();
  const nodesByUrl = new Map();
  for (const node of nodes) {
    const nodeId = node?.["@id"];
    if (typeof nodeId !== "string" || !nodeId)
      throw new Error("Canonical graph contains a top-level node without @id");
    if (byId.has(nodeId))
      throw new Error(`Duplicate canonical graph ID: ${nodeId}`);
    byId.set(nodeId, node);
    if (node.url !== undefined) {
      if (
        typeof node.url !== "string" ||
        !node.url ||
        node.url !== node.url.trim()
      )
        throw new Error(`Canonical graph node has an invalid direct URL: ${nodeId}`);
      const matches = nodesByUrl.get(node.url);
      if (matches) matches.push(node);
      else nodesByUrl.set(node.url, [node]);
    }
  }
  const sourceNodesForUrl = (url) => {
    if (typeof url !== "string" || !url || url !== url.trim())
      throw new Error("Canonical source lookup requires a direct URL");
    const exact = byId.get(url);
    const matches = nodesByUrl.get(url) ?? [];
    return exact && !matches.includes(exact) ? [exact, ...matches] : [...matches];
  };
  return { nodes, byId, nodesByUrl, sourceNodesForUrl };
};
