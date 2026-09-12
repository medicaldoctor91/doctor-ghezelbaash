const SCHEMA_ORIGIN = "https://schema.org/";
const fail = (message) => { throw new Error(message); };
const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const schemaLocal = (value) => typeof value === "string" && value.startsWith(SCHEMA_ORIGIN) ? value.slice(SCHEMA_ORIGIN.length) : null;
const splitIris = (value) => String(value || "").split(/,\s*/).map((item) => item.trim()).filter(Boolean);

// Explicit companion vocabulary profile; never silently accept arbitrary prefixes.
// DCMI Recommendation 2020-01-20: https://www.dublincore.org/specifications/dublin-core/dcmi-terms/
// PROV-O Recommendation: https://www.w3.org/TR/prov-o/#wasDerivedFrom
const EXTERNAL_TERMS = new Map([
  ["dcterms:spatial", "http://purl.org/dc/terms/"],
  ["dcterms:hasPart", "http://purl.org/dc/terms/"],
  ["dcterms:subject", "http://purl.org/dc/terms/"],
  ["dcterms:temporal", "http://purl.org/dc/terms/"],
  ["dcterms:isPartOf", "http://purl.org/dc/terms/"],
  ["dcterms:issued", "http://purl.org/dc/terms/"],
  ["prov:wasDerivedFrom", "http://www.w3.org/ns/prov#"],
]);
function validateExternalTerm(property, value, context, path, errors) {
  const namespace = EXTERNAL_TERMS.get(property);
  if (!namespace || context[property.split(":")[0]] !== namespace) {
    errors.push(`${path}: unknown external term or namespace binding: ${property}`);
    return;
  }
  for (const item of asArray(value)) {
    if (property === "prov:wasDerivedFrom" && (!item || typeof item !== "object" || typeof item["@id"] !== "string"))
      errors.push(`${path}: PROV derivation requires an entity reference`);
    if (property === "dcterms:issued" && !(typeof item === "string" || (item && typeof item === "object" && Object.hasOwn(item, "@value"))))
      errors.push(`${path}: DCMI issued requires a literal`);
  }
}

export function createSchemaVocabulary(propertyRows, typeRows) {
  const properties = new Map(propertyRows.map((row) => [row.label, row]));
  const types = new Map(typeRows.map((row) => [row.label, row]));
  const superTypes = new Map(
    typeRows.map((row) => [
      row.label,
      splitIris(row.subTypeOf).map(schemaLocal).filter(Boolean),
    ]),
  );
  const closureMemo = new Map();
  const typeClosure = (type, trail = new Set()) => {
    if (closureMemo.has(type)) return closureMemo.get(type);
    if (trail.has(type)) fail(`Schema.org type inheritance cycle at ${type}`);
    if (!types.has(type)) fail(`Unknown/superseded Schema.org type ${type}`);
    const nextTrail = new Set(trail).add(type),
      closure = new Set([type]);
    for (const parent of superTypes.get(type) || [])
      for (const inherited of typeClosure(parent, nextTrail)) closure.add(inherited);
    closureMemo.set(type, closure);
    return closure;
  };
  const domainFor = (property) =>
    new Set(splitIris(properties.get(property)?.domainIncludes).map(schemaLocal).filter(Boolean));
  const rangeFor = (property) =>
    new Set(splitIris(properties.get(property)?.rangeIncludes).map(schemaLocal).filter(Boolean));
  const typesFor = (node) =>
    asArray(node?.["@type"])
      .map((value) => (typeof value === "string" ? value : null))
      .filter(Boolean)
      .map((value) => schemaLocal(value) || value)
      .filter((value) => !value.startsWith("http://www.w3.org/2001/XMLSchema#"));
  const domainMatches = (nodeTypes, allowed) => {
    if (!allowed.size) return true;
    return nodeTypes.some((type) =>
      [...typeClosure(type)].some((candidate) => allowed.has(candidate)),
    );
  };
  const rangeMatchesTypes = (valueTypes, allowed) => {
    if (!allowed.size) return true;
    return valueTypes.some((type) =>
      [...typeClosure(type)].some((candidate) => allowed.has(candidate)),
    );
  };
  const rangeAcceptsTextLexicalValue = (allowed) =>
    [...allowed].some(
      (type) => types.has(type) && typeClosure(type).has("Text"),
    );
  const XSD_ORIGIN = "http://www.w3.org/2001/XMLSchema#";
  const XSD_TO_SCHEMA_TYPES = new Map([
    ["string", ["Text"]],
    ["normalizedString", ["Text"]],
    ["token", ["Text"]],
    ["language", ["Text"]],
    ["boolean", ["Boolean"]],
    ["decimal", ["Number"]],
    ["float", ["Float"]],
    ["double", ["Float"]],
    ["integer", ["Integer"]],
    ["nonPositiveInteger", ["Integer"]],
    ["negativeInteger", ["Integer"]],
    ["long", ["Integer"]],
    ["int", ["Integer"]],
    ["short", ["Integer"]],
    ["byte", ["Integer"]],
    ["nonNegativeInteger", ["Integer"]],
    ["unsignedLong", ["Integer"]],
    ["unsignedInt", ["Integer"]],
    ["unsignedShort", ["Integer"]],
    ["unsignedByte", ["Integer"]],
    ["positiveInteger", ["Integer"]],
    ["date", ["Date"]],
    ["dateTime", ["DateTime"]],
    ["dateTimeStamp", ["DateTime"]],
    ["time", ["Time"]],
    ["duration", ["Duration"]],
    ["dayTimeDuration", ["Duration"]],
    ["yearMonthDuration", ["Duration"]],
    ["anyURI", ["URL"]],
    ["gYearMonth", ["Text"]],
    ["gYear", ["Text"]],
    ["gMonthDay", ["Text"]],
    ["gMonth", ["Text"]],
    ["gDay", ["Text"]],
  ]);
  const literalTypesFor = (value) => {
    const schemaType = schemaLocal(value);
    if (schemaType) return [schemaType];
    const xsdType = value.startsWith(XSD_ORIGIN)
      ? value.slice(XSD_ORIGIN.length)
      : value.startsWith("xsd:")
        ? value.slice(4)
        : null;
    if (xsdType) return XSD_TO_SCHEMA_TYPES.get(xsdType) || [];
    return [value];
  };


  return { properties, types, typeClosure, domainFor, rangeFor, typesFor, domainMatches, rangeMatchesTypes, rangeAcceptsTextLexicalValue, literalTypesFor };
}

/** Validate one RDF scope; separate documents must never donate types to another scope. */
export function validateJsonLdScope(jsonDocuments, vocabulary, label) {
  const { properties, types, domainFor, rangeFor, typesFor, domainMatches, rangeMatchesTypes, rangeAcceptsTextLexicalValue, literalTypesFor } = vocabulary;
  const XSD_ORIGIN = "http://www.w3.org/2001/XMLSchema#";
  const graphNodes = jsonDocuments.flatMap((document) => document?.["@graph"] || []);
  const graphById = new Map(
    graphNodes
      .filter((node) => typeof node?.["@id"] === "string")
      .map((node) => [node["@id"], node]),
  );
  const jsonErrors = [];
  if (graphById.size !== graphNodes.length)
    jsonErrors.push(`${label}: graph profile requires unique, explicit top-level @id values`);
  let jsonTypedObjects = 0,
    jsonPropertyUses = 0,
    checkedRanges = 0,
    standardDatatypeLiterals = 0,
    languageTaggedLiterals = 0,
    externalPropertyUses = 0,
    externalRangeReferences = 0;
  const graphOrigins = new Set(graphNodes.map((node) => {
    try { return new URL(node["@id"]).origin; } catch { return null; }
  }).filter(Boolean));
  const unresolvedRange = (id, path) => {
    let origin;
    try { origin = new URL(id).origin; } catch { /* Invalid IRIs fail the JSON-LD/RDF gate. */ }
    if (graphOrigins.has(origin))
      jsonErrors.push(`${path}: unresolved local range target ${id}`);
    else externalRangeReferences++;
  };

  const validateRange = (property, value, path, context) => {
    const allowed = rangeFor(property);
    if (!allowed.size) return;
    for (const item of asArray(value)) {
      if (item && typeof item === "object") {
        if (Object.hasOwn(item, "@value")) {
          const literalTypeIri =
            typeof item["@type"] === "string" ? item["@type"] : null;
          const literalTypes = literalTypeIri ? literalTypesFor(literalTypeIri) : [];
          if (literalTypeIri) {
            if (
              literalTypeIri.startsWith(XSD_ORIGIN) ||
              literalTypeIri.startsWith("xsd:")
            )
              standardDatatypeLiterals++;
            if (!literalTypes.length)
              jsonErrors.push(`${path}: unsupported literal datatype ${literalTypeIri}`);
            else {
              const unknownTypes = literalTypes.filter((type) => !types.has(type));
              if (unknownTypes.length)
                jsonErrors.push(
                  `${path}: unknown/superseded literal type ${unknownTypes.join("+")}`,
                );
              else if (!rangeMatchesTypes(literalTypes, allowed))
                jsonErrors.push(
                  `${path}: ${property} literal datatype ${literalTypeIri} maps to ${literalTypes.join("+")} outside ${[...allowed].join("|")}`,
                );
            }
          } else if (typeof item["@language"] === "string") {
            languageTaggedLiterals++;
            if (!rangeAcceptsTextLexicalValue(allowed))
              jsonErrors.push(
                `${path}: language-tagged literal outside ${[...allowed].join("|")}`,
              );
          } else {
            validateRange(property, item["@value"], `${path}.@value`, context);
          }
          checkedRanges++;
          continue;
        }
        const explicitTypes = typesFor(item);
        if (explicitTypes.length) {
          for (const type of explicitTypes)
            if (!types.has(type))
              jsonErrors.push(`${path}: unknown/superseded range type ${type}`);
          if (
            explicitTypes.every((type) => types.has(type)) &&
            !rangeMatchesTypes(explicitTypes, allowed)
          )
            jsonErrors.push(
              `${path}: ${property} range ${explicitTypes.join("+")} not in ${[...allowed].join("|")}`,
            );
          checkedRanges++;
          continue;
        }
        if (typeof item["@id"] === "string") {
          if (allowed.has("URL")) {
            checkedRanges++;
            continue;
          }
          const target = graphById.get(item["@id"]),
            targetTypes = typesFor(target);
          if (targetTypes.length) {
            if (!rangeMatchesTypes(targetTypes, allowed))
              jsonErrors.push(
                `${path}: ${property} target ${item["@id"]} has ${targetTypes.join("+")} not in ${[...allowed].join("|")}`,
              );
            checkedRanges++;
        } else unresolvedRange(item["@id"], path);
        }
        continue;
      }
      if (typeof item === "boolean") {
        if (!allowed.has("Boolean"))
          jsonErrors.push(`${path}: ${property} Boolean literal outside ${[...allowed].join("|")}`);
        checkedRanges++;
      } else if (typeof item === "number") {
        if (!["Number", "Integer", "Float"].some((type) => allowed.has(type)))
          jsonErrors.push(`${path}: ${property} numeric literal outside ${[...allowed].join("|")}`);
        checkedRanges++;
      } else if (typeof item === "string") {
        const mapping = context?.[property],
          iriCoerced = mapping && typeof mapping === "object" && mapping["@type"] === "@id";
        if (iriCoerced) {
          if (allowed.has("URL")) checkedRanges++;
          else {
            const targetTypes = typesFor(graphById.get(item));
            if (targetTypes.length) {
              if (!rangeMatchesTypes(targetTypes, allowed))
                jsonErrors.push(`${path}: ${property} target ${item} has ${targetTypes.join("+")} not in ${[...allowed].join("|")}`);
              checkedRanges++;
          } else unresolvedRange(item, path);
          }
          continue;
        }
        const nonTextLexicalRanges = new Set([
          "Date",
          "DateTime",
          "Time",
          "Duration",
          "Number",
          "Integer",
          "Float",
        ]);
        if (
          !rangeAcceptsTextLexicalValue(allowed) &&
          ![...allowed].some((type) => nonTextLexicalRanges.has(type))
        )
          jsonErrors.push(
            `${path}: ${property} string literal outside ${[...allowed].join("|")}`,
          );
        checkedRanges++;
      }
    }
  };

  const validateJsonObject = (node, path, context) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    if (Object.hasOwn(node, "@context"))
      jsonErrors.push(`${path}: scoped contexts require an explicitly supported validation profile`);
    const nodeTypes = typesFor(node);
    if (nodeTypes.length) {
      jsonTypedObjects++;
      for (const type of nodeTypes)
        if (!types.has(type)) jsonErrors.push(`${path}: unknown/superseded Schema.org type ${type}`);
      for (const [property, value] of Object.entries(node)) {
        if (property.startsWith("@")) continue;
        if (property.includes(":")) {
          validateExternalTerm(property, value, context, `${path}.${property}`, jsonErrors);
          externalPropertyUses++;
          continue;
        }
        jsonPropertyUses++;
        const spec = properties.get(property);
        if (!spec) {
          jsonErrors.push(`${path}: unknown/superseded Schema.org property ${property}`);
          continue;
        }
        if (
          nodeTypes.every((type) => types.has(type)) &&
          !domainMatches(nodeTypes, domainFor(property))
        )
          jsonErrors.push(
            `${path}: ${property} is outside domain for ${nodeTypes.join("+")}`,
          );
        validateRange(property, value, `${path}.${property}`, context);
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "@context") continue;
      for (const item of asArray(value))
        if (item && typeof item === "object" && !Object.hasOwn(item, "@value"))
          validateJsonObject(item, `${path}.${key}`, context);
    }
  };
  for (const [documentIndex, document] of jsonDocuments.entries()) {
    const context = document?.["@context"] || {};
    if (context["@version"] !== 1.1 || context["@vocab"] !== SCHEMA_ORIGIN)
      jsonErrors.push(`${label}[${documentIndex}]: expected explicit JSON-LD 1.1 Schema.org context`);
    for (const [term, definition] of Object.entries(context)) {
      if (!properties.has(term)) continue;
      const iri = typeof definition === "string" ? definition : definition?.["@id"];
      if (iri !== `${SCHEMA_ORIGIN}${term}`)
        jsonErrors.push(`${label}[${documentIndex}]: Schema.org context term remapped: ${term}`);
    }
    for (const [nodeIndex, node] of (document?.["@graph"] || []).entries())
      validateJsonObject(node, `$jsonld[${documentIndex}].@graph[${nodeIndex}]`, context);
  }
  if (jsonErrors.length)
    fail(`Schema.org JSON-LD conformance failed for ${label}:\n${jsonErrors.join("\n")}`);
  if (!jsonTypedObjects || !jsonPropertyUses || !checkedRanges)
    fail("Schema.org JSON-LD validator exercised no meaningful typed objects/properties/ranges");

  return { label, documents: jsonDocuments.length, graphNodes: graphNodes.length,
    jsonTypedObjects, jsonPropertyUses, checkedRanges, standardDatatypeLiterals,
    languageTaggedLiterals, externalPropertyUses, externalRangeReferences };
}
