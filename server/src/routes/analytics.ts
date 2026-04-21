import { Router, Request, Response } from 'express';
import { getAnalyticsSummary, getAnalyticsCompanies, getAnalyticsTimeline, getAnalyticsByUser } from '../services/analytics.js';

export const analyticsRouter = Router();

analyticsRouter.get('/summary', async (_req: Request, res: Response) => {
  try {
    const summary = await getAnalyticsSummary();
    res.json({ success: true, data: summary });
  } catch (error) {
    console.error('Analytics summary error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch analytics',
    });
  }
});

analyticsRouter.get('/companies', async (_req: Request, res: Response) => {
  try {
    const companies = await getAnalyticsCompanies();
    res.json({ success: true, data: companies });
  } catch (error) {
    console.error('Analytics companies error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch company analytics',
    });
  }
});

analyticsRouter.get('/users', async (_req: Request, res: Response) => {
  try {
    const users = await getAnalyticsByUser();
    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Analytics users error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch user analytics',
    });
  }
});

analyticsRouter.get('/timeline', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string, 10) || 30;
    const timeline = await getAnalyticsTimeline(days);
    res.json({ success: true, data: timeline });
  } catch (error) {
    console.error('Analytics timeline error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch timeline analytics',
    });
  }
});
