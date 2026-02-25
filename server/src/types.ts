// Company Profile from enrichment API
export interface CompanyProfile {
  name: string;
  domain: string;
  description: string;
  employeeCount: string;
  industry: string;
  location: string;
  logo?: string;
  spendingCategories: string[];
}

// Asset types
export type AssetType = 'invoice' | 'receipt' | 'paper_receipt' | 'hotel_folio' | 'airline_receipt' | 'quote' | 'contract';

// Generated asset content
export interface InvoiceData {
  invoiceNumber: string;
  date: string;
  dueDate: string;
  vendor: {
    name: string;
    domain: string;  // For logo lookup
    address: string;
    email: string;
    phone: string;
  };
  client: {
    name: string;
    address: string;
    email: string;
  };
  lineItems: {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
  subtotal: number;
  tax: number;
  total: number;
  paymentTerms: string;
  remitTo?: {
    bankName: string;
    accountName: string;
    routingNumber: string;
    accountNumber: string;
  };
  notes?: string;
  // Reference fields for connected documents
  quoteReference?: string;
  contractReference?: string;
}

export interface ReceiptData {
  receiptNumber: string;
  date: string;
  vendor: {
    name: string;
    domain: string;  // For logo lookup
    address: string;
  };
  items: {
    description: string;
    quantity: number;
    price: number;
  }[];
  subtotal: number;
  tax: number;
  tip?: number;  // Optional tip for restaurant/meal receipts
  total: number;
  paymentMethod: string;
  cardLast4?: string;
}

// Paper receipt - thermal POS style receipt
export interface PaperReceiptData {
  receiptNumber: string;
  transactionId: string;
  date: string;
  time: string;
  store: {
    name: string;
    domain: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
    storeNumber?: string;
  };
  cashier?: string;
  register?: string;
  items: {
    name: string;
    sku?: string;
    quantity: number;
    unitPrice: number;
    total: number;
    discount?: number;
  }[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  tip?: number;  // Optional tip for restaurant receipts
  total: number;
  payment: {
    method: 'cash' | 'credit' | 'debit' | 'gift_card' | 'mobile';
    cardType?: string;
    cardLast4?: string;
    approvalCode?: string;
    amountTendered?: number;
    change?: number;
  };
  savings?: number;
  loyaltyPoints?: number;
  barcode?: string;
  footer?: string[];
}

// Hotel Folio - detailed hotel receipt/invoice
export interface HotelFolioData {
  folioNumber: string;
  hotel: {
    name: string;
    brand?: string;
    domain: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
    email?: string;
  };
  guest: {
    name: string;
    email?: string;
    loyaltyNumber?: string;
    loyaltyTier?: string;
  };
  confirmation: string;
  checkIn: string;
  checkOut: string;
  roomNumber: string;
  roomType: string;
  nights: number;
  charges: {
    category: string;
    description: string;
    date: string;
    amount: number;
  }[];
  roomTotal: number;
  incidentalsTotal: number;
  taxes: {
    name: string;
    rate?: number;
    amount: number;
  }[];
  taxTotal: number;
  total: number;
  payment: {
    method: string;
    cardType?: string;
    cardLast4?: string;
    date: string;
  };
  pointsEarned?: number;
}

// Airline Receipt - email-style flight receipt
export interface AirlineReceiptData {
  confirmationCode: string;
  ticketNumber?: string;
  airline: {
    name: string;
    domain: string;
    logo?: string;
  };
  passenger: {
    name: string;
    frequentFlyer?: string;
    tierStatus?: string;
  };
  bookingDate: string;
  flights: {
    flightNumber: string;
    date: string;
    departure: {
      airport: string;
      code: string;
      time: string;
      terminal?: string;
      gate?: string;
    };
    arrival: {
      airport: string;
      code: string;
      time: string;
      terminal?: string;
    };
    class: string;
    seat?: string;
    aircraft?: string;
    duration?: string;
  }[];
  fareBreakdown: {
    baseFare: number;
    taxes: number;
    fees: number;
    baggage?: number;
    seatSelection?: number;
    other?: number;
  };
  total: number;
  payment: {
    method: string;
    cardType?: string;
    cardLast4?: string;
  };
  milesEarned?: number;
}

export interface QuoteData {
  quoteNumber: string;
  date: string;
  validUntil: string;
  vendor: {
    name: string;
    domain: string;  // For logo lookup
    address: string;
    email: string;
    phone: string;
  };
  client: {
    name: string;
    address: string;
    email: string;
  };
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
  subtotal: number;
  discount?: number;
  total: number;
  terms: string;
  notes?: string;
}

export interface ContractData {
  contractNumber: string;
  date: string;
  effectiveDate: string;
  expirationDate: string;
  parties: {
    provider: {
      name: string;
      domain: string;  // For logo lookup
      address: string;
      representative: string;
    };
    client: {
      name: string;
      address: string;
      representative: string;
    };
  };
  services: string[];
  terms: string[];
  totalValue: number;
  paymentSchedule: string;
  signatures: {
    provider: { name: string; title: string };
    client: { name: string; title: string };
  };
  // Reference field for connected documents
  quoteReference?: string;
}

// Context for connected asset generation
export interface RelatedAssetContext {
  quote?: QuoteData;
  contract?: ContractData;
}

// Configuration for partial invoice generation
export interface InvoiceConfig {
  invoiceNumber: number;      // Which invoice this is (1, 2, 3...)
  totalInvoices: number;      // Total number of invoices
  totalAmount: number;        // Total amount to be invoiced across all invoices
  targetSubtotal: number;     // Pre-computed exact subtotal this invoice must hit
  splitPercentage: number;    // Display percentage for this invoice (e.g. 45)
  isLast: boolean;            // Whether this is the final invoice
  previousInvoicedAmount: number; // Sum of all previous invoice subtotals
}

export type AssetData = InvoiceData | ReceiptData | PaperReceiptData | HotelFolioData | AirlineReceiptData | QuoteData | ContractData;
