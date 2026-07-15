import { homepageEntityIds, homepageSections, homepageToc } from './homepage-sections.mjs';
import { videos } from './media.mjs';

export const homepageGraphSyncContract = Object.freeze({
  version: 1,
  headline: 'دکتر سعید قزلباش؛ پزشک زیبایی، پوست و مو در کرمانشاه',
  entities: homepageEntityIds,
  webpage: Object.freeze({
    id: homepageEntityIds.webpage,
    websiteId: homepageEntityIds.website,
    articleId: 'article',
    primaryImageId: 'image-doctor-portrait',
  }),
  toc: Object.freeze({
    id: homepageToc.id,
    title: homepageToc.title,
    groups: homepageToc.groups,
    sectionIds: Object.freeze(homepageSections.map((section) => section.id)),
  }),
  sections: Object.freeze(homepageSections.map((section) => Object.freeze({
    id: section.id,
    title: section.title,
    about: section.about,
    order: section.order,
  }))),
  videos: Object.freeze(videos.map((video) => Object.freeze({
    id: video.id,
    graphId: `video-${video.id}`,
    title: video.title,
    description: video.description,
    file: video.file,
    thumbnail: video.thumbnail,
    duration: video.duration,
    width: video.width,
    height: video.height,
    sectionId: video.sectionId,
    subsectionId: video.subsectionId ?? null,
    destinationId: video.subsectionId ?? video.sectionId,
  }))),
});

export const homepageSharedGraphFragments = Object.freeze([
  homepageEntityIds.person,
  homepageEntityIds.clinic,
  homepageEntityIds.website,
  homepageEntityIds.webpage,
  'article',
  homepageToc.id,
  ...homepageSections.map((section) => section.id),
  ...new Set(videos.map((video) => video.subsectionId).filter(Boolean)),
  ...videos.map((video) => `video-${video.id}`),
]);
