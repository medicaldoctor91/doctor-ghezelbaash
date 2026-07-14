export type HomepageSectionKind = 'component' | 'article';
export type HomepageTocGroup = 'local' | 'treatment' | 'clinical' | 'safety' | 'authority';
export type HomepageAbout = 'person' | 'clinic' | 'services' | 'medical-content' | 'data';

export type HomepageSectionDefinition = {
  id: string;
  title: string;
  kind: HomepageSectionKind;
  tocGroup: HomepageTocGroup;
  intentClass: string[];
  geographyScope: string[];
  about: HomepageAbout;
  includeInToc: boolean;
  includeInGraph: boolean;
};

export {
  homepageEntityIds,
  homepageSections,
  homepageTocGroups,
  articleHomepageSections,
  homepageSectionById,
  homepageMainSectionIds,
} from './homepage-sections.mjs';
