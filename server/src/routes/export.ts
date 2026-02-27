import { Router, Request, Response } from 'express';
import { generatePdf, generateJpg } from '../services/pdf.js';
import { AssetType, AssetData, InvoiceData, ReceiptData, PaperReceiptData, HotelFolioData, AirlineReceiptData, QuoteData, ContractData } from '../types.js';

export const exportRouter = Router();

interface ExportRequest {
  type: AssetType;
  data: AssetData;
  currency?: string;
  primaryColor?: string;
}

const TYPE_LABELS: Record<AssetType, string> = {
  invoice: 'Invoice',
  receipt: 'Receipt',
  paper_receipt: 'Receipt',
  hotel_folio: 'Hotel_Folio',
  airline_receipt: 'Airline_Receipt',
  quote: 'Quote',
  contract: 'Contract',
};

function sanitize(str: string): string {
  return str.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');
}

function buildFilename(type: AssetType, data: AssetData, ext: string): string {
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

  const label = TYPE_LABELS[type] || type;
  const vendorPart = vendor ? `_${sanitize(vendor)}` : '';
  const datePart = date ? `_${date}` : '';

  return `${label}${vendorPart}${datePart}.${ext}`;
}

exportRouter.post('/pdf', async (req: Request<{}, {}, ExportRequest>, res: Response) => {
  try {
    const { type, data, currency = 'USD', primaryColor } = req.body;
    
    if (!type || !data) {
      return res.status(400).json({
        success: false,
        error: 'Asset type and data are required',
      });
    }
    
    const pdf = await generatePdf(type, data, currency, primaryColor);
    const filename = buildFilename(type, data, 'pdf');
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (error) {
    console.error('PDF export error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate PDF',
    });
  }
});

exportRouter.post('/jpg', async (req: Request<{}, {}, ExportRequest>, res: Response) => {
  try {
    const { type, data, currency = 'USD', primaryColor } = req.body;
    
    if (!type || !data) {
      return res.status(400).json({
        success: false,
        error: 'Asset type and data are required',
      });
    }
    
    const jpg = await generateJpg(type, data, currency, primaryColor);
    const filename = buildFilename(type, data, 'jpg');
    
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(jpg);
  } catch (error) {
    console.error('JPG export error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate JPG',
    });
  }
});
