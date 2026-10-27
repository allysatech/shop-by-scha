require('./env');
const path=require('node:path');const fs=require('node:fs');
const usePostgres=Boolean(process.env.DATABASE_URL || (process.env.SCHA_DATABASE==='pglite' && process.env.SCHA_ENV==='test'));
const DB_PATH=process.env.DB_PATH || path.join(__dirname,'..','data','shop_by_scha.sqlite');
let db,postgresTransaction;
if(usePostgres){({db,transaction:postgresTransaction}=require('./postgres').createPostgres());}
else {
  if(process.env.VERCEL)throw new Error('Durable DATABASE_URL is required on Vercel. Ephemeral SQLite checkout is disabled.');
  const {DatabaseSync}=require('node:sqlite');fs.mkdirSync(path.dirname(DB_PATH),{recursive:true});
  db=new DatabaseSync(DB_PATH);db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.driver='sqlite';db.columns=table=>db.prepare('PRAGMA table_info('+table+')').all();
}
async function initSchema() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      role TEXT NOT NULL CHECK(role IN ('CUSTOMER', 'ADMIN')) DEFAULT 'CUSTOMER',
      mfa_enabled INTEGER NOT NULL DEFAULT 0,
      mfa_code TEXT DEFAULT NULL,
      is_demo INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK(status IN ('active', 'anonymised', 'suspended')) DEFAULT 'active',
      retention_note TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL,
      login_context TEXT NOT NULL CHECK(login_context IN ('customer', 'admin')),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      token_preview TEXT,
      expires_at TEXT NOT NULL,
      used_at TEXT DEFAULT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      description TEXT NOT NULL,
      image_path TEXT NOT NULL,
      slot_code TEXT NOT NULL,
      focal_point TEXT NOT NULL DEFAULT '50% 50%',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference_id TEXT UNIQUE,
      reference_order INTEGER,
      record_type TEXT NOT NULL CHECK(record_type IN ('draft_product_reference', 'confirmed_product')) DEFAULT 'draft_product_reference',
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      brand TEXT NOT NULL,
      category_slug TEXT NOT NULL REFERENCES categories(slug),
      description TEXT NOT NULL DEFAULT '',
      specifications_json TEXT NOT NULL DEFAULT '{}',
      shipping_returns_note TEXT NOT NULL DEFAULT '',
      model TEXT DEFAULT NULL,
      sellable_sku TEXT UNIQUE DEFAULT NULL,
      price_minor INTEGER DEFAULT NULL,
      currency TEXT NOT NULL DEFAULT 'MYR',
      stock_quantity INTEGER DEFAULT NULL,
      low_stock_threshold INTEGER NOT NULL DEFAULT 3,
      weight_grams INTEGER DEFAULT NULL,
      dimensions_cm TEXT DEFAULT NULL,
      seo_title TEXT DEFAULT NULL,
      seo_description TEXT DEFAULT NULL,
      reference_colour_description TEXT DEFAULT NULL,
      confirmed_attributes_json TEXT NOT NULL DEFAULT '{}',
      publish_status TEXT NOT NULL CHECK(publish_status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
      purchase_enabled INTEGER NOT NULL DEFAULT 0,
      duplicate_review_required INTEGER NOT NULL DEFAULT 0,
      duplicate_resolution_status TEXT NOT NULL DEFAULT 'not_applicable',
      duplicate_merged_into_id INTEGER DEFAULT NULL REFERENCES products(id),
      related_reference_ids_json TEXT NOT NULL DEFAULT '[]',
      pending_confirmation_json TEXT NOT NULL DEFAULT '[]',
      notes TEXT DEFAULT '',
      source_filename TEXT DEFAULT NULL,
      source_library_file_id TEXT DEFAULT NULL,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      slot_code TEXT NOT NULL DEFAULT 'P01',
      path TEXT NOT NULL,
      alt TEXT NOT NULL,
      media_type TEXT NOT NULL DEFAULT 'image',
      width INTEGER DEFAULT NULL,
      height INTEGER DEFAULT NULL,
      sha256 TEXT DEFAULT NULL,
      document_preview_bounds_json TEXT DEFAULT NULL,
      focal_point TEXT NOT NULL DEFAULT '50% 50%',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      sku TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      attributes_json TEXT NOT NULL DEFAULT '{}',
      price_minor INTEGER NOT NULL CHECK(price_minor > 0),
      on_hand INTEGER NOT NULL CHECK(on_hand >= 0),
      reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved >= 0),
      low_stock_threshold INTEGER NOT NULL DEFAULT 3,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_demo INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_id INTEGER NOT NULL REFERENCES product_variants(id),
      sku TEXT NOT NULL,
      delta_on_hand INTEGER NOT NULL DEFAULT 0,
      delta_reserved INTEGER NOT NULL DEFAULT 0,
      before_on_hand INTEGER NOT NULL,
      after_on_hand INTEGER NOT NULL,
      before_reserved INTEGER NOT NULL,
      after_reserved INTEGER NOT NULL,
      movement_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      order_id INTEGER DEFAULT NULL,
      actor_user_id INTEGER DEFAULT NULL,
      actor_email TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS carts (
      id TEXT PRIMARY KEY,
      user_id INTEGER DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
      discount_code TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      variant_id INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(cart_id, variant_id)
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL DEFAULT 'Home',
      recipient_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      line1 TEXT NOT NULL,
      line2 TEXT DEFAULT '',
      postcode TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'Malaysia',
      is_default_shipping INTEGER NOT NULL DEFAULT 0,
      is_default_billing INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_instruction_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_number INTEGER NOT NULL UNIQUE,
      is_live_configured INTEGER NOT NULL DEFAULT 0,
      demo_qr_enabled INTEGER NOT NULL DEFAULT 1,
      recipient_name TEXT NOT NULL DEFAULT '',
      bank_name TEXT NOT NULL DEFAULT '',
      account_number TEXT NOT NULL DEFAULT '',
      manual_transfer_enabled INTEGER NOT NULL DEFAULT 0,
      qr_image_path TEXT DEFAULT NULL,
      payment_deadline_minutes INTEGER NOT NULL DEFAULT 30,
      review_window_hours INTEGER NOT NULL DEFAULT 24,
      notes TEXT DEFAULT '',
      created_by_user_id INTEGER DEFAULT NULL,
      created_by_email TEXT NOT NULL DEFAULT 'system',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE,
      user_id INTEGER DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
      customer_email TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      guest_token_hash TEXT DEFAULT NULL,
      guest_access_token TEXT DEFAULT NULL,
      guest_token_expires_at TEXT DEFAULT NULL,
      payment_status TEXT NOT NULL CHECK(payment_status IN (
        'awaiting_payment',
        'under_review',
        'needs_resubmission',
        'paid',
        'expired_cancelled',
        'refund_pending',
        'partially_refunded',
        'refunded'
      )) DEFAULT 'awaiting_payment',
      fulfilment_status TEXT NOT NULL CHECK(fulfilment_status IN (
        'unfulfilled',
        'processing',
        'shipped',
        'delivered',
        'cancelled'
      )) DEFAULT 'unfulfilled',
      reconciliation_required INTEGER NOT NULL DEFAULT 0,
      reconciliation_reason TEXT DEFAULT NULL,
      currency TEXT NOT NULL DEFAULT 'MYR',
      subtotal_minor INTEGER NOT NULL,
      discount_minor INTEGER NOT NULL DEFAULT 0,
      discount_code TEXT DEFAULT NULL,
      shipping_minor INTEGER NOT NULL,
      shipping_zone TEXT NOT NULL,
      shipping_method TEXT NOT NULL,
      tax_minor INTEGER NOT NULL DEFAULT 0,
      total_minor INTEGER NOT NULL,
      refunded_minor INTEGER NOT NULL DEFAULT 0,
      shipping_address_snapshot_json TEXT NOT NULL,
      billing_address_snapshot_json TEXT NOT NULL,
      payment_instruction_version_id INTEGER NOT NULL REFERENCES payment_instruction_versions(id),
      payment_instructions_snapshot_json TEXT NOT NULL,
      payment_deadline_at TEXT NOT NULL,
      review_window_expires_at TEXT DEFAULT NULL,
      resubmission_reason TEXT DEFAULT NULL,
      paid_at TEXT DEFAULT NULL,
      paid_verified_by_email TEXT DEFAULT NULL,
      paid_bank_reference TEXT DEFAULT NULL,
      cancellation_requested INTEGER NOT NULL DEFAULT 0,
      cancellation_reason TEXT DEFAULT NULL,
      return_requested INTEGER NOT NULL DEFAULT 0,
      return_reason TEXT DEFAULT NULL,
      internal_notes TEXT DEFAULT '',
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL,
      variant_id INTEGER NOT NULL,
      reference_id_snapshot TEXT DEFAULT NULL,
      title_snapshot TEXT NOT NULL,
      brand_snapshot TEXT NOT NULL,
      sku_snapshot TEXT NOT NULL,
      variant_title_snapshot TEXT NOT NULL,
      image_snapshot TEXT NOT NULL,
      unit_price_minor INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      line_total_minor INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      variant_id INTEGER NOT NULL REFERENCES product_variants(id),
      sku TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      status TEXT NOT NULL CHECK(status IN (
        'active_payment_hold',
        'active_review_hold',
        'committed',
        'released_expired',
        'released_cancelled'
      )),
      payment_deadline_at TEXT NOT NULL,
      review_window_expires_at TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      declared_reference TEXT NOT NULL,
      declared_amount_minor INTEGER NOT NULL,
      declared_paid_at TEXT DEFAULT NULL,
      receipt_filename TEXT NOT NULL,
      receipt_original_name TEXT NOT NULL,
      receipt_mime_type TEXT NOT NULL,
      receipt_size_bytes INTEGER NOT NULL,
      submitted_after_deadline INTEGER NOT NULL DEFAULT 0,
      amount_mismatch INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK(status IN ('under_review', 'approved', 'needs_resubmission', 'reconciliation')) DEFAULT 'under_review',
      submitted_by_role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      submission_id INTEGER DEFAULT NULL REFERENCES payment_submissions(id),
      action TEXT NOT NULL CHECK(action IN ('confirm_payment', 'request_resubmission', 'flag_reconciliation')),
      received_amount_minor INTEGER DEFAULT NULL,
      actual_bank_reference TEXT DEFAULT NULL,
      bank_records_checked INTEGER NOT NULL DEFAULT 0,
      audit_note TEXT NOT NULL,
      resubmission_reason TEXT DEFAULT NULL,
      actor_user_id INTEGER NOT NULL,
      actor_email TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_confirmed_bank_ref
      ON payment_reviews(actual_bank_reference)
      WHERE action = 'confirm_payment' AND actual_bank_reference IS NOT NULL;

    CREATE TABLE IF NOT EXISTS manual_refunds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('refund_pending', 'completed', 'cancelled')) DEFAULT 'refund_pending',
      amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
      reason TEXT NOT NULL,
      external_bank_reference TEXT DEFAULT NULL,
      transferred_at TEXT DEFAULT NULL,
      restocked INTEGER NOT NULL DEFAULT 0,
      initiated_by_email TEXT NOT NULL,
      completed_by_email TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      courier_name TEXT NOT NULL,
      tracking_number TEXT NOT NULL,
      tracking_url TEXT NOT NULL,
      shipped_at TEXT NOT NULL,
      delivered_at TEXT DEFAULT NULL,
      delivery_confirmed_by TEXT DEFAULT NULL,
      actor_email TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS status_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payment_status TEXT NOT NULL,
      fulfilment_status TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      actor_email TEXT DEFAULT NULL,
      customer_visible INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      recipient_email TEXT NOT NULL,
      template_type TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      subject TEXT NOT NULL,
      body_text TEXT NOT NULL,
      action_url TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('sent_logged', 'pending_smtp', 'failed')),
      attempt_count INTEGER NOT NULL DEFAULT 1,
      last_error TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS content_sections (
      section_key TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      draft_json TEXT NOT NULL,
      published_json TEXT NOT NULL,
      has_unpublished_changes INTEGER NOT NULL DEFAULT 0,
      updated_by_email TEXT DEFAULT 'system',
      updated_at TEXT NOT NULL,
      published_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS store_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      store_name TEXT NOT NULL DEFAULT 'Shop by SCHA',
      tagline TEXT NOT NULL DEFAULT 'A considered edit. Chosen by SCHA.',
      support_email TEXT NOT NULL DEFAULT '',
      support_phone TEXT NOT NULL DEFAULT '',
      business_address TEXT NOT NULL DEFAULT '',
      currency TEXT NOT NULL DEFAULT 'MYR',
      timezone TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
      design_preview_enabled INTEGER NOT NULL DEFAULT 1,
      shipping_zones_json TEXT NOT NULL,
      tax_config_json TEXT NOT NULL,
      policies_json TEXT NOT NULL,
      physical_stores_json TEXT NOT NULL DEFAULT '[]',
      smtp_configured INTEGER NOT NULL DEFAULT 0,
      session_tracking_connected INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      consent_given INTEGER NOT NULL CHECK(consent_given = 1),
      consent_text TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('subscribed', 'unsubscribed')) DEFAULT 'subscribed',
      unsubscribe_token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER DEFAULT NULL,
      actor_email TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stored_objects (
      key TEXT PRIMARY KEY,
      content_type TEXT NOT NULL,
      data_base64 TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

async function runTransaction(fn) {
  if (postgresTransaction) return postgresTransaction(fn);
  db.exec('BEGIN IMMEDIATE TRANSACTION');
  try {const result=await fn();db.exec('COMMIT');return result;}
  catch(e){db.exec('ROLLBACK');throw e;}
}
const ready=(async()=>{
  if(usePostgres && !require('./runtime').sandbox && process.env.SCHA_MIGRATE!=='1'){await db.prepare('SELECT id FROM store_settings LIMIT 1').all();return;}
  await initSchema();
  await db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_ref_ci ON payment_reviews(UPPER(actual_bank_reference)) WHERE action = 'confirm_payment' AND actual_bank_reference IS NOT NULL");
  const columns = await db.columns('products');
  if (!columns.some(c=>c.name==='stock_type')) await db.exec("ALTER TABLE products ADD COLUMN stock_type TEXT NOT NULL DEFAULT 'unconfirmed'");
  const settingsColumns=await db.columns('store_settings');
  for (const key of ['support_hours','founder_story','sourcing_info','business_identity']) if(!settingsColumns.some(c=>c.name===key)) await db.exec(`ALTER TABLE store_settings ADD COLUMN ${key} TEXT NOT NULL DEFAULT ''`);
  if(!(await db.columns('notification_jobs')).some(c=>c.name==='provider_message_id')) await db.exec('ALTER TABLE notification_jobs ADD COLUMN provider_message_id TEXT');
  await db.exec(`CREATE TABLE IF NOT EXISTS checkout_requests (
    scope TEXT NOT NULL, request_key TEXT NOT NULL, order_id INTEGER NOT NULL REFERENCES orders(id),
    PRIMARY KEY(scope,request_key)
  )`);
})();
module.exports={db,ready,runTransaction,initSchema,DB_PATH};
