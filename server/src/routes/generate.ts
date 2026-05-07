import { Router, Request, Response } from 'express';
import {
  generateAssetContent,
  generateAssetContentStreaming,
  generateQuickReceiptContent,
  formatErrorResponse,
} from '../services/claude.js';
import { generateReceiptImage, AVAILABLE_SCENES } from '../services/gemini.js';
import { CompanyProfile, AssetType, RelatedAssetContext, InvoiceConfig } from '../types.js';
import { trackGeneration } from '../services/analytics.js';
import { isTestDomain, getMockAsset, getMockStatusMessages } from '../services/mockData.js';
import { openSSE } from '../utils/sse.js';

export const generateRouter = Router();

interface GenerateRequest {
  type: AssetType;
  company: CompanyProfile;
  spendingCategory: string;
  relatedAssets?: RelatedAssetContext;
  invoiceConfig?: InvoiceConfig;
  currency?: string;
  lineItemCount?: number;
}

// Standard non-streaming endpoint
generateRouter.post('/', async (req: Request<{}, {}, GenerateRequest>, res: Response) => {
  try {
    const { type, company, spendingCategory, currency = 'USD', lineItemCount } = req.body;
    
    if (!type) {
      return res.status(400).json({
        success: false,
        error: 'Asset type is required',
      });
    }
    
    if (!company) {
      return res.status(400).json({
        success: false,
        error: 'Company profile is required',
      });
    }
    
    if (!spendingCategory) {
      return res.status(400).json({
        success: false,
        error: 'Spending category is required',
      });
    }
    
    const validTypes: AssetType[] = ['invoice', 'receipt', 'paper_receipt', 'quote', 'contract'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid asset type. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    if (isTestDomain(company.domain || '')) {
      console.log(`🧪 Test mode — returning mock ${type}`);
      const mockData = getMockAsset(type);
      trackGeneration({ assetType: type, spendingCategory, companyName: company.name, companyDomain: company.domain, currency, flowType: 'standard', userEmail: req.userEmail });
      return res.json({ success: true, data: mockData });
    }
    
    const assetData = await generateAssetContent(type, company, spendingCategory, currency, lineItemCount);
    
    trackGeneration({
      assetType: type,
      spendingCategory,
      companyName: company.name,
      companyDomain: company.domain,
      currency,
      flowType: 'standard',
      userEmail: req.userEmail,
    });

    res.json({
      success: true,
      data: assetData,
    });
  } catch (error) {
    console.error('Generation error:', error);
    const { status, body } = formatErrorResponse(error);
    res.status(status).json(body);
  }
});

// Streaming SSE endpoint
generateRouter.post('/stream', async (req: Request<{}, {}, GenerateRequest>, res: Response) => {
  try {
    const { type, company, spendingCategory, relatedAssets, invoiceConfig, currency = 'USD', lineItemCount } = req.body;
    
    // Validate inputs
    if (!type) {
      return res.status(400).json({
        success: false,
        error: 'Asset type is required',
      });
    }
    
    if (!company) {
      return res.status(400).json({
        success: false,
        error: 'Company profile is required',
      });
    }
    
    if (!spendingCategory) {
      return res.status(400).json({
        success: false,
        error: 'Spending category is required',
      });
    }
    
    const validTypes: AssetType[] = ['invoice', 'receipt', 'paper_receipt', 'quote', 'contract'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid asset type. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    const stream = openSSE(res);

    if (isTestDomain(company.domain || '')) {
      console.log(`🧪 Test mode — streaming mock ${type}`);
      const statuses = getMockStatusMessages(type);
      for (const status of statuses) {
        stream.send('status', { status });
        await new Promise(r => setTimeout(r, 400));
      }
      const mockData = getMockAsset(type, invoiceConfig, relatedAssets);
      stream.send('complete', { success: true, data: mockData });
      trackGeneration({ assetType: type, spendingCategory, companyName: company.name, companyDomain: company.domain, currency, flowType: relatedAssets ? 'connected' : 'standard', userEmail: req.userEmail });
      return stream.close();
    }

    try {
      const assetData = await generateAssetContentStreaming(
        type,
        company,
        spendingCategory,
        (status: string) => {
          stream.send('status', { status });
        },
        relatedAssets,
        invoiceConfig,
        currency,
        lineItemCount
      );

      stream.send('complete', { success: true, data: assetData });

      trackGeneration({
        assetType: type,
        spendingCategory,
        companyName: company.name,
        companyDomain: company.domain,
        currency,
        flowType: relatedAssets ? 'connected' : 'standard',
        userEmail: req.userEmail,
      });

      stream.close();
    } catch (error) {
      console.error('Streaming generation error:', error);
      const { body } = formatErrorResponse(error);
      stream.send('error', { error: body.error, code: body.code });
      stream.close();
    }
  } catch (error) {
    console.error('Streaming generation error (pre-stream):', error);

    const { status, body } = formatErrorResponse(error);

    if (!res.headersSent) {
      return res.status(status).json(body);
    }

    res.end();
  }
});

// Quick receipt generation from prompt
interface QuickReceiptRequest {
  prompt: string;
  receiptType: 'receipt' | 'paper_receipt' | 'hotel_folio' | 'airline_receipt';
  currency?: string;
}

generateRouter.post('/quick-receipt', async (req: Request<{}, {}, QuickReceiptRequest>, res: Response) => {
  try {
    const { prompt, receiptType, currency = 'USD' } = req.body;
    
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required',
      });
    }
    
    const validReceiptTypes = ['receipt', 'paper_receipt', 'hotel_folio', 'airline_receipt'];
    if (!receiptType || !validReceiptTypes.includes(receiptType)) {
      return res.status(400).json({
        success: false,
        error: 'Receipt type must be one of: ' + validReceiptTypes.join(', '),
      });
    }

    const stream = openSSE(res);

    try {
      const receiptData = await generateQuickReceiptContent(
        prompt,
        receiptType,
        currency,
        (status: string) => {
          stream.send('status', { status });
        }
      );

      stream.send('complete', { success: true, data: receiptData });

      trackGeneration({
        assetType: receiptType,
        spendingCategory: '',
        companyName: '',
        companyDomain: '',
        currency,
        flowType: 'quick_receipt',
        userEmail: req.userEmail,
      });

      stream.close();
    } catch (error) {
      console.error('Quick receipt generation error:', error);
      const { body } = formatErrorResponse(error);
      stream.send('error', { error: body.error, code: body.code });
      stream.close();
    }
  } catch (error) {
    console.error('Quick receipt generation error (pre-stream):', error);

    const { status, body } = formatErrorResponse(error);

    if (!res.headersSent) {
      return res.status(status).json(body);
    }

    res.end();
  }
});

// Gemini Nano Banana receipt image generation
interface ReceiptImageRequest {
  prompt: string;
  scene?: string;
}

generateRouter.post('/receipt-image', async (req: Request<{}, {}, ReceiptImageRequest>, res: Response) => {
  try {
    const { prompt, scene = 'restaurant_table' } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required',
      });
    }

    if (scene && !AVAILABLE_SCENES.includes(scene)) {
      return res.status(400).json({
        success: false,
        error: `Invalid scene. Must be one of: ${AVAILABLE_SCENES.join(', ')}`,
      });
    }

    console.log(`📸 Generating receipt image via Gemini — scene: ${scene}`);

    const { imageBuffer, mimeType } = await generateReceiptImage(prompt, scene);

    trackGeneration({
      assetType: 'paper_receipt',
      spendingCategory: '',
      companyName: '',
      companyDomain: '',
      currency: 'USD',
      flowType: 'receipt_image',
      userEmail: req.userEmail,
    });

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', 'inline; filename="receipt.png"');
    res.send(imageBuffer);
  } catch (error) {
    console.error('Receipt image generation error:', error);
    const { status, body } = formatErrorResponse(error);
    res.status(status).json(body);
  }
});
