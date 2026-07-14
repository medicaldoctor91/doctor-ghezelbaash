import {
  homepageEntityIds,
  homepageToc,
  homepageSections,
  homepageTocGroups,
  homepageTocSections,
  articleHomepageSections,
  homepageSectionById,
  homepageMainSectionIds,
} from './homepage-sections.mjs';
import {
  homepageArticleGroups,
  homepageArticleGroupById,
  homepageArticleSubsections,
  homepageArticleSubsectionById,
  homepageSubsectionAnchorRegistry,
} from './homepage-article-registry.mjs';
import { videos } from './media.mjs';

export const homepageVideoPlacements = Object.freeze(videos.map((video) => Object.freeze({
  id: video.id,
  sectionId: video.sectionId,
  subsectionId: video.subsectionId ?? null,
})));

export const homepageContentRegistry = Object.freeze({
  version: 2,
  entities: homepageEntityIds,
  toc: homepageToc,
  sections: homepageSections,
  sectionById: homepageSectionById,
  mainSectionIds: homepageMainSectionIds,
  articleSections: articleHomepageSections,
  articleGroups: homepageArticleGroups,
  articleGroupById: homepageArticleGroupById,
  selectedH3: homepageArticleSubsections,
  selectedH3ById: homepageArticleSubsectionById,
  subsectionAnchorRegistry: homepageSubsectionAnchorRegistry,
  videoPlacements: homepageVideoPlacements,
});

export {
  homepageEntityIds,
  homepageToc,
  homepageSections,
  homepageTocGroups,
  homepageTocSections,
  articleHomepageSections,
  homepageSectionById,
  homepageMainSectionIds,
  homepageArticleGroups,
  homepageArticleGroupById,
  homepageArticleSubsections,
  homepageArticleSubsectionById,
  homepageSubsectionAnchorRegistry,
};
