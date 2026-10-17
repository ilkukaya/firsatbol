import type { DealIndexEntry } from '../lib/deals/schema';
import { formatDate, formatPrice, formatSession } from '../lib/format';
import { shareMessage, shareUrl } from '../lib/share';

/**
 * Client-rendered deal cards (live filters and sorting). Mirrors src/components/DealCard.astro —
 * keep the markup in sync. Icons come from <template data-icon> elements (CardTemplates.astro).
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

function icon(name: string): string {
  return document.querySelector<HTMLTemplateElement>(`template[data-icon="${name}"]`)?.innerHTML ?? '';
}

// shared links use the canonical host (as the server-rendered cards do)
const siteUrl = (() => {
  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  return canonical ? new URL(canonical).origin : location.origin;
})();

function whatsappHref(entry: DealIndexEntry): string {
  const message = shareMessage(
    {
      title: entry.t,
      discountPercent: entry.dp,
      price: entry.p,
      originalPrice: entry.op,
      priceFrom: entry.pf === 1,
      currency: entry.cur,
      district: entry.d,
      city: entry.cn,
      sessions: entry.ns ? [{ date: entry.ns }] : [],
    } as Parameters<typeof shareMessage>[0],
    shareUrl(siteUrl, entry.s, 'whatsapp'),
  );
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function renderCard(entry: DealIndexEntry, categoryNames: Record<string, string>, placement: string): string {
  const location = [entry.d, entry.cn].filter(Boolean).join(', ');
  const media = entry.img
    ? `<img src="${escapeHtml(entry.img)}" alt="" width="480" height="300" loading="lazy" decoding="async" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]">`
    : `<div class="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-50 to-sand text-brand-text">${icon(`cat-${entry.c}`)}</div>`;
  const discount =
    entry.dp !== null
      ? `<span class="absolute left-3 top-3 rounded-full bg-save px-2.5 py-1 text-sm font-extrabold text-white shadow-sm">%${entry.dp} indirim</span>`
      : '';
  const share = `<a href="${escapeHtml(whatsappHref(entry))}" target="_blank" rel="noopener" class="card-share" aria-label="WhatsApp’ta paylaş: ${escapeHtml(entry.t)}" title="WhatsApp’ta paylaş" data-card-share data-deal-id="${escapeHtml(entry.id)}" data-placement="${placement}"></a>`;
  const meta = [
    location ? `<li class="flex min-w-0 items-center gap-1">${icon('pin')}<span class="truncate">${escapeHtml(location)}</span></li>` : '',
    entry.ns
      ? `<li class="flex items-center gap-1 font-semibold text-ink-2">${icon('calendar')}${formatSession(entry.ns)}</li>`
      : entry.vu
        ? `<li class="flex items-center gap-1">${icon('clock')}Son kullanım ${formatDate(entry.vu)}</li>`
        : '',
  ].join('');
  const showOriginal = entry.op !== null && entry.p !== null && entry.op > entry.p;
  const price =
    entry.p !== null
      ? `<p class="flex flex-col leading-tight">${showOriginal ? `<span class="text-[0.8rem] text-muted line-through"><span class="sr-only">Önceki fiyat:</span>${formatPrice(entry.op!, entry.cur)}</span>` : ''}${entry.pf ? '<span class="text-[0.7rem] font-semibold uppercase tracking-wide text-muted">Başlangıç fiyatı</span>' : ''}<span class="text-xl font-extrabold tracking-tight text-ink">${formatPrice(entry.p, entry.cur)}</span></p>`
      : '<p class="text-sm font-medium leading-tight text-muted">Fiyat satıcı<br>sayfasında</p>';
  const category = categoryNames[entry.c] ?? '';
  const expired = entry.vu !== null && Date.parse(entry.vu) < Date.now();
  return `<article class="card group relative flex flex-col overflow-hidden transition-shadow duration-200 hover:shadow-[var(--shadow-lift)]"${expired ? ' data-expired="true"' : ''}>
  <div class="relative aspect-[16/10] overflow-hidden bg-sand">${media}${discount}${share}<span class="absolute inset-x-0 bottom-0 ${expired ? '' : 'hidden '}bg-ink/85 py-1.5 text-center text-sm font-semibold text-white">Süresi doldu</span></div>
  <div class="flex flex-1 flex-col gap-2 p-4">
    <div class="flex items-center gap-2 text-xs font-semibold text-muted">${entry.m ? `<span class="truncate">${escapeHtml(entry.m)}</span>` : ''}${entry.m && category ? '<span aria-hidden="true">·</span>' : ''}${category ? `<span class="shrink-0 text-brand-text" data-card-category>${escapeHtml(category)}</span>` : ''}</div>
    <h3 class="text-[1.02rem] font-bold leading-snug text-ink"><a href="/firsat/${entry.s}/" class="line-clamp-2 after:absolute after:inset-0 after:content-[''] focus:outline-none">${escapeHtml(entry.t)}</a></h3>
    ${meta ? `<ul class="flex flex-wrap gap-x-3 gap-y-1 text-[0.82rem] text-muted">${meta}</ul>` : ''}
    <div class="mt-auto flex items-center justify-between gap-3 border-t border-line/70 pt-3">
      <div class="min-w-0">${price}</div>
      <a href="/git/${entry.s}/" target="_blank" rel="nofollow" class="deal-cta btn-cta relative z-10 shrink-0 px-4 py-2 text-sm" data-deal-link data-deal-id="${escapeHtml(entry.id)}" data-provider="${escapeHtml(entry.pv)}" data-category="${entry.c}"${entry.ct ? ` data-city="${entry.ct}"` : ''} data-placement="${placement}">Fırsatı Gör<span class="sr-only"> (${escapeHtml(entry.m ?? entry.pn)} sitesinde, yeni sekmede açılır)</span>${icon('external')}</a>
    </div>
    <p class="text-[0.7rem] text-muted">Kaynak: ${escapeHtml(entry.pn)}</p>
  </div>
</article>`;
}

let index: Promise<DealIndexEntry[]> | null = null;

/** The compact deal index of this build (fetched once per page view). */
export function loadIndex(): Promise<DealIndexEntry[]> {
  index ??= fetch('/data/deals.json', { headers: { accept: 'application/json' } }).then(async (response) => {
    if (!response.ok) throw new Error(String(response.status));
    return ((await response.json()) as { deals: DealIndexEntry[] }).deals;
  });
  index.catch(() => (index = null));
  return index;
}
