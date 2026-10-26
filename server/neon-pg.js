require('./env');
const { Pool, Client } = require('pg');

let attachDatabasePool = null;
try {
  ({ attachDatabasePool } = require('@vercel/functions'));
} catch (_) {
  // Optional outside Vercel runtime
}

let pool = null;

function getNeonPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;

  pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  if (typeof attachDatabasePool === 'function') {
    try {
      attachDatabasePool(pool);
    } catch (_) {
      // Safe fallback when running outside Vercel Fluid Compute
    }
  }

  return pool;
}

async function migrateNeonSchema() {
  const directUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!directUrl) {
    throw new Error('DATABASE_URL is not configured.');
  }

  const client = new Client({ connectionString: directUrl });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS scha_products (
        id INTEGER PRIMARY KEY,
        reference_id TEXT UNIQUE,
        title TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        brand TEXT NOT NULL,
        category_slug TEXT NOT NULL,
        sellable_sku TEXT,
        price_minor INTEGER,
        currency TEXT NOT NULL DEFAULT 'MYR',
        stock_quantity INTEGER,
        publish_status TEXT NOT NULL DEFAULT 'draft',
        purchase_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        is_demo BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS scha_orders (
        id INTEGER PRIMARY KEY,
        order_number TEXT NOT NULL UNIQUE,
        customer_email TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        payment_status TEXT NOT NULL,
        fulfilment_status TEXT NOT NULL,
        total_minor INTEGER NOT NULL,
        shipping_zone TEXT,
        paid_bank_reference TEXT,
        is_demo BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS scha_shipments (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL,
        order_number TEXT NOT NULL,
        courier_name TEXT NOT NULL,
        tracking_number TEXT NOT NULL,
        tracking_url TEXT NOT NULL,
        shipped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(order_id, tracking_number)
      );
    `);
  } finally {
    await client.end();
  }
}

async function syncSqliteToNeon(sqliteDb) {
  const activePool = getNeonPool();
  if (!activePool) return { synced: false, reason: 'No DATABASE_URL configured' };

  await migrateNeonSchema();

  const products = sqliteDb.prepare('SELECT * FROM products ORDER BY id ASC').all();
  for (const p of products) {
    await activePool.query(
      `
      INSERT INTO scha_products (
        id, reference_id, title, slug, brand, category_slug, sellable_sku,
        price_minor, currency, stock_quantity, publish_status, purchase_enabled, is_demo, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        slug = EXCLUDED.slug,
        brand = EXCLUDED.brand,
        category_slug = EXCLUDED.category_slug,
        sellable_sku = EXCLUDED.sellable_sku,
        price_minor = EXCLUDED.price_minor,
        stock_quantity = EXCLUDED.stock_quantity,
        publish_status = EXCLUDED.publish_status,
        purchase_enabled = EXCLUDED.purchase_enabled,
        updated_at = NOW();
      `,
      [
        p.id,
        p.reference_id,
        p.title,
        p.slug,
        p.brand,
        p.category_slug,
        p.sellable_sku,
        p.price_minor,
        p.currency || 'MYR',
        p.stock_quantity,
        p.publish_status,
        Boolean(p.purchase_enabled),
        Boolean(p.is_demo)
      ]
    );
  }

  const orders = sqliteDb.prepare('SELECT * FROM orders ORDER BY id ASC').all();
  for (const o of orders) {
    await activePool.query(
      `
      INSERT INTO scha_orders (
        id, order_number, customer_email, customer_name, payment_status,
        fulfilment_status, total_minor, shipping_zone, paid_bank_reference, is_demo, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        payment_status = EXCLUDED.payment_status,
        fulfilment_status = EXCLUDED.fulfilment_status,
        paid_bank_reference = EXCLUDED.paid_bank_reference,
        updated_at = EXCLUDED.updated_at;
      `,
      [
        o.id,
        o.order_number,
        o.customer_email,
        o.customer_name,
        o.payment_status,
        o.fulfilment_status,
        o.total_minor,
        o.shipping_zone,
        o.paid_bank_reference,
        Boolean(o.is_demo),
        o.created_at,
        o.updated_at
      ]
    );
  }

  const shipments = sqliteDb.prepare(`
    SELECT s.*, o.order_number
    FROM shipments s
    JOIN orders o ON o.id = s.order_id
    ORDER BY s.id ASC
  `).all();
  for (const s of shipments) {
    await activePool.query(
      `
      INSERT INTO scha_shipments (order_id, order_number, courier_name, tracking_number, tracking_url, shipped_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (order_id, tracking_number) DO UPDATE SET
        courier_name = EXCLUDED.courier_name,
        tracking_url = EXCLUDED.tracking_url;
      `,
      [s.order_id, s.order_number, s.courier_name, s.tracking_number, s.tracking_url, s.shipped_at || s.created_at]
    );
  }

  return {
    synced: true,
    productsCount: products.length,
    ordersCount: orders.length,
    shipmentsCount: shipments.length
  };
}

async function syncOrderToNeon(orderRow, shipmentRow = null) {
  const activePool = getNeonPool();
  if (!activePool || !orderRow) return;
  try {
    await activePool.query(
      `
      INSERT INTO scha_orders (
        id, order_number, customer_email, customer_name, payment_status,
        fulfilment_status, total_minor, shipping_zone, paid_bank_reference, is_demo, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        payment_status = EXCLUDED.payment_status,
        fulfilment_status = EXCLUDED.fulfilment_status,
        paid_bank_reference = EXCLUDED.paid_bank_reference,
        updated_at = EXCLUDED.updated_at;
      `,
      [
        orderRow.id,
        orderRow.order_number,
        orderRow.customer_email,
        orderRow.customer_name,
        orderRow.payment_status,
        orderRow.fulfilment_status,
        orderRow.total_minor,
        orderRow.shipping_zone,
        orderRow.paid_bank_reference,
        Boolean(orderRow.is_demo),
        orderRow.created_at,
        orderRow.updated_at
      ]
    );
    if (shipmentRow) {
      await activePool.query(
        `
        INSERT INTO scha_shipments (order_id, order_number, courier_name, tracking_number, tracking_url, shipped_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (order_id, tracking_number) DO UPDATE SET
          courier_name = EXCLUDED.courier_name,
          tracking_url = EXCLUDED.tracking_url;
        `,
        [
          orderRow.id,
          orderRow.order_number,
          shipmentRow.courier_name,
          shipmentRow.tracking_number,
          shipmentRow.tracking_url,
          shipmentRow.shipped_at || new Date().toISOString()
        ]
      );
    }
  } catch (_) {
    // Non-blocking background sync
  }
}

async function getNeonStatus() {
  const activePool = getNeonPool();
  if (!activePool) {
    return { connected: false, error: 'DATABASE_URL not set' };
  }
  const res = await activePool.query(`
    SELECT
      current_database() AS database_name,
      current_user AS db_user,
      version() AS pg_version,
      (SELECT COUNT(*)::int FROM scha_products) AS products_count,
      (SELECT COUNT(*)::int FROM scha_orders) AS orders_count,
      (SELECT COUNT(*)::int FROM scha_shipments) AS shipments_count
  `);
  return {
    connected: true,
    orgId: process.env.NEON_ORG_ID || 'org-raspy-frog-72240483',
    projectId: process.env.NEON_PROJECT_ID || 'hidden-darkness-70899208',
    branch: process.env.NEON_BRANCH || 'production',
    pooledConnection: Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.includes('-pooler')),
    ...res.rows[0]
  };
}

module.exports = {
  getNeonPool,
  migrateNeonSchema,
  syncSqliteToNeon,
  syncOrderToNeon,
  getNeonStatus
};
