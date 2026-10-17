import { filterEntries, sortEntries, type SortKey } from '../lib/deals/query';
import { loadIndex, renderCard } from './card';

/**
 * Sort and price-range bar of category, city, district and sub-category pages
 * (src/components/ScopedDeals.astro). Without a choice the server-rendered page stays as it is;
 * with one, every deal of the page's scope — not only this page — is filtered, sorted and shown
 * with "Daha fazla göster". Choices live in the query string (?sirala=…&fiyat=…).
 */
const PAGE = 24;

document.querySelectorAll<HTMLElement>('[data-scope]').forEach((root) => init(root));

function init(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>('[data-scope-tools]');
  const results = root.querySelector<HTMLElement>('[data-scope-results]');
  const count = root.querySelector<HTMLElement>('[data-scope-count]');
  if (!form || !results || !count) return;
  const more = root.querySelector<HTMLElement>('[data-scope-more]');
  const empty = root.querySelector<HTMLElement>('[data-scope-empty]');
  const pagination = root.querySelector<HTMLElement>('[data-scope-pagination]');
  const prefix = root.dataset.scopePrefix ?? '';
  const ids = new Set((root.dataset.scopeIds ?? '').split(',').map((id) => `${prefix}${id}`));
  const categoryNames = JSON.parse(root.dataset.categories ?? '{}') as Record<string, string>;
  const placement = root.dataset.placement ?? 'listing';
  const staticCards = results.innerHTML;
  const staticCount = count.innerHTML;
  form.hidden = false;

  // fetch the index as soon as someone reaches for the bar
  const prefetch = () => void loadIndex().catch(() => undefined);
  form.addEventListener('pointerenter', prefetch, { once: true });
  form.addEventListener('focusin', prefetch, { once: true });
  form.addEventListener('touchstart', prefetch, { once: true, passive: true });

  let shown = PAGE;
  const read = () => {
    const data = new FormData(form);
    return { fiyat: String(data.get('fiyat') ?? '') || undefined, sirala: (String(data.get('sirala') ?? '') || 'onerilen') as SortKey };
  };

  const render = async (reset: boolean) => {
    const { fiyat, sirala } = read();
    if (reset) shown = PAGE;
    const params = new URLSearchParams(location.search);
    params.delete('fiyat');
    params.delete('sirala');
    if (fiyat) params.set('fiyat', fiyat);
    if (sirala !== 'onerilen') params.set('sirala', sirala);
    const query = params.toString();
    history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);

    if (!fiyat && sirala === 'onerilen') {
      results.innerHTML = staticCards;
      count.innerHTML = staticCount;
      empty?.classList.add('hidden');
      more?.classList.add('hidden');
      pagination?.classList.remove('hidden');
      return;
    }
    let entries;
    try {
      entries = (await loadIndex()).filter((entry) => ids.has(entry.id));
    } catch {
      return; // keep the static page
    }
    const matched = sortEntries(filterEntries(entries, { fiyat }), sirala);
    results.innerHTML = `<div class="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">${matched
      .slice(0, shown)
      .map((entry) => renderCard(entry, categoryNames, placement))
      .join('')}</div>`;
    count.textContent = `${matched.length.toLocaleString('tr-TR')} fırsat${fiyat ? ' bu fiyat aralığında' : ''}`;
    empty?.classList.toggle('hidden', matched.length > 0);
    more?.classList.toggle('hidden', matched.length <= shown);
    pagination?.classList.add('hidden');
  };

  // restore choices from the URL (shared or reloaded links)
  const params = new URLSearchParams(location.search);
  const sort = form.elements.namedItem('sirala') as HTMLSelectElement | null;
  const wantedSort = params.get('sirala');
  if (sort && wantedSort && [...sort.options].some((option) => option.value === wantedSort)) sort.value = wantedSort;
  const wantedRange = params.get('fiyat');
  const range = wantedRange ? form.querySelector<HTMLInputElement>(`input[name="fiyat"][value="${CSS.escape(wantedRange)}"]`) : null;
  if (range) range.checked = true;
  if ((sort && sort.value !== 'onerilen') || range) void render(true);

  form.addEventListener('change', () => {
    void render(true).then(() => results.scrollIntoView?.({ block: 'nearest' }));
  });
  form.addEventListener('submit', (event) => event.preventDefault());
  more?.addEventListener('click', () => {
    shown += PAGE;
    void render(false);
  });
}
