import { filterEntries, paginate, sortEntries, type DealFilters, type SortKey } from '../lib/deals/query';
import type { DealIndexEntry } from '../lib/deals/schema';
import { track } from './analytics';

/**
 * Progressive enhancement for /firsatlar/ and /arama/: the static HTML already lists deals
 * (crawlable, works without JS). With JS, filters read/write the query string and results
 * are rendered from /data/deals.json using the same pure query functions as the build.
 */
const root = document.querySelector<HTMLElement>('[data-listing]');
if (root) void init(root);

const priceFormat = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const dateFormat = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', year: 'numeric' });
const sessionFormat = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

function icon(name: string): string {
  return document.querySelector<HTMLTemplateElement>(`template[data-icon="${name}"]`)?.innerHTML ?? '';
}

function formatPrice(value: number, currency: string): string {
  return currency === 'TRY' ? priceFormat.format(value) : new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(value);
}

/** Mirrors src/components/DealCard.astro. Keep markup in sync. */
function renderCard(entry: DealIndexEntry, categoryNames: Record<string, string>, placement: string): string {
  const location = [entry.d, entry.cn].filter(Boolean).join(', ');
  const media = entry.img
    ? `<img src="${escapeHtml(entry.img)}" alt="" width="480" height="300" loading="lazy" decoding="async" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]">`
    : `<div class="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-50 to-sand text-brand-text">${icon(`cat-${entry.c}`)}</div>`;
  const discount =
    entry.dp !== null
      ? `<span class="absolute left-3 top-3 rounded-full bg-save px-2.5 py-1 text-sm font-extrabold text-white shadow-sm">%${entry.dp} indirim</span>`
      : '';
  const meta = [
    location ? `<li class="flex min-w-0 items-center gap-1">${icon('pin')}<span class="truncate">${escapeHtml(location)}</span></li>` : '',
    entry.ns
      ? `<li class="flex items-center gap-1 font-semibold text-ink-2">${icon('calendar')}${sessionFormat.format(new Date(entry.ns))}</li>`
      : entry.vu
        ? `<li class="flex items-center gap-1">${icon('clock')}Son kullanım ${dateFormat.format(new Date(entry.vu))}</li>`
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
  <div class="relative aspect-[16/10] overflow-hidden bg-sand">${media}${discount}<span class="absolute inset-x-0 bottom-0 ${expired ? '' : 'hidden '}bg-ink/85 py-1.5 text-center text-sm font-semibold text-white">Süresi doldu</span></div>
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

const PAGE = 24;

async function init(container: HTMLElement): Promise<void> {
  const form = container.querySelector<HTMLFormElement>('[data-filter-form]');
  const results = container.querySelector<HTMLElement>('[data-results]');
  const count = container.querySelector<HTMLElement>('[data-result-count]');
  const more = container.querySelector<HTMLButtonElement>('[data-load-more]');
  const empty = container.querySelector<HTMLElement>('[data-no-results]');
  const staticPagination = container.querySelector<HTMLElement>('[data-static-pagination]');
  const placement = container.dataset.listing ?? 'listing';
  const categoryNames = JSON.parse(container.dataset.categories ?? '{}') as Record<string, string>;
  if (!form || !results || !count) return;

  let entries: DealIndexEntry[];
  try {
    const response = await fetch('/data/deals.json', { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(String(response.status));
    entries = ((await response.json()) as { deals: DealIndexEntry[] }).deals;
  } catch {
    return; // keep the server-rendered list
  }

  let shown = PAGE;
  const read = (): DealFilters => {
    const data = new FormData(form);
    const value = (key: string) => String(data.get(key) ?? '').trim() || undefined;
    return {
      q: value('q'),
      kategori: value('kategori'),
      sehir: value('sehir'),
      magaza: value('magaza'),
      sirala: (value('sirala') as SortKey | undefined) ?? 'onerilen',
    };
  };

  const render = (resetPaging: boolean) => {
    const filters = read();
    if (resetPaging) shown = PAGE;
    const matched = sortEntries(filterEntries(entries, filters), filters.sirala);
    const { items } = paginate(matched, 1, shown);
    results.innerHTML = items.map((entry) => renderCard(entry, categoryNames, placement)).join('');
    count.textContent = `${matched.length.toLocaleString('tr-TR')} fırsat bulundu`;
    empty?.classList.toggle('hidden', matched.length > 0);
    more?.classList.toggle('hidden', matched.length <= shown);
    staticPagination?.classList.add('hidden');

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value && !(key === 'sirala' && value === 'onerilen')) params.set(key, value);
    const query = params.toString();
    history.replaceState(null, '', query ? `${location.pathname}?${query}` : location.pathname);
    return { filters, total: matched.length };
  };

  // initialise controls from the URL
  const params = new URLSearchParams(location.search);
  for (const key of ['q', 'kategori', 'sehir', 'magaza', 'sirala']) {
    const control = form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement | null;
    const value = params.get(key);
    if (control && value) control.value = value;
  }
  if ([...params.keys()].length > 0 || container.dataset.alwaysRender === 'true') {
    const { filters, total } = render(true);
    if (filters.q && placement === 'search') track('search', { q: filters.q.slice(0, 80).toLocaleLowerCase('tr-TR'), results: total });
  }

  let timer: number | undefined;
  form.addEventListener('input', (event) => {
    const isText = (event.target as HTMLElement).matches('input[type="search"]');
    window.clearTimeout(timer);
    timer = window.setTimeout(() => render(true), isText ? 220 : 0);
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const { filters, total } = render(true);
    if (filters.q) track('search', { q: filters.q.slice(0, 80).toLocaleLowerCase('tr-TR'), results: total });
  });
  form.querySelector('[data-reset]')?.addEventListener('click', () => {
    form.reset();
    for (const element of [...form.elements])
      if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement)
        element.value = element instanceof HTMLSelectElement && element.name === 'sirala' ? 'onerilen' : '';
    render(true);
  });
  more?.addEventListener('click', () => {
    shown += PAGE;
    render(false);
  });
}
