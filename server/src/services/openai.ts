import OpenAI from 'openai';
import { CompanyProfile, AssetType, AssetData, RelatedAssetContext, QuoteData, ContractData, InvoiceConfig, InvoiceData, ReceiptData, HotelFolioData, AirlineReceiptData } from '../types.js';

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    throw new Error('OPENAI_API_KEY is not configured. Please add your OpenAI API key to the .env file.');
  }
  return new OpenAI({ apiKey });
}

// Round to 2 decimal places to avoid floating point drift
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Recalculate subtotals and totals from line items so exported numbers always reconcile
function recalculateTotals(type: AssetType, data: AssetData): AssetData {
  switch (type) {
    case 'invoice': {
      const d = data as InvoiceData;
      if (!d.lineItems?.length) return data;
      d.lineItems.forEach(item => {
        item.total = round2(item.quantity * item.unitPrice);
      });
      d.subtotal = round2(d.lineItems.reduce((sum, item) => sum + item.total, 0));
      d.tax = round2(d.subtotal * 0.08);
      d.total = round2(d.subtotal + d.tax);
      return d;
    }
    case 'receipt': {
      const d = data as ReceiptData;
      if (!d.items?.length) return data;
      d.subtotal = round2(d.items.reduce((sum, item) => sum + round2(item.quantity * item.price), 0));
      d.tax = round2(d.tax || d.subtotal * 0.08);
      const tip = d.tip ? round2(d.tip) : 0;
      d.total = round2(d.subtotal + d.tax + tip);
      return d;
    }
    case 'paper_receipt': {
      const d = data as any;
      if (!d.items?.length) return data;
      d.items.forEach((item: any) => {
        item.total = round2(item.quantity * item.unitPrice);
      });
      d.subtotal = round2(d.items.reduce((sum: number, item: any) => sum + item.total, 0));
      d.taxAmount = round2(d.subtotal * (d.taxRate || 0.0825));
      const tip = d.tip ? round2(d.tip) : 0;
      d.total = round2(d.subtotal + d.taxAmount + tip);
      return d;
    }
    case 'quote': {
      const d = data as QuoteData;
      if (!d.items?.length) return data;
      d.items.forEach(item => {
        item.total = round2(item.quantity * item.unitPrice);
      });
      d.subtotal = round2(d.items.reduce((sum, item) => sum + item.total, 0));
      d.total = round2(d.subtotal - (d.discount || 0));
      return d;
    }
    case 'contract': {
      // Contract services are strings; totalValue is set by GPT - no line-item recalculation needed
      return data;
    }
    case 'hotel_folio': {
      const d = data as HotelFolioData;
      if (!d.charges?.length) return data;
      d.roomTotal = round2(d.charges.filter(c => c.category === 'Room').reduce((sum, c) => sum + round2(c.amount), 0));
      d.incidentalsTotal = round2(d.charges.filter(c => c.category !== 'Room').reduce((sum, c) => sum + round2(c.amount), 0));
      d.taxTotal = d.taxes?.length ? round2(d.taxes.reduce((sum, t) => sum + round2(t.amount), 0)) : 0;
      d.total = round2(d.roomTotal + d.incidentalsTotal + d.taxTotal);
      return d;
    }
    case 'airline_receipt': {
      const d = data as AirlineReceiptData;
      if (!d.fareBreakdown) return data;
      const fb = d.fareBreakdown;
      d.total = round2(fb.baseFare + fb.taxes + fb.fees + (fb.seatSelection || 0) + (fb.baggage || 0) + (fb.other || 0));
      return d;
    }
    default:
      return data;
  }
}

// Status messages for different fields by asset type
const STATUS_TRIGGERS: Record<AssetType, Array<{ field: string; message: string }>> = {
  invoice: [
    { field: '"invoiceNumber"', message: 'Creating invoice header...' },
    { field: '"vendor"', message: 'Generating vendor information...' },
    { field: '"client"', message: 'Setting up client details...' },
    { field: '"lineItems"', message: 'Creating line items...' },
    { field: '"subtotal"', message: 'Calculating totals...' },
    { field: '"notes"', message: 'Finalizing invoice...' },
  ],
  receipt: [
    { field: '"receiptNumber"', message: 'Creating receipt header...' },
    { field: '"vendor"', message: 'Identifying store details...' },
    { field: '"items"', message: 'Adding purchased items...' },
    { field: '"subtotal"', message: 'Calculating totals...' },
    { field: '"paymentMethod"', message: 'Finalizing receipt...' },
  ],
  quote: [
    { field: '"quoteNumber"', message: 'Creating quote header...' },
    { field: '"vendor"', message: 'Preparing quote from vendor...' },
    { field: '"client"', message: 'Setting up client details...' },
    { field: '"items"', message: 'Building service items...' },
    { field: '"subtotal"', message: 'Calculating totals...' },
    { field: '"terms"', message: 'Adding terms and conditions...' },
  ],
  contract: [
    { field: '"contractNumber"', message: 'Creating contract header...' },
    { field: '"parties"', message: 'Setting up contract parties...' },
    { field: '"provider"', message: 'Configuring service provider...' },
    { field: '"services"', message: 'Defining contract services...' },
    { field: '"terms"', message: 'Adding legal terms...' },
    { field: '"signatures"', message: 'Preparing signature fields...' },
  ],
  paper_receipt: [
    { field: '"receiptNumber"', message: 'Generating receipt ID...' },
    { field: '"store"', message: 'Setting up store information...' },
    { field: '"items"', message: 'Adding purchased items...' },
    { field: '"subtotal"', message: 'Calculating totals...' },
    { field: '"payment"', message: 'Processing payment details...' },
    { field: '"barcode"', message: 'Generating barcode...' },
  ],
  hotel_folio: [
    { field: '"folioNumber"', message: 'Creating folio header...' },
    { field: '"hotel"', message: 'Setting up hotel details...' },
    { field: '"guest"', message: 'Adding guest information...' },
    { field: '"charges"', message: 'Itemizing room and charges...' },
    { field: '"taxes"', message: 'Calculating taxes...' },
    { field: '"payment"', message: 'Processing payment...' },
  ],
  airline_receipt: [
    { field: '"confirmationCode"', message: 'Creating booking confirmation...' },
    { field: '"airline"', message: 'Setting airline details...' },
    { field: '"passenger"', message: 'Adding passenger info...' },
    { field: '"flights"', message: 'Building flight itinerary...' },
    { field: '"fareBreakdown"', message: 'Calculating fare breakdown...' },
    { field: '"payment"', message: 'Finalizing payment details...' },
  ],
};

// Currency information for prompt building
const CURRENCY_INFO: Record<string, { symbol: string; name: string; locale: string }> = {
  USD: { symbol: '$', name: 'US Dollar', locale: 'en-US' },
  EUR: { symbol: '€', name: 'Euro', locale: 'de-DE' },
  GBP: { symbol: '£', name: 'British Pound', locale: 'en-GB' },
  JPY: { symbol: '¥', name: 'Japanese Yen', locale: 'ja-JP' },
  CAD: { symbol: 'CA$', name: 'Canadian Dollar', locale: 'en-CA' },
  AUD: { symbol: 'A$', name: 'Australian Dollar', locale: 'en-AU' },
  CHF: { symbol: 'CHF', name: 'Swiss Franc', locale: 'de-CH' },
  CNY: { symbol: '¥', name: 'Chinese Yuan', locale: 'zh-CN' },
  INR: { symbol: '₹', name: 'Indian Rupee', locale: 'en-IN' },
  MXN: { symbol: 'MX$', name: 'Mexican Peso', locale: 'es-MX' },
  BRL: { symbol: 'R$', name: 'Brazilian Real', locale: 'pt-BR' },
  KRW: { symbol: '₩', name: 'South Korean Won', locale: 'ko-KR' },
  SGD: { symbol: 'S$', name: 'Singapore Dollar', locale: 'en-SG' },
  HKD: { symbol: 'HK$', name: 'Hong Kong Dollar', locale: 'zh-HK' },
  SEK: { symbol: 'kr', name: 'Swedish Krona', locale: 'sv-SE' },
  NOK: { symbol: 'kr', name: 'Norwegian Krone', locale: 'nb-NO' },
  DKK: { symbol: 'kr', name: 'Danish Krone', locale: 'da-DK' },
  NZD: { symbol: 'NZ$', name: 'New Zealand Dollar', locale: 'en-NZ' },
  ZAR: { symbol: 'R', name: 'South African Rand', locale: 'en-ZA' },
  AED: { symbol: 'د.إ', name: 'UAE Dirham', locale: 'ar-AE' },
  SAR: { symbol: '﷼', name: 'Saudi Riyal', locale: 'ar-SA' },
  ILS: { symbol: '₪', name: 'Israeli Shekel', locale: 'he-IL' },
  PLN: { symbol: 'zł', name: 'Polish Zloty', locale: 'pl-PL' },
  THB: { symbol: '฿', name: 'Thai Baht', locale: 'th-TH' },
  PHP: { symbol: '₱', name: 'Philippine Peso', locale: 'en-PH' },
};

export async function generateAssetContentStreaming(
  type: AssetType,
  company: CompanyProfile,
  spendingCategory: string,
  onStatus: (status: string) => void,
  relatedAssets?: RelatedAssetContext,
  invoiceConfig?: InvoiceConfig,
  currency: string = 'USD'
): Promise<AssetData> {
  const openaiClient = getOpenAIClient();
  const currencyInfo = CURRENCY_INFO[currency] || CURRENCY_INFO['USD'];
  const prompt = relatedAssets 
    ? buildConnectedPrompt(type, company, spendingCategory, relatedAssets, invoiceConfig, currency)
    : buildPrompt(type, company, spendingCategory, currency);
  const triggers = STATUS_TRIGGERS[type];
  const triggeredFields = new Set<string>();
  let fullContent = '';

  // Send initial status
  const isConnected = relatedAssets && (relatedAssets.quote || relatedAssets.contract);
  onStatus(isConnected ? 'Linking to related documents...' : 'Initializing generation...');

  // Build system message based on whether this is connected generation
  let systemMessage = `You are a helpful assistant that generates realistic business document data. Generate JSON data for ${type} documents based on the company profile and spending category provided.

CURRENCY: All monetary values MUST be in ${currency} (${currencyInfo.name}, symbol: ${currencyInfo.symbol})
- Use appropriate pricing for this currency and region
- All numbers should be raw numbers (not strings), the symbol will be added during display

CRITICAL REQUIREMENTS:
1. All vendors MUST be REAL companies that actually exist - do NOT invent fictional company names
2. Prioritize vendors that operate in or near: ${company.location}
3. Use well-known national brands OR real regional businesses in the "${spendingCategory}" space
4. Include real addresses (use the vendor's actual headquarters or a real location near the client)
5. All line items, products, and services MUST be directly related to: "${spendingCategory}"

Examples of REAL vendors by category:
- Office Supplies: Staples, Office Depot, W.B. Mason
- Technology/Hardware: Dell, CDW, Insight Enterprises, Best Buy Business
- Software: Microsoft, Salesforce, Adobe, Atlassian
- Travel: Marriott, Hilton, United Airlines, Enterprise Rent-A-Car
- Professional Services: Deloitte, KPMG, Accenture (or real regional firms)

The data should have realistic prices and quantities appropriate for the company's size and industry.`;

  if (relatedAssets?.quote) {
    systemMessage += `

CONNECTED DOCUMENT CONTEXT:
This ${type} is part of a connected document flow. A Quote has already been created and you MUST maintain consistency:
- Use the EXACT SAME vendor name, domain, address, email, and phone from the quote
- Reference the quote number in your document
- Ensure services/line items align with what was quoted`;
  }

  if (relatedAssets?.contract) {
    systemMessage += `
- A Contract has been created based on the quote - reference the contract number as well
- The invoice should be for work performed under this contract`;
  }

  systemMessage += `

Return ONLY valid JSON, no markdown or explanation.`;

  const stream = await openaiClient.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: systemMessage,
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.7,
    max_tokens: 2000,
    stream: true,
  });

  // Process the stream
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    fullContent += content;

    // Check for field triggers
    for (const trigger of triggers) {
      if (!triggeredFields.has(trigger.field) && fullContent.includes(trigger.field)) {
        triggeredFields.add(trigger.field);
        onStatus(trigger.message);
      }
    }
  }

  // Parse the final JSON
  const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Invalid response format from OpenAI - no JSON found');
  }

  try {
    onStatus('Completing generation...');
    const parsed = JSON.parse(jsonMatch[0]) as AssetData;
    return recalculateTotals(type, parsed);
  } catch {
    throw new Error('Failed to parse JSON response from OpenAI');
  }
}

export async function generateAssetContent(
  type: AssetType,
  company: CompanyProfile,
  spendingCategory: string,
  currency: string = 'USD'
): Promise<AssetData> {
  const openaiClient = getOpenAIClient();
  const currencyInfo = CURRENCY_INFO[currency] || CURRENCY_INFO['USD'];
  
  const prompt = buildPrompt(type, company, spendingCategory, currency);
  
  const response = await openaiClient.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: `You are a helpful assistant that generates realistic business document data. Generate JSON data for ${type} documents based on the company profile and spending category provided.

CURRENCY: All monetary values MUST be in ${currency} (${currencyInfo.name}, symbol: ${currencyInfo.symbol})
- Use appropriate pricing for this currency and region
- All numbers should be raw numbers (not strings), the symbol will be added during display

CRITICAL REQUIREMENTS:
1. All vendors MUST be REAL companies that actually exist - do NOT invent fictional company names
2. Prioritize vendors that operate in or near: ${company.location}
3. Use well-known national brands OR real regional businesses in the "${spendingCategory}" space
4. Include real addresses (use the vendor's actual headquarters or a real location near the client)
5. All line items, products, and services MUST be directly related to: "${spendingCategory}"

Examples of REAL vendors by category:
- Office Supplies: Staples, Office Depot, W.B. Mason
- Technology/Hardware: Dell, CDW, Insight Enterprises, Best Buy Business
- Software: Microsoft, Salesforce, Adobe, Atlassian
- Travel: Marriott, Hilton, United Airlines, Enterprise Rent-A-Car
- Professional Services: Deloitte, KPMG, Accenture (or real regional firms)

The data should have realistic prices and quantities appropriate for the company's size and industry.

Return ONLY valid JSON, no markdown or explanation.`,
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.7,
    max_tokens: 2000,
  });
  
  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No content received from OpenAI');
  }
  
  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Invalid response format from OpenAI - no JSON found');
  }
  
  try {
    const parsed = JSON.parse(jsonMatch[0]) as AssetData;
    return recalculateTotals(type, parsed);
  } catch {
    throw new Error('Failed to parse JSON response from OpenAI');
  }
}

// Category-specific receipt instructions
const CATEGORY_INSTRUCTIONS: Record<string, string> = {
  flight: `This is an AIRLINE/FLIGHT receipt. Include these specific details:
- Airline name (e.g., United, Delta, American, Southwest, JetBlue)
- Flight number (e.g., UA1234, DL567)
- Route (origin → destination with airport codes)
- Passenger name
- Seat/class (economy, business, first)
- Confirmation/PNR code
- Breakdown: base fare, taxes & fees, baggage fees if any
- Date of travel`,

  hotel: `This is a HOTEL FOLIO/RECEIPT. Include these specific details:
- Hotel brand and property name
- Address of the property
- Guest name
- Confirmation number
- Check-in and check-out dates
- Room number and room type
- Nightly rate breakdown
- Incidentals (parking, room service, minibar, etc.)
- Resort fees and taxes
- Total nights stayed`,

  car_rental: `This is a CAR RENTAL receipt. Include these specific details:
- Rental company (Hertz, Enterprise, Avis, Budget, National)
- Pickup and return locations
- Vehicle type/class (compact, midsize, SUV, etc.)
- Rental agreement number
- Rental dates and duration
- Daily/weekly rate
- Insurance/coverage options
- Fuel charges if applicable
- Mileage (unlimited or per-mile)
- Taxes and fees breakdown`,

  rideshare: `This is a RIDESHARE/TAXI receipt. Include these specific details:
- Service provider (Uber, Lyft, taxi company)
- Trip ID/receipt number
- Pickup location (address or landmark)
- Dropoff location
- Date and time of ride
- Distance and duration
- Fare breakdown (base, distance, time, surge if any)
- Tip amount
- Driver name (first name only)
- Vehicle type if rideshare`,

  meals: `This is a RESTAURANT/MEAL receipt. Include these specific details:
- Restaurant name (real establishment)
- Address and phone
- Server name
- Table number or order number
- Itemized food and beverages with prices
- Number of guests if mentioned
- Subtotal, tax, tip/gratuity
- Tip line or included gratuity percentage
- Business meal context if mentioned`,

  coffee: `This is a COFFEE SHOP receipt. Include these specific details:
- Coffee shop name (Starbucks, Peet's, Dunkin', local shop)
- Store number/location
- Itemized drinks and food items
- Size specifications (grande, large, etc.)
- Customizations if any
- Rewards/points earned if applicable
- Order type (mobile, in-store)`,

  parking: `This is a PARKING receipt. Include these specific details:
- Parking facility name
- Address/location
- Entry and exit date/time
- Duration of stay
- Space/level number if applicable
- Rate type (hourly, daily, event)
- Rate breakdown
- Ticket/transaction number
- Validation if applicable`,

  fuel: `This is a GAS/FUEL receipt. Include these specific details:
- Gas station brand (Shell, Chevron, BP, Exxon, etc.)
- Station address
- Pump number
- Fuel type (regular, premium, diesel)
- Price per gallon/liter
- Gallons/liters purchased
- Total fuel cost
- Car wash if added
- Date and time`,

  transit: `This is a TRANSIT/RAIL receipt. Include these specific details:
- Transit provider (Amtrak, airline shuttle, metro, bus company)
- Route or line
- Ticket/confirmation number
- Departure and arrival stations
- Class of service if applicable
- Seat assignment if applicable
- Date and time of travel
- Fare type (one-way, round-trip, pass)`,

  conference: `This is a CONFERENCE/EVENT receipt. Include these specific details:
- Event/conference name
- Organizer name
- Event dates and location/venue
- Registration type (full, day pass, virtual, workshop)
- Attendee name
- Registration/confirmation number
- Early bird or promotional discounts if applicable
- Any add-ons (workshops, meals, networking events)`,

  supplies: `This is an OFFICE SUPPLIES receipt. Include these specific details:
- Store name (Staples, Office Depot, Amazon Business)
- Store number/location if physical store
- Order number
- Itemized products with SKUs
- Quantities and unit prices
- Any business discounts applied
- Shipping charges if applicable
- Rewards earned if applicable`,
};

// Quick receipt generation from user prompt
export async function generateQuickReceiptContent(
  prompt: string,
  receiptType: 'receipt' | 'paper_receipt' | 'hotel_folio' | 'airline_receipt',
  currency: string,
  onStatus: (status: string) => void
): Promise<AssetData> {
  const openaiClient = getOpenAIClient();
  const currencyInfo = CURRENCY_INFO[currency] || CURRENCY_INFO['USD'];
  
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const timeStr = today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  
  // Calculate dates for hotel/flight scenarios
  const checkInDate = new Date(today);
  checkInDate.setDate(checkInDate.getDate() - 3);
  const checkInStr = checkInDate.toISOString().split('T')[0];
  
  const bookingDate = new Date(today);
  bookingDate.setDate(bookingDate.getDate() - 14);
  const bookingDateStr = bookingDate.toISOString().split('T')[0];
  
  const flightDate = new Date(today);
  flightDate.setDate(flightDate.getDate() + 7);
  const flightDateStr = flightDate.toISOString().split('T')[0];
  
  // Extract category from prompt if present
  const categoryMatch = prompt.match(/\[Category:\s*(\w+)\]/i);
  const category = categoryMatch ? categoryMatch[1].toLowerCase() : null;
  const cleanPrompt = prompt.replace(/\[Category:\s*\w+\]\s*/i, '').trim();
  
  const categoryInstructions = category && CATEGORY_INSTRUCTIONS[category] 
    ? `\n\nSPECIFIC RECEIPT TYPE:\n${CATEGORY_INSTRUCTIONS[category]}\n`
    : '';

  onStatus('Analyzing your description...');

  // Build system message based on receipt type
  let systemMessage: string;
  let triggers: Array<{ field: string; message: string }>;

  if (receiptType === 'hotel_folio') {
    systemMessage = `You are a helpful assistant that generates realistic hotel folio/checkout receipt data from user descriptions.

CURRENCY: All monetary values MUST be in ${currency} (${currencyInfo.name}, symbol: ${currencyInfo.symbol})
- Use appropriate pricing for this currency and hotel tier
- All numbers should be raw numbers (not strings)

Generate a realistic HOTEL FOLIO based on the user's description.
Extract all relevant details: hotel name, dates, room type, charges, incidentals, payment method, etc.
If details are not specified, make reasonable assumptions based on context.
Make the folio look AUTHENTIC with proper hotel formatting and details.

JSON Structure for hotel_folio:
{
  "folioNumber": "string (format: FOL-XXXXXXXX)",
  "hotel": {
    "name": "string (REAL hotel property name from description, e.g., 'Marriott Marquis San Francisco')",
    "brand": "string (optional - hotel chain name like 'Marriott' or 'Hilton')",
    "domain": "string (hotel's website domain, e.g., 'marriott.com')",
    "address": "string (hotel street address)",
    "city": "string",
    "state": "string (2-letter code)",
    "zip": "string",
    "phone": "string",
    "email": "string (optional)"
  },
  "guest": {
    "name": "string (full name from description or generate realistic name)",
    "email": "string (corporate email)",
    "loyaltyNumber": "string (optional)",
    "loyaltyTier": "string (optional, like 'Gold', 'Platinum')"
  },
  "confirmation": "string (confirmation number like ABC123456)",
  "checkIn": "string (YYYY-MM-DD - use from description or reasonable date)",
  "checkOut": "string (YYYY-MM-DD - use from description or ${todayStr})",
  "roomNumber": "string (like '1204')",
  "roomType": "string (like 'King Deluxe', 'Executive Suite')",
  "nights": number,
  "charges": [
    {
      "category": "Room" | "Parking" | "Food & Beverage" | "Minibar" | "Phone" | "Laundry" | "Business Center" | "Other",
      "description": "string (detailed charge description)",
      "date": "string (YYYY-MM-DD)",
      "amount": number
    }
  ],
  "roomTotal": number,
  "incidentalsTotal": number,
  "taxes": [
    { "name": "string (e.g., 'State Tax', 'City Occupancy Tax')", "rate": number (optional), "amount": number }
  ],
  "taxTotal": number,
  "total": number,
  "payment": {
    "method": "Credit Card",
    "cardType": "string (VISA, Mastercard, Amex)",
    "cardLast4": "string",
    "date": "${todayStr}"
  },
  "pointsEarned": number (optional)
}

Return ONLY valid JSON, no markdown or explanation.`;
    triggers = [
      { field: '"hotel"', message: 'Setting up hotel details...' },
      { field: '"guest"', message: 'Adding guest information...' },
      { field: '"charges"', message: 'Itemizing room and charges...' },
      { field: '"taxes"', message: 'Calculating taxes...' },
      { field: '"payment"', message: 'Processing payment...' },
    ];
  } else if (receiptType === 'airline_receipt') {
    systemMessage = `You are a helpful assistant that generates realistic airline email receipt/booking confirmation data from user descriptions.

CURRENCY: All monetary values MUST be in ${currency} (${currencyInfo.name}, symbol: ${currencyInfo.symbol})
- Use appropriate pricing for this currency and fare class
- All numbers should be raw numbers (not strings)

Generate a realistic AIRLINE EMAIL RECEIPT based on the user's description.
Extract all relevant details: airline, flight numbers, routes, dates, passenger name, fare, payment method, etc.
If details are not specified, make reasonable assumptions based on context.
Make the receipt look AUTHENTIC like a real airline booking confirmation email.

JSON Structure for airline_receipt:
{
  "confirmationCode": "string (6 character alphanumeric like 'ABC123' - use from description if given)",
  "ticketNumber": "string (optional, 13-digit ticket number)",
  "airline": {
    "name": "string (REAL airline name from description)",
    "domain": "string (airline website domain, e.g., 'united.com', 'delta.com')"
  },
  "passenger": {
    "name": "string (full name in LASTNAME/FIRSTNAME format)",
    "frequentFlyer": "string (optional)",
    "tierStatus": "string (optional, like 'Silver', 'Gold', '1K')"
  },
  "bookingDate": "${bookingDateStr}",
  "flights": [
    {
      "flightNumber": "string (like 'UA1234', 'DL567')",
      "date": "string (YYYY-MM-DD - flight date from description or ${flightDateStr})",
      "departure": {
        "airport": "string (full airport name)",
        "code": "string (3-letter IATA code)",
        "time": "string (HH:MM AM/PM)",
        "terminal": "string (optional)",
        "gate": "string (optional)"
      },
      "arrival": {
        "airport": "string (full airport name)",
        "code": "string (3-letter IATA code)",
        "time": "string (HH:MM AM/PM)",
        "terminal": "string (optional)"
      },
      "class": "string (Economy, Premium Economy, Business, First)",
      "seat": "string (optional, like '12A')",
      "aircraft": "string (optional, like 'Boeing 737-800')",
      "duration": "string (optional, like '5h 30m')"
    }
  ],
  "fareBreakdown": {
    "baseFare": number,
    "taxes": number,
    "fees": number,
    "baggage": number (optional - if checked bag mentioned),
    "seatSelection": number (optional),
    "other": number (optional)
  },
  "total": number,
  "payment": {
    "method": "Credit Card",
    "cardType": "string (VISA, Mastercard, Amex)",
    "cardLast4": "string"
  },
  "milesEarned": number (optional)
}

Return ONLY valid JSON, no markdown or explanation.`;
    triggers = [
      { field: '"confirmationCode"', message: 'Creating booking confirmation...' },
      { field: '"airline"', message: 'Setting airline details...' },
      { field: '"passenger"', message: 'Adding passenger info...' },
      { field: '"flights"', message: 'Building flight itinerary...' },
      { field: '"fareBreakdown"', message: 'Calculating fare breakdown...' },
      { field: '"payment"', message: 'Finalizing payment details...' },
    ];
  } else if (receiptType === 'paper_receipt') {
    systemMessage = `You are a helpful assistant that generates realistic thermal paper receipt data from user descriptions.

CURRENCY: All monetary values MUST be in ${currency} (${currencyInfo.name}, symbol: ${currencyInfo.symbol})
- Use appropriate pricing for this currency
- All numbers should be raw numbers (not strings)
${categoryInstructions}
Generate a realistic THERMAL PAPER RECEIPT (POS-style) based on the user's description.
Extract all relevant details from their description: store name, items, prices, payment method, location, etc.
If details are not specified, make reasonable assumptions based on context.
Make the receipt look AUTHENTIC for this type of expense with appropriate formatting and details.

JSON Structure for paper_receipt:
{
  "receiptNumber": "string (format: XXXXX-XXXXX-XXXXX or category-appropriate format)",
  "transactionId": "string (short ID like TXN12345 or confirmation code)",
  "date": "${todayStr}",
  "time": "${timeStr}",
  "store": {
    "name": "string (REAL company/store name from description or inferred)",
    "domain": "string (company's website domain)",
    "address": "string (street address - infer from location if given)",
    "city": "string",
    "state": "string (2-letter)",
    "zip": "string",
    "phone": "string",
    "storeNumber": "string (optional - store/location number)"
  },
  "cashier": "string (first name, employee ID, or agent name)",
  "register": "string (like 'REG 03', 'Terminal 1', 'Kiosk A')",
  "items": [
    {
      "name": "string (descriptive line item name)",
      "sku": "string (optional - SKU, flight number, confirmation, etc.)",
      "quantity": number,
      "unitPrice": number,
      "total": number,
      "discount": number (optional)
    }
  ],
  "subtotal": number,
  "taxRate": number (decimal like 0.0825),
  "taxAmount": number,
  "tip": number (optional - INCLUDE FOR RESTAURANT/MEAL/DINING receipts, calculate ~18-20% gratuity or use mentioned amount),
  "total": number (subtotal + taxAmount + tip if applicable),
  "payment": {
    "method": "credit" | "debit" | "cash" | "mobile",
    "cardType": "string (VISA, Mastercard, AMEX, etc. - only if card)",
    "cardLast4": "string (only if card - use from description or generate)",
    "approvalCode": "string (6 chars, only if card)",
    "amountTendered": number (only if cash),
    "change": number (only if cash)
  },
  "savings": number (optional - discounts applied),
  "loyaltyPoints": number (optional - points/miles earned),
  "barcode": "string (confirmation code or transaction ID)",
  "footer": ["array of 1-3 appropriate footer messages for this receipt type"]
}

Return ONLY valid JSON, no markdown or explanation.`;
    triggers = [
      { field: '"store"', message: 'Setting up store information...' },
      { field: '"items"', message: 'Adding items...' },
      { field: '"subtotal"', message: 'Calculating totals...' },
      { field: '"payment"', message: 'Processing payment details...' },
      { field: '"barcode"', message: 'Generating barcode...' },
    ];
  } else {
    // receipt (digital)
    systemMessage = `You are a helpful assistant that generates realistic digital receipt data from user descriptions.

CURRENCY: All monetary values MUST be in ${currency} (${currencyInfo.name}, symbol: ${currencyInfo.symbol})
- Use appropriate pricing for this currency
- All numbers should be raw numbers (not strings)
${categoryInstructions}
Generate a realistic DIGITAL RECEIPT based on the user's description.
Extract all relevant details: vendor/store name, items, prices, payment method, etc.
If details are not specified, make reasonable assumptions based on context.
Make the receipt look AUTHENTIC for this type of expense with appropriate formatting and details.

JSON Structure for receipt:
{
  "receiptNumber": "string (format varies by type: RCP-XXXXX, confirmation codes, PNR, etc.)",
  "date": "${todayStr}",
  "vendor": {
    "name": "string (REAL company/vendor name from description)",
    "domain": "string (vendor's website domain)",
    "address": "string (full address - headquarters or service location)"
  },
  "items": [
    {
      "description": "string (detailed line item - flight routes, room nights, services, products)",
      "quantity": number,
      "price": number (unit price)
    }
  ],
  "subtotal": number,
  "tax": number,
  "tip": number (optional - INCLUDE FOR RESTAURANT/MEAL/DINING receipts, calculate ~18-20% gratuity or use mentioned amount),
  "total": number (subtotal + tax + tip if applicable),
  "paymentMethod": "string (from description - 'Corporate Card', 'Visa', 'Amex', etc.)",
  "cardLast4": "string (if mentioned, otherwise generate 4 digits)"
}

Return ONLY valid JSON, no markdown or explanation.`;
    triggers = [
      { field: '"vendor"', message: 'Identifying vendor...' },
      { field: '"items"', message: 'Adding items...' },
      { field: '"subtotal"', message: 'Calculating totals...' },
      { field: '"paymentMethod"', message: 'Finalizing receipt...' },
    ];
  }

  const triggeredFields = new Set<string>();
  let fullContent = '';

  const categoryLabel = category ? ` (${category.replace('_', ' ')})` : '';
  const receiptTypeLabel = receiptType === 'hotel_folio' ? 'hotel folio' 
    : receiptType === 'airline_receipt' ? 'airline receipt'
    : receiptType === 'paper_receipt' ? 'thermal paper receipt'
    : 'digital receipt';
    
  const stream = await openaiClient.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: `Generate a ${receiptTypeLabel}${categoryLabel} based on this description:\n\n${cleanPrompt}` },
    ],
    temperature: 0.7,
    max_tokens: 3000,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    fullContent += content;

    // Check for field triggers
    for (const trigger of triggers) {
      if (!triggeredFields.has(trigger.field) && fullContent.includes(trigger.field)) {
        triggeredFields.add(trigger.field);
        onStatus(trigger.message);
      }
    }
  }

  onStatus('Finalizing receipt...');

  // Parse the complete JSON
  const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Invalid response format from OpenAI - no JSON found');
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as AssetData;
    return recalculateTotals(receiptType || 'receipt', parsed);
  } catch {
    throw new Error('Failed to parse JSON response from OpenAI');
  }
}

function buildPrompt(type: AssetType, company: CompanyProfile, spendingCategory: string, currency: string = 'USD'): string {
  // Calculate actual dates for realistic document generation
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
  
  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + 30);
  const dueDateStr = dueDate.toISOString().split('T')[0];
  
  const validUntilDate = new Date(today);
  validUntilDate.setDate(validUntilDate.getDate() + 30);
  const validUntilStr = validUntilDate.toISOString().split('T')[0];
  
  const effectiveDate = new Date(today);
  effectiveDate.setDate(effectiveDate.getDate() + 14);
  const effectiveDateStr = effectiveDate.toISOString().split('T')[0];
  
  const expirationDate = new Date(effectiveDate);
  expirationDate.setFullYear(expirationDate.getFullYear() + 1);
  const expirationDateStr = expirationDate.toISOString().split('T')[0];

  const currencyInfo = CURRENCY_INFO[currency] || CURRENCY_INFO['USD'];

  const baseInfo = `
IMPORTANT DATE CONTEXT:
- Today's actual date is: ${todayStr}
- Use this EXACT date for document dates, NOT dates from 2022 or 2023

CURRENCY: ${currency} (${currencyInfo.name}, symbol: ${currencyInfo.symbol})
- All monetary values should be appropriate for this currency
- Use pricing typical for the ${currency} region/market

COMPANY PROFILE:
- Company Name: ${company.name}
- Industry: ${company.industry}
- Employee Count: ${company.employeeCount}
- Location: ${company.location}

SELECTED SPENDING CATEGORY: ${spendingCategory}

VENDOR REQUIREMENTS:
- Use REAL companies that actually exist (no fictional names)
- Prioritize vendors with locations near ${company.location}
- Use well-known national brands or real regional businesses
- All generated content MUST be related to ${spendingCategory}
- IMPORTANT: Include the vendor's actual website domain (e.g., "dell.com", "staples.com") for logo display
`;

  switch (type) {
    case 'invoice':
      return `${baseInfo}
Generate a realistic INVOICE that ${company.name} would receive from a vendor.

CLIENT COMPANY CONTEXT:
- ${company.name} is in the ${company.industry} industry
- They are located at ${company.location}
- Company description: ${company.description}
- Use this context to make line items HIGHLY SPECIFIC to what this company would actually purchase

VENDOR INSTRUCTIONS:
- Use a REAL company that provides ${spendingCategory} products/services
- The vendor should operate in or near ${company.location} (use their real address near this location, or headquarters)
- Examples: For tech hardware use Dell, CDW, Insight; for office supplies use Staples, Office Depot; etc.

LINE ITEM REQUIREMENTS:
- Each line item description MUST be highly specific and detailed - NO generic descriptions
- Include product names, model numbers, SKUs, service periods, or specific deliverables
- Tailor items to what ${company.name} (a ${company.industry} company) would actually need
- BAD examples: "Consulting Services", "Equipment", "Supplies", "Software License"
- GOOD examples: "Dell PowerEdge R750 Server - 2x Intel Xeon Gold 6326", "Q1 2024 Network Security Monitoring - 250 endpoints", "Cisco Meraki MX84 Security Appliance w/ 3-yr License"
- Use realistic pricing for ${spendingCategory} industry

JSON Structure:
{
  "invoiceNumber": "string (format: INV-XXXXX)",
  "date": "${todayStr}",
  "dueDate": "${dueDateStr}",
  "vendor": { 
    "name": "string (REAL company name that exists)",
    "domain": "string (the vendor's actual website domain, e.g., 'dell.com', 'cdw.com')",
    "address": "string (real address near ${company.location} or vendor headquarters)",
    "email": "string (realistic email for that company)",
    "phone": "string"
  },
  "client": { 
    "name": "${company.name}",
    "address": "${company.location}",
    "email": "accounts@${company.domain}"
  },
  "lineItems": [
    { "description": "string (DETAILED specific product/service with model numbers, specs, or deliverables)", "quantity": number, "unitPrice": number, "total": number }
  ],
  "subtotal": number,
  "tax": number (calculate ~8% tax),
  "total": number,
  "paymentTerms": "Net 30",
  "remitTo": {
    "bankName": "string (a real major US bank like JPMorgan Chase, Bank of America, Wells Fargo, Citibank, etc.)",
    "accountName": "string (vendor company name)",
    "routingNumber": "string (9-digit valid ABA routing number format - use a realistic but fictional number like 021000021, 121000248, etc.)",
    "accountNumber": "string (10-12 digit account number - generate a realistic fictional number)"
  },
  "notes": "string (optional thank you note)"
}

Generate 3-5 line items with realistic pricing for a ${company.employeeCount} employee company purchasing ${spendingCategory} related items/services.`;

    case 'receipt':
      return `${baseInfo}
Generate a realistic RECEIPT for a purchase that ${company.name} would make.

CLIENT COMPANY CONTEXT:
- ${company.name} is in the ${company.industry} industry
- They are located at ${company.location}
- Company description: ${company.description}
- Use this context to select items this company would actually purchase

VENDOR INSTRUCTIONS:
- Use a REAL store or retailer that sells ${spendingCategory} items
- The store should have locations near ${company.location} (use a real store address in that area)
- Examples: For office supplies use Staples, Office Depot; for electronics use Best Buy, Micro Center; for general supplies use Costco Business, Amazon Business, etc.

ITEM REQUIREMENTS:
- Each item description MUST include the specific brand, product name, and model/SKU where applicable
- NO generic descriptions like "Printer Paper" or "USB Cable"
- GOOD examples: "HP LaserJet Pro M404n Printer", "Logitech MX Master 3S Wireless Mouse", "3M Post-it Super Sticky Notes 3x3 (12-pack)", "Hammermill Premium 24lb Copy Paper (500 sheets)"
- Use realistic retail pricing

JSON Structure:
{
  "receiptNumber": "string (format: RCP-XXXXX)",
  "date": "${todayStr}",
  "vendor": { 
    "name": "string (REAL store/retailer name that exists)",
    "domain": "string (the vendor's actual website domain, e.g., 'staples.com', 'bestbuy.com')",
    "address": "string (real store address near ${company.location})"
  },
  "items": [
    { "description": "string (SPECIFIC brand + product name + model)", "quantity": number, "price": number (unit price) }
  ],
  "subtotal": number,
  "tax": number (calculate ~8% tax),
  "total": number,
  "paymentMethod": "Corporate Card",
  "cardLast4": "string (4 digits)"
}

Generate 2-4 items. Keep the total reasonable for a single ${spendingCategory} purchase (typically under $500).`;

    case 'paper_receipt':
      return `${baseInfo}
Generate a realistic THERMAL PAPER RECEIPT (POS-style) for a retail/store purchase that someone from ${company.name} would make.

RECEIPT STYLE:
- This is a thermal printer receipt like from a grocery store, retail store, restaurant, or gas station
- Keep formatting compact and appropriate for narrow thermal paper
- Include typical POS elements: transaction ID, cashier/register info, SKUs, tax calculation, barcode

CLIENT COMPANY CONTEXT:
- ${company.name} is in the ${company.industry} industry
- They are located at ${company.location}
- Company description: ${company.description}
- Use this context to select items this company would actually purchase

STORE INSTRUCTIONS:
- Use a REAL retail store, restaurant, or service provider
- Choose stores that sell ${spendingCategory} related items or would be relevant to an employee expense
- The store should have locations near ${company.location}
- Examples: Target, Walmart, Home Depot, CVS, Starbucks, McDonald's, Shell, Costco, etc.

ITEM REQUIREMENTS:
- Use realistic short product names (like on actual receipts)
- Include SKUs for some items (6-12 character alphanumeric)
- Realistic retail pricing
- Some items can have discounts

JSON Structure:
{
  "receiptNumber": "string (format: XXXXX-XXXXX-XXXXX)",
  "transactionId": "string (shorter ID like TXN12345)",
  "date": "${todayStr}",
  "time": "string (format: HH:MM AM/PM)",
  "store": {
    "name": "string (REAL store name - can be the store brand name)",
    "domain": "string (store's website domain, e.g., 'target.com', 'starbucks.com')",
    "address": "string (street address)",
    "city": "string",
    "state": "string (2-letter)",
    "zip": "string",
    "phone": "string (store phone number)",
    "storeNumber": "string (optional, like #1234)"
  },
  "cashier": "string (first name or employee ID)",
  "register": "string (like 'REG 03' or 'Lane 5')",
  "items": [
    {
      "name": "string (short product name as on receipt)",
      "sku": "string (optional SKU/UPC)",
      "quantity": number,
      "unitPrice": number,
      "total": number,
      "discount": number (optional, discount amount if any)
    }
  ],
  "subtotal": number,
  "taxRate": number (decimal like 0.0825 for 8.25%),
  "taxAmount": number,
  "total": number,
  "payment": {
    "method": "credit" | "debit" | "cash" | "mobile",
    "cardType": "string (VISA, Mastercard, etc. - only if card payment)",
    "cardLast4": "string (only if card payment)",
    "approvalCode": "string (6 chars, only if card payment)",
    "amountTendered": number (only if cash),
    "change": number (only if cash)
  },
  "savings": number (optional, total savings from discounts),
  "loyaltyPoints": number (optional, points earned),
  "barcode": "string (unique barcode number for receipt)",
  "footer": ["string array of 1-3 typical receipt footer messages like 'Thank you!', 'Survey: www.survey.com', 'Return Policy: 30 days']"
}

Generate 3-6 items. Keep the total under $200 for a typical expense purchase.`;

    case 'quote':
      return `${baseInfo}
Generate a realistic QUOTE/PROPOSAL that ${company.name} would receive from a service provider.

CLIENT COMPANY CONTEXT:
- ${company.name} is in the ${company.industry} industry
- They are located at ${company.location}
- Company description: ${company.description}
- Use this context to propose services this company would actually need

VENDOR INSTRUCTIONS:
- Use a REAL professional services company that provides ${spendingCategory} services
- The vendor should serve the ${company.location} area (use their real office address or headquarters)
- Examples: For IT services use Accenture, Deloitte, IBM; for marketing use WPP agencies, Publicis; for legal use real law firms; etc.

LINE ITEM REQUIREMENTS:
- Each line item description MUST be highly specific and detailed - NO generic descriptions
- Include specific deliverables, scope, phases, or service tiers
- BAD examples: "Consulting Services", "Project Management", "Implementation"
- GOOD examples: "Phase 1: Discovery & Requirements Analysis - 40 hours on-site", "AWS Infrastructure Migration - 15 EC2 instances, 3 RDS databases", "Q1 2024 Digital Marketing Campaign Management - Social + PPC", "SOC 2 Type II Compliance Audit & Remediation Support"
- Use realistic professional services pricing

JSON Structure:
{
  "quoteNumber": "string (format: QTE-XXXXX)",
  "date": "${todayStr}",
  "validUntil": "${validUntilStr}",
  "vendor": { 
    "name": "string (REAL professional services company that exists)",
    "domain": "string (the vendor's actual website domain, e.g., 'accenture.com', 'deloitte.com')",
    "address": "string (real office address serving ${company.location})",
    "email": "string (realistic email for that company)",
    "phone": "string"
  },
  "client": { 
    "name": "${company.name}",
    "address": "${company.location}",
    "email": "procurement@${company.domain}"
  },
  "items": [
    { "description": "string (DETAILED service with scope, deliverables, or timeframe)", "quantity": number (hours or units), "unitPrice": number, "total": number }
  ],
  "subtotal": number,
  "discount": number (optional volume discount, can be 0),
  "total": number,
  "terms": "string (payment terms and conditions)",
  "notes": "string (scope notes or next steps)"
}

Generate 3-5 line items representing a ${spendingCategory} project or service engagement. Price appropriately for a ${company.employeeCount} employee ${company.industry} company.`;

    case 'contract':
      return `${baseInfo}
Generate a realistic SERVICE CONTRACT/AGREEMENT that ${company.name} would sign with a provider.

CLIENT COMPANY CONTEXT:
- ${company.name} is in the ${company.industry} industry
- They are located at ${company.location}
- Company description: ${company.description}
- Use this context to propose services this company would actually need

VENDOR INSTRUCTIONS:
- Use a REAL service provider company that offers ${spendingCategory} services
- The provider should have operations in or serving ${company.location} (use their real office address)
- Examples: For cloud services use AWS, Microsoft Azure, Google Cloud; for HR use ADP, Paychex; for facilities use ABM, CBRE; etc.

SERVICE REQUIREMENTS:
- Each service listed MUST be highly specific and detailed - NO generic descriptions
- Include specific tiers, SLAs, quantities, or coverage details
- BAD examples: "IT Support", "Cloud Services", "Maintenance"
- GOOD examples: "24/7 Managed IT Support - Tier 2 Helpdesk for 250 users", "AWS Reserved Instances - 10x m5.xlarge EC2, 3-year term", "HVAC Preventive Maintenance - Quarterly inspections, 12 units", "Payroll Processing - Semi-monthly, up to 500 employees + direct deposit"
- Terms should be appropriate for a ${spendingCategory} service agreement

JSON Structure:
{
  "contractNumber": "string (format: CTR-XXXXX)",
  "date": "${todayStr}",
  "effectiveDate": "${effectiveDateStr}",
  "expirationDate": "${expirationDateStr}",
  "parties": {
    "provider": { 
      "name": "string (REAL ${spendingCategory} service provider that exists)",
      "domain": "string (the provider's actual website domain, e.g., 'aws.amazon.com', 'adp.com')",
      "address": "string (real office address serving ${company.location})",
      "representative": "string (full name)"
    },
    "client": { 
      "name": "${company.name}",
      "address": "${company.location}",
      "representative": "string (full name)"
    }
  },
  "services": ["string (DETAILED specific service with scope/SLA/quantities)", ...],
  "terms": ["string (contract term 1)", "string (contract term 2)", ...],
  "totalValue": number (annual contract value for ${spendingCategory} services),
  "paymentSchedule": "string (e.g., Monthly, Quarterly)",
  "signatures": {
    "provider": { "name": "string", "title": "string" },
    "client": { "name": "string", "title": "string (appropriate for ${company.employeeCount} employee company)" }
  }
}

Generate 4-6 specific ${spendingCategory} services and 5-7 standard contract terms. Set contract value appropriate for a ${company.employeeCount} employee company's ${spendingCategory} needs.`;

    case 'hotel_folio':
      const checkInDate = new Date(today);
      checkInDate.setDate(checkInDate.getDate() - 3);
      const checkInStr = checkInDate.toISOString().split('T')[0];
      
      return `${baseInfo}
Generate a realistic HOTEL FOLIO (checkout receipt/invoice) for a business trip by someone from ${company.name}.

HOTEL FOLIO STYLE:
- This is a detailed checkout folio from a business hotel
- Include room charges, incidentals, and detailed tax breakdown
- Use a format typical of major hotel chains

CLIENT COMPANY CONTEXT:
- ${company.name} is in the ${company.industry} industry
- They are located at ${company.location}
- An employee is traveling for business purposes

HOTEL INSTRUCTIONS:
- Use a REAL hotel chain (Marriott, Hilton, Hyatt, IHG, etc.) or a real independent hotel
- The hotel should be in a realistic business travel destination
- Include the hotel brand and property name (e.g., "Marriott Marquis New York", "Hilton Chicago O'Hare")
- Use realistic room rates for the hotel tier and location

CHARGE REQUIREMENTS:
- Include multiple nights of room charges
- Add realistic incidentals: parking, room service, minibar, phone, laundry, in-room movies
- Include detailed tax breakdown (occupancy tax, city tax, state tax, resort fee if applicable)
- All charges should be realistic for a business traveler

JSON Structure:
{
  "folioNumber": "string (format: FOL-XXXXXXXX)",
  "hotel": {
    "name": "string (REAL hotel property name, e.g., 'Marriott Marquis San Francisco')",
    "brand": "string (hotel chain name like 'Marriott' or 'Hilton' - optional for independents)",
    "domain": "string (hotel's website domain, e.g., 'marriott.com', 'hilton.com')",
    "address": "string (hotel street address)",
    "city": "string",
    "state": "string (2-letter code)",
    "zip": "string",
    "phone": "string",
    "email": "string (hotel email, optional)"
  },
  "guest": {
    "name": "string (full name of employee)",
    "email": "string (corporate email at ${company.domain})",
    "loyaltyNumber": "string (optional, loyalty program number)",
    "loyaltyTier": "string (optional, like 'Gold', 'Platinum', 'Diamond')"
  },
  "confirmation": "string (confirmation number like ABC123456)",
  "checkIn": "${checkInStr}",
  "checkOut": "${todayStr}",
  "roomNumber": "string (like '1204')",
  "roomType": "string (like 'King Deluxe', 'Executive Suite', 'Standard Double')",
  "nights": number,
  "charges": [
    {
      "category": "Room" | "Parking" | "Food & Beverage" | "Minibar" | "Phone" | "Laundry" | "Business Center" | "Other",
      "description": "string (detailed charge description)",
      "date": "string (date of charge YYYY-MM-DD)",
      "amount": number
    }
  ],
  "roomTotal": number (sum of room charges only),
  "incidentalsTotal": number (sum of non-room charges),
  "taxes": [
    { "name": "string (e.g., 'State Tax', 'City Occupancy Tax', 'Tourism Fee')", "rate": number (optional, like 0.085), "amount": number }
  ],
  "taxTotal": number,
  "total": number,
  "payment": {
    "method": "Credit Card",
    "cardType": "string (VISA, Mastercard, Amex)",
    "cardLast4": "string",
    "date": "${todayStr}"
  },
  "pointsEarned": number (optional, loyalty points earned)
}

Generate a realistic 2-4 night stay with 8-15 charge line items including room, incidentals, and taxes.`;

    case 'airline_receipt':
      const bookingDate = new Date(today);
      bookingDate.setDate(bookingDate.getDate() - 14);
      const bookingDateStr = bookingDate.toISOString().split('T')[0];
      
      const flightDate = new Date(today);
      flightDate.setDate(flightDate.getDate() + 7);
      const flightDateStr = flightDate.toISOString().split('T')[0];
      
      return `${baseInfo}
Generate a realistic AIRLINE EMAIL RECEIPT for a business trip booked by someone from ${company.name}.

AIRLINE RECEIPT STYLE:
- This is an electronic booking confirmation/receipt like you'd receive via email
- Include all flight details, fare breakdown, and passenger information
- Format like a real airline booking confirmation

CLIENT COMPANY CONTEXT:
- ${company.name} is in the ${company.industry} industry
- They are located at ${company.location}
- An employee is booking business travel

AIRLINE INSTRUCTIONS:
- Use a REAL airline (United, Delta, American, Southwest, JetBlue, Alaska, etc.)
- Use realistic flight numbers for that airline
- Route should make sense for business travel from/to the company's region
- Use real airport codes and airport names

FLIGHT REQUIREMENTS:
- Can be one-way or round-trip
- Use realistic flight times and durations
- Include class of service (Economy, Premium Economy, Business, First)
- Seat assignments should be realistic for the class
- Aircraft type is optional but should be realistic if included

FARE REQUIREMENTS:
- Break down into base fare, taxes, carrier fees
- Include optional extras like baggage, seat selection if applicable
- Total should be realistic for the route and class

JSON Structure:
{
  "confirmationCode": "string (6 character alphanumeric like 'ABC123')",
  "ticketNumber": "string (optional, 13-digit ticket number like '0012345678901')",
  "airline": {
    "name": "string (REAL airline name)",
    "domain": "string (airline website domain, e.g., 'united.com', 'delta.com')"
  },
  "passenger": {
    "name": "string (full name in LASTNAME/FIRSTNAME format)",
    "frequentFlyer": "string (optional, frequent flyer number)",
    "tierStatus": "string (optional, like 'Silver', 'Gold', 'Platinum', '1K', 'Diamond')"
  },
  "bookingDate": "${bookingDateStr}",
  "flights": [
    {
      "flightNumber": "string (like 'UA1234', 'DL567')",
      "date": "${flightDateStr}",
      "departure": {
        "airport": "string (full airport name)",
        "code": "string (3-letter IATA code)",
        "time": "string (format: HH:MM AM/PM)",
        "terminal": "string (optional)",
        "gate": "string (optional)"
      },
      "arrival": {
        "airport": "string (full airport name)",
        "code": "string (3-letter IATA code)",
        "time": "string (format: HH:MM AM/PM)",
        "terminal": "string (optional)"
      },
      "class": "string (Economy, Premium Economy, Business, First)",
      "seat": "string (optional, like '12A')",
      "aircraft": "string (optional, like 'Boeing 737-800')",
      "duration": "string (optional, like '5h 30m')"
    }
  ],
  "fareBreakdown": {
    "baseFare": number,
    "taxes": number,
    "fees": number,
    "baggage": number (optional, if checked bag purchased),
    "seatSelection": number (optional, if preferred seat purchased),
    "other": number (optional, other fees)
  },
  "total": number,
  "payment": {
    "method": "Credit Card",
    "cardType": "string (VISA, Mastercard, Amex)",
    "cardLast4": "string"
  },
  "milesEarned": number (optional, frequent flyer miles to be earned)
}

Generate a realistic 1-2 flight itinerary (one-way or round-trip) with appropriate pricing for the route and class.`;

    default:
      throw new Error(`Unknown asset type: ${type}`);
  }
}

// Build prompts for connected document generation (quote -> contract -> invoice flow)
function buildConnectedPrompt(
  type: AssetType, 
  company: CompanyProfile, 
  spendingCategory: string,
  relatedAssets: RelatedAssetContext,
  invoiceConfig?: InvoiceConfig,
  currency: string = 'USD'
): string {
  // Calculate actual dates for realistic document generation
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + 30);
  const dueDateStr = dueDate.toISOString().split('T')[0];
  
  const effectiveDate = new Date(today);
  effectiveDate.setDate(effectiveDate.getDate() + 14);
  const effectiveDateStr = effectiveDate.toISOString().split('T')[0];
  
  const expirationDate = new Date(effectiveDate);
  expirationDate.setFullYear(expirationDate.getFullYear() + 1);
  const expirationDateStr = expirationDate.toISOString().split('T')[0];

  const currencyInfo = CURRENCY_INFO[currency] || CURRENCY_INFO['USD'];
  const { quote, contract } = relatedAssets;

  // Contract connected to Quote
  if (type === 'contract' && quote) {
    return `
CONNECTED DOCUMENT GENERATION - CONTRACT FROM QUOTE

The client has accepted Quote ${quote.quoteNumber}. Generate a SERVICE CONTRACT that formalizes this agreement.

QUOTE DETAILS TO REFERENCE:
- Quote Number: ${quote.quoteNumber}
- Quote Date: ${quote.date}
- Quote Total: $${quote.total.toLocaleString()}
- Vendor: ${quote.vendor.name}
- Vendor Domain: ${quote.vendor.domain}
- Vendor Address: ${quote.vendor.address}
- Vendor Email: ${quote.vendor.email}
- Vendor Phone: ${quote.vendor.phone}

QUOTED LINE ITEMS:
${quote.items.map(item => `- ${item.description}: ${item.quantity} x $${item.unitPrice} = $${item.total}`).join('\n')}

CLIENT INFORMATION:
- Client Name: ${quote.client.name}
- Client Address: ${quote.client.address}
- Client Email: ${quote.client.email}

CRITICAL REQUIREMENTS:
1. Use the EXACT SAME vendor information from the quote (name, domain, address, email, phone)
2. Services in the contract MUST align with the quoted line items
3. Contract totalValue should match or be close to the quote total: $${quote.total.toLocaleString()}
4. Include "quoteReference": "${quote.quoteNumber}" in your JSON output
5. The contract formalizes the services that were quoted

JSON Structure:
{
  "contractNumber": "string (format: CTR-XXXXX)",
  "date": "${todayStr}",
  "effectiveDate": "${effectiveDateStr}",
  "expirationDate": "${expirationDateStr}",
  "quoteReference": "${quote.quoteNumber}",
  "parties": {
    "provider": { 
      "name": "${quote.vendor.name}",
      "domain": "${quote.vendor.domain}",
      "address": "${quote.vendor.address}",
      "representative": "string (full name)"
    },
    "client": { 
      "name": "${company.name}",
      "address": "${company.location}",
      "representative": "string (full name)"
    }
  },
  "services": ["string (services derived from quoted line items)", ...],
  "terms": ["string (contract term)", ...],
  "totalValue": ${quote.total},
  "paymentSchedule": "string (e.g., Monthly, Quarterly, or as invoiced)",
  "signatures": {
    "provider": { "name": "string", "title": "string" },
    "client": { "name": "string", "title": "string" }
  }
}

Transform the quoted line items into contract service descriptions. Include 5-7 standard contract terms.`;
  }

  // Invoice connected to Quote and/or Contract
  if (type === 'invoice' && (quote || contract)) {
    const vendorInfo = quote?.vendor || (contract ? {
      name: contract.parties.provider.name,
      domain: contract.parties.provider.domain,
      address: contract.parties.provider.address,
      email: `billing@${contract.parties.provider.domain}`,
      phone: '(800) 555-0100'
    } : null);

    const referenceSection = [];
    if (quote) {
      referenceSection.push(`Quote Reference: ${quote.quoteNumber}`);
    }
    if (contract) {
      referenceSection.push(`Contract Reference: ${contract.contractNumber}`);
    }

    const totalAmount = quote?.total || contract?.totalValue || 10000;
    
    // Handle multiple invoices configuration
    let invoiceAmountInstructions = '';
    let invoiceNumberSuffix = '';
    
    if (invoiceConfig) {
      const { invoiceNumber, totalInvoices, isLast, previousInvoicedAmount, targetSubtotal, splitPercentage } = invoiceConfig;
      invoiceNumberSuffix = `-${invoiceNumber}`;
      
      const remainingBalance = totalAmount - previousInvoicedAmount;
      const label = `Payment ${invoiceNumber} of ${totalInvoices} (${splitPercentage}%)`;
      
      invoiceAmountInstructions = `
PARTIAL INVOICE INSTRUCTIONS - CRITICAL AMOUNTS:
- This is Invoice ${invoiceNumber} of ${totalInvoices} for this agreement (${splitPercentage}% of total)
- Quote/Contract Total: $${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Previously Invoiced: $${previousInvoicedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Remaining Balance: $${remainingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- **THIS INVOICE SUBTOTAL MUST BE EXACTLY: $${targetSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**
- Label this invoice as: "${label}"
- ${isLast ? 'This is the FINAL invoice - the subtotal MUST equal the exact remaining balance above' : 'Ensure line items add up to the exact subtotal specified'}
- Invoice line items should represent work completed in this phase/period

AMOUNT VERIFICATION:
- Your line item totals MUST add up to exactly $${targetSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Tax is calculated separately on top of the subtotal
- After all ${totalInvoices} invoices, the combined subtotals must equal $${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    const lineItemsSource = quote ? `
QUOTED LINE ITEMS (use these as basis for invoice):
${quote.items.map(item => `- ${item.description}: ${item.quantity} x $${item.unitPrice} = $${item.total}`).join('\n')}
` : contract ? `
CONTRACT SERVICES (invoice for these services):
${contract.services.map(service => `- ${service}`).join('\n')}
Contract Total Value: $${contract.totalValue.toLocaleString()}
` : '';

    return `
CONNECTED DOCUMENT GENERATION - INVOICE FROM ${quote && contract ? 'QUOTE & CONTRACT' : quote ? 'QUOTE' : 'CONTRACT'}

Generate an INVOICE for work performed under the existing agreement.
${invoiceAmountInstructions}

${referenceSection.length > 0 ? `DOCUMENT REFERENCES:\n${referenceSection.map(r => `- ${r}`).join('\n')}` : ''}

${quote ? `QUOTE DETAILS:
- Quote Number: ${quote.quoteNumber}
- Quote Date: ${quote.date}
- Quote Total: $${quote.total.toLocaleString()}` : ''}

${contract ? `CONTRACT DETAILS:
- Contract Number: ${contract.contractNumber}
- Contract Date: ${contract.date}
- Contract Total Value: $${contract.totalValue.toLocaleString()}
- Payment Schedule: ${contract.paymentSchedule}` : ''}

VENDOR INFORMATION (MUST USE EXACTLY):
- Vendor Name: ${vendorInfo?.name}
- Vendor Domain: ${vendorInfo?.domain}
- Vendor Address: ${vendorInfo?.address}
- Vendor Email: ${vendorInfo?.email || `billing@${vendorInfo?.domain}`}
- Vendor Phone: ${vendorInfo?.phone || '(800) 555-0100'}

CLIENT INFORMATION:
- Client Name: ${company.name}
- Client Address: ${company.location}
${lineItemsSource}

CRITICAL REQUIREMENTS:
1. Use the EXACT SAME vendor information (name, domain, address, email, phone)
2. Invoice line items MUST relate to the quoted/contracted services
3. ${invoiceConfig ? `Follow the partial invoice instructions above for amount and labeling` : 'This invoice can be for a portion or full amount'}
4. Include reference fields in your JSON output

JSON Structure:
{
  "invoiceNumber": "string (format: INV-XXXXX${invoiceNumberSuffix})",
  "date": "${todayStr}",
  "dueDate": "${dueDateStr}",
  ${quote ? `"quoteReference": "${quote.quoteNumber}",` : ''}
  ${contract ? `"contractReference": "${contract.contractNumber}",` : ''}
  "vendor": { 
    "name": "${vendorInfo?.name}",
    "domain": "${vendorInfo?.domain}",
    "address": "${vendorInfo?.address}",
    "email": "${vendorInfo?.email || `billing@${vendorInfo?.domain}`}",
    "phone": "${vendorInfo?.phone || '(800) 555-0100'}"
  },
  "client": { 
    "name": "${company.name}",
    "address": "${company.location}",
    "email": "accounts@${company.domain}"
  },
  "lineItems": [
    { "description": "string (service from quote/contract with phase/progress indicator)", "quantity": number, "unitPrice": number, "total": number }
  ],
  "subtotal": number,
  "tax": number (calculate ~8% tax),
  "total": number,
  "paymentTerms": "Net 30",
  "remitTo": {
    "bankName": "string (a real major US bank)",
    "accountName": "${vendorInfo?.name}",
    "routingNumber": "string (9-digit)",
    "accountNumber": "string (10-12 digit)"
  },
  "notes": "string (${invoiceConfig ? `mention this is invoice ${invoiceConfig.invoiceNumber} of ${invoiceConfig.totalInvoices} and reference the quote/contract` : 'reference the quote/contract in the note'})"
}

Generate 2-4 line items that represent billable work from the quoted/contracted services.`;
  }

  // Fall back to regular prompt if no connected context applies
  return buildPrompt(type, company, spendingCategory, currency);
}
