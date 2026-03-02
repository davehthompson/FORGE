export const GENERATE_TYPES = ['invoice', 'quote', 'contract'] as const;
export type GenerateType = (typeof GENERATE_TYPES)[number];

export const RECEIPT_TYPES = ['receipt', 'paper_receipt', 'hotel_folio', 'airline_receipt'] as const;
export type ReceiptType = (typeof RECEIPT_TYPES)[number];

export const BUNDLE_ASSETS = ['quote', 'contract', 'invoice'] as const;
export type BundleAsset = (typeof BUNDLE_ASSETS)[number];

export const EXPORT_FORMATS = ['pdf', 'jpg'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const CURRENCIES = [
  'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'MXN',
  'BRL', 'KRW', 'SGD', 'HKD', 'SEK', 'NOK', 'DKK', 'NZD', 'ZAR', 'AED',
  'SAR', 'ILS', 'PLN', 'THB', 'PHP',
] as const;
export type Currency = (typeof CURRENCIES)[number];

const GENERATE_TYPES_SET = new Set<string>(GENERATE_TYPES);
const RECEIPT_TYPES_SET = new Set<string>(RECEIPT_TYPES);
const BUNDLE_ASSETS_SET = new Set<string>(BUNDLE_ASSETS);
const EXPORT_FORMATS_SET = new Set<string>(EXPORT_FORMATS);
const CURRENCIES_SET = new Set<string>(CURRENCIES);

export const ENUM_SETS: Record<string, Set<string>> = {
  type: GENERATE_TYPES_SET,
  receiptType: RECEIPT_TYPES_SET,
  assets: BUNDLE_ASSETS_SET,
  format: EXPORT_FORMATS_SET,
  currency: CURRENCIES_SET,
};

export function validateEnum(
  value: unknown,
  allowed: readonly string[],
  fieldName: string,
): string | null {
  if (value === undefined || value === null || value === '') {
    return `"${fieldName}" is required. Accepted values: ${allowed.join(', ')}`;
  }
  const set = new Set<string>(allowed);
  if (!set.has(value as string)) {
    return `Invalid "${fieldName}": "${value}". Accepted values: ${allowed.join(', ')}`;
  }
  return null;
}

export function validateEnumOptional(
  value: unknown,
  allowed: readonly string[],
  fieldName: string,
): string | null {
  if (value === undefined || value === null || value === '') return null;
  const set = new Set<string>(allowed);
  if (!set.has(value as string)) {
    return `Invalid "${fieldName}": "${value}". Accepted values: ${allowed.join(', ')}`;
  }
  return null;
}
