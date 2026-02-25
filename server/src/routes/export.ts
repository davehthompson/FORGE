import { Router, Request, Response } from 'express';
import { generatePdf, generateJpg } from '../services/pdf.js';
import { AssetType, AssetData } from '../types.js';

export const exportRouter = Router();

interface ExportRequest {
  type: AssetType;
  data: AssetData;
  currency?: string;
  primaryColor?: string;
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
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-${Date.now()}.pdf"`);
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
    
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-${Date.now()}.jpg"`);
    res.send(jpg);
  } catch (error) {
    console.error('JPG export error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate JPG',
    });
  }
});
