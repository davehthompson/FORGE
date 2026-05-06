import { Router, Request, Response } from 'express';
import {
  enrichCompanyFromDomain,
  enrichCompanyFromDomainStreaming,
} from '../services/enrichment.js';
import { formatErrorResponse } from '../services/claude.js';
import { isTestDomain, getMockCompanyProfile } from '../services/mockData.js';
import { openSSE } from '../utils/sse.js';

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

    const stream = openSSE(res);

    try {
      stream.send('status', { status: `Looking up ${domain}...` });

      if (isTestDomain(domain)) {
        stream.send('status', { status: 'Test domain — using mock data' });
        stream.send('complete', { success: true, data: getMockCompanyProfile() });
        return stream.close();
      }

      const profile = await enrichCompanyFromDomainStreaming(domain, (status) => {
        stream.send('status', { status });
      });

      stream.send('status', { status: 'Finalizing profile...' });
      stream.send('complete', { success: true, data: profile });
      stream.close();
    } catch (error) {
      console.error('Enrichment streaming error:', error);
      const { body } = formatErrorResponse(error);
      stream.send('error', { error: body.error, code: body.code });
      stream.close();
    }
  },
);
