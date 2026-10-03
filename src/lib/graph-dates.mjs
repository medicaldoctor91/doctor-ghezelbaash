const dateTypes = new Set(["http://www.w3.org/2001/XMLSchema#date", "xsd:date"]);
const temporalTypes = new Set([...dateTypes, "http://www.w3.org/2001/XMLSchema#dateTime", "xsd:dateTime"]);

/** Read an authored date without changing its JSON-LD literal representation. */
export function dateValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (!Object.hasOwn(value, "@value") || Object.hasOwn(value, "@language") ||
        (value["@type"] !== undefined && !dateTypes.has(value["@type"]))) return value;
    return value["@value"];
  }
  return value;
}

/** Preserve an authored date or timestamp for a format with its own date validator. */
export function temporalValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value) &&
      Object.hasOwn(value, "@value") && !Object.hasOwn(value, "@language") &&
      (value["@type"] === undefined || temporalTypes.has(value["@type"]))) return value["@value"];
  return value;
}

export function validCalendarDate(value) {
  const date = dateValue(value);
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}

export function requireCalendarDate(value, label) {
  if (!validCalendarDate(value)) throw new Error(`${label} must be a valid ISO calendar date`);
  return dateValue(value);
}

const validTimestamp = (value) => {
  if (typeof value !== "string") return false;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):([0-5]\d):([0-5]\d)(?:\.(\d+))?(?:Z|([+-])(\d{2}):([0-5]\d))?$/.exec(value);
  return Boolean(match && validCalendarDate(match[1]) &&
    (Number(match[2]) < 24 || match[2] === "24" && match[3] === "00" && match[4] === "00" && !Number(match[5] || 0)) &&
    (!match[7] || Number(match[7]) < 14 || match[7] === "14" && match[8] === "00") && Number.isFinite(Date.parse(value)));
};

/** Emit a typed RDF temporal literal while preserving its recorded lexical precision. */
export function rdfTemporalLiteral(value, label) {
  const text = temporalValue(value);
  const type = value && typeof value === "object" ? value["@type"] : undefined;
  const calendar = validCalendarDate(value);
  const timestamp = (!type || ["http://www.w3.org/2001/XMLSchema#dateTime", "xsd:dateTime"].includes(type)) && validTimestamp(text);
  if (!calendar && !timestamp) throw new Error(`${label} must be a valid RDF date or dateTime`);
  return value && typeof value === "object"
    ? { ...structuredClone(value), "@type": type ?? `http://www.w3.org/2001/XMLSchema#${calendar ? "date" : "dateTime"}` }
    : { "@value": text, "@type": `http://www.w3.org/2001/XMLSchema#${calendar ? "date" : "dateTime"}` };
}
