import pg from 'pg';

const { Pool } = pg;

export interface GenerationEvent {
  assetType: string;
  spendingCategory: string;
  companyName: string;
  companyDomain: string;
  currency: string;
  flowType: 'standard' | 'connected' | 'quick_receipt' | 'receipt_image';
  apiService?: string;
}

let pool: pg.Pool | null = null;
let tableReady = false;
// Sticky failure latch: once `CREATE TABLE` fails (most commonly with PG15's
// `42501 permission denied for schema public` on managed Postgres where the
// app role isn't the schema owner), subsequent calls short-circuit instead of
// re-attempting the DDL on every analytics-touching request and re-spamming
// the error in the logs. A process restart resets the latch — useful when an
// operator finally grants `CREATE ON SCHEMA public`.
let tableInitFailed = false;

/**
 * Returns true if the env var looks like a real Postgres URL — guards against
 * the literal `your_neon_postgres_connection_string_here` placeholder leaking
 * into a real `neon()`/`Pool()` constructor and crashing the request.
 */
function isUsableConnectionString(url: string | undefined): url is string {
  if (!url) return false;
  if (url.startsWith('your_')) return false;
  return /^postgres(ql)?:\/\//.test(url);
}

function getPool(): pg.Pool | null {
  if (pool) return pool;

  const url = process.env.DATABASE_URL;
  if (!isUsableConnectionString(url)) return null;

  // Managed Postgres providers (Ramplify, Neon, RDS, etc.) all require SSL.
  // Local dev against a plain Postgres on localhost/127.0.0.1 should not.
  const isLocal = /@(localhost|127\.0\.0\.1)/.test(url);

  pool = new Pool({
    connectionString: url,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  pool.on('error', (err) => {
    console.error('Analytics: idle pg client error', err);
  });

  return pool;
}

async function ensureTable(): Promise<pg.Pool | null> {
  const client = getPool();
  if (!client) return null;
  if (tableReady) return client;
  if (tableInitFailed) return null;

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS generation_events (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        asset_type TEXT NOT NULL,
        spending_category TEXT NOT NULL DEFAULT '',
        company_name TEXT NOT NULL DEFAULT '',
        company_domain TEXT NOT NULL DEFAULT '',
        currency TEXT NOT NULL DEFAULT 'USD',
        flow_type TEXT NOT NULL DEFAULT 'standard',
        api_service TEXT NOT NULL DEFAULT ''
      )
    `);
    await client.query(`
      ALTER TABLE generation_events ADD COLUMN IF NOT EXISTS api_service TEXT NOT NULL DEFAULT ''
    `);
    tableReady = true;
    return client;
  } catch (err) {
    tableInitFailed = true;
    const code = (err as { code?: string })?.code;
    if (code === '42501') {
      console.warn(
        'Analytics: disabled — DB user lacks CREATE on the target schema. ' +
        'Grant CREATE on schema public (or the schema in DATABASE_URL) to ' +
        'enable persistence, then restart the app. Continuing without analytics.',
      );
    } else {
      console.error('Analytics: failed to create table; disabling analytics for this process.', err);
    }
    return null;
  }
}

export function trackGeneration(event: GenerationEvent): void {
  ensureTable()
    .then((client) => {
      if (!client) return;
      return client.query(
        `INSERT INTO generation_events
          (asset_type, spending_category, company_name, company_domain, currency, flow_type, api_service)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          event.assetType,
          event.spendingCategory,
          event.companyName,
          event.companyDomain,
          event.currency,
          event.flowType,
          event.apiService ?? '',
        ],
      );
    })
    .catch((err) => {
      console.error('Analytics: tracking failed', err);
    });
}

export async function getAnalyticsSummary() {
  const empty = {
    total: 0,
    byType: [] as { type: string; count: number }[],
    byCategory: [] as { category: string; count: number }[],
  };

  const client = await ensureTable();
  if (!client) return empty;

  const totalRows = await client.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM generation_events`,
  );
  const typeRows = await client.query<{ asset_type: string; count: number }>(
    `SELECT asset_type, COUNT(*)::int AS count
     FROM generation_events
     GROUP BY asset_type
     ORDER BY count DESC`,
  );
  const categoryRows = await client.query<{ spending_category: string; count: number }>(
    `SELECT spending_category, COUNT(*)::int AS count
     FROM generation_events
     WHERE spending_category != ''
     GROUP BY spending_category
     ORDER BY count DESC`,
  );

  return {
    total: totalRows.rows[0]?.total ?? 0,
    byType: typeRows.rows.map((r) => ({ type: r.asset_type, count: r.count })),
    byCategory: categoryRows.rows.map((r) => ({
      category: r.spending_category,
      count: r.count,
    })),
  };
}

export async function getAnalyticsCompanies() {
  const client = await ensureTable();
  if (!client) return [];

  const rows = await client.query<{
    company_name: string;
    company_domain: string;
    count: number;
    last_used: string;
  }>(`
    SELECT company_name, company_domain, COUNT(*)::int AS count,
           MAX(created_at)::text AS last_used
    FROM generation_events
    WHERE company_name != ''
    GROUP BY company_name, company_domain
    ORDER BY count DESC
  `);

  return rows.rows.map((r) => ({
    name: r.company_name,
    domain: r.company_domain,
    count: r.count,
    lastUsed: r.last_used,
  }));
}

export async function getAnalyticsTimeline(days: number = 30) {
  const client = await ensureTable();
  if (!client) return [];

  const rows = await client.query<{ date: string; count: number }>(
    `SELECT d::date::text AS date, COALESCE(e.count, 0)::int AS count
     FROM generate_series(
       CURRENT_DATE - $1::int + 1,
       CURRENT_DATE,
       '1 day'::interval
     ) AS d
     LEFT JOIN (
       SELECT DATE(created_at) AS event_date, COUNT(*)::int AS count
       FROM generation_events
       WHERE created_at >= CURRENT_DATE - $1::int + 1
       GROUP BY DATE(created_at)
     ) e ON e.event_date = d::date
     ORDER BY date ASC`,
    [days],
  );

  return rows.rows.map((r) => ({ date: r.date, count: r.count }));
}
