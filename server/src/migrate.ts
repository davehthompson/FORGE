// Standalone deploy-time migration. Runs under Ramplify's `migration:`
// Procfile target with elevated credentials so it can issue DDL against the
// managed Postgres instance. The runtime app role only has DML rights, so
// any `CREATE TABLE` attempted at request time fails with `42501 permission
// denied for schema public` — moving the DDL here keeps the app strictly
// DML and lets analytics persistence actually work in prod.
//
// Idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) so
// it's safe to re-run on every deploy. Exits 0 on success or when there's
// no usable `DATABASE_URL` (so local builds without a DB don't break the
// release pipeline). Exits non-zero on real DDL errors so a misconfigured
// deploy fails loudly.
import './loadEnv.js';
import pg from 'pg';

const { Pool } = pg;

function isUsableConnectionString(url: string | undefined): url is string {
  if (!url) return false;
  if (url.startsWith('your_')) return false;
  return /^postgres(ql)?:\/\//.test(url);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!isUsableConnectionString(url)) {
    console.warn('migrate: DATABASE_URL not set or placeholder — skipping (no-op).');
    return;
  }

  const isLocal = /@(localhost|127\.0\.0\.1)/.test(url);
  const pool = new Pool({
    connectionString: url,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  try {
    await pool.query(`
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
    await pool.query(`
      ALTER TABLE generation_events
      ADD COLUMN IF NOT EXISTS api_service TEXT NOT NULL DEFAULT ''
    `);
    console.log('migrate: generation_events ready.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('migrate: failed', err);
  process.exit(1);
});
