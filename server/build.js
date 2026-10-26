require('./env');
const fs = require('node:fs');
const path = require('node:path');
const { db } = require('./db');
const { seedIfNeeded } = require('./seed');
const { syncSqliteToNeon, getNeonStatus } = require('./neon-pg');
const { getGatewayConfig } = require('./ai-gateway');

async function runBuild() {
  console.log('=== Shop by SCHA Build & Service Provision Verification ===');

  // 1. Ensure local database is seeded
  seedIfNeeded();
  console.log('✓ 1. Local catalogue & demo dataset seeded.');

  // 2. Verify required frontend & backend files exist
  const requiredFiles = [
    'public/index.html',
    'public/styles.css',
    'public/app.js',
    'public/state.js',
    'public/storefront-views.js',
    'public/admin-views.js',
    'public/images/logo.png',
    'neon.ts',
    'vercel.json',
    'api/index.js'
  ];
  for (const rel of requiredFiles) {
    const abs = path.join(__dirname, '..', rel);
    if (!fs.existsSync(abs)) {
      throw new Error(`Missing required build file: ${rel}`);
    }
  }
  console.log('✓ 2. All storefront, admin, Vercel, and Neon config files verified.');

  // 3. Migrate & Sync to Neon Lakebase Postgres if DATABASE_URL is present
  if (process.env.DATABASE_URL) {
    const syncResult = await syncSqliteToNeon(db);
    const neonStatus = await getNeonStatus();
    console.log(
      `✓ 3. Neon Lakebase Postgres connected & synced (${neonStatus.database_name} on ${neonStatus.pg_version.split(',')[0]}):`,
      `${syncResult.productsCount} products, ${syncResult.ordersCount} orders, ${syncResult.shipmentsCount} shipments.`
    );
  } else {
    console.log('! 3. DATABASE_URL not set; skipping remote Neon Postgres sync.');
  }

  // 4. Verify Neon AI Gateway configuration
  const gw = getGatewayConfig();
  console.log(`✓ 4. Neon AI Gateway configured at ${gw.baseUrl} (Token provisioned: ${gw.hasToken}).`);

  const { getNeonPool } = require('./neon-pg');
  const pool = getNeonPool();
  if (pool) await pool.end();

  console.log('=== Build Completed Successfully ===');
}

runBuild().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
