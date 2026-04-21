import { Pool } from 'pg';

export interface GenerationEvent {
  assetType: string;
  spendingCategory: string;
  companyName: string;
  companyDomain: string;
  currency: string;
  flowType: 'standard' | 'connected' | 'quick_receipt' | 'receipt_image';
  apiService?: string;
  userEmail?: string;
}

let pool: Pool | null = null;
let tableReady = false;

function getPool(): Pool | null {
  if (!pool) {
    const url = process.env.DATABASE_URL || process.env.FORGE_DATABASE_URL;
    if (!url) return null;
    pool = new Pool({
      connectionString: url,
      ssl: url.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function ensureTable() {
  if (tableReady) return;
  const db = getPool();
  if (!db) return;

  try {
    await db.query('SELECT 1 FROM generation_events LIMIT 0');
    tableReady = true;
  } catch {
    console.error('Analytics: generation_events table not found — run migrations');
  }
}

export function trackGeneration(event: GenerationEvent): void {
  const db = getPool();
  if (!db) return;

  ensureTable()
    .then(() => {
      if (!db) return;
      return db.query(
        `INSERT INTO generation_events (asset_type, spending_category, company_name, company_domain, currency, flow_type, api_service, user_email)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [event.assetType, event.spendingCategory, event.companyName, event.companyDomain, event.currency, event.flowType, event.apiService ?? '', event.userEmail ?? '']
      );
    })
    .catch((err) => {
      console.error('Analytics: tracking failed', err);
    });
}

export async function getAnalyticsSummary() {
  const db = getPool();
  if (!db) return { total: 0, byType: [] as { type: string; count: number }[], byCategory: [] as { category: string; count: number }[] };

  await ensureTable();

  const totalRes = await db.query('SELECT COUNT(*)::int AS total FROM generation_events');
  const typeRes = await db.query('SELECT asset_type, COUNT(*)::int AS count FROM generation_events GROUP BY asset_type ORDER BY count DESC');
  const categoryRes = await db.query("SELECT spending_category, COUNT(*)::int AS count FROM generation_events WHERE spending_category != '' GROUP BY spending_category ORDER BY count DESC");

  const total = totalRes.rows[0]?.total ?? 0;

  return {
    total,
    byType: typeRes.rows.map((r: Record<string, unknown>) => ({
      type: r.asset_type as string,
      count: r.count as number,
    })),
    byCategory: categoryRes.rows.map((r: Record<string, unknown>) => ({
      category: r.spending_category as string,
      count: r.count as number,
    })),
  };
}

export async function getAnalyticsCompanies() {
  const db = getPool();
  if (!db) return [];

  await ensureTable();

  const res = await db.query(`
    SELECT company_name, company_domain, COUNT(*)::int AS count, MAX(created_at)::text AS last_used
    FROM generation_events
    WHERE company_name != ''
    GROUP BY company_name, company_domain
    ORDER BY count DESC
  `);

  return res.rows.map((r: Record<string, unknown>) => ({
    name: r.company_name as string,
    domain: r.company_domain as string,
    count: r.count as number,
    lastUsed: r.last_used as string,
  }));
}

export async function getAnalyticsTimeline(days: number = 30) {
  const db = getPool();
  if (!db) return [];

  await ensureTable();

  const res = await db.query(
    `SELECT d::date::text AS date, COALESCE(e.count, 0)::int AS count
     FROM generate_series(
       CURRENT_DATE - make_interval(days => $1) + interval '1 day',
       CURRENT_DATE,
       '1 day'::interval
     ) AS d
     LEFT JOIN (
       SELECT DATE(created_at) AS event_date, COUNT(*)::int AS count
       FROM generation_events
       WHERE created_at >= CURRENT_DATE - make_interval(days => $1) + interval '1 day'
       GROUP BY DATE(created_at)
     ) e ON e.event_date = d::date
     ORDER BY date ASC`,
    [days]
  );

  return res.rows.map((r: Record<string, unknown>) => ({
    date: r.date as string,
    count: r.count as number,
  }));
}

export async function getAnalyticsByUser() {
  const db = getPool();
  if (!db) return [];

  await ensureTable();

  const res = await db.query(`
    SELECT user_email, COUNT(*)::int AS count, MAX(created_at)::text AS last_active
    FROM generation_events
    WHERE user_email != ''
    GROUP BY user_email
    ORDER BY count DESC
  `);

  return res.rows.map((r: Record<string, unknown>) => ({
    email: r.user_email as string,
    count: r.count as number,
    lastActive: r.last_active as string,
  }));
}
