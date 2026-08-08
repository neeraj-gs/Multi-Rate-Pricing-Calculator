import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges class names, letting later Tailwind utilities win over earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Groups a decimal string into thousands for display: `"1234567.50"` becomes
 * `"1,234,567.50"`.
 *
 * Operates on the string the server already formatted — never on a `Number`.
 * Running the value through `toLocaleString` would mean parsing it as a float
 * first, which is the one thing this system is built to avoid.
 */
export function groupDigits(value: string): string {
  const [whole, fraction] = value.split('.');
  const negative = whole.startsWith('-');
  const digits = negative ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''}`;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  AED: 'AED',
  SAR: 'SAR',
  QAR: 'QAR',
  KWD: 'KWD',
  BHD: 'BHD',
  OMR: 'OMR',
  EGP: 'EGP',
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  JPY: '¥',
};

/** Renders an already-formatted amount with its currency marker. */
export function money(value: string, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  const amount = groupDigits(value);
  // Single-glyph symbols hug the number; three-letter codes need a space.
  return symbol.length === 1 ? `${symbol}${amount}` : `${symbol} ${amount}`;
}

export function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? currency;
}

/**
 * Currency names, for searching and for saying which one you picked.
 *
 * A list of bare three-letter codes assumes the reader already knows them all.
 * Someone who thinks "rupee" should not have to remember it is filed under
 * `INR`, and someone scanning a list of eleven codes should be able to tell
 * `QAR` from `SAR` without looking either up.
 */
const CURRENCY_NAMES: Record<string, string> = {
  AED: 'UAE dirham',
  SAR: 'Saudi riyal',
  QAR: 'Qatari riyal',
  KWD: 'Kuwaiti dinar',
  BHD: 'Bahraini dinar',
  OMR: 'Omani rial',
  EGP: 'Egyptian pound',
  USD: 'US dollar',
  EUR: 'Euro',
  GBP: 'Pound sterling',
  INR: 'Indian rupee',
  JPY: 'Japanese yen',
};

export function currencyName(currency: string): string {
  return CURRENCY_NAMES[currency] ?? currency;
}

/** `2026-08-08` -> `8 Aug 2026`. Locale-independent, so it never surprises. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getUTCDate()} ${
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
      date.getUTCMonth()
    ]
  } ${date.getUTCFullYear()}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const time = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${formatDate(date.toISOString())} · ${time}`;
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(new Date(then).toISOString());
}

/** Today as `YYYY-MM-DD` in UTC, matching how issue dates are stored. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** First day of the month, `n` months back, as `YYYY-MM-DD`. */
export function monthsAgoISO(months: number): string {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
  return date.toISOString().slice(0, 10);
}
