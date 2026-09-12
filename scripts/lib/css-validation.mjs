import assert from "node:assert/strict";
import * as css from "css-tree";

const fail = (label, message) => { throw new Error(`${label}: ${message}`); };
const valueAst = (value) => css.parse(value, { context: "value", parseCustomProperty: true });
const matched = (result, label) => { if (result.error) fail(label, result.error.message); };

// CSS parsers recover at EOF. Validation must also reject truncated input.
export function parseCss(source, label, context = "stylesheet") {
  const t = css.tokenTypes, stack = [];
  const pairs = new Map([[t.Function, t.RightParenthesis], [t.LeftParenthesis, t.RightParenthesis],
    [t.LeftSquareBracket, t.RightSquareBracket], [t.LeftCurlyBracket, t.RightCurlyBracket]]);
  css.tokenize(source, (type, start, end) => {
    const token = source.slice(start, end);
    if ([t.BadString, t.BadUrl].includes(type)) fail(label, "Malformed CSS token");
    if (type === t.Comment && !token.endsWith("*/")) fail(label, "Unclosed CSS comment");
    if (type === t.String && (token.length < 2 || token.at(-1) !== token[0] ||
      ((token.slice(0, -1).match(/\\+$/)?.[0].length || 0) % 2))) fail(label, "Unclosed CSS string");
    if (type === t.Url && !token.endsWith(")")) fail(label, "Unclosed CSS URL");
    if (pairs.has(type)) stack.push(pairs.get(type));
    else if ([t.RightParenthesis, t.RightSquareBracket, t.RightCurlyBracket].includes(type) && stack.pop() !== type)
      fail(label, "Unbalanced CSS delimiter");
  });
  if (stack.length) fail(label, "Unclosed CSS delimiter");
  const ast = css.parse(source, { context, positions: true, parseCustomProperty: true,
    onParseError: (error) => fail(label, error.message) });
  css.walk(ast, (node) => { if (node.type === "Raw") fail(label, "Unparsed CSS is not validated"); });
  return ast;
}

function resolveValue(value, definitions, label, chain = [], preferFallback = false) {
  const result = css.clone(value);
  css.walk(result, { visit: "Function", enter(node, item, list) {
    if (node.name.toLowerCase() !== "var") return;
    const args = node.children.toArray();
    if (args[0]?.type !== "Identifier" || !/^--[^\s]+$/.test(args[0].name) ||
      (args.length > 1 && (args[1]?.type !== "Operator" || args[1].value !== ",")))
      fail(label, "Malformed var() reference");
    const name = args[0].name;
    if (chain.includes(name)) fail(label, `Cyclic custom property ${name}`);
    const fallback = args.length > 1 ? valueAst(args.slice(2).map((n) => css.generate(n)).join("")) : null;
    const target = (preferFallback && fallback) || definitions.get(name) || fallback;
    if (!target) fail(label, `Unresolved custom property ${name}`);
    const replacement = resolveValue(target, definitions, label, [...chain, name], preferFallback);
    list.replace(item, replacement.children);
    return css.walk.skip;
  } });
  return result;
}

const discreteFeatures = new Map([
  ["prefers-reduced-motion", ["reduce", "no-preference"]],
  ["prefers-contrast", ["more", "less", "custom", "no-preference"]],
  ["forced-colors", ["active", "none"]],
]);
function validateFeature(node, label) {
  const sizeFeature = node.kind === "media" ? /^(?:(?:min|max)-)?(?:width|height)$/
    : /^(?:(?:min|max)-)?(?:width|height|inline-size|block-size)$/;
  if (sizeFeature.test(node.name)) {
    if (!node.value) return; // Boolean size query.
    matched(css.lexer.matchType("length", node.value), label);
    if (Number(node.value.value) < 0) fail(label, "Negative query size");
  } else if (node.kind === "media" && discreteFeatures.has(node.name)) {
    if (!node.value || !discreteFeatures.get(node.name).includes(css.generate(node.value)))
      fail(label, `Unsupported ${node.name} value`);
  } else fail(label, `Query feature needs explicit validation coverage: ${node.name}`);
}

export function validateCssUnits(units) {
  assert(units.length, "No CSS inputs were validated");
  const parsed = units.map((unit) => ({ ...unit, ast: parseCss(unit.css, unit.label, unit.context) }));
  const roots = new Map(), chunks = new Map(), formulas = new Map();
  const declarations = [], checkedSelectors = new Set(), browserValues = new Map();
  const checkInBrowser = (property, value, descriptor = null) => {
    const entry = { property, value: css.generate(value), descriptor };
    browserValues.set(JSON.stringify(entry), entry);
  };
  let ruleCount = 0;
  for (const unit of parsed) {
    const atRules = [], selectors = [];
    css.walk(unit.ast, { enter(node) {
      const label = `${unit.label}:${node.loc?.start.line || 1}`;
      if (node.type === "Atrule") {
        if (selectors.length || atRules.includes("font-face") || unit.context === "declarationList")
          fail(label, "Nested at-rule context needs explicit validation coverage");
        if (!["layer", "font-face", "media", "container"].includes(node.name))
          fail(label, `At-rule needs explicit validation coverage: @${node.name}`);
        matched(css.lexer.matchAtrulePrelude(node.name, node.prelude), label);
        if (node.name !== "layer" && !node.block) fail(label, `@${node.name} requires a block`);
        atRules.push(node.name);
      }
      if (node.type === "Rule") {
        if (selectors.length || atRules.includes("font-face"))
          fail(label, "Nested rule context needs explicit validation coverage");
        const selector = css.generate(node.prelude);
        selectors.push(selector);
        for (const item of node.prelude.children) checkedSelectors.add(css.generate(item));
        ruleCount++;
      }
      if (node.type === "Feature") {
        validateFeature(node, label);
        if (node.value && !discreteFeatures.has(node.name)) checkInBrowser("width", node.value);
      }
      if (["FeatureRange", "FeatureFunction", "GeneralEnclosed"].includes(node.type))
        fail(label, `Query syntax needs explicit validation coverage: ${node.type}`);
      if (node.type === "MediaQuery" && node.mediaType && !["all", "screen", "print"].includes(node.mediaType))
        fail(label, `Media type needs explicit validation coverage: ${node.mediaType}`);
      if (node.type !== "Declaration") return;
      const selector = selectors.at(-1), property = node.property;
      if (!selector && atRules.at(-1) !== "font-face" && unit.context !== "declarationList")
        fail(label, "Declaration has no valid rule context");
      if (property.startsWith("--")) {
        if (selector === ":root") {
          if (roots.has(property) && css.generate(roots.get(property)) !== css.generate(node.value))
            fail(label, `Ambiguous root token ${property}`);
          roots.set(property, node.value);
        } else if (/^--cis-[0-5]$/.test(property) && /^#rc\d+$/.test(selector || "")) {
          const number = node.value.children.toArray();
          if (number.length !== 1 || number[0].type !== "Number" || !(Number(number[0].value) > 0))
            fail(label, `Calibration sample must be a positive unitless number: ${property}`);
          if (!chunks.has(selector)) chunks.set(selector, new Map());
          const values = chunks.get(selector);
          if (values.has(property) && css.generate(values.get(property)) !== css.generate(node.value))
            fail(label, `Conflicting calibration sample: ${selector} ${property}`);
          values.set(property, node.value);
        } else if (property === "--cis" && selector === ".render-chunk") {
          formulas.set(css.generate(node.value), node.value);
        } else fail(label, `Custom property scope needs explicit validation coverage: ${selector} ${property}`);
      } else {
        const descriptor = atRules.at(-1) === "font-face" ? "font-face" : null;
        if (!descriptor && !css.lexer.getProperty(property)) fail(label, `Unknown property ${property}`);
        declarations.push({ node, descriptor, label });
      }
    }, leave(node) {
      if (node.type === "Atrule") atRules.pop();
      if (node.type === "Rule") selectors.pop();
    } });
  }

  // Validate every actual calibration profile, rather than treating var() as a
  // parser exemption. Computed dimensions remain covered by the browser gate.
  let calibrationCases = 0, representative;
  for (const [selector, values] of chunks) {
    assert.equal(values.size, 6, `${selector}: incomplete calibration profile`);
    for (const formula of formulas.values()) {
      const resolved = resolveValue(formula, values, selector);
      matched(css.lexer.matchProperty("height", resolved), selector);
      checkInBrowser("height", resolved);
      representative ||= resolved;
      calibrationCases++;
    }
  }
  if (formulas.size && !calibrationCases) fail("calibration", "Formula has no measured profiles");
  if (chunks.size && !formulas.size) fail("calibration", "Measured profiles have no formula");
  if (representative) roots.set("--cis", representative);
  for (const [name, value] of roots) resolveValue(value, roots, name);
  for (const { node, descriptor, label } of declarations) {
    for (const useFallback of [false, true]) {
      const resolved = resolveValue(node.value, roots, label, [], useFallback);
      matched(descriptor ? css.lexer.matchAtruleDescriptor(descriptor, node.property, resolved)
        : css.lexer.matchProperty(node.property, resolved), label);
      checkInBrowser(node.property, resolved, descriptor);
    }
  }
  return { valid: true, parser: `css-tree ${css.version}`, inputs: units.length,
    rules: ruleCount, declarations: declarations.length, rootTokens: roots.size,
    calibrationProfiles: chunks.size, calibrationCases, selectors: [...checkedSelectors],
    browserValues: [...browserValues.values()] };
}
