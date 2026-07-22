import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import { launch } from 'chrome-launcher';
import { chromium } from '@playwright/test';

const positionalUrl = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
const runsArgument = process.argv.find((argument) => argument.startsWith('--runs='));
const url = new URL(positionalUrl ?? 'https://www.ghezelbaash.ir/').href;
const runs = Number(runsArgument?.split('=')[1] ?? 3);

if (!Number.isInteger(runs) || runs < 1) {
  throw new Error('--runs must be a positive integer.');
}

const OUTPUT_DIRECTORY = path.join(process.cwd(), 'lighthouse-results');
await mkdir(OUTPUT_DIRECTORY, { recursive: true });

const profiles = [
  ['mobile', undefined],
  ['desktop', desktopConfig],
];
const results = new Map();

for (const [profile, config] of profiles) {
  const profileResults = [];
  for (let run = 1; run <= runs; run += 1) {
    const chrome = await launch({
      chromePath: chromium.executablePath(),
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
    });
    try {
      const result = await lighthouse(
        url,
        {
          port: chrome.port,
          output: 'json',
          logLevel: 'error',
          throttlingMethod: 'devtools',
          onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        },
        config,
      );
      if (!result) throw new Error(`Lighthouse returned no result for ${profile} run ${run}.`);
      await writeFile(
        path.join(OUTPUT_DIRECTORY, `${profile}-${run}.json`),
        result.report,
      );
      const { lhr } = result;
      profileResults.push({
        performance: lhr.categories.performance.score,
        accessibility: lhr.categories.accessibility.score,
        bestPractices: lhr.categories['best-practices'].score,
        seo: lhr.categories.seo.score,
        lcp: lhr.audits['largest-contentful-paint'].numericValue,
        cls: lhr.audits['cumulative-layout-shift'].numericValue,
        tbt: lhr.audits['total-blocking-time'].numericValue,
      });
      console.log(`${profile} run ${run}/${runs} completed.`);
    } finally {
      chrome.kill();
    }
  }
  results.set(profile, profileResults);
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
    : sorted[midpoint];
};

const thresholds = {
  performance: 0.9,
  accessibility: 1,
  bestPractices: 0.95,
  seo: 1,
  lcp: 2500,
  cls: 0.1,
  tbt: 200,
};
const failures = [];

for (const [profile, profileResults] of results) {
  const summary = Object.fromEntries(
    Object.keys(profileResults[0]).map((key) => [
      key,
      median(profileResults.map((result) => result[key])),
    ]),
  );
  console.log(
    `${profile} median — performance ${Math.round(summary.performance * 100)}, accessibility ${Math.round(summary.accessibility * 100)}, best practices ${Math.round(summary.bestPractices * 100)}, SEO ${Math.round(summary.seo * 100)}, LCP ${Math.round(summary.lcp)}ms, CLS ${summary.cls.toFixed(3)}, TBT ${Math.round(summary.tbt)}ms.`,
  );

  for (const category of ['performance', 'accessibility', 'bestPractices', 'seo']) {
    if (summary[category] < thresholds[category]) {
      failures.push(`${profile} ${category} ${summary[category]} < ${thresholds[category]}`);
    }
  }
  for (const metric of ['lcp', 'cls', 'tbt']) {
    if (summary[metric] > thresholds[metric]) {
      failures.push(`${profile} ${metric} ${summary[metric]} > ${thresholds[metric]}`);
    }
  }
}

console.log(
  'Lighthouse is a lab audit. It does not establish 75th-percentile Core Web Vitals or field INP; verify those on the deployed URL with PageSpeed Insights/CrUX when field data exists.',
);

if (failures.length > 0) {
  console.error('Lighthouse release gate failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
}
