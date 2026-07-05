import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface VideoCrossLink {
  label: string;
  url: string;
}

export interface VideoSegment {
  name: string;
  startOffset: number;
  endOffset: number;
  description: string;
  url: string;
}

export interface WatchVideoSegment extends VideoSegment {
  watchUrl: string;
  watchPath: string;
  watchHashUrl: string;
  watchHashPath: string;
  anchorId: string;
  label: string;
}

export interface SourceVideoEntry {
  id: string;
  file: string;
  pagePath: string;
  sectionAnchor: string;
  embedAnchor: string;
  title: string;
  shortTitle: string;
  description: string;
  placement: string;
  role: string;
  intent: string;
  keywords: string[];
  clinicalNote: string;
  relatedAnchors: string[];
  crossLinks: VideoCrossLink[];
  width: number;
  height: number;
  durationSeconds: number;
  duration: string;
  byteSize: number;
  sha256: string;
  contentUrl: string;
  thumbnailUrl: string;
  embedUrl: string;
  pageUrl: string;
  dateAdded: string;
  thumbnailByteSize: number;
  thumbnailSha256: string;
  structuredDataStatus: string;
  schemaNodeId: string;
  videoSitemapUrl: string;
  dateModified: string;
  preloadPolicy: string;
  deliveryProfile: string;
  layoutWidth: number;
  layoutHeight: number;
  transcriptStatus: string;
  transcriptKind: string;
  transcriptNotice: string;
  transcript: string;
  segments: VideoSegment[];
  watchPagePath?: string;
  watchPageUrl?: string;
}

interface VideoManifest {
  videos: SourceVideoEntry[];
}

export interface WatchVideoEntry extends SourceVideoEntry {
  slug: string;
  watchPath: string;
  watchUrl: string;
  watchTitle: string;
  sourcePageLabel: string;
  sourceSectionUrl: string;
  sourceSectionPath: string;
  chapterTrackPath: string;
  chapterTrackUrl: string;
  bytesLabel: string;
  segments: WatchVideoSegment[];
  relatedVideos: Array<{
    id: string;
    title: string;
    shortTitle: string;
    watchPath: string;
    watchUrl: string;
    thumbnailUrl: string;
    sourcePageLabel: string;
    sourceSectionUrl: string;
    reason: string;
  }>;
  previousVideo?: {
    title: string;
    watchPath: string;
  };
  nextVideo?: {
    title: string;
    watchPath: string;
  };
}

const siteUrl = 'https://www.ghezelbaash.ir';
const manifestPath = path.resolve(process.cwd(), 'public/data/video-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as VideoManifest;

const pageLabels: Record<string, string> = {
  '/': 'صفحه خانه',
  '/dr-saeed-ghezelbash-aesthetic-clinic/': 'صفحه کلینیک',
  '/botox-kermanshah/': 'صفحه بوتاکس',
  '/filler-kermanshah/': 'صفحه فیلر',
  '/thread-lift-kermanshah/': 'صفحه لیفت نخ',
  '/aesthetic-concerns-kermanshah/': 'صفحه مشکلات زیبایی',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded = value >= 100 ? value.toFixed(0) : value.toFixed(1);
  return `${rounded} ${units[unitIndex]}`;
}

function buildSegmentWatchLinks(watchPath: string, watchUrl: string, segments: VideoSegment[]): WatchVideoSegment[] {
  return segments.map((segment, index) => {
    const anchorId = `segment-${index + 1}`;
    const watchPathWithTime = `${watchPath}?t=${segment.startOffset}`;
    const watchUrlWithTime = `${watchUrl}?t=${segment.startOffset}`;

    return {
      ...segment,
      anchorId,
      label: `پخش از ثانیه ${segment.startOffset}`,
      watchPath: watchPathWithTime,
      watchUrl: watchUrlWithTime,
      watchHashPath: `${watchPathWithTime}#watch-video-player`,
      watchHashUrl: `${watchUrlWithTime}#watch-video-player`,
    };
  });
}

function scoreRelatedVideo(baseVideo: SourceVideoEntry, candidate: SourceVideoEntry): { score: number; reason: string } {
  let score = 0;
  const baseKeywords = new Set(baseVideo.keywords);
  const keywordOverlap = candidate.keywords.filter((keyword) => baseKeywords.has(keyword)).length;

  if (baseVideo.pagePath === candidate.pagePath) {
    score += 100;
  }

  if (keywordOverlap > 0) {
    score += keywordOverlap * 10;
  }

  const hasSharedCrossLink = candidate.crossLinks.some((candidateLink) =>
    baseVideo.crossLinks.some((baseLink) => baseLink.url === candidateLink.url)
  );

  if (hasSharedCrossLink) {
    score += 8;
  }

  if (score >= 100) {
    return { score, reason: 'هم‌خانواده در همان صفحه مادر' };
  }

  if (keywordOverlap > 0) {
    return { score, reason: 'هم‌پوشانی مفهومی و کلیدواژه‌ای' };
  }

  if (hasSharedCrossLink) {
    return { score, reason: 'هم‌مسیر در لینک‌دهی محتوایی' };
  }

  return { score, reason: 'ویدئوی مکمل در کتابخانه ویدئویی' };
}

const baseWatchVideos: WatchVideoEntry[] = manifest.videos.map((video) => {
  const slug = video.watchPagePath?.split('/').filter(Boolean).at(-1) ?? video.id;
  const watchPath = video.watchPagePath ?? `/videos/${slug}/`;
  const watchUrl = video.watchPageUrl ?? `${siteUrl}${watchPath}`;
  const sourceSectionPath = `${video.pagePath}${video.embedAnchor}`;
  const sourceSectionUrl = `${siteUrl}${sourceSectionPath}`;
  const chapterTrackPath = `/videos/chapters/${slug}.vtt`;

  return {
    ...video,
    slug,
    watchPath,
    watchUrl,
    watchTitle: `${video.shortTitle} | صفحه اختصاصی ویدئو`,
    sourcePageLabel: pageLabels[video.pagePath] ?? video.pagePath,
    sourceSectionPath,
    sourceSectionUrl,
    chapterTrackPath,
    chapterTrackUrl: `${siteUrl}${chapterTrackPath}`,
    bytesLabel: formatBytes(video.byteSize),
    segments: buildSegmentWatchLinks(watchPath, watchUrl, video.segments),
    relatedVideos: [],
  };
});

const watchVideos: WatchVideoEntry[] = baseWatchVideos.map((video, index) => {
  const relatedVideos = baseWatchVideos
    .filter((candidate) => candidate.id !== video.id)
    .map((candidate) => {
      const { score, reason } = scoreRelatedVideo(video, candidate);
      return { candidate, score, reason };
    })
    .sort((left, right) => right.score - left.score || left.candidate.title.localeCompare(right.candidate.title, 'fa'))
    .slice(0, 3)
    .map(({ candidate, reason }) => ({
      id: candidate.id,
      title: candidate.title,
      shortTitle: candidate.shortTitle,
      watchPath: candidate.watchPath,
      watchUrl: candidate.watchUrl,
      thumbnailUrl: candidate.thumbnailUrl,
      sourcePageLabel: candidate.sourcePageLabel,
      sourceSectionUrl: candidate.sourceSectionUrl,
      reason,
    }));

  return {
    ...video,
    relatedVideos,
    previousVideo:
      index > 0
        ? {
            title: baseWatchVideos[index - 1].shortTitle,
            watchPath: baseWatchVideos[index - 1].watchPath,
          }
        : undefined,
    nextVideo:
      index < baseWatchVideos.length - 1
        ? {
            title: baseWatchVideos[index + 1].shortTitle,
            watchPath: baseWatchVideos[index + 1].watchPath,
          }
        : undefined,
  };
});

export function getAllWatchVideos(): WatchVideoEntry[] {
  return watchVideos;
}

export function getWatchVideoBySlug(slug: string): WatchVideoEntry | undefined {
  return watchVideos.find((video) => video.slug === slug);
}

export function getWatchVideosForPage(pathname: string): WatchVideoEntry[] {
  return watchVideos.filter((video) => video.pagePath === pathname);
}

export function getWatchPagePathById(id: string): string {
  return watchVideos.find((video) => video.id === id)?.watchPath ?? '/videos/';
}

export function groupWatchVideosByPage(): Array<{
  pagePath: string;
  pageLabel: string;
  videos: WatchVideoEntry[];
}> {
  const groups = new Map<string, WatchVideoEntry[]>();

  for (const video of watchVideos) {
    const existing = groups.get(video.pagePath) ?? [];
    existing.push(video);
    groups.set(video.pagePath, existing);
  }

  return Array.from(groups.entries())
    .map(([pagePath, videos]) => ({
      pagePath,
      pageLabel: pageLabels[pagePath] ?? pagePath,
      videos: videos.sort((left, right) => left.title.localeCompare(right.title, 'fa')),
    }))
    .sort((left, right) => left.pageLabel.localeCompare(right.pageLabel, 'fa'));
}
