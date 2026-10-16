import { readBool, readEnv } from '../lib/env';

/**
 * Site-wide configuration. Everything that is owner-specific (legal entity, contact
 * details, analytics IDs) comes from environment variables so nothing personal or
 * secret is committed. See `.env.example` for the full list.
 *
 * All values here are read at BUILD time and end up in public HTML — never put secrets here.
 */
function resolveSiteUrl(): string {
  const raw = readEnv('SITE_URL') ?? readEnv('URL') ?? 'https://firsatbol.com';
  return raw.replace(/\/+$/, '');
}

export const SITE = {
  name: 'FırsatBol',
  legalBrand: 'FırsatBol',
  tagline: 'Fırsat çok, kaçırmak yok!',
  description:
    'FırsatBol; yetkili iş ortaklarından derlenen indirim, kampanya, kupon ve etkinlik fırsatlarını tek yerde toplayan bağımsız bir fırsat keşif platformudur.',
  url: resolveSiteUrl(),
  locale: 'tr_TR',
  lang: 'tr',
  currency: 'TRY',
  timeZone: 'Europe/Istanbul',
  themeColor: '#0f1b2d',
} as const;

/** Data-controller / publisher details. Missing values are shown as "pending" notices. */
export const OWNER = {
  controllerName: readEnv('SITE_CONTROLLER_NAME'),
  controllerAddress: readEnv('SITE_CONTROLLER_ADDRESS'),
  contactEmail: readEnv('SITE_CONTACT_EMAIL'),
  kepAddress: readEnv('SITE_KEP_ADDRESS'),
  mersisNo: readEnv('SITE_MERSIS_NO'),
} as const;

export const ANALYTICS = {
  plausibleDomain: readEnv('PUBLIC_PLAUSIBLE_DOMAIN'),
  plausibleSrc: readEnv('PUBLIC_PLAUSIBLE_SRC') ?? 'https://plausible.io/js/script.js',
  umamiWebsiteId: readEnv('PUBLIC_UMAMI_WEBSITE_ID'),
  umamiSrc: readEnv('PUBLIC_UMAMI_SRC') ?? 'https://cloud.umami.is/script.js',
  /** GA4 is loaded only after explicit consent (cookie banner). */
  ga4Id: readEnv('PUBLIC_GA4_ID'),
  /** Anonymous first-party click/search/view events → /api/event (Netlify Function). */
  firstPartyEvents: readBool('PUBLIC_FIRST_PARTY_EVENTS', true),
} as const;

export const VERIFICATION = {
  google: readEnv('PUBLIC_GOOGLE_SITE_VERIFICATION'),
  bing: readEnv('PUBLIC_BING_SITE_VERIFICATION'),
  yandex: readEnv('PUBLIC_YANDEX_VERIFICATION'),
} as const;

export const FEATURES = {
  /** Shows the newsletter form. The function also requires BREVO_API_KEY + BREVO_LIST_ID. */
  newsletter: readBool('PUBLIC_NEWSLETTER_ENABLED', false),
  /** Reserved ad slots render nothing until an ad network has approved the site. */
  ads: readBool('PUBLIC_ADS_ENABLED', false),
} as const;

export const SOCIAL: readonly { name: string; url: string }[] = [
  { name: 'Instagram', url: readEnv('PUBLIC_SOCIAL_INSTAGRAM') ?? '' },
  { name: 'X', url: readEnv('PUBLIC_SOCIAL_X') ?? '' },
  { name: 'Facebook', url: readEnv('PUBLIC_SOCIAL_FACEBOOK') ?? '' },
  { name: 'YouTube', url: readEnv('PUBLIC_SOCIAL_YOUTUBE') ?? '' },
].filter((entry) => entry.url.startsWith('https://'));

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE.url}${path.startsWith('/') ? path : `/${path}`}`;
}
