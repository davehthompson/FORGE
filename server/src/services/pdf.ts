import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { AssetType, AssetData, InvoiceData, ReceiptData, PaperReceiptData, QuoteData, ContractData, HotelFolioData, AirlineReceiptData } from '../types.js';

// Logo API key for logo.dev
const LOGO_API_KEY = 'pk_AxloykzTSi-S1pEaFbM7Lg';

// Metadata constants for AI-generated content
const AI_METADATA = {
  author: 'FORGE - AI Generated Demo Asset',
  creator: 'FORGE (File Output for Ramp Generated Examples)',
  producer: 'FORGE by Ramp - AI Generated Content',
  keywords: ['AI Generated', 'Demo Asset', 'FORGE', 'Synthetic Data', 'Not Real'],
  subject: 'AI-generated demo document for testing purposes. This is not a real document.',
};

// Asset type display names for titles
const ASSET_TYPE_NAMES: Record<AssetType, string> = {
  invoice: 'Invoice',
  receipt: 'Receipt',
  quote: 'Quote',
  contract: 'Contract',
  paper_receipt: 'Paper Receipt',
  hotel_folio: 'Hotel Folio',
  airline_receipt: 'Airline Receipt',
};

// Currency symbols and locales
const CURRENCY_INFO: Record<string, { symbol: string; locale: string }> = {
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '€', locale: 'de-DE' },
  GBP: { symbol: '£', locale: 'en-GB' },
  JPY: { symbol: '¥', locale: 'ja-JP' },
  CAD: { symbol: 'CA$', locale: 'en-CA' },
  AUD: { symbol: 'A$', locale: 'en-AU' },
  CHF: { symbol: 'CHF', locale: 'de-CH' },
  CNY: { symbol: '¥', locale: 'zh-CN' },
  INR: { symbol: '₹', locale: 'en-IN' },
  MXN: { symbol: 'MX$', locale: 'es-MX' },
  BRL: { symbol: 'R$', locale: 'pt-BR' },
  KRW: { symbol: '₩', locale: 'ko-KR' },
  SGD: { symbol: 'S$', locale: 'en-SG' },
  HKD: { symbol: 'HK$', locale: 'zh-HK' },
  SEK: { symbol: 'kr', locale: 'sv-SE' },
  NOK: { symbol: 'kr', locale: 'nb-NO' },
  DKK: { symbol: 'kr', locale: 'da-DK' },
  NZD: { symbol: 'NZ$', locale: 'en-NZ' },
  ZAR: { symbol: 'R', locale: 'en-ZA' },
  AED: { symbol: 'د.إ', locale: 'ar-AE' },
  SAR: { symbol: '﷼', locale: 'ar-SA' },
  ILS: { symbol: '₪', locale: 'he-IL' },
  PLN: { symbol: 'zł', locale: 'pl-PL' },
  THB: { symbol: '฿', locale: 'th-TH' },
  PHP: { symbol: '₱', locale: 'en-PH' },
};

function getLogoUrl(domain: string, size: number = 64): string {
  return `https://img.logo.dev/${domain}?token=${LOGO_API_KEY}&size=${size}&format=png`;
}

const CHROMIUM_PACK_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/chromium-pack.tar`
  : 'https://github.com/Sparticuz/chromium/releases/download/v141.0.0/chromium-v141.0.0-pack.tar';

let cachedExecutablePath: string | null = null;
let downloadPromise: Promise<string> | null = null;

async function getChromiumPath(): Promise<string> {
  if (cachedExecutablePath) return cachedExecutablePath;

  if (!downloadPromise) {
    downloadPromise = chromium
      .executablePath(CHROMIUM_PACK_URL)
      .then((path) => {
        cachedExecutablePath = path;
        return path;
      })
      .catch((error) => {
        downloadPromise = null;
        throw error;
      });
  }

  return downloadPromise;
}

async function launchBrowser() {
  const isLocal = !process.env.VERCEL;

  if (isLocal) {
    return puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
    });
  }

  const executablePath = await getChromiumPath();

  return puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: true,
  });
}

export async function generatePdf(type: AssetType, data: AssetData, currency: string = 'USD', primaryColor?: string): Promise<Buffer> {
  const html = generateHtml(type, data, currency, primaryColor);
  
  const browser = await launchBrowser();
  
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    const pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });
    
    // Add AI-generated metadata to the PDF
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    // Get document identifier for title
    const docId = getDocumentIdentifier(type, data);
    const typeName = ASSET_TYPE_NAMES[type] || type;
    
    pdfDoc.setTitle(`${typeName} - ${docId} (AI Generated Demo)`);
    pdfDoc.setAuthor(AI_METADATA.author);
    pdfDoc.setSubject(AI_METADATA.subject);
    pdfDoc.setKeywords(AI_METADATA.keywords);
    pdfDoc.setCreator(AI_METADATA.creator);
    pdfDoc.setProducer(AI_METADATA.producer);
    pdfDoc.setCreationDate(new Date());
    pdfDoc.setModificationDate(new Date());
    
    // Add custom metadata to indicate AI generation
    const infoDict = pdfDoc.context.trailerInfo.Info;
    if (infoDict) {
      pdfDoc.context.obj({
        AIGenerated: 'true',
        GeneratedBy: 'FORGE',
        Disclaimer: 'This document was generated by AI for demo purposes only. It is not a real document.',
      });
    }
    
    const modifiedPdfBytes = await pdfDoc.save();
    return Buffer.from(modifiedPdfBytes);
  } finally {
    await browser.close();
  }
}

// Helper to get document identifier for metadata
function getDocumentIdentifier(type: AssetType, data: AssetData): string {
  switch (type) {
    case 'invoice':
      return (data as InvoiceData).invoiceNumber || 'Unknown';
    case 'receipt':
      return (data as ReceiptData).receiptNumber || 'Unknown';
    case 'quote':
      return (data as QuoteData).quoteNumber || 'Unknown';
    case 'contract':
      return (data as ContractData).contractNumber || 'Unknown';
    case 'paper_receipt':
      return (data as any).receiptNumber || 'Unknown';
    case 'hotel_folio':
      return (data as HotelFolioData).folioNumber || 'Unknown';
    case 'airline_receipt':
      return (data as AirlineReceiptData).confirmationCode || 'Unknown';
    default:
      return 'Unknown';
  }
}

export async function generateJpg(type: AssetType, data: AssetData, currency: string = 'USD', primaryColor?: string): Promise<Buffer> {
  const html = generateHtml(type, data, currency, primaryColor);
  
  const browser = await launchBrowser();
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123 }); // A4 at 96 DPI
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    const screenshot = await page.screenshot({
      type: 'jpeg',
      quality: 95,
      fullPage: true,
    });
    
    // Get document identifier for metadata
    const docId = getDocumentIdentifier(type, data);
    const typeName = ASSET_TYPE_NAMES[type] || type;
    
    // Add EXIF metadata using sharp to indicate AI generation
    const imageWithMetadata = await sharp(screenshot)
      .withExifMerge({
        IFD0: {
          Copyright: 'AI Generated Demo Asset - FORGE by Ramp - Not a real document',
          ImageDescription: `${typeName} ${docId} - AI Generated Demo Asset. This is synthetic data created by FORGE for testing purposes. NOT A REAL DOCUMENT.`,
          Artist: AI_METADATA.author,
          Software: AI_METADATA.creator,
          Make: 'FORGE',
          Model: 'AI Generated',
        },
      })
      .jpeg({ quality: 95 })
      .toBuffer();
    
    return imageWithMetadata;
  } finally {
    await browser.close();
  }
}

// Format currency with proper symbol and locale
function formatCurrencyAmount(amount: number, currency: string = 'USD'): string {
  const info = CURRENCY_INFO[currency] || CURRENCY_INFO['USD'];
  const formatted = amount.toLocaleString(info.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${info.symbol}${formatted}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [61, 61, 61];
  return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function getLighterHex(rgb: [number, number, number], amount: number = 0.92): string {
  const lighten = (c: number) => Math.round(c + (255 - c) * amount);
  return rgbToHex(lighten(rgb[0]), lighten(rgb[1]), lighten(rgb[2]));
}

function getRgba(rgb: [number, number, number], opacity: number): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity})`;
}

function generateHtml(type: AssetType, data: AssetData, currency: string = 'USD', primaryColor?: string): string {
  // Helper to format currency with the correct symbol
  const formatCurrency = (amount: number): string => formatCurrencyAmount(amount, currency);
  
  // Derive accent colors from vendor logo color (matching client-side logic)
  const accentRgb = primaryColor ? hexToRgb(primaryColor) : null;
  const accentColor = primaryColor || '#3D3D3D';
  const accentBgColor = accentRgb ? getLighterHex(accentRgb, 0.92) : '#F4F3EF';
  const accentBorderColor = accentRgb ? getRgba(accentRgb, 0.3) : '#E0DDD8';

  // Ramp brand colors
  const colors = {
    slate: '#3D3D3D',
    sand: '#F4F3EF',
    stone: '#E0DDD8',
    sage: '#787868',
    gray600: '#787878',
    spring: '#6F8BCC',
    solar: '#E4F222',
    rust: '#924F35',
    white: '#FFFFFF',
    accent: accentColor,
    accentBg: accentBgColor,
    accentBorder: accentBorderColor,
  };

  const styles = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
      
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: ${colors.slate};
        background: ${colors.white};
        line-height: 1.5;
        width: 794px;
        min-height: 1123px;
        padding: 48px;
      }
      
      /* Header */
      .header { 
        display: flex; 
        justify-content: space-between; 
        align-items: flex-start; 
        margin-bottom: 40px; 
      }
      .header-left {
        display: flex;
        align-items: flex-start;
        gap: 16px;
      }
      .vendor-logo {
        width: 64px;
        height: 64px;
        object-fit: contain;
        border-radius: 8px;
        border: 2px solid ${colors.accentBorder};
      }
      .vendor-name { 
        font-size: 24px; 
        font-weight: 700; 
        color: ${colors.accent};
        margin-bottom: 4px;
      }
      .vendor-details {
        font-size: 14px;
        color: ${colors.gray600};
        line-height: 1.6;
      }
      .document-info { 
        text-align: right; 
      }
      .document-title { 
        font-size: 24px; 
        font-weight: 700; 
        color: ${colors.accent};
        margin-bottom: 4px;
      }
      .document-meta { 
        color: ${colors.gray600}; 
        font-size: 14px;
        margin-top: 4px; 
      }
      .document-ref {
        font-size: 12px;
        color: ${colors.accent};
        margin-top: 8px;
      }
      
      /* Parties / Bill To */
      .section-label { 
        font-size: 12px; 
        text-transform: uppercase; 
        letter-spacing: 0.05em;
        color: ${colors.accent}; 
        margin-bottom: 8px; 
        font-weight: 600; 
      }
      .party-name { 
        font-weight: 700; 
        font-size: 16px; 
        margin-bottom: 4px;
        color: ${colors.slate};
      }
      .party-details { 
        color: ${colors.gray600}; 
        font-size: 14px;
        line-height: 1.6;
      }
      .bill-to {
        margin-bottom: 32px;
      }
      .parties { 
        display: flex; 
        gap: 40px; 
        margin-bottom: 30px; 
      }
      .party { 
        flex: 1; 
      }
      
      /* Table */
      table { 
        width: 100%; 
        border-collapse: collapse; 
        margin-bottom: 32px; 
      }
      th { 
        background: ${colors.accentBg}; 
        padding: 12px; 
        text-align: left; 
        font-size: 12px; 
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: ${colors.accent}; 
        font-weight: 600; 
      }
      th.text-right { text-align: right; }
      td { 
        padding: 12px; 
        border-bottom: 1px solid ${colors.accentBorder};
        color: ${colors.slate};
        font-size: 14px;
      }
      td.text-right { text-align: right; }
      
      /* Totals */
      .totals-container {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 32px;
      }
      .totals { 
        width: 288px; 
      }
      .totals-row { 
        display: flex; 
        justify-content: space-between; 
        padding: 8px 0; 
        border-bottom: 1px solid ${colors.accentBorder}; 
      }
      .totals-row .label { color: ${colors.gray600}; }
      .totals-row .value { color: ${colors.slate}; }
      .totals-row.total { 
        font-weight: 700; 
        font-size: 18px; 
        border-bottom: none; 
        border-top: 2px solid ${colors.accent}; 
        margin-top: 8px; 
        padding-top: 12px; 
      }
      .totals-row.total .label,
      .totals-row.total .value { color: ${colors.slate}; }
      .totals-row.discount .value { color: ${colors.rust}; }
      
      /* Info Boxes */
      .info-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }
      .info-box { 
        padding: 16px; 
        background: ${colors.accentBg}; 
        border-radius: 8px;
        border: 1px solid ${colors.accentBorder};
      }
      .info-box .label {
        font-size: 12px; 
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: ${colors.accent}; 
        margin-bottom: 8px; 
        font-weight: 600;
      }
      .info-box p {
        font-size: 14px;
        color: ${colors.slate};
        margin-top: 4px;
      }
      .info-box .detail-label {
        color: ${colors.gray600};
      }
      .info-box .mono {
        font-family: 'Courier New', monospace;
      }
      
      /* Contract specific */
      .contract-section {
        margin-bottom: 24px;
      }
      .terms-list { 
        list-style: none; 
      }
      .terms-list li { 
        padding: 8px 0; 
        border-bottom: 1px solid ${colors.accentBorder};
        font-size: 14px;
      }
      .terms-list li:last-child { 
        border-bottom: none; 
      }
      .signatures { 
        display: flex; 
        gap: 40px; 
        margin-top: 48px; 
      }
      .signature-block { 
        flex: 1; 
      }
      .signature-line { 
        border-bottom: 1px solid ${colors.accent}; 
        height: 48px; 
        margin-bottom: 8px; 
      }
      .signature-name { 
        font-weight: 600;
        color: ${colors.slate};
      }
      .signature-title { 
        color: ${colors.gray600}; 
        font-size: 14px; 
      }
      
      /* Badge */
      .badge { 
        display: inline-block; 
        background: ${colors.solar}; 
        color: ${colors.slate}; 
        padding: 4px 12px; 
        border-radius: 4px; 
        font-size: 12px; 
        font-weight: 600; 
      }
    </style>
  `;

  switch (type) {
    case 'invoice':
      return generateInvoiceHtml(data as InvoiceData, styles, formatCurrency);
    case 'receipt':
      return generateReceiptHtml(data as ReceiptData, styles, formatCurrency);
    case 'quote':
      return generateQuoteHtml(data as QuoteData, styles, formatCurrency);
    case 'contract':
      return generateContractHtml(data as ContractData, styles, formatCurrency);
    case 'hotel_folio':
      return generateHotelFolioHtml(data as HotelFolioData, styles, formatCurrency, colors);
    case 'airline_receipt':
      return generateAirlineReceiptHtml(data as AirlineReceiptData, styles, formatCurrency, colors);
    case 'paper_receipt':
      return generatePaperReceiptHtml(data as PaperReceiptData, styles, formatCurrency);
    default:
      throw new Error(`Unknown asset type: ${type}`);
  }
}

function generateInvoiceHtml(data: InvoiceData, styles: string, formatCurrency: (amount: number) => string): string {
  const logoUrl = data.vendor.domain ? getLogoUrl(data.vendor.domain, 64) : '';
  
  return `
    <!DOCTYPE html>
    <html>
    <head>${styles}</head>
    <body>
      <div class="header">
        <div class="header-left">
          ${logoUrl ? `<img src="${logoUrl}" class="vendor-logo" onerror="this.style.display='none'" />` : ''}
          <div>
            <div class="vendor-name">${data.vendor.name}</div>
            <div class="vendor-details">
              ${data.vendor.address}<br>
              ${data.vendor.email}<br>
              ${data.vendor.phone}
            </div>
          </div>
        </div>
        <div class="document-info">
          <div class="document-title">INVOICE</div>
          <div class="document-meta">${data.invoiceNumber}</div>
          <div class="document-meta">Date: ${data.date}</div>
          <div class="document-meta">Due: ${data.dueDate}</div>
          ${data.quoteReference ? `<div class="document-ref">Quote Ref: ${data.quoteReference}</div>` : ''}
          ${data.contractReference ? `<div class="document-ref">Contract Ref: ${data.contractReference}</div>` : ''}
        </div>
      </div>
      
      <div class="bill-to">
        <div class="section-label">Bill To</div>
        <div class="party-name">${data.client.name}</div>
        <div class="party-details">
          ${data.client.address}<br>
          ${data.client.email}
        </div>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="text-right">Qty</th>
            <th class="text-right">Unit Price</th>
            <th class="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${data.lineItems.map(item => `
            <tr>
              <td>${item.description}</td>
              <td class="text-right">${item.quantity}</td>
              <td class="text-right">${formatCurrency(item.unitPrice)}</td>
              <td class="text-right">${formatCurrency(item.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <div class="totals-container">
        <div class="totals">
          <div class="totals-row">
            <span class="label">Subtotal</span>
            <span class="value">${formatCurrency(data.subtotal)}</span>
          </div>
          ${data.taxes?.length ? data.taxes.map((t: any) => `
          <div class="totals-row">
            <span class="label">${t.name}${t.rate ? ` (${(t.rate * 100).toFixed(1)}%)` : ''}</span>
            <span class="value">${formatCurrency(t.amount)}</span>
          </div>`).join('') : `
          <div class="totals-row">
            <span class="label">Tax</span>
            <span class="value">${formatCurrency(data.tax)}</span>
          </div>`}
          <div class="totals-row total">
            <span class="label">Total Due</span>
            <span class="value">${formatCurrency(data.total)}</span>
          </div>
        </div>
      </div>
      
      <div class="info-grid">
        <div class="info-box">
          <div class="label">Payment Terms</div>
          <p>${data.paymentTerms}</p>
          ${data.notes ? `<p style="margin-top: 8px;">${data.notes}</p>` : ''}
        </div>
        ${data.remitTo ? `
          <div class="info-box">
            <div class="label">Remit Payment To (ACH)</div>
            <p><span class="detail-label">Bank:</span> ${data.remitTo.bankName}</p>
            <p><span class="detail-label">Account Name:</span> ${data.remitTo.accountName}</p>
            <p><span class="detail-label">Routing:</span> <span class="mono">${data.remitTo.routingNumber}</span></p>
            <p><span class="detail-label">Account:</span> <span class="mono">${data.remitTo.accountNumber}</span></p>
          </div>
        ` : ''}
      </div>
    </body>
    </html>
  `;
}

function generateReceiptHtml(data: ReceiptData, styles: string, formatCurrency: (amount: number) => string): string {
  const vendor = data.vendor || { name: '', domain: '', address: '' };
  const logoUrl = vendor.domain ? getLogoUrl(vendor.domain, 64) : '';
  
  return `
    <!DOCTYPE html>
    <html>
    <head>${styles}</head>
    <body>
      <div class="header">
        <div class="header-left">
          ${logoUrl ? `<img src="${logoUrl}" class="vendor-logo" onerror="this.style.display='none'" />` : ''}
          <div>
            <div class="vendor-name">${vendor.name}</div>
            <div class="vendor-details">${vendor.address}</div>
          </div>
        </div>
        <div class="document-info">
          <div class="document-title">RECEIPT</div>
          <div class="document-meta">${data.receiptNumber}</div>
          <div class="document-meta">${data.date}</div>
        </div>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th class="text-right">Qty</th>
            <th class="text-right">Price</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.map(item => `
            <tr>
              <td>${item.description}</td>
              <td class="text-right">${item.quantity}</td>
              <td class="text-right">${formatCurrency(item.quantity * item.price)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <div class="totals-container">
        <div class="totals">
          <div class="totals-row">
            <span class="label">Subtotal</span>
            <span class="value">${formatCurrency(data.subtotal)}</span>
          </div>
          ${data.taxes?.length ? data.taxes.map((t: any) => `
          <div class="totals-row">
            <span class="label">${t.name}${t.rate ? ` (${(t.rate * 100).toFixed(1)}%)` : ''}</span>
            <span class="value">${formatCurrency(t.amount)}</span>
          </div>`).join('') : `
          <div class="totals-row">
            <span class="label">Tax</span>
            <span class="value">${formatCurrency(data.tax)}</span>
          </div>`}
          ${data.tip ? `
          <div class="totals-row">
            <span class="label">Tip</span>
            <span class="value">${formatCurrency(data.tip)}</span>
          </div>
          ` : ''}
          <div class="totals-row total">
            <span class="label">Total</span>
            <span class="value">${formatCurrency(data.total)}</span>
          </div>
        </div>
      </div>
      
      <div class="info-box" style="max-width: 300px;">
        <div class="label">Payment Method</div>
        <p>${data.paymentMethod}${data.cardLast4 ? ` ending in ${data.cardLast4}` : ''}</p>
      </div>
    </body>
    </html>
  `;
}

function generatePaperReceiptHtml(data: PaperReceiptData, _styles: string, formatCurrency: (amount: number) => string): string {
  const formatPrice = (amount: number) => amount.toFixed(2);

  const barcodeHtml = Array.from({ length: 50 }, (_, i) => {
    const w = Math.random() > 0.5 ? 2 : 1;
    const bg = i % 2 === 0 ? '#000' : '#fff';
    return `<div style="width:${w}px;height:40px;background:${bg}"></div>`;
  }).join('');

  const paymentIcon = (() => {
    switch (data.payment?.method) {
      case 'cash': return '&#x1F4B5;';
      case 'gift_card': return '&#x1F381;';
      case 'mobile': return '&#x1F4F1;';
      default: return '&#x1F4B3;';
    }
  })();

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Courier+Prime&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Courier Prime', 'Courier New', monospace;
          font-size: 12px;
          color: #000;
          width: 320px;
          padding: 24px 16px;
          background: #fff;
          background-image:
            linear-gradient(90deg, transparent 0%, transparent 50%, rgba(0,0,0,0.02) 50%, rgba(0,0,0,0.02) 100%),
            linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px);
          background-size: 4px 4px, 100% 2px;
        }
        .center { text-align: center; }
        .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        .divider { border-top: 1px dashed #999; margin: 10px 0; }
        .bold { font-weight: bold; }
        .small { font-size: 10px; color: #666; }
        .total-row { font-size: 14px; font-weight: bold; border-top: 1px solid #ccc; padding-top: 4px; margin-top: 4px; }
        .barcode { display: flex; justify-content: center; margin: 16px 0 4px; }
      </style>
    </head>
    <body>
      <div class="center" style="margin-bottom:16px">
        <div style="font-size:16px;font-weight:bold;letter-spacing:2px;text-transform:uppercase">${data.store.name}</div>
        ${data.store.storeNumber ? `<div class="small">Store #${data.store.storeNumber}</div>` : ''}
        <div style="font-size:11px;margin-top:4px;line-height:1.5">
          ${data.store.address}<br/>
          ${data.store.city}, ${data.store.state} ${data.store.zip}<br/>
          ${data.store.phone}
        </div>
      </div>

      <div class="divider"></div>

      <div style="margin-bottom:10px">
        <div class="row"><span>DATE:</span><span>${data.date}</span></div>
        <div class="row"><span>TIME:</span><span>${data.time}</span></div>
        <div class="row"><span>TRANS#:</span><span>${data.transactionId}</span></div>
        ${data.cashier ? `<div class="row"><span>CASHIER:</span><span>${data.cashier}</span></div>` : ''}
        ${data.register ? `<div class="row"><span>REG:</span><span>${data.register}</span></div>` : ''}
      </div>

      <div class="divider"></div>

      <div style="margin-bottom:10px">
        ${data.items.map(item => `
          <div>
            <div class="row">
              <span style="flex:1;padding-right:8px;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.name}</span>
              <span class="bold">${formatPrice(item.total)}</span>
            </div>
            ${item.quantity > 1 ? `<div class="small" style="padding-left:8px">${item.quantity} @ ${formatPrice(item.unitPrice)}</div>` : ''}
            ${item.sku ? `<div class="small" style="padding-left:8px;font-size:9px;color:#999">SKU: ${item.sku}</div>` : ''}
            ${item.discount && item.discount > 0 ? `<div class="small" style="padding-left:8px">DISCOUNT: -${formatPrice(item.discount)}</div>` : ''}
          </div>
        `).join('')}
      </div>

      <div class="divider"></div>

      <div style="margin-bottom:10px">
        <div class="row"><span>SUBTOTAL:</span><span>${formatPrice(data.subtotal)}</span></div>
        ${data.taxes?.length ? data.taxes.map((t: any) => `<div class="row"><span>${t.name.toUpperCase()} (${(t.rate * 100).toFixed(2)}%):</span><span>${formatPrice(t.amount)}</span></div>`).join('\n        ') : `<div class="row"><span>TAX (${(data.taxRate * 100).toFixed(2)}%):</span><span>${formatPrice(data.taxAmount)}</span></div>`}
        ${data.tip && data.tip > 0 ? `<div class="row"><span>TIP:</span><span>${formatPrice(data.tip)}</span></div>` : ''}
        ${data.savings && data.savings > 0 ? `<div class="row small"><span>*** YOU SAVED ***</span><span>-${formatPrice(data.savings)}</span></div>` : ''}
        <div class="row total-row"><span>TOTAL:</span><span>${formatCurrency(data.total)}</span></div>
      </div>

      <div style="margin-bottom:10px">
        <div class="row" style="align-items:center">
          <span>${paymentIcon} ${(data.payment?.method || 'card').replace('_', ' ').toUpperCase()}${data.payment?.cardType ? ` (${data.payment.cardType})` : ''}</span>
          <span>${formatCurrency(data.total)}</span>
        </div>
        ${data.payment?.cardLast4 ? `<div class="small" style="padding-left:16px">Card: ****${data.payment.cardLast4}</div>` : ''}
        ${data.payment?.approvalCode ? `<div class="small" style="padding-left:16px">Approval: ${data.payment.approvalCode}</div>` : ''}
        ${data.payment?.method === 'cash' && data.payment?.amountTendered ? `
          <div class="row"><span>CASH TENDERED:</span><span>${formatCurrency(data.payment.amountTendered)}</span></div>
          ${data.payment?.change !== undefined ? `<div class="row bold"><span>CHANGE DUE:</span><span>${formatCurrency(data.payment.change)}</span></div>` : ''}
        ` : ''}
      </div>

      ${data.loyaltyPoints !== undefined ? `
        <div class="divider"></div>
        <div class="center bold" style="padding:8px 0">REWARDS POINTS EARNED: ${data.loyaltyPoints}</div>
      ` : ''}

      <div class="barcode">${barcodeHtml}</div>
      <div class="center small" style="letter-spacing:2px">${data.barcode || data.transactionId}</div>

      ${data.footer && data.footer.length > 0 ? `
        <div class="center" style="margin-top:16px">
          ${data.footer.map(line => `<div class="small">${line}</div>`).join('')}
        </div>
      ` : ''}

      <div class="center" style="margin-top:16px;font-size:9px;color:#999">RECEIPT# ${data.receiptNumber}</div>
    </body>
    </html>
  `;
}

function generateQuoteHtml(data: QuoteData, styles: string, formatCurrency: (amount: number) => string): string {
  const logoUrl = data.vendor.domain ? getLogoUrl(data.vendor.domain, 64) : '';
  
  return `
    <!DOCTYPE html>
    <html>
    <head>${styles}</head>
    <body>
      <div class="header">
        <div class="header-left">
          ${logoUrl ? `<img src="${logoUrl}" class="vendor-logo" onerror="this.style.display='none'" />` : ''}
          <div>
            <div class="vendor-name">${data.vendor.name}</div>
            <div class="vendor-details">
              ${data.vendor.address}<br>
              ${data.vendor.email}<br>
              ${data.vendor.phone}
            </div>
          </div>
        </div>
        <div class="document-info">
          <div class="document-title">QUOTE</div>
          <div class="document-meta">${data.quoteNumber}</div>
          <div class="document-meta">Date: ${data.date}</div>
          <div style="margin-top: 8px;"><span class="badge">Valid until ${data.validUntil}</span></div>
        </div>
      </div>
      
      <div class="bill-to">
        <div class="section-label">Prepared For</div>
        <div class="party-name">${data.client.name}</div>
        <div class="party-details">
          ${data.client.address}<br>
          ${data.client.email}
        </div>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="text-right">Qty</th>
            <th class="text-right">Unit Price</th>
            <th class="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.map(item => `
            <tr>
              <td>${item.description}</td>
              <td class="text-right">${item.quantity}</td>
              <td class="text-right">${formatCurrency(item.unitPrice)}</td>
              <td class="text-right">${formatCurrency(item.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <div class="totals-container">
        <div class="totals">
          <div class="totals-row">
            <span class="label">Subtotal</span>
            <span class="value">${formatCurrency(data.subtotal)}</span>
          </div>
          ${data.discount ? `
            <div class="totals-row discount">
              <span class="label">Discount</span>
              <span class="value">-${formatCurrency(data.discount)}</span>
            </div>
          ` : ''}
          <div class="totals-row total">
            <span class="label">Total</span>
            <span class="value">${formatCurrency(data.total)}</span>
          </div>
        </div>
      </div>
      
      <div class="info-box">
        <div class="label">Terms & Conditions</div>
        <p>${data.terms}</p>
        ${data.notes ? `<p style="margin-top: 8px;">${data.notes}</p>` : ''}
      </div>
    </body>
    </html>
  `;
}

function generateContractHtml(data: ContractData, styles: string, formatCurrency: (amount: number) => string): string {
  const logoUrl = data.parties.provider.domain ? getLogoUrl(data.parties.provider.domain, 64) : '';
  
  return `
    <!DOCTYPE html>
    <html>
    <head>${styles}</head>
    <body>
      <div class="header">
        <div class="header-left">
          ${logoUrl ? `<img src="${logoUrl}" class="vendor-logo" onerror="this.style.display='none'" />` : ''}
          <div>
            <div class="document-title">SERVICE AGREEMENT</div>
          </div>
        </div>
        <div class="document-info">
          <div class="document-meta">${data.contractNumber}</div>
          <div class="document-meta">Date: ${data.date}</div>
          ${data.quoteReference ? `<div class="document-ref">Based on Quote: ${data.quoteReference}</div>` : ''}
        </div>
      </div>
      
      <div class="parties">
        <div class="party">
          <div class="section-label">Service Provider</div>
          <div class="party-name">${data.parties.provider.name}</div>
          <div class="party-details">
            ${data.parties.provider.address}<br>
            Representative: ${data.parties.provider.representative}
          </div>
        </div>
        <div class="party">
          <div class="section-label">Client</div>
          <div class="party-name">${data.parties.client.name}</div>
          <div class="party-details">
            ${data.parties.client.address}<br>
            Representative: ${data.parties.client.representative}
          </div>
        </div>
      </div>
      
      <div class="contract-section">
        <div class="section-label">Contract Period</div>
        <p style="margin-top: 8px;"><strong>Effective Date:</strong> ${data.effectiveDate}</p>
        <p><strong>Expiration Date:</strong> ${data.expirationDate}</p>
      </div>
      
      <div class="contract-section">
        <div class="section-label">Services</div>
        <ul class="terms-list">
          ${data.services.map(service => `<li>${service}</li>`).join('')}
        </ul>
      </div>
      
      <div class="contract-section">
        <div class="section-label">Terms & Conditions</div>
        <ul class="terms-list">
          ${data.terms.map(term => `<li>${term}</li>`).join('')}
        </ul>
      </div>
      
      <div class="contract-section">
        <div class="section-label">Compensation</div>
        <p style="margin-top: 8px;"><strong>Total Contract Value:</strong> ${formatCurrency(data.totalValue)}</p>
        <p><strong>Payment Schedule:</strong> ${data.paymentSchedule}</p>
      </div>
      
      <div class="signatures">
        <div class="signature-block">
          <div class="section-label">Provider Signature</div>
          <div class="signature-line"></div>
          <div class="signature-name">${data.signatures.provider.name}</div>
          <div class="signature-title">${data.signatures.provider.title}</div>
        </div>
        <div class="signature-block">
          <div class="section-label">Client Signature</div>
          <div class="signature-line"></div>
          <div class="signature-name">${data.signatures.client.name || '___________________'}</div>
          <div class="signature-title">${data.signatures.client.title}</div>
        </div>
      </div>
    </body>
    </html>
  `;
}

function generateHotelFolioHtml(data: HotelFolioData, styles: string, formatCurrency: (amount: number) => string, colors: Record<string, string>): string {
  const logoUrl = data.hotel.domain ? getLogoUrl(data.hotel.domain, 64) : '';
  
  // Group charges by category
  const roomCharges = data.charges.filter(c => c.category === 'Room');
  const incidentalCharges = data.charges.filter(c => c.category !== 'Room');
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      ${styles}
      <style>
        .folio-header { 
          display: flex; 
          justify-content: space-between; 
          padding-bottom: 20px; 
          border-bottom: 3px solid ${colors.accent}; 
          margin-bottom: 24px; 
        }
        .hotel-info { display: flex; gap: 16px; align-items: flex-start; }
        .hotel-logo { width: 64px; height: 64px; object-fit: contain; }
        .hotel-name { font-size: 24px; font-weight: bold; color: ${colors.accent}; }
        .hotel-brand { font-size: 12px; color: #787868; }
        .hotel-details { font-size: 12px; color: #3D3D3D; margin-top: 8px; }
        .folio-title { font-size: 20px; font-weight: bold; color: ${colors.accent}; text-align: right; }
        .folio-meta { font-size: 12px; color: #3D3D3D; margin-top: 4px; text-align: right; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
        .info-box { background: ${colors.accentBg}; padding: 16px; border-radius: 8px; border: 1px solid ${colors.accentBorder}; }
        .info-box-title { font-size: 11px; font-weight: 600; color: ${colors.accent}; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
        .guest-name { font-weight: 600; color: #3D3D3D; }
        .guest-email { font-size: 12px; color: #787868; }
        .loyalty-badge { display: inline-block; font-size: 10px; padding: 2px 8px; background: ${colors.accent}; color: white; border-radius: 12px; margin-top: 8px; }
        .stay-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 12px; }
        .stay-label { color: #787868; }
        .stay-value { font-weight: 600; color: #3D3D3D; }
        .charges-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px; }
        .charges-table th { background: ${colors.accentBg}; color: ${colors.accent}; font-weight: 600; padding: 10px; text-align: left; }
        .charges-table th:last-child { text-align: right; }
        .charges-table td { padding: 10px; border-bottom: 1px solid ${colors.accentBorder}; }
        .charges-table td:last-child { text-align: right; }
        .category-header { background: ${colors.accentBg}; font-weight: 600; color: #3D3D3D; }
        .subtotal-row { background: ${colors.accentBg}; font-weight: 600; }
        .summary-box { width: 320px; margin-left: auto; background: ${colors.accentBg}; padding: 16px; border-radius: 8px; border: 1px solid ${colors.accentBorder}; }
        .summary-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 8px; }
        .summary-label { color: #787868; }
        .summary-value { color: #3D3D3D; }
        .summary-total { display: flex; justify-content: space-between; font-size: 18px; font-weight: bold; color: ${colors.accent}; padding-top: 12px; border-top: 2px solid ${colors.accent}; margin-top: 12px; }
        .payment-box { background: ${colors.accentBg}; padding: 16px; border-radius: 8px; border: 1px solid ${colors.accentBorder}; margin: 24px 0; display: flex; justify-content: space-between; align-items: center; }
        .payment-label { font-size: 11px; font-weight: 600; color: ${colors.accent}; text-transform: uppercase; }
        .payment-details { font-size: 12px; color: #3D3D3D; }
        .payment-amount { font-size: 20px; font-weight: bold; color: ${colors.accent}; }
        .points-earned { text-align: center; background: ${colors.accentBg}; padding: 12px; border-radius: 8px; margin: 16px 0; font-size: 12px; }
        .points-value { font-weight: 600; color: ${colors.accent}; }
        .folio-footer { text-align: center; font-size: 10px; color: #787868; padding-top: 16px; border-top: 1px solid ${colors.accentBorder}; margin-top: 24px; }
      </style>
    </head>
    <body>
      <div class="folio-header">
        <div class="hotel-info">
          ${logoUrl ? `<img src="${logoUrl}" class="hotel-logo" onerror="this.style.display='none'" />` : ''}
          <div>
            <div class="hotel-name">${data.hotel.name}</div>
            ${data.hotel.brand ? `<div class="hotel-brand">${data.hotel.brand}</div>` : ''}
            <div class="hotel-details">
              ${data.hotel.address}<br>
              ${data.hotel.city}, ${data.hotel.state} ${data.hotel.zip}<br>
              ${data.hotel.phone}
            </div>
          </div>
        </div>
        <div>
          <div class="folio-title">GUEST FOLIO</div>
          <div class="folio-meta">Folio #: ${data.folioNumber}</div>
          <div class="folio-meta">Confirmation: ${data.confirmation}</div>
        </div>
      </div>
      
      <div class="info-grid">
        <div class="info-box">
          <div class="info-box-title">Guest Information</div>
          <div class="guest-name">${data.guest.name}</div>
          ${data.guest.email ? `<div class="guest-email">${data.guest.email}</div>` : ''}
          ${data.guest.loyaltyNumber ? `<div class="loyalty-badge">${data.guest.loyaltyTier || 'Member'} #${data.guest.loyaltyNumber}</div>` : ''}
        </div>
        <div class="info-box">
          <div class="info-box-title">Stay Details</div>
          <div class="stay-grid">
            <div>
              <div class="stay-label">Check-In</div>
              <div class="stay-value">${data.checkIn}</div>
            </div>
            <div>
              <div class="stay-label">Check-Out</div>
              <div class="stay-value">${data.checkOut}</div>
            </div>
            <div>
              <div class="stay-label">Room</div>
              <div class="stay-value">${data.roomNumber}</div>
            </div>
            <div>
              <div class="stay-label">Room Type</div>
              <div class="stay-value">${data.roomType}</div>
            </div>
          </div>
        </div>
      </div>
      
      <table class="charges-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${roomCharges.length > 0 ? `
            <tr class="category-header">
              <td colspan="3">Room Charges</td>
            </tr>
            ${roomCharges.map(charge => `
              <tr>
                <td>${charge.date}</td>
                <td>${charge.description}</td>
                <td>${formatCurrency(charge.amount)}</td>
              </tr>
            `).join('')}
            <tr class="subtotal-row">
              <td colspan="2" style="text-align: right;">Room Subtotal</td>
              <td>${formatCurrency(data.roomTotal)}</td>
            </tr>
          ` : ''}
          ${incidentalCharges.length > 0 ? `
            <tr class="category-header">
              <td colspan="3">Incidentals & Other Charges</td>
            </tr>
            ${incidentalCharges.map(charge => `
              <tr>
                <td>${charge.date}</td>
                <td>${charge.description}</td>
                <td>${formatCurrency(charge.amount)}</td>
              </tr>
            `).join('')}
            <tr class="subtotal-row">
              <td colspan="2" style="text-align: right;">Incidentals Subtotal</td>
              <td>${formatCurrency(data.incidentalsTotal)}</td>
            </tr>
          ` : ''}
        </tbody>
      </table>
      
      <div class="summary-box">
        <div class="summary-row">
          <span class="summary-label">Room Total (${data.nights} nights)</span>
          <span class="summary-value">${formatCurrency(data.roomTotal)}</span>
        </div>
        ${data.incidentalsTotal > 0 ? `
          <div class="summary-row">
            <span class="summary-label">Incidentals</span>
            <span class="summary-value">${formatCurrency(data.incidentalsTotal)}</span>
          </div>
        ` : ''}
        ${data.taxes.map(tax => `
          <div class="summary-row">
            <span class="summary-label">${tax.name}${tax.rate ? ` (${(tax.rate * 100).toFixed(1)}%)` : ''}</span>
            <span class="summary-value">${formatCurrency(tax.amount)}</span>
          </div>
        `).join('')}
        <div class="summary-row" style="font-weight: 600;">
          <span>Tax Total</span>
          <span>${formatCurrency(data.taxTotal)}</span>
        </div>
        <div class="summary-total">
          <span>TOTAL</span>
          <span>${formatCurrency(data.total)}</span>
        </div>
      </div>
      
      <div class="payment-box">
        <div>
          <div class="payment-label">Payment Received</div>
          <div class="payment-details">
            ${data.payment.method}${data.payment.cardType ? ` - ${data.payment.cardType}` : ''}${data.payment.cardLast4 ? ` ending in ${data.payment.cardLast4}` : ''}<br>
            Processed on ${data.payment.date}
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 10px; color: #787868;">Amount Paid</div>
          <div class="payment-amount">${formatCurrency(data.total)}</div>
        </div>
      </div>
      
      ${data.pointsEarned ? `
        <div class="points-earned">
          <span class="points-value">${data.pointsEarned.toLocaleString()} points</span> earned on this stay
        </div>
      ` : ''}
      
      <div class="folio-footer">
        Thank you for staying with ${data.hotel.name}<br>
        Questions about this folio? Contact us at ${data.hotel.phone}${data.hotel.email ? ` or ${data.hotel.email}` : ''}
      </div>
    </body>
    </html>
  `;
}

function generateAirlineReceiptHtml(data: AirlineReceiptData, styles: string, formatCurrency: (amount: number) => string, colors: Record<string, string>): string {
  const logoUrl = data.airline.domain ? getLogoUrl(data.airline.domain, 64) : '';
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      ${styles}
      <style>
        .airline-header { 
          background: ${colors.accent}; 
          padding: 16px 32px; 
          display: flex; 
          justify-content: space-between; 
          align-items: center;
          margin: -48px -48px 32px -48px;
        }
        .airline-logo-section { display: flex; align-items: center; gap: 12px; }
        .airline-logo { width: 40px; height: 40px; object-fit: contain; background: white; border-radius: 4px; padding: 4px; }
        .airline-name { color: white; font-size: 20px; font-weight: bold; }
        .receipt-label { color: rgba(255,255,255,0.8); font-size: 12px; }
        .confirmation-banner { 
          text-align: center; 
          padding-bottom: 24px; 
          border-bottom: 2px solid ${colors.accentBorder}; 
          margin-bottom: 24px; 
        }
        .trip-badge { 
          display: inline-flex; 
          align-items: center; 
          gap: 8px; 
          background: ${colors.accentBg}; 
          padding: 8px 16px; 
          border-radius: 20px; 
          font-weight: 600; 
          color: ${colors.accent}; 
          font-size: 12px;
          margin-bottom: 16px;
        }
        .confirmation-title { font-size: 28px; font-weight: bold; color: #3D3D3D; }
        .confirmation-code { color: ${colors.accent}; }
        .ticket-number { color: #787868; font-size: 12px; margin-top: 4px; }
        .passenger-box { 
          background: ${colors.accentBg}; 
          padding: 16px; 
          border-radius: 8px; 
          display: flex; 
          gap: 16px; 
          margin-bottom: 24px; 
        }
        .passenger-icon { font-size: 20px; }
        .passenger-name { font-weight: 600; color: #3D3D3D; }
        .passenger-ff { font-size: 12px; color: #787868; }
        .section-title { 
          font-size: 16px; 
          font-weight: 600; 
          color: ${colors.accent}; 
          display: flex; 
          align-items: center; 
          gap: 8px; 
          margin-bottom: 16px; 
        }
        .flight-card { 
          border: 1px solid ${colors.accentBorder}; 
          border-radius: 8px; 
          padding: 20px; 
          margin-bottom: 16px; 
          background: white; 
        }
        .flight-header { 
          display: flex; 
          justify-content: space-between; 
          padding-bottom: 12px; 
          border-bottom: 1px solid ${colors.accentBorder}; 
          margin-bottom: 16px; 
        }
        .flight-label { font-size: 10px; color: #787868; }
        .flight-number { font-size: 16px; font-weight: bold; color: ${colors.accent}; }
        .flight-date { font-weight: 600; color: #3D3D3D; }
        .flight-route { display: flex; flex-direction: column; align-items: center; }
        .flight-route-row { display: flex; justify-content: space-between; align-items: flex-start; width: 100%; }
        .flight-endpoint { text-align: center; flex: 1; }
        .airport-code { font-size: 28px; font-weight: bold; color: #3D3D3D; }
        .airport-name { font-size: 11px; color: #787868; max-width: 140px; margin: 0 auto; }
        .terminal-info { font-size: 10px; color: #787868; margin-top: 4px; }
        .flight-arrow { 
          width: 80px; 
          text-align: center; 
          border-top: 2px dashed ${colors.accent}; 
          margin: 8px 8px 0 8px; 
          position: relative;
        }
        .arrow-icon { font-size: 16px; position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: white; }
        .duration { 
          font-size: 10px; 
          color: #787868; 
          background: ${colors.accentBg}; 
          padding: 4px 12px; 
          border-radius: 12px; 
          margin-top: 8px;
          display: inline-block;
        }
        .flight-times { display: flex; justify-content: space-between; width: 100%; margin-top: 12px; padding: 0 16px; }
        .flight-time { font-size: 16px; font-weight: 600; color: ${colors.accent}; text-align: center; flex: 1; }
        .flight-details { 
          display: flex; 
          justify-content: center; 
          gap: 40px; 
          padding-top: 12px; 
          border-top: 1px solid ${colors.accentBorder}; 
          margin-top: 16px; 
          font-size: 12px;
        }
        .detail-label { font-size: 10px; color: #787868; }
        .detail-value { font-weight: 600; color: #3D3D3D; }
        .fare-box { 
          background: ${colors.accentBg}; 
          padding: 20px; 
          border-radius: 8px; 
          margin-bottom: 24px; 
        }
        .fare-row { 
          display: flex; 
          justify-content: space-between; 
          font-size: 12px; 
          margin-bottom: 8px; 
        }
        .fare-label { color: #787868; }
        .fare-value { color: #3D3D3D; }
        .fare-total { 
          display: flex; 
          justify-content: space-between; 
          font-size: 18px; 
          font-weight: bold; 
          color: ${colors.accent}; 
          padding-top: 12px; 
          border-top: 2px solid ${colors.accent}; 
          margin-top: 12px; 
        }
        .payment-info { font-size: 12px; color: #787868; margin-top: 16px; padding-top: 16px; border-top: 1px solid ${colors.accentBorder}; }
        .miles-box { 
          text-align: center; 
          background: ${colors.accentBg}; 
          padding: 16px; 
          border-radius: 8px; 
          margin-bottom: 24px; 
        }
        .miles-label { font-size: 12px; color: #787868; }
        .miles-value { font-size: 24px; font-weight: bold; color: ${colors.accent}; }
        .airline-footer { 
          text-align: center; 
          font-size: 10px; 
          color: #787868; 
          padding-top: 16px; 
          border-top: 1px solid ${colors.accentBorder}; 
        }
      </style>
    </head>
    <body style="padding: 0;">
      <div class="airline-header">
        <div class="airline-logo-section">
          ${logoUrl ? `<img src="${logoUrl}" class="airline-logo" onerror="this.style.display='none'" />` : ''}
          <span class="airline-name">${data.airline.name}</span>
        </div>
        <span class="receipt-label">Electronic Receipt</span>
      </div>
      
      <div style="padding: 0 48px 48px 48px;">
        <div class="confirmation-banner">
          <div class="trip-badge">✈ Your Trip is Confirmed!</div>
          <div class="confirmation-title">
            Confirmation: <span class="confirmation-code">${data.confirmationCode}</span>
          </div>
          ${data.ticketNumber ? `<div class="ticket-number">Ticket Number: ${data.ticketNumber}</div>` : ''}
        </div>
        
        <div class="passenger-box">
          <span class="passenger-icon">👤</span>
          <div>
            <div class="passenger-name">${data.passenger.name}</div>
            ${data.passenger.frequentFlyer ? `
              <div class="passenger-ff">${data.airline.name} ${data.passenger.tierStatus || ''} #${data.passenger.frequentFlyer}</div>
            ` : ''}
          </div>
        </div>
        
        <div class="section-title">📅 Flight Details</div>
        
        ${data.flights.map(flight => `
          <div class="flight-card">
            <div class="flight-header">
              <div>
                <div class="flight-label">Flight</div>
                <div class="flight-number">${flight.flightNumber}</div>
              </div>
              <div style="text-align: right;">
                <div class="flight-label">Date</div>
                <div class="flight-date">${flight.date}</div>
              </div>
            </div>
            
            <div class="flight-route">
              <div class="flight-route-row">
                <div class="flight-endpoint">
                  <div class="airport-code">${flight.departure.code}</div>
                  <div class="airport-name">${flight.departure.airport}</div>
                  ${flight.departure.terminal ? `<div class="terminal-info">Terminal ${flight.departure.terminal}${flight.departure.gate ? ` · Gate ${flight.departure.gate}` : ''}</div>` : ''}
                </div>
                
                <div class="flight-arrow">
                  <span class="arrow-icon">✈</span>
                </div>
                
                <div class="flight-endpoint">
                  <div class="airport-code">${flight.arrival.code}</div>
                  <div class="airport-name">${flight.arrival.airport}</div>
                  ${flight.arrival.terminal ? `<div class="terminal-info">Terminal ${flight.arrival.terminal}</div>` : ''}
                </div>
              </div>
              
              ${flight.duration ? `<div class="duration">${flight.duration}</div>` : ''}
              
              <div class="flight-times">
                <div class="flight-time">${flight.departure.time}</div>
                <div style="flex: 1;"></div>
                <div class="flight-time">${flight.arrival.time}</div>
              </div>
            </div>
            
            <div class="flight-details">
              <div>
                <div class="detail-label">Class</div>
                <div class="detail-value">${flight.class}</div>
              </div>
              ${flight.seat ? `
                <div>
                  <div class="detail-label">Seat</div>
                  <div class="detail-value">${flight.seat}</div>
                </div>
              ` : ''}
              ${flight.aircraft ? `
                <div>
                  <div class="detail-label">Aircraft</div>
                  <div class="detail-value">${flight.aircraft}</div>
                </div>
              ` : ''}
            </div>
          </div>
        `).join('')}
        
        <div class="section-title">💳 Payment Summary</div>
        
        <div class="fare-box">
          <div class="fare-row">
            <span class="fare-label">Base Fare</span>
            <span class="fare-value">${formatCurrency(data.fareBreakdown.baseFare)}</span>
          </div>
          <div class="fare-row">
            <span class="fare-label">Taxes</span>
            <span class="fare-value">${formatCurrency(data.fareBreakdown.taxes)}</span>
          </div>
          <div class="fare-row">
            <span class="fare-label">Carrier-Imposed Fees</span>
            <span class="fare-value">${formatCurrency(data.fareBreakdown.fees)}</span>
          </div>
          ${data.fareBreakdown.baggage ? `
            <div class="fare-row">
              <span class="fare-label">Checked Baggage</span>
              <span class="fare-value">${formatCurrency(data.fareBreakdown.baggage)}</span>
            </div>
          ` : ''}
          ${data.fareBreakdown.seatSelection ? `
            <div class="fare-row">
              <span class="fare-label">Seat Selection</span>
              <span class="fare-value">${formatCurrency(data.fareBreakdown.seatSelection)}</span>
            </div>
          ` : ''}
          ${data.fareBreakdown.other ? `
            <div class="fare-row">
              <span class="fare-label">Other Services</span>
              <span class="fare-value">${formatCurrency(data.fareBreakdown.other)}</span>
            </div>
          ` : ''}
          <div class="fare-total">
            <span>Total Charged</span>
            <span>${formatCurrency(data.total)}</span>
          </div>
          
          <div class="payment-info">
            Paid with ${data.payment.method}${data.payment.cardType ? ` (${data.payment.cardType}` : ''}${data.payment.cardLast4 ? ` ending in ${data.payment.cardLast4})` : ')'}
          </div>
        </div>
        
        ${data.milesEarned ? `
          <div class="miles-box">
            <div class="miles-label">Estimated miles to be earned</div>
            <div class="miles-value">${data.milesEarned.toLocaleString()} miles</div>
          </div>
        ` : ''}
        
        <div class="airline-footer">
          This is your electronic receipt for travel on ${data.airline.name}<br>
          Booked on ${data.bookingDate}<br><br>
          For questions or changes, visit <span style="color: #0033a0;">${data.airline.domain}</span> or contact customer service
        </div>
      </div>
    </body>
    </html>
  `;
}
