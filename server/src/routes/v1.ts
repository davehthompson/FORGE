import { Router, Request, Response } from 'express';
import {
  generateAssetContent,
  generateAssetContentStreaming,
  generateQuickReceiptContent,
  formatErrorResponse,
} from '../services/claude.js';
import { enrichCompanyFromDomain } from '../services/enrichment.js';
import { trackGeneration } from '../services/analytics.js';
import { generateInvoiceSplits } from '../utils/invoiceSplits.js';
import {
  GENERATE_TYPES,
  RECEIPT_TYPES,
  BUNDLE_ASSETS,
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
  InvoiceData,
  InvoiceConfig,
  RelatedAssetContext,
} from '../types.js';

export const v1Router = Router();

// ---------------------------------------------------------------------------
// v1 is a JSON-only API.
//
// As of the chromium-removal pass, server-side PDF/JPG rendering no longer
// exists. v1 endpoints return the structured AssetData (or a bundle of
// AssetData) and any consumer that wants a visual file is expected to render
// it client-side (the dashboard does this via services/capture.ts).
// ---------------------------------------------------------------------------

function noopStatus(_status: string): void {}

function collectErrors(errors: (string | null)[]): string[] {
  return errors.filter((e): e is string => e !== null);
}

// ---------------------------------------------------------------------------
// POST /generate  —  single asset (invoice, quote, or contract)
// ---------------------------------------------------------------------------

v1Router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { type, domain, spendingCategory, currency = 'USD', lineItemCount } = req.body;

    const errors = collectErrors([
      validateEnum(type, GENERATE_TYPES, 'type'),
      validateEnum(domain, ['__any__'], 'domain'),
      validateEnum(spendingCategory, ['__any__'], 'spendingCategory'),
      validateEnumOptional(currency, CURRENCIES, 'currency'),
    ]);

    if (!domain || typeof domain !== 'string') {
      errors.push('"domain" is required and must be a string');
    }
    if (!spendingCategory || typeof spendingCategory !== 'string') {
      errors.push('"spendingCategory" is required and must be a string');
    }
    if (lineItemCount !== undefined) {
      const n = Number(lineItemCount);
      if (!Number.isInteger(n) || n < 1 || n > 10) {
        errors.push('"lineItemCount" must be an integer between 1 and 10');
      }
    }
    const realErrors = errors.filter((e) => !e.includes('__any__'));

    if (realErrors.length > 0) {
      return res.status(400).json({ success: false, error: realErrors.join('; ') });
    }

    const company = await enrichCompanyFromDomain(domain);
    const data = await generateAssetContent(
      type as AssetType,
      company,
      spendingCategory,
      currency,
      lineItemCount,
    );

    res.json({
      success: true,
      type,
      currency,
      company: { name: company.name, domain: company.domain },
      data,
    });

    trackGeneration({
      assetType: type,
      spendingCategory,
      companyName: company.name,
      companyDomain: company.domain,
      currency,
      flowType: 'standard',
      apiService: req.serviceName,
      userEmail: req.userEmail,
    });
  } catch (error) {
    console.error('[v1/generate] error:', error);
    const { status, body } = formatErrorResponse(error);
    res.status(status).json(body);
  }
});

// ---------------------------------------------------------------------------
// POST /bundle  —  connected document set (quote + contract + N invoices)
// ---------------------------------------------------------------------------

interface BundlePayload {
  quote?: QuoteData;
  contract?: ContractData;
  invoices: InvoiceData[];
}

v1Router.post('/bundle', async (req: Request, res: Response) => {
  try {
    const {
      domain,
      spendingCategory,
      assets,
      invoiceCount = 2,
      currency = 'USD',
      lineItemCount,
    } = req.body;

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
    if (lineItemCount !== undefined) {
      const n = Number(lineItemCount);
      if (!Number.isInteger(n) || n < 1 || n > 10) {
        errors.push('"lineItemCount" must be an integer between 1 and 10');
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors.join('; ') });
    }

    const wantQuote = assets.includes('quote');
    const wantContract = assets.includes('contract');

    const company: CompanyProfile = await enrichCompanyFromDomain(domain);

    const bundle: BundlePayload = { invoices: [] };
    let quoteData: QuoteData | undefined;
    let contractData: ContractData | undefined;

    if (wantQuote) {
      const data = await generateAssetContent('quote', company, spendingCategory, currency, lineItemCount);
      quoteData = data as QuoteData;
      bundle.quote = quoteData;

      trackGeneration({
        assetType: 'quote',
        spendingCategory,
        companyName: company.name,
        companyDomain: company.domain,
        currency,
        flowType: 'connected',
        apiService: req.serviceName,
        userEmail: req.userEmail,
      });
    }

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
        lineItemCount,
      );
      contractData = data as ContractData;
      bundle.contract = contractData;

      trackGeneration({
        assetType: 'contract',
        spendingCategory,
        companyName: company.name,
        companyDomain: company.domain,
        currency,
        flowType: 'connected',
        apiService: req.serviceName,
        userEmail: req.userEmail,
      });
    }

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
        lineItemCount,
      );

      bundle.invoices.push(data as InvoiceData);
      previousInvoicedAmount += targetSubtotal;

      trackGeneration({
        assetType: 'invoice',
        spendingCategory,
        companyName: company.name,
        companyDomain: company.domain,
        currency,
        flowType: 'connected',
        apiService: req.serviceName,
        userEmail: req.userEmail,
      });
    }

    res.json({
      success: true,
      currency,
      company: { name: company.name, domain: company.domain },
      data: bundle,
    });
  } catch (error) {
    console.error('[v1/bundle] error:', error);
    if (!res.headersSent) {
      const { status, body } = formatErrorResponse(error);
      res.status(status).json(body);
    }
  }
});

// ---------------------------------------------------------------------------
// POST /receipt  —  quick receipt from natural language prompt
// ---------------------------------------------------------------------------

v1Router.post('/receipt', async (req: Request, res: Response) => {
  try {
    const { prompt, receiptType, currency = 'USD' } = req.body;

    const errors = collectErrors([
      validateEnum(receiptType, RECEIPT_TYPES, 'receiptType'),
      validateEnumOptional(currency, CURRENCIES, 'currency'),
    ]);

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      errors.push('"prompt" is required and must be a non-empty string');
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors.join('; ') });
    }

    const data = await generateQuickReceiptContent(prompt, receiptType, currency, noopStatus);

    res.json({
      success: true,
      type: receiptType,
      currency,
      data: data as AssetData,
    });

    trackGeneration({
      assetType: receiptType,
      spendingCategory: '',
      companyName: '',
      companyDomain: '',
      currency,
      flowType: 'quick_receipt',
      apiService: req.serviceName,
      userEmail: req.userEmail,
    });
  } catch (error) {
    console.error('[v1/receipt] error:', error);
    const { status, body } = formatErrorResponse(error);
    res.status(status).json(body);
  }
});
