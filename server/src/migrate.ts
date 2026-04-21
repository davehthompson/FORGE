import { Pool } from 'pg';

async function migrate() {
  const url = process.env.DATABASE_URL || process.env.FORGE_DATABASE_URL;
  if (!url) {
    console.log('DATABASE_URL not set — skipping migration');
    process.exit(0);
  }

  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
  });

  try {
    console.log('Running migrations...');

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
        api_service TEXT NOT NULL DEFAULT '',
        user_email TEXT NOT NULL DEFAULT ''
      )
    `);

    await pool.query(`ALTER TABLE generation_events ADD COLUMN IF NOT EXISTS api_service TEXT NOT NULL DEFAULT ''`);
    await pool.query(`ALTER TABLE generation_events ADD COLUMN IF NOT EXISTS user_email TEXT NOT NULL DEFAULT ''`);

    console.log('Migrations complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
