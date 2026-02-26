import { Router, Request, Response } from 'express';
import { enrichCompanyFromDomain } from '../services/enrichment.js';
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
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to enrich company data',
    });
  }
});
