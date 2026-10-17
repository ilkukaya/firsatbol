export const TIME_ZONE = 'Europe/Istanbul';
export const LOCALE = 'tr-TR';

const currencyFormatters = new Map<string, Intl.NumberFormat>();
const tlNumber = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/**
 * Prices as Turkish readers write them: "1.950 TL" (amount first, "TL" spelled out — the ₺ sign
 * on the left is unusual in Türkiye and not everyone knows it). A non-breaking space keeps
 * amount and unit together. Other currencies use the standard locale format.
 */
export function formatPrice(amount: number, currency = 'TRY'): string {
  if (currency === 'TRY') return `${tlNumber.format(amount)}\u00a0TL`;
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 });
    currencyFormatters.set(currency, formatter);
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

const sessionFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const sessionLongFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** "Cum 18 Eki 20:30" — compact event session label. */
export function formatSession(value: string | Date): string {
  return sessionFormatter.format(typeof value === 'string' ? new Date(value) : value);
}

export function formatSessionLong(value: string | Date): string {
  return sessionLongFormatter.format(typeof value === 'string' ? new Date(value) : value);
}
