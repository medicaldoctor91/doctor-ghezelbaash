#!/usr/bin/env node
import { loadPublicationData } from "./lib/publication-context.mjs";

const fail = (message) => {
  throw new Error(message);
};

const [command = "json", selector] = process.argv.slice(2);
const publication = await loadPublicationData();

if (command === "json") {
  if (selector !== undefined) fail("publication-context json takes no selector");
  process.stdout.write(`${JSON.stringify(publication)}\n`);
} else if (command === "get") {
  if (
    typeof selector !== "string" ||
    !selector ||
    selector.startsWith(".") ||
    selector.endsWith(".")
  )
    fail("publication-context get requires a dot-separated selector");
  let value = publication;
  for (const segment of selector.split(".")) {
    if (
      !segment ||
      value == null ||
      typeof value !== "object" ||
      !Object.hasOwn(value, segment)
    )
      fail(`publication-context selector is not available: ${selector}`);
    value = value[segment];
  }
  if (value == null || (typeof value === "string" && !value))
    fail(`publication-context selector is empty: ${selector}`);
  process.stdout.write(
    `${typeof value === "object" ? JSON.stringify(value) : String(value)}\n`,
  );
} else {
  fail(`Unsupported publication-context command: ${command}`);
}
