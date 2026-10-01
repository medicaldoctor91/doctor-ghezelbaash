/** Pure lexical ranking for the authored guide; safe to embed with toString(). */
export function createGuideSearch({ aliases = [], stopWords = [], synonyms = {}, detectIntent = () => null } = {}) {
  const normalize = (value) => String(value ?? "")
    .normalize("NFKC").toLowerCase()
    .replace(/[\u0640\p{M}\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/gu, "")
    .replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[أإٱ]/g, "ا")
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const words = (value) => normalize(value).split(" ").filter(Boolean);
  const stop = new Set(stopWords.map(normalize));
  const names = [...new Set(aliases.map(normalize).filter((name) => name.length > 2))]
    .sort((left, right) => right.length - left.length);
  const neighbors = new Map();
  const connect = (left, right) => {
    if (!left || !right || left === right) return;
    if (!neighbors.has(left)) neighbors.set(left, new Set());
    if (!neighbors.has(right)) neighbors.set(right, new Set());
    neighbors.get(left).add(right); neighbors.get(right).add(left);
  };
  for (const [key, values] of Object.entries(synonyms))
    for (const value of [values].flat()) connect(normalize(key), normalize(value));
  const expanded = new Map();
  const variants = (token) => {
    if (expanded.has(token)) return expanded.get(token);
    const found = new Set([token]), queue = [token];
    for (let index = 0; index < queue.length; index++)
      for (const next of neighbors.get(queue[index]) ?? [])
        if (!found.has(next)) { found.add(next); queue.push(next); }
    const result = [...found]; expanded.set(token, result); return result;
  };
  let count = 0, documentFrequency = new Map(), vocabulary = new Set(), averageLengths = [1, 1, 1];
  const field = (value) => {
    const key = normalize(value), frequency = new Map(), tokens = words(key);
    for (const token of tokens) frequency.set(token, (frequency.get(token) ?? 0) + 1);
    return { key, frequency, length: tokens.length };
  };
  const build = (records) => {
    documentFrequency = new Map(); vocabulary = new Set(); count = records.length;
    const index = records.map((record) => {
      const fields = [field(record.text), field(record.retrievalAlias ?? ""), field((record.parents ?? []).join(" "))];
      for (const token of new Set(fields.flatMap((item) => [...item.frequency.keys()]))) {
        vocabulary.add(token);
        documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
      }
      return { ...record, fields, titleKey: fields[0].key };
    });
    averageLengths = [0, 1, 2].map((position) =>
      Math.max(1, index.reduce((sum, item) => sum + item.fields[position].length, 0) / Math.max(1, count)));
    return index;
  };
  const queryInfo = (value) => {
    const original = normalize(value);
    let reduced = " " + original + " ", entity = false;
    for (const name of names) {
      const match = " " + name + " ";
      while (reduced.includes(match)) { reduced = reduced.replaceAll(match, " "); entity = true; }
    }
    reduced = normalize(reduced);
    const raw = words(reduced), filtered = raw.filter((token) => token.length > 1 && !stop.has(token));
    return {
      original, phrase: reduced || original, tokens: [...new Set(filtered.length ? filtered : raw)],
      lastToken: raw.at(-1), entity, entityOnly: entity && raw.length === 0,
      intent: detectIntent(original, entity),
    };
  };
  const matches = (item, options, allowPrefix, position) => {
    let best;
    for (const option of options) {
      let frequency = item.frequency.get(option) ?? 0, prefix = false;
      const parts = option.split(" ");
      if (parts.length > 1 && (" " + item.key + " ").includes(" " + option + " ")) frequency = 1;
      if (!frequency && allowPrefix && option.length >= 3 && parts.length === 1)
        for (const [token, occurrences] of item.frequency)
          if (token.startsWith(option) && occurrences > frequency) { frequency = occurrences; prefix = true; }
      if (!frequency) continue;
      const df = Math.max(1, ...parts.map((part) => documentFrequency.get(part) ?? 1));
      const rarity = Math.min(2.5, Math.log(1 + (count - df + .5) / (df + .5)));
      const value = frequency * 2.2 / (frequency + 1.2 * (.25 + .75 * item.length / averageLengths[position]))
        * (1 + .12 * rarity) * (prefix ? .7 : 1);
      if (!best || value > best.value) best = { value };
    }
    return best?.value ?? 0;
  };
  const score = (record, query) => {
    if (query.entityOnly) return record.level === 1 ? 0 : 99;
    if (!query.tokens.length) return 99;
    let matched = 0, relevance = 0;
    for (const token of query.tokens) {
      const options = variants(token);
      const allowPrefix = token === query.lastToken && !options.some((option) =>
        option.split(" ").every((part) => vocabulary.has(part)));
      const title = matches(record.fields[0], options, allowPrefix, 0),
        alias = matches(record.fields[1], options, allowPrefix, 1),
        context = matches(record.fields[2], options, allowPrefix, 2);
      const weight = Math.max(title * 20, alias * 18, context * 6);
      if (weight) { matched++; relevance += weight; }
    }
    const coverage = matched / query.tokens.length;
    if (!matched || (query.tokens.length > 1 && coverage < .5)) return 99;
    let rank = record.level * 2 + Math.round((1 - coverage) * 80) - relevance - (query.entity ? 3 : 0);
    if (record.titleKey === query.phrase) rank -= 100;
    else if (record.titleKey.startsWith(query.phrase)) rank -= 80;
    else if (query.phrase.length > 2 && (" " + record.titleKey + " ").includes(" " + query.phrase + " ")) rank -= 60;
    else if (record.fields[1].key === query.phrase) rank -= 55;
    return rank;
  };
  return { normalize, queryInfo, build, score };
}
