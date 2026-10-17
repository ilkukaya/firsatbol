import { filterEntries, paginate, sortEntries, type DealFilters, type SortKey } from '../lib/deals/query';
import type { DealIndexEntry } from '../lib/deals/schema';
import { track } from './analytics';
import { loadIndex, renderCard } from './card';

/**
 * Progressive enhancement for /firsatlar/ and /arama/: the static HTML already lists deals
 * (crawlable, works without JS). With JS, filters read/write the query string and results
 * are rendered from /data/deals.json using the same pure query functions as the build.
 */
const root = document.querySelector<HTMLElement>('[data-listing]');
if (root) void init(root);

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
    entries = await loadIndex();
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
      fiyat: value('fiyat'),
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
  for (const key of ['q', 'kategori', 'sehir', 'magaza', 'fiyat', 'sirala']) {
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
