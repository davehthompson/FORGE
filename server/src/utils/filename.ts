import {
  AssetType,
  AssetData,
  InvoiceData,
  ReceiptData,
  PaperReceiptData,
  HotelFolioData,
  AirlineReceiptData,
  QuoteData,
  ContractData,
} from '../types.js';

export const TYPE_LABELS: Record<AssetType, string> = {
  invoice: 'Invoice',
  receipt: 'Receipt',
  paper_receipt: 'Receipt',
  hotel_folio: 'Hotel_Folio',
  airline_receipt: 'Airline_Receipt',
  quote: 'Quote',
  contract: 'Contract',
};

export function sanitize(str: string): string {
  return str.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');
}

export function getVendorAndDate(type: AssetType, data: AssetData): { vendor: string; date: string } {
  let vendor = '';
  let date = '';

  switch (type) {
    case 'invoice': { const d = data as InvoiceData; vendor = d.vendor?.name; date = d.date; break; }
    case 'receipt': { const d = data as ReceiptData; vendor = d.vendor?.name; date = d.date; break; }
    case 'paper_receipt': { const d = data as PaperReceiptData; vendor = d.store?.name; date = d.date; break; }
    case 'hotel_folio': { const d = data as HotelFolioData; vendor = d.hotel?.name; date = d.checkIn; break; }
    case 'airline_receipt': { const d = data as AirlineReceiptData; vendor = d.airline?.name; date = d.bookingDate; break; }
    case 'quote': { const d = data as QuoteData; vendor = d.vendor?.name; date = d.date; break; }
    case 'contract': { const d = data as ContractData; vendor = d.parties?.provider?.name; date = d.date; break; }
  }

  return { vendor: vendor || '', date: date || '' };
}

export function buildFilename(type: AssetType, data: AssetData, ext: string, suffix?: string): string {
  const { vendor, date } = getVendorAndDate(type, data);

  const label = TYPE_LABELS[type] || type;
  const vendorPart = vendor ? `_${sanitize(vendor)}` : '';
  const datePart = date ? `_${date}` : '';
  const suffixPart = suffix ? `_${suffix}` : '';

  return `${label}${vendorPart}${datePart}${suffixPart}.${ext}`;
}
