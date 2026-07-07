import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'astro/config';
import sitemap, { ChangeFreqEnum } from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import siteSettings from './src/content/site-settings/site.json';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const toIsoDateTime = (date: string) => (/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00+03:30` : date);

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;

type GovernanceEntry = {
  path: string;
  reviewedAt: string;
};

type VideoManifest = {
  dateModified?: string;
  videos?: Array<{
    watchPagePath?: string;
    dateModified?: string;
  }>;
};

const governanceDir = path.resolve(__dirname, 'src/content/page-governance');
const governanceByPath = new Map<string, GovernanceEntry>();

for (const fileName of fs.readdirSync(governanceDir)) {
  if (!fileName.endsWith('.json')) continue;
  const entry = readJson<GovernanceEntry>(path.join(governanceDir, fileName));
  governanceByPath.set(entry.path, entry);
}

const videoManifest = readJson<VideoManifest>(path.resolve(__dirname, 'src/content/aeo-data/video-manifest.json'));
const videoDateByPath = new Map<string, string>();

if (videoManifest.dateModified) {
  videoDateByPath.set('/videos/', videoManifest.dateModified);
}

for (const video of videoManifest.videos ?? []) {
  if (video.watchPagePath)
    videoDateByPath.set(video.watchPagePath, video.dateModified ?? videoManifest.dateModified ?? '');
}

const normalizePathname = (url: string): string => {
  const pathname = new URL(url).pathname;
  return pathname.endsWith('/') ? pathname : `${pathname}/`;
};

const getSitemapDates = (url: string): string | undefined => {
  const pathname = normalizePathname(url);
  const date = governanceByPath.get(pathname)?.reviewedAt ?? videoDateByPath.get(pathname);
  return date ? toIsoDateTime(date) : undefined;
};

const getSitemapPriority = (url: string): number => {
  const pathname = normalizePathname(url);

  if (pathname === '/') return 1;
  if (governanceByPath.has(pathname)) return 0.9;
  if (pathname === '/videos/') return 0.7;
  if (pathname.startsWith('/videos/')) return 0.55;

  return 0.5;
};

const getSitemapChangefreq = (url: string): ChangeFreqEnum => {
  const pathname = normalizePathname(url);

  if (pathname === '/') return ChangeFreqEnum.WEEKLY;
  if (governanceByPath.has(pathname) || pathname === '/videos/') return ChangeFreqEnum.MONTHLY;

  return ChangeFreqEnum.YEARLY;
};

export default defineConfig({
  site: siteSettings.site,
  base: siteSettings.base,
  trailingSlash: siteSettings.trailingSlash ? 'always' : 'never',
  output: 'static',

  integrations: [
    sitemap({
      filter: (page) => !page.endsWith('/search/'),
      serialize: (item) => {
        const lastmod = getSitemapDates(item.url);

        return {
          ...item,
          ...(lastmod ? { lastmod } : {}),
          changefreq: getSitemapChangefreq(item.url),
          priority: getSitemapPriority(item.url),
        };
      },
    }),
  ],

  image: {
    domains: ['cdn.pixabay.com'],
  },

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '~': path.resolve(__dirname, './src'),
      },
    },
  },
});
