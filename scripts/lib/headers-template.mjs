import { machineResourceForPath } from "../../src/lib/resources.mjs";

const ANY_TOKEN_PATTERN = /{{[^{}]+}}/g;

const countToken = (source, token) => source.split(token).length - 1;

// These limits apply after interpolation, not just to the short template.
// https://developers.cloudflare.com/pages/configuration/headers/
export function assertCloudflareHeadersContract(headers) {
  let rules = 0;
  let maximumLineCharacters = 0;
  for (const [index, line] of String(headers).split(/\r?\n/).entries()) {
    maximumLineCharacters = Math.max(maximumLineCharacters, line.length);
    if (line.length > 2_000)
      throw new Error(`Cloudflare _headers line ${index + 1} exceeds 2000 characters: ${line.length}`);
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) rules++;
  }
  if (rules > 100)
    throw new Error(`Cloudflare _headers exceeds 100 rules: ${rules}`);
  return { rules, maximumLineCharacters };
}

export function compileHeadersTemplate(
  template,
  { mainCsp, csp404, httpResourceLinks } = {},
) {
  const source = String(template);
  if (typeof mainCsp !== "string" || !mainCsp)
    throw new Error("_headers compiler: MAIN_CSP missing");
  if (typeof csp404 !== "string" || !csp404)
    throw new Error("_headers compiler: 404_CSP missing");
  if (typeof httpResourceLinks !== "string" || !httpResourceLinks)
    throw new Error("_headers compiler: HTTP resource links missing");

  const bindings = new Map([
    ["{{MAIN_CSP}}", mainCsp],
    ["{{404_CSP}}", csp404],
    ["{{HTTP_RESOURCE_LINKS}}", httpResourceLinks],
  ]);
  const discovered = source.match(ANY_TOKEN_PATTERN) || [];
  for (const token of discovered) {
    const resourceToken = /^{{CONTENT_TYPE:([^{}]+)}}$/.exec(token);
    if (resourceToken)
      bindings.set(token, machineResourceForPath(resourceToken[1]).contentType);
  }
  const unknown = [
    ...new Set(discovered.filter((token) => !bindings.has(token))),
  ];
  if (unknown.length)
    throw new Error(
      `_headers compiler: unknown token(s): ${unknown.join(", ")}`,
    );

  for (const [token, value] of bindings) {
    if (!value)
      throw new Error(`_headers compiler: empty binding for ${token}`);
    const count = countToken(source, token);
    if (count !== 1)
      throw new Error(
        `_headers compiler: expected exactly one ${token}; found ${count}`,
      );
  }
  const expectedCount = bindings.size;
  const recognized = discovered.filter((token) => bindings.has(token));
  if (recognized.length !== expectedCount)
    throw new Error(
      `_headers compiler: token inventory mismatch; expected ${expectedCount}, found ${recognized.length}`,
    );

  const output = source.replace(ANY_TOKEN_PATTERN, (token) =>
    bindings.get(token),
  );
  const unresolved = output.match(ANY_TOKEN_PATTERN) || [];
  if (unresolved.length)
    throw new Error(
      `_headers compiler: unresolved token(s): ${[...new Set(unresolved)].join(", ")}`,
    );
  assertCloudflareHeadersContract(output);
  return output;
}
