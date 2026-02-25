import { neon } from '@neondatabase/serverless';

export interface GenerationEvent {
  assetType: string;
  spendingCategory: string;
  companyName: string;
  companyDomain: string;
  currency: string;
  flowType: 'standard' | 'connected' | 'quick_receipt';
}

let sql: ReturnType<typeof neon> | null = null;
let tableReady = false;

function getClient() {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) return null;
    sql = neon(url);
  }
  return sql;
}

async function ensureTable() {
  if (tableReady) return;
  const client = getClient();
  if (!client) return;

  try {
    await client`
      CREATE TABLE IF NOT EXISTS generation_events (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        asset_type TEXT NOT NULL,
        spending_category TEXT NOT NULL DEFAULT '',
        company_name TEXT NOT NULL DEFAULT '',
        company_domain TEXT NOT NULL DEFAULT '',
        currency TEXT NOT NULL DEFAULT 'USD',
        flow_type TEXT NOT NULL DEFAULT 'standard'
      )
    `;
    tableReady = true;
  } catch (err) {
    console.error('Analytics: failed to create table', err);
  }
}

export function trackGeneration(event: GenerationEvent): void {
  const client = getClient();
  if (!client) return;

  ensureTable()
    .then(() => {
      if (!client) return;
      return client`
        INSERT INTO generation_events (asset_type, spending_category, company_name, company_domain, currency, flow_type)
        VALUES (${event.assetType}, ${event.spendingCategory}, ${event.companyName}, ${event.companyDomain}, ${event.currency}, ${event.flowType})
      `;
    })
    .catch((err) => {
      console.error('Analytics: tracking failed', err);
    });
}

export async function getAnalyticsSummary() {
  const client = getClient();
  if (!client) return { total: 0, byType: [] as { type: string; count: number }[], byCategory: [] as { category: string; count: number }[] };

  await ensureTable();

  const totalRows = await client`SELECT COUNT(*)::int AS total FROM generation_events`;
  const typeRows = await client`SELECT asset_type, COUNT(*)::text AS count FROM generation_events GROUP BY asset_type ORDER BY count DESC`;
  const categoryRows = await client`SELECT spending_category, COUNT(*)::text AS count FROM generation_events WHERE spending_category != '' GROUP BY spending_category ORDER BY count DESC`;

  const total = (totalRows as Record<string, unknown>[])[0]?.total as number ?? 0;

  return {
    total,
    byType: (typeRows as Record<string, unknown>[]).map((r) => ({
      type: r.asset_type as string,
      count: parseInt(r.count as string, 10),
    })),
    byCategory: (categoryRows as Record<string, unknown>[]).map((r) => ({
      category: r.spending_category as string,
      count: parseInt(r.count as string, 10),
    })),
  };
}

export async function getAnalyticsCompanies() {
  const client = getClient();
  if (!client) return [];

  await ensureTable();

  const rows = await client`
    SELECT company_name, company_domain, COUNT(*)::text AS count, MAX(created_at)::text AS last_used
    FROM generation_events
    WHERE company_name != ''
    GROUP BY company_name, company_domain
    ORDER BY count DESC
  `;

  return (rows as Record<string, unknown>[]).map((r) => ({
    name: r.company_name as string,
    domain: r.company_domain as string,
    count: parseInt(r.count as string, 10),
    lastUsed: r.last_used as string,
  }));
}

export async function getAnalyticsTimeline(days: number = 30) {
  const client = getClient();
  if (!client) return [];

  await ensureTable();

  const rows = await client`
    SELECT DATE(created_at)::text AS date, COUNT(*)::text AS count
    FROM generation_events
    WHERE created_at >= NOW() - MAKE_INTERVAL(days => ${days})
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `;

  return (rows as Record<string, unknown>[]).map((r) => ({
    date: r.date as string,
    count: parseInt(r.count as string, 10),
  }));
}
