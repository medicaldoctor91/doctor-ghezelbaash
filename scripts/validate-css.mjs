import { pathToFileURL } from "node:url";
import { collectCssInputs, digest } from "./lib/html-css-inputs.mjs";
import { validateCssUnits } from "./lib/css-validation.mjs";

export async function validateCss(root = process.cwd(), directory = "dist") {
  const inputs = await collectCssInputs(root, directory);
  const selectors = new Set(), browserValues = new Map(), reports = [];
  const audit = (units) => {
    const { selectors: checked, browserValues: values, ...report } = validateCssUnits(units);
    for (const selector of checked) selectors.add(selector);
    for (const value of values) browserValues.set(JSON.stringify(value), value);
    return report;
  };
  reports.push({ scope: "source", ...audit(inputs.source) });
  for (const document of inputs.documents) reports.push({ scope: document.label,
    htmlSha256: document.sha256, ...audit(document.units),
    css: document.units.map((unit) => ({ label: unit.label, sha256: digest(unit.css) })) });
  return { ...inputs, selectors: [...selectors], browserValues: [...browserValues.values()], report: { valid: true, reports } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify((await validateCss(process.cwd(), process.argv[2] || "dist")).report, null, 2));
