import { Router, Request, Response } from 'express';
import {
  enrichCompanyFromDomain,
  enrichCompanyFromDomainStreaming,
} from '../services/enrichment.js';
import { formatErrorResponse } from '../services/claude.js';
import { isTestDomain, getMockCompanyProfile } from '../services/mockData.js';

export const enrichRouter = Router();

interface EnrichRequest {
  domain: string;
}

enrichRouter.post('/', async (req: Request<{}, {}, EnrichRequest>, res: Response) => {
  try {
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({
        success: false,
        error: 'Domain is required',
      });
    }

    if (isTestDomain(domain)) {
      console.log('🧪 Test domain detected — returning mock company data');
      return res.json({ success: true, data: getMockCompanyProfile() });
    }
    
    const companyProfile = await enrichCompanyFromDomain(domain);
    
    res.json({
      success: true,
      data: companyProfile,
    });
  } catch (error) {
    console.error('Enrichment error:', error);
    const { status, body } = formatErrorResponse(error);
    res.status(status).json(body);
  }
});

// Streaming variant — emits SSE status events while Claude runs web searches
// and synthesizes the company profile, ending with a `complete` event that
// carries the final CompanyProfile.
enrichRouter.post(
  '/stream',
  async (req: Request<{}, {}, EnrichRequest>, res: Response) => {
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({ success: false, error: 'Domain is required' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      sendEvent('status', { status: `Looking up ${domain}...` });

      if (isTestDomain(domain)) {
        sendEvent('status', { status: 'Test domain — using mock data' });
        sendEvent('complete', { success: true, data: getMockCompanyProfile() });
        return res.end();
      }

      const profile = await enrichCompanyFromDomainStreaming(domain, (status) => {
        sendEvent('status', { status });
      });

      sendEvent('status', { status: 'Finalizing profile...' });
      sendEvent('complete', { success: true, data: profile });
      res.end();
    } catch (error) {
      console.error('Enrichment streaming error:', error);
      const { body } = formatErrorResponse(error);
      sendEvent('error', { error: body.error, code: body.code });
      res.end();
    }
  },
);
