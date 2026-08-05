import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeHtml, inspectHtml } from '../scripts/analyze-build-performance.mjs';
import {
  appendProvenanceHeaders,
  createBuildProvenance,
  resolveBuildIdentity,
} from '../src/integrations/build-provenance.mjs';

const FIXTURE = `<!doctype html><html lang="fa-IR"><head><meta charset="utf-8"><link rel="stylesheet" href="/a.css"><link rel="preload" as="image" href="/hero.webp" fetchpriority="high"><script type="application/ld+json">{"htmlLike":"<div>not a DOM node</div>"}</script></head><body><main id="main-content"><p id="intro">من، دکتر سعید قزلباش هستم</p><img src="/doctor.webp" alt="دکتر سعید قزلباش"><section><h2 id="services">خدمات</h2><a href="#services">مشاهده خدمات</a></section></main></body></html>`;

test('performance analyzer measures the real DOM without counting HTML-like JSON-LD text', () => {
  const inspected = inspectHtml(FIXTURE);
  assert.equal(inspected.totalElements, 13);
  assert.equal(inspected.mainDirectChildren, 3);
  assert.equal(inspected.maxDepth, 5);
  assert.deepEqual(inspected.stylesheets, ['/a.css']);
  assert.equal(inspected.headings[0].text, 'خدمات');
});

test('performance report records stable size, inventory, and authority fingerprints', () => {
  const report = analyzeHtml(FIXTURE, { commit: 'fixture' });
  assert.equal(report.regions.inlineJsonLd.count, 1);
  assert.equal(report.dom.totalElements, 13);
  assert.equal(report.criticalPathInventory.identityText.found, true);
  assert.equal(report.criticalPathInventory.preloads[0].fetchpriority, 'high');
  assert.match(report.document.sha256, /^[a-f0-9]{64}$/);
  assert.match(report.fingerprints.normalizedMainTextSha256, /^[a-f0-9]{64}$/);
  assert.equal(report.budgets.enforcement, 'observation-only');
});

test('build provenance prefers Cloudflare Pages system variables', () => {
  const identity = resolveBuildIdentity({
    CF_PAGES: '1',
    CF_PAGES_COMMIT_SHA: 'a'.repeat(40),
    CF_PAGES_BRANCH: 'main',
    CF_PAGES_URL: 'https://example.pages.dev',
    GITHUB_ACTIONS: 'true',
    GITHUB_SHA: 'b'.repeat(40),
  });
  assert.deepEqual(identity, {
    commit: 'a'.repeat(40),
    branch: 'main',
    deploymentUrl: 'https://example.pages.dev',
    platform: 'cloudflare-pages',
  });

  const provenance = createBuildProvenance(FIXTURE, {
    CF_PAGES: '1',
    CF_PAGES_COMMIT_SHA: 'a'.repeat(40),
    CF_PAGES_BRANCH: 'main',
  });
  assert.equal(provenance.commit, 'a'.repeat(40));
  assert.match(provenance.indexHtmlSha256, /^[a-f0-9]{64}$/);
});

test('provenance header section is deterministic and idempotent', () => {
  const initial = '/*\n  X-Content-Type-Options: nosniff\n';
  const once = appendProvenanceHeaders(initial);
  const twice = appendProvenanceHeaders(once);
  assert.equal(once, twice);
  assert.match(once, /\/\.well-known\/build-provenance\.json/);
  assert.match(once, /X-Robots-Tag: noindex, nofollow/);
  assert.match(once, /Cache-Control: no-store/);
});
