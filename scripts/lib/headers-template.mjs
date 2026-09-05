import { machineResourceForPath } from "../../src/lib/resources.mjs";

const ANY_TOKEN_PATTERN = /{{[^{}]+}}/g;

const countToken = (source, token) => source.split(token).length - 1;

export function compileHeadersTemplate(
  template,
  { mainCsp, csp404, heroEarlyHintHref, httpResourceLinks } = {},
) {
  const source = String(template);
  if (typeof mainCsp !== "string" || !mainCsp)
    throw new Error("_headers compiler: MAIN_CSP missing");
  if (typeof csp404 !== "string" || !csp404)
    throw new Error("_headers compiler: 404_CSP missing");
  if (
    typeof heroEarlyHintHref !== "string" ||
    !heroEarlyHintHref.startsWith("/")
  )
    throw new Error("_headers compiler: Hero Early Hint path missing");
  if (typeof httpResourceLinks !== "string" || !httpResourceLinks)
    throw new Error("_headers compiler: HTTP resource links missing");

  const bindings = new Map([
    ["{{MAIN_CSP}}", mainCsp],
    ["{{404_CSP}}", csp404],
    ["{{HERO_EARLY_HINT_HREF}}", heroEarlyHintHref],
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
  return output;
}
