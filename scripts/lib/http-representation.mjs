import { createHash } from "node:crypto";
import http from "node:http";
import https from "node:https";
import * as zlib from "node:zlib";

// Repr-Digest covers the selected representation, including Content-Encoding.
// Fetch transparently decodes that representation, so it cannot prove this hash.
export function verifyReprDigest(value, encodedBytes) {
  if (value === null || value === undefined) return null;
  let checked = 0;
  for (const member of String(value).split(",")) {
    const match = member
      .trim()
      .match(/^([a-z][a-z0-9_.*-]*)=:([A-Za-z0-9+/]*={0,2}):$/);
    if (!match) throw new Error(`Malformed Repr-Digest member: ${member}`);
    const algorithm = { "sha-256": "sha256", "sha-512": "sha512" }[match[1]];
    if (!algorithm) continue;
    const expected = createHash(algorithm)
      .update(encodedBytes)
      .digest("base64");
    if (match[2] !== expected)
      throw new Error(
        `Repr-Digest ${match[1]} does not match the encoded representation`,
      );
    checked++;
  }
  if (!checked)
    throw new Error("Repr-Digest contains no supported integrity algorithm");
  return true;
}

export function decodeRepresentation(
  encodedBytes,
  contentEncoding = "identity",
) {
  let bytes = Buffer.from(encodedBytes);
  const encodings = String(contentEncoding || "identity")
    .split(",")
    .map((value) => value.trim().toLowerCase());
  for (const encoding of encodings.reverse()) {
    if (encoding === "identity") continue;
    const decode = {
      gzip: zlib.gunzipSync,
      br: zlib.brotliDecompressSync,
      deflate: zlib.inflateSync,
      zstd: zlib.zstdDecompressSync,
    }[encoding];
    if (!decode) throw new Error(`Unsupported Content-Encoding: ${encoding}`);
    bytes = decode(bytes, { maxOutputLength: 64 * 1024 * 1024 });
  }
  return bytes;
}

export async function fetchRepresentation(
  input,
  {
    headers = {},
    timeoutMs = 45000,
    redirect = "follow",
    maxRedirects = 5,
  } = {},
) {
  const url = new URL(input);
  const transport = { "http:": http, "https:": https }[url.protocol];
  if (!transport) throw new Error(`Unsupported HTTP protocol: ${url.protocol}`);
  const result = await new Promise((resolve, reject) => {
    const request = transport.get(
      url,
      {
        headers: { "accept-encoding": "identity", ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      },
      (response) => {
        const chunks = [];
        let byteLength = 0;
        response.on("data", (chunk) => {
          byteLength += chunk.length;
          if (byteLength > 64 * 1024 * 1024) {
            response.destroy(
              new Error(`HTTP representation exceeds verifier budget: ${url}`),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          if (!response.complete) {
            reject(new Error(`Incomplete HTTP representation: ${url}`));
            return;
          }
          const responseHeaders = new Headers();
          for (let i = 0; i < response.rawHeaders.length; i += 2)
            responseHeaders.append(
              response.rawHeaders[i],
              response.rawHeaders[i + 1],
            );
          resolve({
            r: {
              status: response.statusCode,
              ok: response.statusCode >= 200 && response.statusCode < 300,
              headers: responseHeaders,
              url: url.href,
            },
            encodedBytes: Buffer.concat(chunks),
          });
        });
      },
    );
    request.on("error", reject);
  });
  const { r, encodedBytes } = result;
  if (redirect === "follow" && [301, 302, 303, 307, 308].includes(r.status)) {
    const location = r.headers.get("location");
    if (!location || maxRedirects <= 0)
      throw new Error(`Invalid or excessive HTTP redirect: ${url}`);
    const destination = new URL(location, url);
    if (
      destination.origin !== url.origin &&
      Object.keys(headers).some((key) => /^(authorization|cookie)$/i.test(key))
    )
      throw new Error(
        "Refusing to forward credentials across an HTTP redirect",
      );
    return fetchRepresentation(destination, {
      headers,
      timeoutMs,
      redirect,
      maxRedirects: maxRedirects - 1,
    });
  }
  if (r.status === 206 || r.status === 304)
    throw new Error(
      `Expected a complete representation, received HTTP ${r.status}: ${url}`,
    );
  const contentEncoding = r.headers.get("content-encoding") || "identity";
  const reprDigestVerified = verifyReprDigest(
    r.headers.get("repr-digest"),
    encodedBytes,
  );
  return {
    r,
    encodedBytes,
    contentEncoding,
    reprDigestVerified,
    b: decodeRepresentation(encodedBytes, contentEncoding),
  };
}
