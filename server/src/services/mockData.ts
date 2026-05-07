import crypto from 'crypto';
import { CompanyProfile, AssetType, InvoiceData, QuoteData, ContractData, AssetData, InvoiceConfig, RelatedAssetContext } from '../types.js';
import { stampAssetLogos } from './claude.js';

export const TEST_DOMAIN = 'ramptest.com';

export function isTestDomain(domain: string): boolean {
  const clean = domain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].toLowerCase();
  return clean === TEST_DOMAIN;
}

function buildMockLogoUrl(): string {
  const token = process.env.LOGO_DEV_KEY ?? '';
  if (!token) return '';
  const params = new URLSearchParams({
    token,
    size: '128',
    format: 'png',
    retina: 'true',
    fallback: 'monogram',
  });
  return `https://img.logo.dev/ramp.com?${params.toString()}`;
}

export function getMockCompanyProfile(): CompanyProfile {
  return {
    name: 'Ramp',
    domain: TEST_DOMAIN,
    description: 'Ramp is a finance automation platform that helps businesses manage expenses, corporate cards, bill payments, and accounting in one unified system. The company leverages AI and machine learning to provide real-time spend visibility and control.',
    employeeCount: '1,200',
    industry: 'Financial Technology',
    location: '29 W 23rd St, New York, NY 10010, United States',
    logo: buildMockLogoUrl(),
    spendingCategories: [
      'Cloud Infrastructure & Hosting',
      'Software Subscriptions & SaaS',
      'Professional & Legal Services',
      'Office Supplies & Equipment',
      'Marketing & Advertising',
      'Travel & Entertainment',
      'Recruiting & Staffing',
    ],
  };
}

const MOCK_VENDOR = {
  name: 'Acme Cloud Services Inc.',
  domain: 'acmecloudservices.com',
  address: '500 Technology Drive, Suite 200, San Jose, CA 95110',
  email: 'billing@acmecloudservices.com',
  phone: '(408) 555-0192',
  representative: 'Michael Chen',
};

function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

const MOCK_LINE_ITEM_IDS = [
  'a1b2c3d4-e5f6-4a7b-8c9d-000000000001',
  'a1b2c3d4-e5f6-4a7b-8c9d-000000000002',
  'a1b2c3d4-e5f6-4a7b-8c9d-000000000003',
  'a1b2c3d4-e5f6-4a7b-8c9d-000000000004',
  'a1b2c3d4-e5f6-4a7b-8c9d-000000000005',
];

function getMockQuote(): QuoteData {
  return {
    quoteNumber: 'QT-2026-0847',
    date: futureDate(0),
    validUntil: futureDate(30),
    vendor: {
      name: MOCK_VENDOR.name,
      domain: MOCK_VENDOR.domain,
      address: MOCK_VENDOR.address,
      email: MOCK_VENDOR.email,
      phone: MOCK_VENDOR.phone,
    },
    client: {
      name: 'Ramp',
      address: '29 W 23rd St, New York, NY 10010',
      email: 'procurement@ramp.com',
    },
    items: [
      { id: MOCK_LINE_ITEM_IDS[0], description: 'Enterprise Cloud Compute Instances (12-month term)', quantity: 24, unitPrice: 850, total: 20400 },
      { id: MOCK_LINE_ITEM_IDS[1], description: 'Managed Kubernetes Cluster - Production', quantity: 2, unitPrice: 3200, total: 6400 },
      { id: MOCK_LINE_ITEM_IDS[2], description: 'Dedicated Load Balancer with SSL Termination', quantity: 4, unitPrice: 475, total: 1900 },
      { id: MOCK_LINE_ITEM_IDS[3], description: 'Object Storage - 50TB Tier with CDN', quantity: 1, unitPrice: 2800, total: 2800 },
      { id: MOCK_LINE_ITEM_IDS[4], description: 'Premium 24/7 Technical Support Plan', quantity: 1, unitPrice: 4500, total: 4500 },
    ],
    subtotal: 36000,
    discount: 3600,
    total: 32400,
    terms: 'Net 30. This quote is valid for 30 days from the date of issue. All prices are in USD and exclude applicable taxes.',
    notes: 'Volume discount of 10% applied. Includes dedicated account manager and quarterly business reviews.',
  };
}

function getMockContract(quoteRef?: string): ContractData {
  return {
    contractNumber: 'MSA-2026-0412',
    date: futureDate(0),
    effectiveDate: futureDate(7),
    expirationDate: futureDate(372),
    parties: {
      provider: {
        name: MOCK_VENDOR.name,
        domain: MOCK_VENDOR.domain,
        address: MOCK_VENDOR.address,
        representative: MOCK_VENDOR.representative,
      },
      client: {
        name: 'Ramp',
        address: '29 W 23rd St, New York, NY 10010',
        representative: 'Sarah Kim',
      },
    },
    services: [
      'Provision and maintenance of 24 Enterprise Cloud Compute Instances with guaranteed 99.99% uptime SLA',
      'Fully managed Kubernetes cluster deployment for production and staging environments',
      'Dedicated load balancing infrastructure with automated SSL certificate management',
      'Object storage with integrated CDN distribution across North American edge locations',
      'Premium 24/7 technical support with 15-minute response time for Severity 1 incidents',
    ],
    terms: [
      'Service Level Agreement guarantees 99.99% monthly uptime or proportional service credits will be issued',
      'Either party may terminate with 60 days written notice after the initial 12-month commitment period',
      'All data remains the property of the Client and will be returned or securely deleted upon contract termination',
      'Provider maintains SOC 2 Type II compliance and will undergo annual third-party security audits',
      'Pricing is fixed for the initial term; any renewal pricing adjustments will not exceed 5% annually',
      'Provider will assign a dedicated account manager and conduct quarterly business reviews',
    ],
    totalValue: 32400,
    paymentSchedule: 'Quarterly installments of $8,100 due on the first business day of each quarter',
    signatures: {
      provider: { name: 'Michael Chen', title: 'VP of Enterprise Sales' },
      client: { name: 'Sarah Kim', title: 'Director of Engineering' },
    },
    quoteReference: quoteRef,
  };
}

function getMockInvoice(config?: InvoiceConfig, relatedAssets?: RelatedAssetContext): InvoiceData {
  const invoiceNum = config?.invoiceNumber ?? 1;
  const targetSubtotal = config?.targetSubtotal ?? 32400;
  const taxRate = 0.08875;
  const tax = Math.round(targetSubtotal * taxRate * 100) / 100;

  const baseItems = [
    { id: MOCK_LINE_ITEM_IDS[0], description: 'Enterprise Cloud Compute Instances (12-month term)', quantity: 24, unitPrice: 850, total: 20400 },
    { id: MOCK_LINE_ITEM_IDS[1], description: 'Managed Kubernetes Cluster - Production', quantity: 2, unitPrice: 3200, total: 6400 },
    { id: MOCK_LINE_ITEM_IDS[2], description: 'Dedicated Load Balancer with SSL Termination', quantity: 4, unitPrice: 475, total: 1900 },
    { id: MOCK_LINE_ITEM_IDS[3], description: 'Object Storage - 50TB Tier with CDN', quantity: 1, unitPrice: 2800, total: 2800 },
    { id: MOCK_LINE_ITEM_IDS[4], description: 'Premium 24/7 Technical Support Plan', quantity: 1, unitPrice: 4500, total: 4500 },
  ];

  let items: InvoiceData['lineItems'];
  if (config && config.totalInvoices > 1) {
    const ratio = targetSubtotal / 36000;
    items = baseItems.map(item => {
      const adjTotal = Math.round(item.total * ratio * 100) / 100;
      const adjQty = Math.max(1, Math.round(item.quantity * ratio));
      const adjUnitPrice = Math.round((adjTotal / adjQty) * 100) / 100;
      return { id: item.id, description: item.description, quantity: adjQty, unitPrice: adjUnitPrice, total: adjTotal };
    });
    const itemsTotal = items.reduce((sum, i) => sum + i.total, 0);
    const diff = Math.round((targetSubtotal - itemsTotal) * 100) / 100;
    if (diff !== 0) {
      items[items.length - 1].total = Math.round((items[items.length - 1].total + diff) * 100) / 100;
    }
  } else {
    items = baseItems;
  }

  const subtotal = items.reduce((sum, i) => sum + i.total, 0);

  return {
    invoiceNumber: `INV-2026-${String(8400 + invoiceNum).padStart(4, '0')}`,
    date: futureDate(invoiceNum * 7),
    dueDate: futureDate(invoiceNum * 7 + 30),
    vendor: {
      name: MOCK_VENDOR.name,
      domain: MOCK_VENDOR.domain,
      address: MOCK_VENDOR.address,
      email: MOCK_VENDOR.email,
      phone: MOCK_VENDOR.phone,
    },
    client: {
      name: 'Ramp',
      address: '29 W 23rd St, New York, NY 10010',
      email: 'ap@ramp.com',
    },
    lineItems: items,
    subtotal,
    tax,
    total: Math.round((subtotal + tax) * 100) / 100,
    paymentTerms: 'Net 30',
    remitTo: {
      bankName: 'Silicon Valley Bank',
      accountName: 'Acme Cloud Services Inc.',
      routingNumber: '121140399',
      accountNumber: '****7892',
    },
    notes: config && config.totalInvoices > 1
      ? `Partial invoice ${invoiceNum} of ${config.totalInvoices} (${config.splitPercentage}% of contract value)`
      : undefined,
    quoteReference: relatedAssets?.quote?.quoteNumber,
    contractReference: relatedAssets?.contract?.contractNumber,
  };
}

function getMockReceipt(): AssetData {
  return {
    receiptNumber: 'RCP-482917',
    date: futureDate(0),
    vendor: {
      name: 'WeWork',
      domain: 'wework.com',
      address: '71 5th Avenue, New York, NY 10003',
    },
    items: [
      { description: 'Hot Desk Day Pass', quantity: 3, price: 45 },
      { description: 'Meeting Room Booking (2hr)', quantity: 1, price: 75 },
      { description: 'Printing Services - Color (50 pages)', quantity: 1, price: 12.50 },
    ],
    subtotal: 222.50,
    tax: 19.75,
    total: 242.25,
    paymentMethod: 'Corporate Card',
    cardLast4: '4291',
  } as AssetData;
}

function getMockPaperReceipt(): AssetData {
  return {
    receiptNumber: '00847291',
    transactionId: 'TXN-20260126-8472',
    date: futureDate(0),
    time: '12:34 PM',
    store: {
      name: 'Sweetgreen',
      domain: 'sweetgreen.com',
      address: '8 W 18th St',
      city: 'New York',
      state: 'NY',
      zip: '10011',
      phone: '(212) 555-0134',
      storeNumber: '#0847',
    },
    cashier: 'Jordan M.',
    register: 'POS-3',
    items: [
      { name: 'Harvest Bowl', quantity: 2, unitPrice: 14.95, total: 29.90 },
      { name: 'Guacamole Greens', quantity: 1, unitPrice: 13.95, total: 13.95 },
      { name: 'Lemonade', quantity: 3, unitPrice: 3.50, total: 10.50 },
    ],
    subtotal: 54.35,
    taxRate: 8.875,
    taxAmount: 4.82,
    tip: 8.88,
    total: 68.05,
    payment: {
      method: 'credit',
      cardType: 'Visa',
      cardLast4: '4291',
      approvalCode: 'A84721',
    },
    barcode: '0084729120260126',
    footer: ['Thank you for choosing Sweetgreen!', 'sweetgreen.com/rewards'],
  } as AssetData;
}

function getMockHotelFolio(): AssetData {
  return {
    folioNumber: 'FOL-926184',
    hotel: {
      name: 'The Westin New York Grand Central',
      brand: 'Westin',
      domain: 'marriott.com',
      address: '212 East 42nd Street',
      city: 'New York',
      state: 'NY',
      zip: '10017',
      phone: '(212) 490-8900',
      email: 'reservations@westinnyc.com',
    },
    guest: {
      name: 'Sarah Kim',
      email: 'sarah.kim@ramp.com',
      loyaltyNumber: 'MW-847291056',
      loyaltyTier: 'Platinum Elite',
    },
    confirmation: 'CONF-8472MW',
    checkIn: futureDate(3),
    checkOut: futureDate(6),
    roomNumber: '2847',
    roomType: 'Deluxe King Room - City View',
    nights: 3,
    charges: [
      { category: 'Room', description: 'Deluxe King Room - City View', date: futureDate(3), amount: 389 },
      { category: 'Room', description: 'Deluxe King Room - City View', date: futureDate(4), amount: 389 },
      { category: 'Room', description: 'Deluxe King Room - City View', date: futureDate(5), amount: 389 },
      { category: 'Dining', description: 'Room Service - Breakfast', date: futureDate(4), amount: 42.50 },
      { category: 'Dining', description: 'Room Service - Breakfast', date: futureDate(5), amount: 38.75 },
      { category: 'Spa', description: 'Business Center - Printing', date: futureDate(4), amount: 8.50 },
      { category: 'Parking', description: 'Valet Parking (per night)', date: futureDate(3), amount: 75 },
      { category: 'Parking', description: 'Valet Parking (per night)', date: futureDate(4), amount: 75 },
      { category: 'Parking', description: 'Valet Parking (per night)', date: futureDate(5), amount: 75 },
    ],
    roomTotal: 1167,
    incidentalsTotal: 314.75,
    taxes: [
      { name: 'State Occupancy Tax', rate: 5.875, amount: 87.08 },
      { name: 'NYC Hotel Room Occupancy Tax', rate: 14.75, amount: 172.13 },
      { name: 'NYC Unit Fee', amount: 6 },
    ],
    taxTotal: 265.21,
    total: 1746.96,
    payment: {
      method: 'Credit Card',
      cardType: 'Visa',
      cardLast4: '4291',
      date: futureDate(6),
    },
    pointsEarned: 8734,
  } as AssetData;
}

function getMockAirlineReceipt(): AssetData {
  return {
    confirmationCode: 'BXKM47',
    ticketNumber: '001-8472916384',
    airline: {
      name: 'Delta Air Lines',
      domain: 'delta.com',
    },
    passenger: {
      name: 'Sarah Kim',
      frequentFlyer: 'SK847291',
      tierStatus: 'Gold Medallion',
    },
    bookingDate: futureDate(-5),
    flights: [
      {
        flightNumber: 'DL 1847',
        date: futureDate(10),
        departure: { airport: 'John F. Kennedy International', code: 'JFK', time: '7:15 AM', terminal: '4', gate: 'B32' },
        arrival: { airport: 'San Francisco International', code: 'SFO', time: '10:48 AM', terminal: '2' },
        class: 'Main Cabin',
        seat: '14C',
        aircraft: 'Boeing 757-200',
        duration: '6h 33m',
      },
      {
        flightNumber: 'DL 892',
        date: futureDate(13),
        departure: { airport: 'San Francisco International', code: 'SFO', time: '6:30 PM', terminal: '2', gate: 'D15' },
        arrival: { airport: 'John F. Kennedy International', code: 'JFK', time: '3:05 AM +1', terminal: '4' },
        class: 'Main Cabin',
        seat: '22A',
        aircraft: 'Airbus A321',
        duration: '5h 35m',
      },
    ],
    fareBreakdown: {
      baseFare: 387.40,
      taxes: 42.18,
      fees: 11.20,
      baggage: 35,
      seatSelection: 24,
    },
    total: 499.78,
    payment: {
      method: 'Credit Card',
      cardType: 'Visa',
      cardLast4: '4291',
    },
    milesEarned: 4928,
  } as AssetData;
}

export function getMockAsset(
  type: AssetType,
  config?: InvoiceConfig,
  relatedAssets?: RelatedAssetContext,
): AssetData {
  let asset: AssetData;
  switch (type) {
    case 'quote':
      asset = getMockQuote();
      break;
    case 'contract':
      asset = getMockContract(relatedAssets?.quote?.quoteNumber);
      break;
    case 'invoice':
      asset = getMockInvoice(config, relatedAssets);
      break;
    case 'receipt':
      asset = getMockReceipt();
      break;
    case 'paper_receipt':
      asset = getMockPaperReceipt();
      break;
    case 'hotel_folio':
      asset = getMockHotelFolio();
      break;
    case 'airline_receipt':
      asset = getMockAirlineReceipt();
      break;
    default:
      asset = getMockInvoice();
  }
  // Stamp Logo.dev URLs onto vendor/store/airline/hotel/provider so test-mode
  // (ramptest.com path) renders end-to-end identically to real generations.
  return stampAssetLogos(type, asset);
}

const STATUS_MESSAGES: Record<AssetType, string[]> = {
  quote: ['Researching vendor details...', 'Building line items...', 'Calculating pricing...', 'Finalizing quote...'],
  contract: ['Setting up contract terms...', 'Defining service scope...', 'Adding legal provisions...', 'Finalizing contract...'],
  invoice: ['Setting up invoice details...', 'Building line items...', 'Calculating totals...', 'Adding payment terms...'],
  receipt: ['Generating receipt...', 'Adding transaction details...', 'Finalizing receipt...'],
  paper_receipt: ['Generating thermal receipt...', 'Adding store details...', 'Finalizing receipt...'],
  hotel_folio: ['Building hotel folio...', 'Adding room charges...', 'Calculating taxes...', 'Finalizing folio...'],
  airline_receipt: ['Generating flight receipt...', 'Adding flight details...', 'Calculating fare...', 'Finalizing receipt...'],
};

export function getMockStatusMessages(type: AssetType): string[] {
  return STATUS_MESSAGES[type] || ['Generating...', 'Finalizing...'];
}
