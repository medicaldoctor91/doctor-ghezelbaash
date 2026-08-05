import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const PROVENANCE_PATH = '.well-known/build-provenance.json';
const HEADER_SECTION = `/${PROVENANCE_PATH}\n  Content-Type: application/json; charset=utf-8\n  Content-Location: /${PROVENANCE_PATH}\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-store\n  Access-Control-Allow-Origin: *\n  Cross-Origin-Resource-Policy: cross-origin\n`;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function resolveBuildIdentity(environment = process.env) {
  const cloudflare = environment.CF_PAGES === '1';
  const github = environment.GITHUB_ACTIONS === 'true';
  return {
    commit: environment.CF_PAGES_COMMIT_SHA ?? environment.GITHUB_SHA ?? 'local-unversioned-build',
    branch: environment.CF_PAGES_BRANCH ?? environment.GITHUB_HEAD_REF ?? environment.GITHUB_REF_NAME ?? 'local',
    deploymentUrl: environment.CF_PAGES_URL ?? null,
    platform: cloudflare ? 'cloudflare-pages' : github ? 'github-actions' : 'local',
  };
}

export function createBuildProvenance(html, environment = process.env) {
  return {
    schemaVersion: 1,
    artifact: 'doctor-ghezelbaash-canonical-page',
    canonicalOrigin: 'https://www.ghezelbaash.ir',
    ...resolveBuildIdentity(environment),
    indexHtmlSha256: sha256(html),
  };
}

export function appendProvenanceHeaders(headers) {
  if (headers.includes(`/${PROVENANCE_PATH}\n`)) return headers;
  return `${headers.replace(/\s*$/, '')}\n\n${HEADER_SECTION}`;
}

export default function buildProvenance() {
  return {
    name: 'build-provenance',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const indexURL = new URL('index.html', dir);
        const headersURL = new URL('_headers', dir);
        const provenanceURL = new URL(PROVENANCE_PATH, dir);
        const html = await readFile(indexURL, 'utf8');
        const headers = await readFile(headersURL, 'utf8');
        const provenance = createBuildProvenance(html);

        await mkdir(new URL('.well-known/', dir), { recursive: true });
        await Promise.all([
          writeFile(provenanceURL, `${JSON.stringify(provenance, null, 2)}\n`),
          writeFile(headersURL, appendProvenanceHeaders(headers)),
        ]);

        logger.info(`Published deployment provenance for ${provenance.commit}.`);
      },
    },
  };
}
