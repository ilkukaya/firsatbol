/**
 * Event fan-out. Events are only sent to tools the owner enabled; GA4 only after consent.
 * First-party events go to /api/event and contain no personal data.
 */
export type TrackEvent = 'deal_click' | 'deal_view' | 'deal_share' | 'search' | 'newsletter_signup' | 'contact_submit';
export type TrackProps = Record<string, string | number | null | undefined>;

declare global {
  interface Window {
    __fbAnalytics?: { ga4: string | null; firstParty: boolean };
    plausible?: (event: string, options?: { props?: Record<string, string | number> }) => void;
    umami?: { track: (event: string, data?: Record<string, string | number>) => void };
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
    fbTrack?: (event: TrackEvent, props?: TrackProps) => void;
  }
}

const CONSENT_KEY = 'firsatbol_consent';

function clean(props: TrackProps): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(props)) if (value !== null && value !== undefined && value !== '') out[key] = value;
  return out;
}

export function readConsent(): 'granted' | 'denied' | null {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

export function writeConsent(value: 'granted' | 'denied'): void {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    /* storage unavailable — consent applies to this page view only */
  }
}

let gaLoaded = false;
export function loadGa4(id: string): void {
  if (gaLoaded) return;
  gaLoaded = true;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', id, { anonymize_ip: true });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
}

export function track(event: TrackEvent, props: TrackProps = {}): void {
  const data = clean(props);
  try {
    window.plausible?.(event, { props: data });
    window.umami?.track(event, data);
    if (gaLoaded) window.gtag?.('event', event, data);
  } catch {
    /* analytics must never break navigation */
  }
  if (window.__fbAnalytics?.firstParty && navigator.sendBeacon) {
    const body = JSON.stringify({ type: event, path: location.pathname, ...data });
    try {
      navigator.sendBeacon('/api/event', new Blob([body], { type: 'application/json' }));
    } catch {
      /* ignore */
    }
  }
}
