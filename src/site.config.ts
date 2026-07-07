import siteSettings from './content/site-settings/site.json';

export const SITE: {
  name: string;
  site: string;
  base: string;
  trailingSlash: boolean;
  googleSiteVerificationId: string;
} = {
  name: siteSettings.name,
  site: siteSettings.site,
  base: siteSettings.base,
  trailingSlash: siteSettings.trailingSlash,
  googleSiteVerificationId: siteSettings.googleSiteVerificationId,
};

export const I18N = {
  language: siteSettings.language,
  textDirection: siteSettings.textDirection,
} as const;

export const METADATA = siteSettings.metadata;

export const UI = siteSettings.ui;

export const ANALYTICS = siteSettings.analytics as {
  vendors: {
    googleAnalytics: { id?: string | null };
  };
};
