const values = (value) =>
  Array.isArray(value) ? value : value == null ? [] : [value];
const refId = (value) =>
  value && typeof value === "object" && typeof value["@id"] === "string"
    ? value["@id"]
    : null;
const nodeTypes = (node) => values(node?.["@type"]);

const indexCanonicalGraph = (graph) => {
  const nodes = graph?.["@graph"];
  if (!Array.isArray(nodes)) throw new Error("Canonical graph lacks @graph");
  const byId = new Map();
  for (const node of nodes) {
    const nodeId = node?.["@id"];
    if (typeof nodeId !== "string" || !nodeId) continue;
    if (byId.has(nodeId))
      throw new Error(`Duplicate canonical graph ID: ${nodeId}`);
    byId.set(nodeId, node);
  }
  return { nodes, byId };
};

const requiredCanonicalFragment = (url, label, canonicalDocument) => {
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
  return parsed;
};

const exactKeys = (value, expected, label) => {
  const actual = Object.keys(value || {}).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  )
    throw new Error(`${label} fields are not canonical`);
};

export const canonicalSemanticSource = (policy) => {
  exactKeys(
    policy,
    [
      "schemaVersion",
      "identitySource",
      "semanticSource",
      "evidenceRegistry",
      "languages",
      "scopes",
      "retrievalPolicy",
      "resolutionMode",
      "intentFamilies",
      "intentAnswerIds",
      "serviceAliasCoverage",
      "evidencePolicy",
      "stableEvidenceField",
      "volatileSignalField",
    ],
    "Retrieval policy",
  );
  exactKeys(
    policy.serviceAliasCoverage,
    [
      "enabled",
      "coverage",
      "expandUnscopedAliasesTo",
      "preserveNativeAliasLanguage",
      "rowKind",
      "emptyAliasFallback",
    ],
    "Service alias policy",
  );
  if (
    policy.schemaVersion !== "2.3" ||
    policy.semanticSource !== "src/data/semantic/knowledge-graph.jsonld" ||
    policy.serviceAliasCoverage.coverage !== "all-offered-services"
  )
    throw new Error("Retrieval policy semantic source drift");
  return policy.semanticSource;
};

/** Compiles the build-consumed answer and offered-service graph fields. */
export const deriveCanonicalSemanticSets = (graph, release) => {
  const { nodes, byId } = indexCanonicalGraph(graph);
  const canonicalDocument = new URL(release?.canonicalUrl);
  canonicalDocument.hash = "";
  const personId = release?.primaryEntity?.id;
  const clinicId = release?.clinic?.id;
  const person = byId.get(personId);
  const clinic = byId.get(clinicId);
  if (!person || !clinic)
    throw new Error("Canonical physician or clinic graph node is missing");

  const answers = nodes
    .filter((node) => nodeTypes(node).includes("Question"))
    .map((question) => {
      const questionId = question?.["@id"];
      const answerId = refId(question?.acceptedAnswer);
      requiredCanonicalFragment(questionId, "Question ID", canonicalDocument);
      requiredCanonicalFragment(answerId, "Answer ID", canonicalDocument);
      const answer = byId.get(answerId);
      if (
        typeof questionId !== "string" ||
        !answer ||
        !nodeTypes(answer).includes("Answer") ||
        typeof answer.text !== "string" ||
        !answer.text.trim()
      )
        throw new Error(
          `Question lacks a canonical Answer: ${questionId || "(missing ID)"}`,
        );
      const sourceUrl = question.url;
      const language = question.inLanguage;
      if (
        typeof sourceUrl !== "string" ||
        typeof language !== "string" ||
        answer.url !== sourceUrl ||
        answer.inLanguage !== language
      )
        throw new Error(`Question/Answer source or language drift: ${questionId}`);
      requiredCanonicalFragment(
        sourceUrl,
        "Question source URL",
        canonicalDocument,
      );
      return {
        questionId,
        answerId,
        sourceUrl,
      };
    });
  const answerIds = new Set(answers.map((answer) => answer.answerId));
  const graphAnswers = nodes.filter((node) =>
    nodeTypes(node).includes("Answer"),
  );
  if (
    graphAnswers.some(
      (node) => typeof node?.["@id"] !== "string" || !node["@id"],
    )
  )
    throw new Error("Every canonical Answer must have an ID");
  const graphAnswerIds = graphAnswers.map((node) => node["@id"]);
  if (
    answerIds.size !== answers.length ||
    graphAnswerIds.length !== answers.length ||
    graphAnswerIds.some((answerId) => !answerIds.has(answerId))
  )
    throw new Error("Canonical Question/Answer topology is not one-to-one");

  const personServiceIds = values(person.availableService).map(refId);
  const clinicServiceIds = values(clinic.availableService).map(refId);
  if (personServiceIds.includes(null) || clinicServiceIds.includes(null))
    throw new Error("Canonical availableService values must be ID references");
  const offeredByPerson = new Set(personServiceIds);
  const offeredByClinic = new Set(clinicServiceIds);
  if (
    offeredByPerson.size !== personServiceIds.length ||
    offeredByClinic.size !== clinicServiceIds.length
  )
    throw new Error("Canonical availableService values must be unique");
  const offeredServiceIds = new Set([...offeredByPerson, ...offeredByClinic]);
  const graphServices = nodes.filter((node) =>
    nodeTypes(node).includes("Service"),
  );
  if (
    graphServices.some(
      (node) => typeof node?.["@id"] !== "string" || !node["@id"],
    )
  )
    throw new Error("Every canonical Service must have an ID");
  const graphServiceIds = graphServices.map((node) => node["@id"]);
  if (
    graphServiceIds.length !== offeredServiceIds.size ||
    graphServiceIds.some((serviceId) => !offeredServiceIds.has(serviceId))
  )
    throw new Error("Canonical Service topology contains an unoffered service");
  const services = [...offeredServiceIds]
    .map((serviceId) => {
      const service = byId.get(serviceId);
      const types = nodeTypes(service);
      if (!service || !types.includes("Service"))
        throw new Error(`Offered service is missing or untyped: ${serviceId}`);
      const aliases = values(service.alternateName);
      if (aliases.some((alias) => typeof alias !== "string"))
        throw new Error(`Service alias must be text: ${serviceId}`);
      const serviceUrl = requiredCanonicalFragment(
        serviceId,
        "Service ID",
        canonicalDocument,
      );
      const providers = values(service.provider).map(refId);
      if (providers.some((providerId) => !providerId))
        throw new Error(`Service provider must be an ID reference: ${serviceId}`);
      if (!providers.includes(personId))
        throw new Error(
          `Offered service lacks the canonical physician provider: ${serviceId}`,
        );
      const name = serviceUrl.hash.slice(1);
      return {
        id: serviceId,
        types,
        name,
        aliases,
      };
    })
    .sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    );

  return { answers, services };
};

/**
 * Applies a declarative projection profile to one canonical graph node.
 * This is shared by JSON-LD generation and HTML Microdata assembly so both
 * delivery syntaxes are compiled from the same policy instead of drifting.
 */
export const projectNode = (node, spec = {}) => {
  const out = {};
  if (!spec.include) Object.assign(out, structuredClone(node));
  else
    for (const key of spec.include)
      if (Object.hasOwn(node, key)) out[key] = structuredClone(node[key]);
  for (const [key, allow] of Object.entries(spec.refAllow || {})) {
    if (!Object.hasOwn(out, key)) continue;
    const values = Array.isArray(out[key]) ? out[key] : [out[key]];
    const filtered = values.filter((value) => {
      const id = refId(value);
      return id ? allow.includes(id) : true;
    });
    if (!filtered.length) delete out[key];
    else out[key] = Array.isArray(node[key]) ? filtered : filtered[0];
  }
  for (const [key, allow] of Object.entries(spec.valueAllow || {})) {
    if (!Object.hasOwn(out, key)) continue;
    const values = Array.isArray(out[key]) ? out[key] : [out[key]];
    const filtered = values.filter((value) => {
      const literal =
        value && typeof value === "object" && value["@value"] != null
          ? String(value["@value"])
          : typeof value === "string"
            ? value
            : null;
      return literal === null ? true : allow.includes(literal);
    });
    if (!filtered.length) delete out[key];
    else out[key] = Array.isArray(node[key]) ? filtered : filtered[0];
  }
  return out;
};
