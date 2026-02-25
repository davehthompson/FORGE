// Supported currencies with flag emojis and ISO codes
export interface Currency {
  code: string;       // ISO 4217 currency code (e.g., USD, EUR)
  name: string;       // Full currency name
  symbol: string;     // Currency symbol (e.g., $, €, £)
  flag: string;       // Flag emoji
  locale: string;     // Locale for formatting (e.g., en-US, de-DE)
}

export const CURRENCIES: Currency[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', flag: '🇺🇸', locale: 'en-US' },
  { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺', locale: 'de-DE' },
  { code: 'GBP', name: 'British Pound', symbol: '£', flag: '🇬🇧', locale: 'en-GB' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', flag: '🇯🇵', locale: 'ja-JP' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', flag: '🇨🇦', locale: 'en-CA' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', flag: '🇦🇺', locale: 'en-AU' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', flag: '🇨🇭', locale: 'de-CH' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', flag: '🇨🇳', locale: 'zh-CN' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', flag: '🇮🇳', locale: 'en-IN' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$', flag: '🇲🇽', locale: 'es-MX' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', flag: '🇧🇷', locale: 'pt-BR' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩', flag: '🇰🇷', locale: 'ko-KR' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', flag: '🇸🇬', locale: 'en-SG' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', flag: '🇭🇰', locale: 'zh-HK' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', flag: '🇸🇪', locale: 'sv-SE' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', flag: '🇳🇴', locale: 'nb-NO' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr', flag: '🇩🇰', locale: 'da-DK' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', flag: '🇳🇿', locale: 'en-NZ' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', flag: '🇿🇦', locale: 'en-ZA' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', flag: '🇦🇪', locale: 'ar-AE' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', flag: '🇸🇦', locale: 'ar-SA' },
  { code: 'ILS', name: 'Israeli Shekel', symbol: '₪', flag: '🇮🇱', locale: 'he-IL' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'zł', flag: '🇵🇱', locale: 'pl-PL' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿', flag: '🇹🇭', locale: 'th-TH' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱', flag: '🇵🇭', locale: 'en-PH' },
];

// Get currency by code
export function getCurrency(code: string): Currency | undefined {
  return CURRENCIES.find(c => c.code === code);
}

// Default currency
export const DEFAULT_CURRENCY: Currency = CURRENCIES[0]; // USD

// Format amount with currency
export function formatCurrency(amount: number, currencyCode: string = 'USD'): string {
  const currency = getCurrency(currencyCode) || DEFAULT_CURRENCY;
  
  return new Intl.NumberFormat(currency.locale, {
    style: 'currency',
    currency: currency.code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Format amount with just the symbol (for templates)
export function formatWithSymbol(amount: number, currencyCode: string = 'USD'): string {
  const currency = getCurrency(currencyCode) || DEFAULT_CURRENCY;
  
  const formatted = amount.toLocaleString(currency.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  
  return `${currency.symbol}${formatted}`;
}
