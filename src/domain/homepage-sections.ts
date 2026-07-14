export type HomepageSectionKind = 'component' | 'article';
export type HomepageTocGroup = 'local' | 'treatment' | 'clinical' | 'safety' | 'authority';
export type HomepageAbout = 'person' | 'clinic' | 'services' | 'medical-content' | 'data';
export type HomepageGeographyScope = 'Kermanshah' | 'Iran' | 'Global';

export type HomepageSectionDefinition = {
  order: number;
  id: string;
  title: string;
  kind: HomepageSectionKind;
  tocGroup: HomepageTocGroup;
  intentClass: readonly string[];
  geographyScope: readonly HomepageGeographyScope[];
  about: HomepageAbout;
  includeInToc: boolean;
  includeInGraph: boolean;
};

export type HomepageTocDefinition = {
  id: string;
  headingId: string;
  title: string;
  groups: readonly { id: HomepageTocGroup; title: string }[];
};

export {
  homepageEntityIds,
  homepageToc,
  homepageSections,
  homepageTocGroups,
  homepageTocSections,
  articleHomepageSections,
  homepageSectionById,
  homepageMainSectionIds,
} from './homepage-sections.mjs';
