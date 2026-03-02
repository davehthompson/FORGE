import { Router, Request, Response } from 'express';
import archiver from 'archiver';
import { generateAssetContent, generateAssetContentStreaming, generateQuickReceiptContent } from '../services/openai.js';
import { generatePdf, generateJpg } from '../services/pdf.js';
import { enrichCompanyFromDomain } from '../services/enrichment.js';
import { trackGeneration } from '../services/analytics.js';
import { buildFilename } from '../utils/filename.js';
import { generateInvoiceSplits } from '../utils/invoiceSplits.js';
import {
  GENERATE_TYPES,
  RECEIPT_TYPES,
  BUNDLE_ASSETS,
  EXPORT_FORMATS,
  CURRENCIES,
  validateEnum,
  validateEnumOptional,
} from '../utils/enums.js';
import {
  AssetType,
  AssetData,
  CompanyProfile,
  QuoteData,
  ContractData,
  InvoiceConfig,
  RelatedAssetContext,
} from '../types.js';

export const v1Router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function noopStatus(_status: string): void {}

async function renderAsset(
  type: AssetType,
  data: AssetData,
  format: string,
  currency: string,
  primaryColor?: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  if (format === 'jpg') {
    const buffer = await generateJpg(type, data, currency, primaryColor);
    return { buffer, contentType: 'image/jpeg' };
  }
  const buffer = await generatePdf(type, data, currency, primaryColor);
  return { buffer, contentType: 'application/pdf' };
}

function collectErrors(errors: (string | null)[]): string[] {
  return errors.filter((e): e is string => e !== null);
}

// ---------------------------------------------------------------------------
// POST /generate  —  single asset (invoice, quote, or contract)
// ---------------------------------------------------------------------------

v1Router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { type, domain, spendingCategory, currency = 'USD', format = 'pdf' } = req.body;

    const errors = collectErrors([
      validateEnum(type, GENERATE_TYPES, 'type'),
      validateEnum(domain, ['__any__'], 'domain'),
      validateEnum(spendingCategory, ['__any__'], 'spendingCategory'),
      validateEnumOptional(currency, CURRENCIES, 'currency'),
      validateEnumOptional(format, EXPORT_FORMATS, 'format'),
    ]);

    // domain and spendingCategory are free-form — just check presence
    if (!domain || typeof domain !== 'string') {
      errors.push('"domain" is required and must be a string');
    }
    if (!spendingCategory || typeof spendingCategory !== 'string') {
      errors.push('"spendingCategory" is required and must be a string');
    }
    // Remove the __any__ false-positives
    const realErrors = errors.filter(e => !e.includes('__any__'));

    if (realErrors.length > 0) {
      return res.status(400).json({ success: false, error: realErrors.join('; ') });
    }

    const company = await enrichCompanyFromDomain(domain);
    const data = await generateAssetContent(type as AssetType, company, spendingCategory, currency);
    const ext = format === 'jpg' ? 'jpg' : 'pdf';
    const { buffer, contentType } = await renderAsset(type as AssetType, data, ext, currency);
    const filename = buildFilename(type as AssetType, data, ext);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);

    trackGeneration({
      assetType: type,
      spendingCategory,
      companyName: company.name,
      companyDomain: company.domain,
      currency,
      flowType: 'standard',
      apiService: req.serviceName,
    });
  } catch (error) {
    console.error('[v1/generate] error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate asset',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /bundle  —  connected document set (quote + contract + N invoices)
// ---------------------------------------------------------------------------

v1Router.post('/bundle', async (req: Request, res: Response) => {
  try {
    const {
      domain,
      spendingCategory,
      assets,
      invoiceCount = 2,
      currency = 'USD',
      format = 'pdf',
    } = req.body;

    // --- validation ---
    const errors: string[] = [];

    if (!domain || typeof domain !== 'string') {
      errors.push('"domain" is required and must be a string');
    }
    if (!spendingCategory || typeof spendingCategory !== 'string') {
      errors.push('"spendingCategory" is required and must be a string');
    }
    if (!Array.isArray(assets) || assets.length === 0) {
      errors.push('"assets" is required and must be a non-empty array');
    } else {
      for (const a of assets) {
        const e = validateEnum(a, BUNDLE_ASSETS, 'assets[]');
        if (e) errors.push(e);
      }
      if (!assets.includes('invoice')) {
        errors.push('"assets" must include "invoice"');
      }
    }

    const count = Number(invoiceCount);
    if (!Number.isInteger(count) || count < 1 || count > 5) {
      errors.push('"invoiceCount" must be an integer between 1 and 5');
    }

    const currErr = validateEnumOptional(currency, CURRENCIES, 'currency');
    if (currErr) errors.push(currErr);
    const fmtErr = validateEnumOptional(format, EXPORT_FORMATS, 'format');
    if (fmtErr) errors.push(fmtErr);

    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors.join('; ') });
    }

    const wantQuote = assets.includes('quote');
    const wantContract = assets.includes('contract');
    const ext = format === 'jpg' ? 'jpg' : 'pdf';

    // --- enrich company ---
    const company: CompanyProfile = await enrichCompanyFromDomain(domain);

    // --- generate in order: quote -> contract -> invoices ---
    const files: { name: string; buffer: Buffer }[] = [];
    let quoteData: QuoteData | undefined;
    let contractData: ContractData | undefined;

    // 1. Quote
    if (wantQuote) {
      const data = await generateAssetContent('quote', company, spendingCategory, currency);
      quoteData = data as QuoteData;
      const { buffer } = await renderAsset('quote', data, ext, currency);
      files.push({ name: buildFilename('quote', data, ext), buffer });

      trackGeneration({
        assetType: 'quote',
        spendingCategory,
        companyName: company.name,
        companyDomain: company.domain,
        currency,
        flowType: 'connected',
        apiService: req.serviceName,
      });
    }

    // 2. Contract (linked to quote if available)
    if (wantContract) {
      const relatedAssets: RelatedAssetContext | undefined = quoteData ? { quote: quoteData } : undefined;
      const data = await generateAssetContentStreaming(
        'contract',
        company,
        spendingCategory,
        noopStatus,
        relatedAssets,
        undefined,
        currency,
      );
      contractData = data as ContractData;
      const { buffer } = await renderAsset('contract', data, ext, currency);
      files.push({ name: buildFilename('contract', data, ext), buffer });

      trackGeneration({
        assetType: 'contract',
        spendingCategory,
        companyName: company.name,
        companyDomain: company.domain,
        currency,
        flowType: 'connected',
        apiService: req.serviceName,
      });
    }

    // 3. Invoices — split total from quote/contract
    const totalAmount = quoteData?.total || contractData?.totalValue || 10000;
    const splits = generateInvoiceSplits(count, totalAmount);
    let previousInvoicedAmount = 0;

    for (let i = 0; i < count; i++) {
      const split = splits[i];
      const isLast = i === count - 1;
      const invoiceNumber = i + 1;

      const targetSubtotal = isLast
        ? Math.round((totalAmount - previousInvoicedAmount) * 100) / 100
        : split.subtotal;

      const invoiceConfig: InvoiceConfig = {
        invoiceNumber,
        totalInvoices: count,
        totalAmount,
        targetSubtotal,
        splitPercentage: split.percentage,
        isLast,
        previousInvoicedAmount,
      };

      const relatedAssets: RelatedAssetContext = {
        quote: quoteData,
        contract: contractData,
      };

      const data = await generateAssetContentStreaming(
        'invoice',
        company,
        spendingCategory,
        noopStatus,
        relatedAssets,
        invoiceConfig,
        currency,
      );

      const { buffer } = await renderAsset('invoice', data, ext, currency);
      files.push({
        name: buildFilename('invoice', data, ext, String(invoiceNumber)),
        buffer,
      });

      previousInvoicedAmount += targetSubtotal;

      trackGeneration({
        assetType: 'invoice',
        spendingCategory,
        companyName: company.name,
        companyDomain: company.domain,
        currency,
        flowType: 'connected',
        apiService: req.serviceName,
      });
    }

    // --- zip all files and stream response ---
    const vendorName = company.name.replace(/[^a-zA-Z0-9]/g, '_');
    const today = new Date().toISOString().slice(0, 10);
    const zipFilename = `Bundle_${vendorName}_${today}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.pipe(res);

    for (const file of files) {
      archive.append(file.buffer, { name: file.name });
    }

    await archive.finalize();
  } catch (error) {
    console.error('[v1/bundle] error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate bundle',
      });
    }
  }
});

// ---------------------------------------------------------------------------
// POST /receipt  —  quick receipt from natural language prompt
// ---------------------------------------------------------------------------

v1Router.post('/receipt', async (req: Request, res: Response) => {
  try {
    const { prompt, receiptType, currency = 'USD', format = 'pdf' } = req.body;

    const errors = collectErrors([
      validateEnum(receiptType, RECEIPT_TYPES, 'receiptType'),
      validateEnumOptional(currency, CURRENCIES, 'currency'),
      validateEnumOptional(format, EXPORT_FORMATS, 'format'),
    ]);

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      errors.push('"prompt" is required and must be a non-empty string');
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors.join('; ') });
    }

    const data = await generateQuickReceiptContent(prompt, receiptType, currency, noopStatus);
    const assetType = receiptType as AssetType;
    const ext = format === 'jpg' ? 'jpg' : 'pdf';
    const { buffer, contentType } = await renderAsset(assetType, data, ext, currency);
    const filename = buildFilename(assetType, data, ext);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);

    trackGeneration({
      assetType: receiptType,
      spendingCategory: '',
      companyName: '',
      companyDomain: '',
      currency,
      flowType: 'quick_receipt',
      apiService: req.serviceName,
    });
  } catch (error) {
    console.error('[v1/receipt] error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate receipt',
    });
  }
});
