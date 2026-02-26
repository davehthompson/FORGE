import { Router, Request, Response } from 'express';
import { generateAssetContent, generateAssetContentStreaming, generateQuickReceiptContent } from '../services/openai.js';
import { CompanyProfile, AssetType, RelatedAssetContext, InvoiceConfig } from '../types.js';
import { trackGeneration } from '../services/analytics.js';
import { isTestDomain, getMockAsset, getMockStatusMessages } from '../services/mockData.js';

export const generateRouter = Router();

interface GenerateRequest {
  type: AssetType;
  company: CompanyProfile;
  spendingCategory: string;
  relatedAssets?: RelatedAssetContext;
  invoiceConfig?: InvoiceConfig;
  currency?: string;
}

// Standard non-streaming endpoint
generateRouter.post('/', async (req: Request<{}, {}, GenerateRequest>, res: Response) => {
  try {
    const { type, company, spendingCategory, currency = 'USD' } = req.body;
    
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
      trackGeneration({ assetType: type, spendingCategory, companyName: company.name, companyDomain: company.domain, currency, flowType: 'standard' });
      return res.json({ success: true, data: mockData });
    }
    
    const assetData = await generateAssetContent(type, company, spendingCategory, currency);
    
    trackGeneration({
      assetType: type,
      spendingCategory,
      companyName: company.name,
      companyDomain: company.domain,
      currency,
      flowType: 'standard',
    });

    res.json({
      success: true,
      data: assetData,
    });
  } catch (error) {
    console.error('Generation error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate asset',
    });
  }
});

// Streaming SSE endpoint
generateRouter.post('/stream', async (req: Request<{}, {}, GenerateRequest>, res: Response) => {
  try {
    const { type, company, spendingCategory, relatedAssets, invoiceConfig, currency = 'USD' } = req.body;
    
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

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Helper to send SSE events
    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    if (isTestDomain(company.domain || '')) {
      console.log(`🧪 Test mode — streaming mock ${type}`);
      const statuses = getMockStatusMessages(type);
      for (const status of statuses) {
        sendEvent('status', { status });
        await new Promise(r => setTimeout(r, 400));
      }
      const mockData = getMockAsset(type, invoiceConfig, relatedAssets);
      sendEvent('complete', { success: true, data: mockData });
      trackGeneration({ assetType: type, spendingCategory, companyName: company.name, companyDomain: company.domain, currency, flowType: relatedAssets ? 'connected' : 'standard' });
      return res.end();
    }

    // Generate with streaming status updates (pass related assets and invoice config for connected generation)
    const assetData = await generateAssetContentStreaming(
      type,
      company,
      spendingCategory,
      (status: string) => {
        sendEvent('status', { status });
      },
      relatedAssets,
      invoiceConfig,
      currency
    );

    // Send the final complete data
    sendEvent('complete', { success: true, data: assetData });

    trackGeneration({
      assetType: type,
      spendingCategory,
      companyName: company.name,
      companyDomain: company.domain,
      currency,
      flowType: relatedAssets ? 'connected' : 'standard',
    });
    
    // Close the connection
    res.end();
  } catch (error) {
    console.error('Streaming generation error:', error);
    
    // If headers haven't been sent, send JSON error
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate asset',
      });
    }
    
    // Otherwise send SSE error event
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to generate asset' 
    })}\n\n`);
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

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Generate receipt from prompt
    const receiptData = await generateQuickReceiptContent(
      prompt,
      receiptType,
      currency,
      (status: string) => {
        sendEvent('status', { status });
      }
    );

    sendEvent('complete', { success: true, data: receiptData });

    trackGeneration({
      assetType: receiptType,
      spendingCategory: '',
      companyName: '',
      companyDomain: '',
      currency,
      flowType: 'quick_receipt',
    });

    res.end();
  } catch (error) {
    console.error('Quick receipt generation error:', error);
    
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate receipt',
      });
    }
    
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to generate receipt' 
    })}\n\n`);
    res.end();
  }
});
