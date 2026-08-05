import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeHtml, inspectHtml } from '../scripts/analyze-build-performance.mjs';
import { cloudflareCheckState, selectCloudflarePagesCheck } from '../scripts/verify-live.mjs';

const FIXTURE = `<!doctype html><html lang="fa-IR"><head><meta charset="utf-8"><link rel="stylesheet" href="/a.css"><script type="application/ld+json">{"htmlLike":"<div>not a DOM node</div>"}</script></head><body><main id="main-content"><p id="intro">من، <strong>دکتر سعید</strong> قزلباش هستم</p><img src="/doctor.webp" alt="دکتر سعید قزلباش"><section><h2 id="services">خدمات</h2><a href="#services">مشاهده خدمات</a></section></main></body></html>`;

test('parse5 analyzer measures DOM nodes without counting HTML-like JSON-LD text', () => {
  const inspected = inspectHtml(FIXTURE);
  assert.equal(inspected.totalElements, 13);
  assert.equal(inspected.mainDirectChildren, 3);
  assert.equal(inspected.maxDepth, 5);
  assert.equal(inspected.headings[0].text, 'خدمات');
  assert.equal(inspected.jsonLdScripts.length, 1);
});

test('performance report records stable size and authority-preserving fingerprints', () => {
  const report = analyzeHtml(FIXTURE, { commit: 'fixture' });
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.regions.inlineJsonLd.count, 1);
  assert.equal(report.dom.totalElements, 13);
  assert.equal(report.dom.mainDirectChildren, 3);
  assert.match(report.document.sha256, /^[a-f0-9]{64}$/);
  assert.match(report.fingerprints.normalizedMainTextSha256, /^[a-f0-9]{64}$/);
  assert.match(report.fingerprints.headingSequenceSha256, /^[a-f0-9]{64}$/);
  assert.equal(report.budgets.enforcement, 'observation-only');
  assert.equal('criticalPathInventory' in report, false);
});

test('Cloudflare check selection only accepts the official app and newest exact check', () => {
  const selected = selectCloudflarePagesCheck([
    {
      name: 'Cloudflare Pages',
      app: { name: 'Unrelated App' },
      status: 'completed',
      conclusion: 'success',
      started_at: '2026-08-05T10:00:00Z',
    },
    {
      name: 'Cloudflare Pages',
      app: { name: 'Cloudflare Workers and Pages' },
      status: 'completed',
      conclusion: 'failure',
      started_at: '2026-08-05T11:00:00Z',
    },
    {
      name: 'Cloudflare Pages',
      app: { name: 'Cloudflare Workers and Pages' },
      status: 'completed',
      conclusion: 'success',
      started_at: '2026-08-05T12:00:00Z',
    },
  ]);

  assert.equal(selected.conclusion, 'success');
  assert.equal(cloudflareCheckState(selected), 'success');
  assert.equal(cloudflareCheckState({ status: 'in_progress' }), 'pending');
  assert.equal(cloudflareCheckState({ status: 'completed', conclusion: 'failure' }), 'failure');
  assert.equal(cloudflareCheckState(null), 'missing');
});
