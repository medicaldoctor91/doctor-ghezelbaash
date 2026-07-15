import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const reportDirectory = process.argv[2] ?? 'quality-reports';
const enforce = process.argv.includes('--enforce');
const thresholds = Object.freeze({
  mobile: { performance: 95, accessibility: 100, 'best-practices': 100, seo: 100, lcp: 2500, cls: 0.1, tbt: 200 },
  desktop: { performance: 98, accessibility: 100, 'best-practices': 100, seo: 100, lcp: 2500, cls: 0.1, tbt: 200 },
});

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const files = readdirSync(reportDirectory).filter((file) => /^lighthouse-(mobile|desktop)-\d+\.json$/u.test(file));
const failures = [];
const summary = { generatedAt: new Date().toISOString(), enforce, profiles: {} };

for (const profile of ['mobile', 'desktop']) {
  const profileFiles = files.filter((file) => file.startsWith(`lighthouse-${profile}-`)).sort();
  if (profileFiles.length !== 3) failures.push(`${profile}: expected 3 Lighthouse reports, found ${profileFiles.length}`);
  const runs = profileFiles.map((file) => {
    const report = JSON.parse(readFileSync(join(reportDirectory, file), 'utf8'));
    return {
      file,
      performance: Math.round((report.categories.performance?.score ?? 0) * 100),
      accessibility: Math.round((report.categories.accessibility?.score ?? 0) * 100),
      'best-practices': Math.round((report.categories['best-practices']?.score ?? 0) * 100),
      seo: Math.round((report.categories.seo?.score ?? 0) * 100),
      lcp: report.audits['largest-contentful-paint']?.numericValue ?? Number.POSITIVE_INFINITY,
      cls: report.audits['cumulative-layout-shift']?.numericValue ?? Number.POSITIVE_INFINITY,
      tbt: report.audits['total-blocking-time']?.numericValue ?? Number.POSITIVE_INFINITY,
      fcp: report.audits['first-contentful-paint']?.numericValue ?? Number.POSITIVE_INFINITY,
      speedIndex: report.audits['speed-index']?.numericValue ?? Number.POSITIVE_INFINITY,
      domElements: report.audits['dom-size']?.details?.items?.[0]?.value ?? null,
      totalByteWeight: report.audits['total-byte-weight']?.numericValue ?? null,
      mainThreadWork: report.audits['mainthread-work-breakdown']?.numericValue ?? null,
    };
  });
  const metrics = {};
  for (const key of ['performance', 'accessibility', 'best-practices', 'seo', 'lcp', 'cls', 'tbt', 'fcp', 'speedIndex']) {
    metrics[key] = runs.length ? median(runs.map((run) => run[key])) : null;
  }
  summary.profiles[profile] = { runs, median: metrics, thresholds: thresholds[profile] };
  if (enforce && runs.length === 3) {
    for (const category of ['performance', 'accessibility', 'best-practices', 'seo']) {
      if (metrics[category] < thresholds[profile][category]) failures.push(`${profile}: ${category} median ${metrics[category]} < ${thresholds[profile][category]}`);
    }
    for (const metric of ['lcp', 'cls', 'tbt']) {
      if (metrics[metric] > thresholds[profile][metric]) failures.push(`${profile}: ${metric} median ${metrics[metric]} > ${thresholds[profile][metric]}`);
    }
  }
}

summary.status = failures.length ? 'fail' : 'pass';
summary.failures = failures;
writeFileSync(join(reportDirectory, 'lighthouse-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (failures.length) process.exit(1);
