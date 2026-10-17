import { loadGa4, readConsent, track, writeConsent } from './analytics';

window.fbTrack = track;

// --- mobile menu ----------------------------------------------------------
const toggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
const panel = document.querySelector<HTMLElement>('[data-menu-panel]');
toggle?.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') === 'true';
  toggle.setAttribute('aria-expanded', String(!open));
  toggle.querySelector('.sr-only')!.textContent = open ? 'Menüyü aç' : 'Menüyü kapat';
  panel?.classList.toggle('hidden', open);
});

// --- dropdowns (<details>) close on outside click / Escape ------------------
const dropdowns = document.querySelectorAll<HTMLDetailsElement>('details[data-dropdown]');
document.addEventListener('click', (event) => {
  dropdowns.forEach((details) => {
    if (details.open && !details.contains(event.target as Node)) details.open = false;
  });
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  dropdowns.forEach((details) => {
    if (details.open) {
      details.open = false;
      details.querySelector('summary')?.focus();
    }
  });
});

// --- consent (only rendered when GA4 is configured) -------------------------
const ga4 = window.__fbAnalytics?.ga4;
const banner = document.querySelector<HTMLElement>('[data-consent-banner]');
if (ga4 && banner) {
  const consent = readConsent();
  if (consent === 'granted') loadGa4(ga4);
  if (consent === null) banner.classList.remove('hidden');
  banner.querySelectorAll<HTMLButtonElement>('[data-consent]').forEach((button) =>
    button.addEventListener('click', () => {
      const value = button.dataset.consent === 'granted' ? 'granted' : 'denied';
      writeConsent(value);
      banner.classList.add('hidden');
      if (value === 'granted') loadGa4(ga4);
      else if (readConsent() === 'denied') {
        // revoke: GA cookies set earlier are removed on next load since the script is not loaded
        document.cookie.split(';').forEach((cookie) => {
          const name = cookie.split('=')[0]?.trim();
          if (name?.startsWith('_ga')) document.cookie = `${name}=; Max-Age=0; path=/; domain=.${location.hostname}`;
        });
      }
    }),
  );
  document.querySelector('[data-consent-open]')?.addEventListener('click', () => banner.classList.remove('hidden'));
}

// --- outbound deal clicks ---------------------------------------------------
document.addEventListener('click', (event) => {
  const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[data-deal-link]');
  if (!link) return;
  const { dealId, provider, category, city, placement } = link.dataset;
  track('deal_click', { deal: dealId, provider, category, city, placement });
});

// --- WhatsApp buttons on deal cards -------------------------------------------
// warm the price card on first touch so it is ready when WhatsApp fetches the link preview
const warmed = new Set<string>();
const warmCard = (event: Event) => {
  const card = (event.target as Element | null)?.closest?.<HTMLElement>('[data-card-share]')?.dataset.shareCard;
  if (!card || warmed.has(card)) return;
  warmed.add(card);
  new Image().src = card;
};
['pointerover', 'touchstart', 'focusin'].forEach((type) => document.addEventListener(type, warmCard, { passive: true }));
document.addEventListener('click', (event) => {
  const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[data-card-share]');
  if (!link) return;
  warmCard(event);
  track('deal_share', { deal: link.dataset.dealId, placement: 'card-whatsapp' });
});

// --- deal detail view ---------------------------------------------------------
const view = document.querySelector<HTMLElement>('[data-deal-view]');
if (view) {
  const { dealId, provider, category } = view.dataset;
  track('deal_view', { deal: dealId, provider, category });
}

// --- client-side expiry: data refreshes periodically, the clock moves continuously --
const now = Date.now();
document.querySelectorAll<HTMLElement>('[data-valid-until]').forEach((element) => {
  const until = Date.parse(element.dataset.validUntil ?? '');
  if (Number.isFinite(until) && until < now) {
    element.dataset.expired = 'true';
    element.querySelector('[data-expired-note]')?.classList.remove('hidden');
  }
});
