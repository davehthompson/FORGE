import { Router, Request, Response } from 'express';
import { generatePdf, generateJpg } from '../services/pdf.js';
import { AssetType, AssetData } from '../types.js';
import { buildFilename } from '../utils/filename.js';

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
