export const TIME_ZONE = 'Europe/Istanbul';
export const LOCALE = 'tr-TR';

const currencyFormatters = new Map<string, Intl.NumberFormat>();

export function formatPrice(amount: number, currency = 'TRY'): string {
  const key = currency;
  let formatter = currencyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    currencyFormatters.set(key, formatter);
  }
  return formatter.format(amount);
}

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(value: string | Date): string {
  return dateFormatter.format(typeof value === 'string' ? new Date(value) : value);
}

export function formatDateTime(value: string | Date): string {
  return dateTimeFormatter.format(typeof value === 'string' ? new Date(value) : value);
}

/** ISO date (YYYY-MM-DD) in Istanbul time. */
export function isoDateInIstanbul(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(value);
}

export function pluralFirsat(count: number): string {
  return `${count.toLocaleString(LOCALE)} fırsat`;
}
