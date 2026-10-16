const TR_MAP: Record<string, string> = {
  ı: 'i',
  İ: 'i',
  ş: 's',
  Ş: 's',
  ğ: 'g',
  Ğ: 'g',
  ü: 'u',
  Ü: 'u',
  ö: 'o',
  Ö: 'o',
  ç: 'c',
  Ç: 'c',
  â: 'a',
  Â: 'a',
  î: 'i',
  Î: 'i',
  û: 'u',
  Û: 'u',
};

/** Turkish-aware lowercase that keeps the dotted/dotless i distinction correct. */
export function trLower(value: string): string {
  return value.toLocaleLowerCase('tr-TR');
}

/** ASCII, hyphenated, Turkish-aware slug: "Yeme & İçme Fırsatları" → "yeme-icme-firsatlari". */
export function slugify(value: string, maxLength = 80): string {
  const replaced = value.replace(/[ıİşŞğĞüÜöÖçÇâÂîÎûÛ]/g, (ch) => TR_MAP[ch] ?? ch);
  const ascii = replaced
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' ve ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (ascii.length <= maxLength) return ascii;
  const cut = ascii.slice(0, maxLength);
  const lastHyphen = cut.lastIndexOf('-');
  return (lastHyphen > maxLength * 0.6 ? cut.slice(0, lastHyphen) : cut).replace(/-+$/g, '');
}

/** Normalise text for search matching (lowercase, ASCII-folded, single spaced). */
export function searchFold(value: string): string {
  return slugify(value, 10_000).replace(/-/g, ' ');
}
