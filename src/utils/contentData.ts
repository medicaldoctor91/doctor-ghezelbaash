import type { ImageMetadata } from 'astro';
import type { CallToAction } from '~/types';
import { getCollection, getEntry } from 'astro:content';
import { getPermalink } from '~/utils/permalinks';

import doctorPortrait from '~/assets/custom/doctor-portrait.jpg';
import doctorExam from '~/assets/custom/doctor-exam.jpg';
import doctorWithStaff from '~/assets/custom/doctor-with-staff.jpg';
import clinicInterior from '~/assets/custom/clinic-interior.jpg';
import clinicInterior2 from '~/assets/custom/clinic-interior-2.jpg';
import clinicEnvironment3 from '~/assets/custom/clinic-environment-3.jpg';
import clinicCorridor from '~/assets/custom/clinic-corridor.jpg';
import clinicWaitingRoom from '~/assets/custom/clinic-waiting-room.jpg';

type ImageKey =
  | 'doctorPortrait'
  | 'doctorExam'
  | 'doctorWithStaff'
  | 'clinicInterior'
  | 'clinicInterior2'
  | 'clinicEnvironment3'
  | 'clinicCorridor'
  | 'clinicWaitingRoom';

const imageRegistry: Record<ImageKey, ImageMetadata> = {
  doctorPortrait,
  doctorExam,
  doctorWithStaff,
  clinicInterior,
  clinicInterior2,
  clinicEnvironment3,
  clinicCorridor,
  clinicWaitingRoom,
};

export type ContactData = NonNullable<Awaited<ReturnType<typeof getContactData>>>;
export type GoogleMapsRatingData = {
  source: string;
  googleMapsUrl: string;
  googleMapsSearchUrl: string;
  placeId: string;
  cid: string;
  ratingValue: number;
  ratingCount: number;
  bestRating: number;
  worstRating: number;
  displayText: string;
  lastSynced: string;
  syncMode: string;
  enabledInSchema: boolean;
};

export type PageMediaEntry = {
  path: string;
  title: string;
  heroImage: ImageMetadata;
  heroAlt: string;
  supportImage: ImageMetadata;
  supportAlt: string;
  galleryImage: ImageMetadata;
  galleryAlt: string;
  imageCaption: string;
  supportCaption: string;
  galleryCaption: string;
  ogImagePath: string;
  videoLabel?: string;
};

type ContentAction = {
  variant?: string;
  text: string;
  href?: string;
  hrefSource?: keyof ContactData;
  target?: string;
};

type ContentLink = {
  text?: string;
  textSource?: keyof ContactData;
  href?: string;
  hrefSource?: keyof ContactData;
  target?: string;
};

const requireImage = (key: string): ImageMetadata => {
  const image = imageRegistry[key as ImageKey];
  if (!image) throw new Error(`Unknown page media image key: ${key}`);
  return image;
};

const resolveHref = (item: Pick<ContentAction, 'href' | 'hrefSource'>, contactData: ContactData) => {
  if (item.href) return getPermalink(item.href);
  if (!item.hrefSource) return '#';
  const value = String(contactData[item.hrefSource] ?? '');
  return item.hrefSource === 'phone' ? `tel:${value}` : value;
};

const resolveText = (item: Pick<ContentLink, 'text' | 'textSource'>, contactData: ContactData) => {
  if (item.text) return item.text;
  if (!item.textSource) return '';
  return String(contactData[item.textSource] ?? '');
};

export const resolveContentActions = (actions: ContentAction[], contactData: ContactData): CallToAction[] =>
  actions.map((action) => ({
    variant: action.variant as CallToAction['variant'],
    text: action.text,
    href: resolveHref(action, contactData),
    target: action.target,
  }));

const resolveContentLinks = (links: ContentLink[], contactData: ContactData) =>
  links.map((link) => ({
    ...link,
    text: resolveText(link, contactData),
    href: resolveHref(link, contactData),
  }));

export const getContactData = async () => {
  const entry = await getEntry('siteData', 'contact');
  if (!entry) throw new Error('Missing src/content/site/contact.json content collection entry.');
  return entry.data;
};

export const getGoogleMapsRating = async (): Promise<GoogleMapsRatingData> => {
  const entry = await getEntry('aeoData', 'google-maps-rating');
  if (!entry) throw new Error('Missing src/content/aeo-data/google-maps-rating.json content collection entry.');
  return entry.data as GoogleMapsRatingData;
};

export const getPageMedia = async (pathname: string): Promise<PageMediaEntry> => {
  const entries = await getCollection('pageMedia');
  const selected =
    entries.find((entry) => entry.data.path === pathname) ?? entries.find((entry) => entry.data.path === '/');

  if (!selected) throw new Error('Missing page media content collection entries.');

  return {
    path: selected.data.path,
    title: selected.data.title,
    heroImage: requireImage(selected.data.heroImageKey),
    heroAlt: selected.data.heroAlt,
    supportImage: requireImage(selected.data.supportImageKey),
    supportAlt: selected.data.supportAlt,
    galleryImage: requireImage(selected.data.galleryImageKey),
    galleryAlt: selected.data.galleryAlt,
    imageCaption: selected.data.imageCaption,
    supportCaption: selected.data.supportCaption,
    galleryCaption: selected.data.galleryCaption,
    ogImagePath: selected.data.ogImagePath,
    videoLabel: selected.data.videoLabel,
  };
};

export const getPageUiData = async (pathname: string) => {
  const entries = await getCollection('pageUi');
  const selected = entries.find((entry) => entry.data.path === pathname);
  if (!selected) throw new Error(`Missing page UI content collection entry for ${pathname}.`);
  return selected.data;
};

export const getNavigationData = async () => {
  const contactData = await getContactData();
  const entry = await getEntry('navigationData', 'main');
  if (!entry) throw new Error('Missing src/content/navigation/main.json content collection entry.');

  const headerData = {
    links: entry.data.headerData.links.map((link) => ({
      ...link,
      href: link.href ? getPermalink(link.href) : undefined,
      links: link.links?.map((child) => ({ ...child, href: getPermalink(child.href) })),
    })),
    actions: resolveContentActions(entry.data.headerData.actions, contactData),
  };

  const footerData = {
    links: entry.data.footerData.links.map((group) => ({
      ...group,
      links: resolveContentLinks(group.links, contactData),
    })),
    secondaryLinks: resolveContentLinks(entry.data.footerData.secondaryLinks, contactData),
    socialLinks: entry.data.footerData.socialLinks.map((link) => ({
      ...link,
      href: resolveHref(link, contactData),
    })),
    footNote: entry.data.footerData.footNote,
  };

  return { headerData, footerData };
};
