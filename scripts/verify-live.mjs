import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

const ORIGIN = process.env.LIVE_ORIGIN ?? 'https://www.ghezelbaash.ir';
const ATTEMPTS = Number.parseInt(process.env.LIVE_VERIFY_ATTEMPTS ?? '20', 10);
const DELAY_MS = Number.parseInt(process.env.LIVE_VERIFY_DELAY_MS ?? '15000', 10);
const DEPLOYMENT_ATTEMPTS = Number.parseInt(process.env.DEPLOYMENT_VERIFY_ATTEMPTS ?? '30', 10);
const DEPLOYMENT_DELAY_MS = Number.parseInt(process.env.DEPLOYMENT_VERIFY_DELAY_MS ?? '10000', 10);
const EXPECTED_DEPLOYMENT_SHA = process.env.EXPECTED_DEPLOYMENT_SHA?.trim().toLowerCase() ?? '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? '';
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY ?? '';
const IS_PAGES_PREVIEW = new URL(ORIGIN).hostname.endsWith('.pages.dev');
const CONTENT_SIGNAL = 'search=yes, ai-input=yes, ai-train=yes, use=reference';
const CLOUDFLARE_CHECK_NAME = 'Cloudflare Pages';
const CLOUDFLARE_APP_NAME = 'Cloudflare Workers and Pages';
const HOME = 'https://www.ghezelbaash.ir/';
const PERSON_ID = `${HOME}#saeed-ghezelbash`;
const PRIMARY_DATASET_ID = `${HOME}graph.jsonld#dataset`;
const HISTORICAL_SUMMARY_ID = `${HOME}#historical-patient-origin-summary`;
const LEGACY_DATASET_ID = `${HOME}#project-huggingface-dataset`;
const MAX_HEAD_GRAPH_BYTES = 120_000;

const asArray = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function cacheBustedURL(pathname) {
  const url = new URL(pathname, ORIGIN);
  url.searchParams.set('__live_verify', `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  return url;
}

async function request(pathname, { accept, redirect = 'manual' } = {}) {
  const headers = new Headers({
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'User-Agent': 'doctor-ghezelbaash-live-contract/3.0',
  });
  if (accept) headers.set('Accept', accept);

  const response = await fetch(cacheBustedURL(pathname), { headers, redirect });
  const body = await response.text();
  return { response, body };
}

function header(response, name) {
  return response.headers.get(name) ?? '';
}

function headerTokens(response, name) {
  return header(response, name)
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function findNode(document, id) {
  return document?.['@graph']?.find((node) => node?.['@id'] === id);
}

function datasetNodes(document) {
  return document?.['@graph']?.filter((node) => asArray(node?.['@type']).includes('Dataset')) ?? [];
}

function assertDatasetContract(document, label, { compact = false } = {}) {
  assert.ok(Array.isArray(document?.['@graph']), `${label} must contain an @graph array`);
  const serialized = JSON.stringify(document);
  const primary = findNode(document, PRIMARY_DATASET_ID);
  const publisher = findNode(document, PERSON_ID);
  const historical = findNode(document, HISTORICAL_SUMMARY_ID);

  assert.ok(primary, `${label} is missing the canonical Dataset`);
  assert.equal(primary.name, 'Dr. Saeed Ghezelbash Entity Data');
  assert.ok(typeof primary.description === 'string' && primary.description.length >= 50, `${label} Dataset description is missing`);
  assert.equal(primary.publisher?.['@id'], PERSON_ID, `${label} Dataset publisher must be the physician`);
  assert.equal(primary.creator?.['@id'], PERSON_ID, `${label} Dataset creator must be the physician`);
  assert.equal(Object.hasOwn(primary, 'isPartOf'), false, `${label} primary Dataset must not have isPartOf`);
  assert.ok(asArray(publisher?.['@type']).some((type) => ['Person', 'IndividualPhysician'].includes(type)), `${label} publisher must resolve to a Person node`);
  assert.ok(asArray(historical?.['@type']).includes('CreativeWork'), `${label} historical geography must be CreativeWork`);
  assert.equal(asArray(historical?.['@type']).includes('Dataset'), false, `${label} historical geography must not be a Dataset`);
  assert.equal(serialized.includes(LEGACY_DATASET_ID), false, `${label} contains the retired duplicate Dataset`);
  assert.equal(/separate secondary supporting Dataset/i.test(serialized), false, `${label} contains stale Dataset wording`);

  if (compact) {
    assert.deepEqual(datasetNodes(document).map((node) => node['@id']), [PRIMARY_DATASET_ID], `${label} must expose only the primary Dataset inline`);
    assert.ok(Buffer.byteLength(serialized, 'utf8') <= MAX_HEAD_GRAPH_BYTES, `${label} exceeds ${MAX_HEAD_GRAPH_BYTES} bytes`);
  }
}

export function selectCloudflarePagesCheck(checkRuns) {
  return [...checkRuns]
    .filter((check) => check.name === CLOUDFLARE_CHECK_NAME && check.app?.name === CLOUDFLARE_APP_NAME)
    .sort((left, right) => {
      const leftTime = Date.parse(left.started_at ?? left.created_at ?? 0) || 0;
      const rightTime = Date.parse(right.started_at ?? right.created_at ?? 0) || 0;
      return rightTime - leftTime;
    })[0] ?? null;
}

export function cloudflareCheckState(check) {
  if (!check) return 'missing';
  if (check.status !== 'completed') return 'pending';
  return check.conclusion === 'success' ? 'success' : 'failure';
}

async function fetchCloudflarePagesCheck() {
  assert.match(EXPECTED_DEPLOYMENT_SHA, /^[a-f0-9]{40}$/i, 'EXPECTED_DEPLOYMENT_SHA must be a full commit SHA');
  assert.ok(GITHUB_TOKEN, 'GITHUB_TOKEN is required for revision-aware deployment verification');
  assert.match(GITHUB_REPOSITORY, /^[^/]+\/[^/]+$/, 'GITHUB_REPOSITORY must use owner/repository form');

  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/commits/${EXPECTED_DEPLOYMENT_SHA}/check-runs?per_page=100`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'doctor-ghezelbaash-deployment-contract/1.0',
    },
  });

  assert.equal(response.status, 200, `GitHub check-runs API returned ${response.status}`);
  const payload = await response.json();
  assert.ok(Array.isArray(payload.check_runs), 'GitHub check-runs response is malformed');
  return selectCloudflarePagesCheck(payload.check_runs);
}

async function waitForExactCloudflareDeployment() {
  if (!EXPECTED_DEPLOYMENT_SHA) return;

  for (let attempt = 1; attempt <= DEPLOYMENT_ATTEMPTS; attempt += 1) {
    const check = await fetchCloudflarePagesCheck();
    const state = cloudflareCheckState(check);

    if (state === 'success') {
      console.log(`Cloudflare Pages completed successfully for ${EXPECTED_DEPLOYMENT_SHA} on attempt ${attempt}/${DEPLOYMENT_ATTEMPTS}.`);
      return;
    }
    if (state === 'failure') throw new Error(`Cloudflare Pages concluded ${check.conclusion} for ${EXPECTED_DEPLOYMENT_SHA}`);

    const status = check ? check.status : 'not published yet';
    console.log(`Cloudflare Pages check is ${status} for ${EXPECTED_DEPLOYMENT_SHA}; attempt ${attempt}/${DEPLOYMENT_ATTEMPTS}.`);
    if (attempt < DEPLOYMENT_ATTEMPTS) await sleep(DEPLOYMENT_DELAY_MS);
  }

  throw new Error(`Cloudflare Pages did not complete successfully for ${EXPECTED_DEPLOYMENT_SHA}`);
}

function extractInlineJsonLd(html) {
  const matches = [...html.matchAll(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  assert.equal(matches.length, 1, `canonical HTML must expose one compact inline JSON-LD graph, found ${matches.length}`);
  return matches[0][1];
}

async function verifyCanonicalHTML() {
  const { response, body } = await request('/', {
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  });

  assert.equal(response.status, 200, `canonical HTML returned ${response.status}`);
  assert.match(header(response, 'content-type'), /^text\/html\b/i);
  assert.match(header(response, 'cache-control'), /(?:^|,)\s*max-age=300(?:,|$)/i);
  assert.equal(headerTokens(response, 'vary').includes('accept'), false, 'static root must not vary on Accept');
  assert.equal(header(response, 'content-location'), '/');
  assert.equal(header(response, 'content-signal'), CONTENT_SIGNAL);
  if (IS_PAGES_PREVIEW) assert.match(header(response, 'x-robots-tag'), /\bnoindex\b/i);
  else assert.match(header(response, 'x-robots-tag'), /\ball\b/i);

  assert.match(body, /<html\b[^>]*\blang=["']fa-IR["']/i);
  assert.match(body, /<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']https:\/\/www\.ghezelbaash\.ir\/?["']/i);

  const inlinePayload = extractInlineJsonLd(body);
  assertDatasetContract(JSON.parse(inlinePayload), 'live compact Head Graph', { compact: true });

  const preloadTags = body.match(/<link\b[^>]*\brel=["']preload["'][^>]*>/gi) ?? [];
  const heroPreload = preloadTags.find((tag) => tag.includes('saeed-ghezelbash-portrait')) ?? '';
  assert.ok(heroPreload, 'hero image preload is missing from live HTML');
  assert.match(heroPreload, /\bas=["']image["']/i);
  assert.match(heroPreload, /\bfetchpriority=["']high["']/i);

  const fontPreload = preloadTags.find((tag) => tag.includes('/fonts/vazirmatn-nl-wght.woff2')) ?? '';
  assert.ok(fontPreload, 'desktop Vazirmatn preload is missing from live HTML');
  assert.match(fontPreload, /\bas=["']font["']/i);
  assert.match(fontPreload, /\btype=["']font\/woff2["']/i);
  assert.match(fontPreload, /\bmedia=["']\(min-width:\s*48\.001rem\)["']/i);

  const stylesheetURLs = [...body.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => new URL(match[1], ORIGIN));
  assert.ok(stylesheetURLs.length > 0, 'live HTML exposes no stylesheet links');

  const stylesheets = await Promise.all(stylesheetURLs.map(async (url) => {
    url.searchParams.set('__live_verify', `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const stylesheet = await fetch(url, { headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } });
    assert.equal(stylesheet.status, 200, `stylesheet ${url.pathname} returned ${stylesheet.status}`);
    return stylesheet.text();
  }));
  const css = stylesheets.join('\n');
  assert.match(css, /:has\(main\s+:target\)/i, 'target-aware fragment materialization rule is missing');
  assert.match(css, /content-visibility:\s*visible/i, 'fragment materialization does not force visible geometry');
  assert.match(css, /contain-intrinsic-size:\s*none/i, 'fragment materialization does not clear intrinsic placeholders');
}

async function verifyMachineReadableAssets() {
  const graphResult = await request('/graph.jsonld', { accept: 'application/ld+json,application/json;q=0.9,*/*;q=0.1' });
  assert.equal(graphResult.response.status, 200, `graph.jsonld returned ${graphResult.response.status}`);
  assert.match(header(graphResult.response, 'content-type'), /^(?:application\/ld\+json|application\/json)\b/i);
  assertDatasetContract(JSON.parse(graphResult.body), 'live full graph');

  const turtle = await request('/graph.ttl', { accept: 'text/turtle,text/plain;q=0.9,*/*;q=0.1' });
  assert.equal(turtle.response.status, 200, `graph.ttl returned ${turtle.response.status}`);
  assert.match(header(turtle.response, 'content-type'), /^(?:text\/turtle|text\/plain)\b/i);
  assert.ok(turtle.body.includes(`<${PRIMARY_DATASET_ID}> <https://schema.org/publisher> <${PERSON_ID}> .`));
  assert.equal(turtle.body.includes(`<${HISTORICAL_SUMMARY_ID}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://schema.org/Dataset> .`), false);

  const llms = await request('/llms.txt', { accept: 'text/plain,*/*;q=0.1' });
  assert.equal(llms.response.status, 200, `llms.txt returned ${llms.response.status}`);
  assert.match(llms.body, /## Integrated historical geographic evidence/);
  assert.equal(/separate secondary supporting Dataset/i.test(llms.body), false);
}

async function verifyExplicitRepresentations() {
  const negotiated = await request('/', { accept: 'text/markdown, text/html;q=0.2' });
  assert.equal(negotiated.response.status, 200);
  assert.match(header(negotiated.response, 'content-type'), /^text\/html\b/i);
  assert.match(negotiated.body, /<html\b/i);

  const markdown = await request('/index.md', { accept: 'text/markdown,*/*;q=0.1' });
  assert.equal(markdown.response.status, 200, `index.md returned ${markdown.response.status}`);
  assert.match(header(markdown.response, 'content-type'), /^text\/markdown\b/i);
  assert.equal(header(markdown.response, 'content-language'), 'fa-IR');
  assert.match(header(markdown.response, 'x-robots-tag'), /\bnoindex\b/i);
  assert.match(markdown.body, /^---\n[\s\S]*?\n---\n/m, 'Markdown projection is missing canonical frontmatter');
  assert.match(markdown.body, /canonical:\s*["']https:\/\/www\.ghezelbaash\.ir\/?["']/i);

  const fullText = await request('/llms-full.txt', { accept: 'text/plain,*/*;q=0.1' });
  assert.equal(fullText.response.status, 200, `llms-full.txt returned ${fullText.response.status}`);
  assert.match(header(fullText.response, 'content-type'), /^text\/plain\b/i);
  assert.equal(header(fullText.response, 'content-language'), 'fa-IR');
  assert.match(header(fullText.response, 'x-robots-tag'), /\bnoindex\b/i);
}

async function verifyRobotsPolicy() {
  const { response, body } = await request('/robots.txt', { accept: 'text/plain,*/*;q=0.1' });
  assert.equal(response.status, 200, `robots.txt returned ${response.status}`);
  assert.match(header(response, 'content-type'), /^text\/plain\b/i);
  assert.match(body, /^User-agent:\s*OAI-SearchBot$/m);
  assert.match(body, /^User-agent:\s*Claude-SearchBot$/m);
  assert.match(body, /^User-agent:\s*PerplexityBot$/m);
  assert.match(body, new RegExp(`^Content-Signal:\\s*${CONTENT_SIGNAL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  assert.match(body, /^Sitemap:\s*https:\/\/www\.ghezelbaash\.ir\/sitemap\.xml$/m);
}

async function verify404Aliases() {
  for (const pathname of ['/404', '/404/', '/404.html']) {
    const { response, body } = await request(pathname, { accept: 'text/html,*/*;q=0.1' });
    assert.equal(response.status, 404, `${pathname} returned ${response.status} instead of 404`);
    assert.match(header(response, 'content-type'), /^text\/html\b/i);
    assert.equal(header(response, 'cache-control'), 'no-store');
    assert.match(header(response, 'x-robots-tag'), /\bnoindex\b/i);
    assert.equal(header(response, 'content-location'), '/404.html');
    assert.equal(header(response, 'content-signal'), CONTENT_SIGNAL);
    assert.match(body, /<meta\b[^>]*\bname=["']robots["'][^>]*\bcontent=["'][^"']*noindex/i);
    assert.match(body, />404</);
  }
}

async function verifyLiveContract() {
  await verifyRobotsPolicy();
  await verifyCanonicalHTML();
  await verifyMachineReadableAssets();
  await verifyExplicitRepresentations();
  await verify404Aliases();
}

export async function main() {
  await waitForExactCloudflareDeployment();

  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      await verifyLiveContract();
      console.log(`Live contract verified against ${ORIGIN} on attempt ${attempt}/${ATTEMPTS}.`);
      return;
    } catch (error) {
      lastError = error;
      console.error(`Live verification attempt ${attempt}/${ATTEMPTS} failed: ${error.message}`);
      if (attempt < ATTEMPTS) await sleep(DELAY_MS);
    }
  }

  throw lastError;
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) await main();
