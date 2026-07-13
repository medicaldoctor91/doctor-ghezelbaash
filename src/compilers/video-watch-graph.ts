import { site } from '~/domain/entities';
// @ts-expect-error Canonical ESM video metadata.
import { videoPageDetails } from '~/domain/video-pages.mjs';
import {
  videoClipId,
  videoEntityId,
  videoMomentUrl,
  videoWatchUrl,
  videoWebPageId,
} from '~/domain/url-architecture.mjs';
import { readMediaChapters } from '~/lib/media';

type Video = {
  id: string;
  file: string;
  title: string;
  description: string;
  thumbnail: string;
  width: number;
  height: number;
  duration: string;
  durationSeconds: number;
  tags: string[];
  chapterTrack?: string;
  uploadDate?: string;
};

const ref = (id: string) => ({ '@id': id });
const absolute = (path: string) => new URL(path.replace(/^\//u, ''), site.url).href;

export function videoPublishedAt(video: Video) {
  // First verified publication timestamp of the current public video corpus/watch pages.
  return video.uploadDate ?? site.dateModified;
}

export function buildVideoWatchGraph(video: Video) {
  const watchUrl = videoWatchUrl(site.url, video.id);
  const pageId = videoWebPageId(site.url, video.id);
  const videoId = videoEntityId(site.url, video.id);
  const publishedAt = videoPublishedAt(video);
  const details = videoPageDetails[video.id];
  const eligibleChapters = video.durationSeconds >= 30
    ? readMediaChapters(video.chapterTrack)
    : [];

  const clipNodes = eligibleChapters.map((chapter) => ({
    '@type': 'Clip',
    '@id': videoClipId(site.url, video.id, chapter.index),
    name: `${video.title}: ${chapter.name}`,
    startOffset: chapter.startOffset,
    endOffset: chapter.endOffset,
    url: videoMomentUrl(site.url, video.id, chapter.startOffset),
    isPartOf: ref(videoId),
  }));

  const videoNode = {
    '@type': 'VideoObject',
    '@id': videoId,
    name: video.title,
    description: video.description,
    ...(details?.summary ? { abstract: details.summary } : {}),
    url: watchUrl,
    thumbnailUrl: [absolute(video.thumbnail)],
    uploadDate: publishedAt,
    duration: video.duration,
    contentUrl: absolute(`/videos/${video.file}`),
    encodingFormat: 'video/mp4',
    width: video.width,
    height: video.height,
    inLanguage: site.language,
    keywords: video.tags,
    isFamilyFriendly: true,
    creator: ref(`${site.url}#person`),
    publisher: ref(`${site.url}#clinic`),
    about: [ref(`${site.url}#person`), ref(`${site.url}#clinic`)],
    mainEntityOfPage: ref(pageId),
    ...(clipNodes.length ? { hasPart: clipNodes.map((clip) => ref(clip['@id'])) } : {}),
    potentialAction: {
      '@type': 'SeekToAction',
      target: `${watchUrl}?t={seek_to_second_number}`,
      'startOffset-input': 'required name=seek_to_second_number',
    },
    ...(details?.sources?.length ? { citation: details.sources.map((source: { url: string }) => source.url) } : {}),
  };

  const pageNode = {
    '@type': 'WebPage',
    '@id': pageId,
    url: watchUrl,
    name: video.title,
    headline: video.title,
    description: video.description,
    inLanguage: site.language,
    isPartOf: ref(`${site.url}#website`),
    mainEntity: ref(videoId),
    primaryImageOfPage: {
      '@type': 'ImageObject',
      url: absolute(video.thumbnail),
      contentUrl: absolute(video.thumbnail),
    },
    about: [ref(`${site.url}#person`), ref(`${site.url}#clinic`)],
    author: ref(`${site.url}#person`),
    reviewedBy: ref(`${site.url}#person`),
    publisher: ref(`${site.url}#clinic`),
    dateCreated: publishedAt,
    datePublished: publishedAt,
    dateModified: site.dateModified,
    breadcrumb: ref(`${watchUrl}#breadcrumb`),
  };

  const breadcrumb = {
    '@type': 'BreadcrumbList',
    '@id': `${watchUrl}#breadcrumb`,
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: site.name,
        item: site.url,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: video.title,
        item: watchUrl,
      },
    ],
  };

  const graph = [
    {
      '@type': 'WebSite',
      '@id': `${site.url}#website`,
      url: site.url,
      name: site.name,
      creator: ref(`${site.url}#person`),
      publisher: ref(`${site.url}#clinic`),
    },
    {
      '@type': 'Person',
      '@id': `${site.url}#person`,
      name: site.legalName,
      alternateName: site.name,
      url: site.url,
      image: ref(`${site.url}#image-doctor-portrait`),
      worksFor: ref(`${site.url}#clinic`),
      workLocation: ref(`${site.url}#clinic`),
      affiliation: ref(`${site.url}#clinic`),
    },
    {
      '@type': ['MedicalClinic', 'LocalBusiness'],
      '@id': `${site.url}#clinic`,
      name: site.clinicName,
      url: site.url,
      telephone: site.phone,
      employee: ref(`${site.url}#person`),
    },
    pageNode,
    videoNode,
    breadcrumb,
    ...clipNodes,
  ];

  return { '@context': 'https://schema.org', '@graph': graph };
}
