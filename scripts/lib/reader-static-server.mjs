import http from "node:http";
import path from "node:path";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";

const mimeTypes = new Map(Object.entries({
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json", ".jsonld": "application/ld+json",
  ".xml": "application/xml", ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8", ".ttl": "text/turtle; charset=utf-8",
  ".csv": "text/csv; charset=utf-8", ".vcf": "text/vcard; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".webp": "image/webp",
  ".avif": "image/avif", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".mp4": "video/mp4", ".webm": "video/webm", ".vtt": "text/vtt; charset=utf-8",
  ".woff": "font/woff", ".woff2": "font/woff2", ".pdf": "application/pdf",
}));
const redirectStatuses = new Set([200, 301, 302, 303, 307, 308]);
const readOptional = async (file) => readFile(file, "utf8").catch((error) => {
  if (error.code === "ENOENT") return "";
  throw error;
});
const inside = (root, file) => {
  const relative = path.relative(root, file);
  return !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep);
};
const decodePath = (value) => {
  const decoded = decodeURIComponent(value);
  if (!decoded.startsWith("/") || decoded.startsWith("//") || /[\\\x00-\x1f\x7f]/u.test(decoded) ||
      decoded.split("/").some((part) => part === "." || part === ".."))
    throw new Error("Unsafe reader path");
  return decoded;
};
const interpolate = (value, bindings) => value.replace(/:([A-Za-z][A-Za-z0-9_-]*)/g,
  (token, name) => Object.hasOwn(bindings, name) ? bindings[name] : token);

function patternMatcher(pattern, hostname = false) {
  const names = [];
  let source = "", offset = 0;
  for (const token of pattern.matchAll(/\*|:[A-Za-z][A-Za-z0-9_-]*/g)) {
    source += pattern.slice(offset, token.index).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    names.push(token[0] === "*" ? "splat" : token[0].slice(1));
    source += token[0] === "*" ? "(.*)" : hostname ? "([^./:*]+)" : "([^/]+)";
    offset = token.index + token[0].length;
  }
  source += pattern.slice(offset).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp("^" + source + "$");
  return (value) => {
    const match = expression.exec(value);
    return match ? Object.fromEntries(names.map((name, index) => [name, match[index + 1]])) : null;
  };
}

function compilePattern(pattern) {
  const absolute = /^(https?:\/\/[^/]+)(\/.*)?$/.exec(pattern);
  const matchOrigin = absolute ? patternMatcher(absolute[1], true) : null;
  const route = absolute?.[2] ?? (absolute ? "/" : pattern);
  if (!route.startsWith("/") || /[?#]/.test(route)) throw new Error("Invalid reader rule: " + pattern);
  const matchPath = patternMatcher(decodePath(route));
  return (origin, pathname) => {
    const hostBindings = matchOrigin ? matchOrigin(origin) : {};
    const pathBindings = matchPath(pathname);
    return hostBindings && pathBindings ? { ...hostBindings, ...pathBindings } : null;
  };
}

function parseHeaders(source) {
  const rules = [];
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) rules.push({ match: compilePattern(line.trim()), headers: [] });
    else {
      if (!rules.length) throw new Error("Reader header has no path rule");
      const removal = /^\s*!\s*([^\s:]+)\s*$/.exec(line);
      const field = /^\s*([^\s:]+):\s*(.*)$/.exec(line);
      if (!removal && !field) throw new Error("Invalid reader header: " + line.trim());
      const name = (removal?.[1] ?? field[1]).toLowerCase();
      http.validateHeaderName(name);
      if (field) http.validateHeaderValue(name, field[2]);
      rules.at(-1).headers.push({ name, value: field?.[2], remove: Boolean(removal) });
    }
  }
  return rules;
}

function parseRedirects(source) {
  return source.split(/\r?\n/).filter((line) => line.trim() && !line.trimStart().startsWith("#")).map((line) => {
    const fields = line.trim().split(/\s+/);
    const [sourcePath, target, status = "302"] = fields;
    if (fields.length < 2 || fields.length > 3 || !redirectStatuses.has(Number(status)))
      throw new Error("Invalid reader redirect: " + line);
    return { match: compilePattern(sourcePath), target, status: Number(status) };
  });
}

function applyHeaders(response, rules, origin, pathname) {
  const fields = new Map();
  for (const rule of rules) {
    const bindings = rule.match(origin, pathname);
    if (!bindings) continue;
    for (const { name, value, remove } of rule.headers) {
      if (remove) fields.delete(name);
      else fields.set(name, [...(fields.get(name) ?? []), interpolate(value, bindings)]);
    }
  }
  for (const [name, values] of fields)
    response.setHeader(name, name === "content-security-policy" ? values : values.join(", "));
}

function byteRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value ?? "");
  if (!match || !match[1] && !match[2]) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!size || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      !match[1] && Number(match[2]) === 0 || start > end || start >= size) return false;
  return { start, end };
}

/** Serve a built reader locally, using its request-path Pages headers and redirects. */
export async function startReaderStaticServer({ distDirectory, host = "127.0.0.1", port = 0 } = {}) {
  if (typeof distDirectory !== "string" || !distDirectory) throw new Error("Reader distDirectory is required");
  const root = await realpath(distDirectory);
  if (!(await stat(root)).isDirectory()) throw new Error("Reader distDirectory must be a directory");
  const [headerSource, redirectSource, homepage] = await Promise.all([
    readOptional(path.join(root, "_headers")), readOptional(path.join(root, "_redirects")),
    readOptional(path.join(root, "index.html")),
  ]);
  const headerRules = parseHeaders(headerSource), redirectRules = parseRedirects(redirectSource);
  const canonicalHref = /<link\b(?=[^>]*\brel=["']canonical["'])[^>]*\bhref=["']([^"']+)["']/i.exec(homepage)?.[1];
  const canonicalOrigin = canonicalHref ? new URL(canonicalHref).origin : null;
  let origin;
  const locate = async (route) => {
    const candidate = path.resolve(root, "." + decodePath(route));
    if (!inside(root, candidate)) throw new Error("Unsafe reader path");
    try {
      const file = await realpath(candidate);
      if (!inside(root, file)) throw new Error("Reader file escaped distDirectory");
      return { file, info: await stat(file) };
    } catch (error) {
      if (["ENOENT", "ENOTDIR"].includes(error.code)) return null;
      throw error;
    }
  };
  const server = http.createServer(async (request, response) => {
    const send = (status, message = "", headers = {}) => {
      const body = Buffer.from(message);
      if (!response.hasHeader("Content-Type")) response.setHeader("Content-Type", "text/plain; charset=utf-8");
      response.writeHead(status, { ...headers, "Content-Length": body.length });
      response.end(request.method === "HEAD" ? undefined : body);
    };
    try {
      // Inspect the raw pathname before URL parsing can normalize dot segments.
      const route = decodePath(request.url.split(/[?#]/, 1)[0]);
      const url = new URL(request.url, origin);
      const ruleOrigin = canonicalOrigin ?? origin;
      applyHeaders(response, headerRules, ruleOrigin, route);
      if (!["GET", "HEAD"].includes(request.method)) { request.resume(); send(405, "Method not allowed", { Allow: "GET, HEAD" }); return; }
      let rule;
      for (const entry of redirectRules) {
        const bindings = entry.match(ruleOrigin, route);
        if (bindings) { rule = { ...entry, bindings }; break; }
      }
      let resource = route;
      if (rule) {
        const target = new URL(interpolate(rule.target, rule.bindings), origin);
        if (target.username || target.password || ![origin, canonicalOrigin].includes(target.origin)) {
          send(502, "Redirect destination is outside the canonical site"); return;
        }
        if (!target.search) target.search = url.search;
        if (rule.status !== 200) { send(rule.status, "", { Location: target.pathname + target.search + target.hash }); return; }
        resource = decodePath(target.pathname);
      }
      let found = ["/_headers", "/_redirects"].includes(resource) ? null : await locate(resource);
      if (found?.info.isDirectory()) {
        found = await locate(resource.replace(/\/$/, "") + "/index.html");
        if (found && !route.endsWith("/") && !rule) { send(308, "", { Location: url.pathname + "/" + url.search }); return; }
      } else if (!found) {
        const clean = resource.replace(/\/$/, "");
        found = await locate(clean + ".html");
        if (found && resource.endsWith("/") && !rule) { send(308, "", { Location: url.pathname.slice(0, -1) + url.search }); return; }
      }
      if (found?.info.isFile() && resource.endsWith(".html") && !rule) {
        const clean = url.pathname.endsWith("/index.html") ? url.pathname.slice(0, -10) : url.pathname.slice(0, -5);
        send(308, "", { Location: clean + url.search }); return;
      }
      if (!found?.info.isFile()) { response.statusCode = 404; found = await locate("/404.html"); }
      if (!found?.info.isFile()) { send(404, "Not found"); return; }
      if (!response.hasHeader("Content-Type")) response.setHeader("Content-Type", mimeTypes.get(path.extname(found.file).toLowerCase()) ?? "application/octet-stream");
      response.setHeader("Accept-Ranges", "bytes");
      const range = response.statusCode === 200 ? byteRange(request.headers.range, found.info.size) : null;
      if (range === false) { response.writeHead(416, { "Content-Range": "bytes */" + found.info.size, "Content-Length": 0 }); response.end(); return; }
      if (range) { response.statusCode = 206; response.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${found.info.size}`); }
      response.setHeader("Content-Length", range ? range.end - range.start + 1 : found.info.size);
      if (request.method === "HEAD") { response.end(); return; }
      await pipeline(createReadStream(found.file, range ?? undefined), response);
    } catch (error) {
      if (response.headersSent) response.destroy();
      else send(error instanceof URIError || /Unsafe reader path|escaped distDirectory/.test(error.message) ? 400 : 500, "Reader request failed");
    }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, host, resolve); });
  const address = server.address();
  origin = `http://${host.includes(":") ? "[" + host + "]" : host}:${address.port}`;
  let closing;
  return { origin, close: () => closing ??= new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }) };
}
