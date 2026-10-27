const {sandbox}=require('./runtime');
const fs = require('node:fs');
const path = require('node:path');
const { db, runTransaction } = require('./db');
const { hashPassword, generateToken, hashToken } = require('./auth');

const { PRIVATE_RECEIPTS_DIR } = require('./uploads');

function ensureSamplePrivateReceipt() {
  const receiptDir = PRIVATE_RECEIPTS_DIR;
  if (!fs.existsSync(receiptDir)) {
    fs.mkdirSync(receiptDir, { recursive: true });
  }
  const sampleFile = path.join(receiptDir, 'demo_receipt_scha_001.png');
  if (!fs.existsSync(sampleFile)) {
    // Copy one of the small valid PNGs or create a minimal valid 1x1 PNG for demo receipt preview
    const minimalPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    fs.writeFileSync(sampleFile, minimalPng);
  }
  return 'demo_receipt_scha_001.png';
}

async function seedIfNeeded() {
  const existingUsers = (await db.prepare('SELECT COUNT(*) AS count FROM users').get()).count;
  if (existingUsers > 0) {
    return;
  }

  if(!sandbox && ((await db.prepare('SELECT COUNT(*) AS n FROM products').get()).n>0 || (await db.prepare('SELECT COUNT(*) AS n FROM orders').get()).n>0))throw new Error('Existing business records require explicit migration/provisioning review.');
  if(!sandbox && process.env.SCHA_PROVISION !== '1') throw new Error('Store setup required. Run the explicit provisioning command with merchant admin credentials.');
  const now = new Date('2026-10-26T06:00:00.000Z').toISOString();
  const cataloguePath = path.join(__dirname, '..', 'data', 'catalogue', 'catalogue.json');
  const catalogueData = JSON.parse(fs.readFileSync(cataloguePath, 'utf8'));
  const sampleReceiptFile = ensureSamplePrivateReceipt();

  await runTransaction(async () => {
    // 1. Provision Initial Admin outside public registration
    const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@shopbyscha.my').trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || (sandbox ? 'SchaAdmin!2026' : '');
    if(!adminPassword || adminPassword.length<12)throw new Error('Provide a unique ADMIN_PASSWORD of at least 12 characters.');
    const insertUser = db.prepare(`
      INSERT INTO users (email, password_hash, name, phone, role, mfa_enabled, mfa_code, is_demo, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `);

    const adminRes = await insertUser.run(
      adminEmail,
      hashPassword(adminPassword),
      'SCHA Store Admin',
      '+6012-300 0000',
      'ADMIN',
      0,
      '261026',
      0,
      now,
      now
    );
    const adminUserId = Number(adminRes.lastInsertRowid);

    // 2. Demo Customers
    const custARes = await insertUser.run(
      'customer@example.com',
      hashPassword('Customer!2026'),
      'Customer A [demo]',
      '+6012-345 6789',
      'CUSTOMER',
      0,
      null,
      1,
      now,
      now
    );
    const custAId = Number(custARes.lastInsertRowid);

    const custBRes = await insertUser.run(
      'customer.b@example.com',
      hashPassword('Customer!2026'),
      'Customer B [demo]',
      '+6017-888 1234',
      'CUSTOMER',
      0,
      null,
      1,
      now,
      now
    );
    const custBId = Number(custBRes.lastInsertRowid);

    const custCRes = await insertUser.run(
      'customer.c@example.com',
      hashPassword('Customer!2026'),
      'Customer C [demo]',
      '+6019-222 5678',
      'CUSTOMER',
      0,
      null,
      1,
      now,
      now
    );
    const custCId = Number(custCRes.lastInsertRowid);

    // 3. Demo Customer Addresses
    const insertAddr = db.prepare(`
      INSERT INTO addresses (user_id, label, recipient_name, phone, line1, line2, postcode, city, state, country, is_default_shipping, is_default_billing, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Malaysia', ?, ?, ?, ?)
    `);
    await insertAddr.run(
      custAId,
      'Home (Bangsar)',
      'Customer A [demo]',
      '+6012-345 6789',
      'No. 18, Jalan Telawi 3',
      'Bangsar Baru',
      '59100',
      'Kuala Lumpur',
      'Wilayah Persekutuan Kuala Lumpur',
      1,
      1,
      now,
      now
    );
    await insertAddr.run(
      custAId,
      'Studio (PJ)',
      'Customer A [demo]',
      '+6012-345 6789',
      'Unit 5-02, The Five, Kompleks Pejabat Damansara',
      'Jalan Dungun',
      '50490',
      'Kuala Lumpur',
      'Wilayah Persekutuan Kuala Lumpur',
      0,
      0,
      now,
      now
    );
    await insertAddr.run(
      custBId,
      'Home',
      'Customer B [demo]',
      '+6017-888 1234',
      '42 Lebuh Pantai',
      '',
      '10300',
      'George Town',
      'Pulau Pinang',
      1,
      1,
      now,
      now
    );

    // 4. Categories (C01-C04)
    const insertCategory = db.prepare(`
      INSERT INTO categories (slug, name, subtitle, description, image_path, slot_code, focal_point, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, '50% 50%', ?)
    `);
    await insertCategory.run(
      'eyewear',
      'Eyewear',
      'Optical & Sculptural Frames',
      'Architectural silhouettes, silver rectangular frames and bold acetate eyewear references.',
      '/images/03_gentle_monster_silver_rectangular_frame.png',
      'C01',
      1
    );
    await insertCategory.run(
      'bags',
      'Bags',
      'Top-handle & Flap Silhouettes',
      'Playful structured mini bags, top-handle icons and statement colourways.',
      '/images/06_jacquemus_pink_top_handle_bag.png',
      'C02',
      2
    );
    await insertCategory.run(
      'beauty',
      'Beauty',
      'Complexion & Lip Edit',
      'Luminous finishes, soft-focus setting powders and signature lip references.',
      '/images/10_charlotte_tilbury_airbrush_flawless_finish_powder.png',
      'C03',
      3
    );
    await insertCategory.run(
      'footwear',
      'Footwear',
      'Low-profile Everyday Sneakers',
      'Sleek pastel profiles selected for effortless daily styling.',
      '/images/12_onitsuka_tiger_pink_sneakers.png',
      'C04',
      4
    );

    // 5. All 12 Supplied Product Catalogue References (REF-01 through REF-12)
    // Strictly preserving null price, null stock, draft status, and purchase_enabled = 0
    const insertProduct = db.prepare(`
      INSERT INTO products (
        reference_id, reference_order, record_type, title, slug, brand, category_slug,
        description, specifications_json, shipping_returns_note, model, sellable_sku,
        price_minor, currency, stock_quantity, low_stock_threshold,
        reference_colour_description, confirmed_attributes_json,
        publish_status, purchase_enabled, duplicate_review_required, duplicate_resolution_status,
        related_reference_ids_json, pending_confirmation_json, notes,
        source_filename, source_library_file_id, is_demo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 3, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `);

    const insertMedia = db.prepare(`
      INSERT INTO product_media (
        product_id, slot_code, path, alt, media_type, width, height, sha256, document_preview_bounds_json, focal_point, sort_order
      ) VALUES (?, ?, ?, ?, 'image', ?, ?, ?, ?, '50% 50%', ?)
    `);

    for (const item of catalogueData.products) {
      const catSlug = item.category.toLowerCase();
      const dupStatus = item.duplicate_review_required ? 'pending' : 'not_applicable';
      const specs = {
        reference_id: item.reference_id,
        brand: item.brand,
        category: item.category,
        colour_reference: item.reference_colour_description || 'To confirm',
        model_code: 'To confirm before publication',
        selling_unit: 'To confirm before publication'
      };
      const prodRes = await insertProduct.run(
        item.reference_id,
        item.reference_order,
        item.record_type, // 'draft_product_reference'
        item.title,
        item.slug,
        item.brand,
        catSlug,
        `${item.title} (${item.reference_id}). ${item.notes}`,
        JSON.stringify(specs),
        'Standard Malaysia shipping rates and return eligibility apply once confirmed in Store Settings.',
        item.model, // null
        item.sellable_sku, // null
        item.price_minor, // null
        item.currency || 'MYR',
        item.stock_quantity, // null
        item.reference_colour_description,
        JSON.stringify({}),
        item.publish_status, // 'draft'
        item.purchase_enabled ? 1 : 0, // 0
        item.duplicate_review_required ? 1 : 0,
        dupStatus,
        JSON.stringify(item.related_reference_ids || []),
        JSON.stringify(item.pending_confirmation || []),
        item.notes || '',
        item.source_filename || null,
        item.source_library_file_id || null,
        now,
        now
      );
      const productId = Number(prodRes.lastInsertRowid);

      await Promise.all((item.images || []).map(async (img, idx) => {
        await insertMedia.run(
          productId,
          `P0${idx + 1}`,
          '/' + img.path.replace(/^\/+/, ''),
          img.alt,
          img.width,
          img.height,
          img.sha256,
          img.document_preview_bounds ? JSON.stringify(img.document_preview_bounds) : null,
          idx + 1
        );
      }));
    }

    // 6. Demo Sandbox Sellable Product & SKUs (matching PDF Wireframe Pages 7, 8, 9, 10, 15:
    // Product 01 / Variant A [SCHA-001-A, RM129.00, On hand 12, Reserved 2, Available 10],
    // SCHA-002-A [On hand 4, Reserved 1, Available 3], SCHA-003-A [On hand 0, Reserved 0, Available 0])
    const demoProdRes = await db.prepare(`
      INSERT INTO products (
        reference_id, reference_order, record_type, title, slug, brand, category_slug,
        description, specifications_json, shipping_returns_note, model, sellable_sku,
        price_minor, currency, stock_quantity, low_stock_threshold,
        reference_colour_description, confirmed_attributes_json,
        publish_status, purchase_enabled, duplicate_review_required, duplicate_resolution_status,
        related_reference_ids_json, pending_confirmation_json, notes,
        is_demo, created_at, updated_at
      ) VALUES (
        'DEMO-01', 99, 'confirmed_product', 'Product 01 [Demo Sellable Sandbox]', 'demo-product-01',
        'Shop by SCHA Demo', 'bags',
        'Explicit DEMO sandbox product pre-configured with confirmed price (RM129.00) and inventory SKUs (SCHA-001-A, SCHA-002-A, SCHA-003-A) matching the wireframe blueprint so you can test the complete Cart -> Checkout -> DuitNow QR -> Receipt Upload -> Admin Verification flow immediately. All 12 supplied catalogue references (REF-01 to REF-12) remain unconfirmed drafts until published by Admin.',
        '{"demo_record": "Yes - excluded from live analytics", "sku_series": "SCHA-001-A / SCHA-002-A / SCHA-003-A"}',
        'Demo shipping RM8.00 (West Malaysia) / RM15.00 (East Malaysia).',
        'DEMO-MODEL-01', 'SCHA-001-A',
        12900, 'MYR', 16, 5,
        'Pink', '{"colour":"Pink","model_size":"Mini [Demo]"}',
        'published', 1, 0, 'not_applicable',
        '[]', '[]', 'Explicit DEMO sandbox item for end-to-end checkout testing.',
        1, ?, ?
      )
    `).run(now, now);
    const demoProductId = Number(demoProdRes.lastInsertRowid);

    await insertMedia.run(
      demoProductId,
      'P01',
      '/images/08_jacquemus_pink_flap_handbag.png',
      'Product 01 [Demo Sellable Sandbox]',
      1296,
      1296,
      null,
      JSON.stringify([268, 378, 1029, 954]),
      1
    );

    const insertVariant = db.prepare(`
      INSERT INTO product_variants (
        product_id, sku, title, attributes_json, price_minor, on_hand, reserved, low_stock_threshold, is_active, is_demo, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, ?, ?)
    `);

    const v1Res = await insertVariant.run(
      demoProductId,
      'SCHA-001-A',
      'Variant A',
      JSON.stringify({ colour: 'Pink', model_size: 'Variant A' }),
      12900,
      12,
      2,
      5,
      now,
      now
    );
    const var1Id = Number(v1Res.lastInsertRowid);

    const v2Res = await insertVariant.run(
      demoProductId,
      'SCHA-002-A',
      'Variant B (Low Stock)',
      JSON.stringify({ colour: 'Pink', model_size: 'Variant B' }),
      12900,
      4,
      1,
      5,
      now,
      now
    );
    const var2Id = Number(v2Res.lastInsertRowid);

    const v3Res = await insertVariant.run(
      demoProductId,
      'SCHA-003-A',
      'Variant C (Sold Out)',
      JSON.stringify({ colour: 'Pink', model_size: 'Variant C' }),
      12900,
      0,
      0,
      5,
      now,
      now
    );
    const var3Id = Number(v3Res.lastInsertRowid);

    const insertMovement = db.prepare(`
      INSERT INTO stock_movements (
        variant_id, sku, delta_on_hand, delta_reserved, before_on_hand, after_on_hand, before_reserved, after_reserved,
        movement_type, reason, order_id, actor_user_id, actor_email, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    await insertMovement.run(var1Id, 'SCHA-001-A', 12, 2, 0, 12, 0, 2, 'initial_seed', 'Initial DEMO inventory seed (Wireframe Page 15)', null, adminUserId, adminEmail, now);
    await insertMovement.run(var2Id, 'SCHA-002-A', 4, 1, 0, 4, 0, 1, 'initial_seed', 'Initial DEMO inventory seed (Wireframe Page 15)', null, adminUserId, adminEmail, now);
    await insertMovement.run(var3Id, 'SCHA-003-A', 0, 0, 0, 0, 0, 0, 'initial_seed', 'Initial DEMO inventory seed (Wireframe Page 15)', null, adminUserId, adminEmail, now);

    // 7. Payment Instruction Version 1 (Unconfigured Live QR + Demo QR Placeholder Q01 enabled for testing)
    const payVerRes = await db.prepare(`
      INSERT INTO payment_instruction_versions (
        version_number, is_live_configured, demo_qr_enabled, recipient_name, bank_name, account_number,
        manual_transfer_enabled, qr_image_path, payment_deadline_minutes, review_window_hours,
        notes, created_by_user_id, created_by_email, created_at
      ) VALUES (
        1, 0, 1,
        'SCHA STUDIO SDN BHD [DEMO - TO CONFIGURE]',
        'Merchant Acquiring Bank [To Configure]',
        '',
        0,
        null,
        30,
        24,
        'Initial setup state: No live bank-issued DuitNow QR has been uploaded yet. Q01 placeholder is non-scannable.',
        ?, ?, ?
      )
    `).run(adminUserId, adminEmail, now);
    const payVerId = Number(payVerRes.lastInsertRowid);

    const paySnapshot = JSON.stringify({
      version_number: 1,
      is_live_configured: false,
      demo_qr_enabled: true,
      recipient_name: 'SCHA STUDIO SDN BHD [DEMO - TO CONFIGURE]',
      bank_name: 'Merchant Acquiring Bank [To Configure]',
      manual_transfer_enabled: false,
      qr_image_path: null,
      payment_deadline_minutes: 30,
      review_window_hours: 24
    });

    // 8. Seed Demo Orders (#SCHA-001, #SCHA-002, #SCHA-003, #SCHA-004, #SCHA-005) matching Wireframe Pages 8-16
    const defaultAddrSnapshot = JSON.stringify({
      recipient_name: 'Customer A [demo]',
      phone: '+6012-345 6789',
      line1: 'No. 18, Jalan Telawi 3',
      line2: 'Bangsar Baru',
      postcode: '59100',
      city: 'Kuala Lumpur',
      state: 'Wilayah Persekutuan Kuala Lumpur',
      country: 'Malaysia'
    });

    const insertOrder = db.prepare(`
      INSERT INTO orders (
        order_number, user_id, customer_email, customer_name, customer_phone,
        guest_token_hash, guest_access_token, guest_token_expires_at,
        payment_status, fulfilment_status, currency,
        subtotal_minor, discount_minor, shipping_minor, shipping_zone, shipping_method, tax_minor, total_minor,
        shipping_address_snapshot_json, billing_address_snapshot_json,
        payment_instruction_version_id, payment_instructions_snapshot_json,
        payment_deadline_at, review_window_expires_at, resubmission_reason,
        paid_at, paid_verified_by_email, paid_bank_reference,
        internal_notes, is_demo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MYR', ?, 0, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

    const insertOrderItem = db.prepare(`
      INSERT INTO order_items (
        order_id, product_id, variant_id, reference_id_snapshot, title_snapshot, brand_snapshot,
        sku_snapshot, variant_title_snapshot, image_snapshot, unit_price_minor, quantity, line_total_minor
      ) VALUES (?, ?, ?, 'DEMO-01', 'Product 01', 'Shop by SCHA', ?, ?, '/images/08_jacquemus_pink_flap_handbag.png', ?, ?, ?)
    `);

    const insertEvent = db.prepare(`
      INSERT INTO status_events (
        order_id, event_type, payment_status, fulfilment_status, title, detail, actor_role, actor_email, customer_visible, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const deadlineFuture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Order #SCHA-001: Paid / Processing (RM137.00 [demo]) - matches Page 9 & 15
    const guestTok1 = 'demo-guest-token-scha-001-verified';
    const o1Res = await insertOrder.run(
      'SCHA-001',
      custAId,
      'customer@example.com',
      'Customer A [demo]',
      '+6012-345 6789',
      hashToken(guestTok1),
      guestTok1,
      deadlineFuture,
      'paid',
      'processing',
      12900,
      800,
      'West Malaysia',
      'Standard Tracked Courier (Demo)',
      13700,
      defaultAddrSnapshot,
      defaultAddrSnapshot,
      payVerId,
      paySnapshot,
      deadlineFuture,
      deadlineFuture,
      null,
      '2026-10-25T10:15:00.000Z',
      adminEmail,
      'DNQR-DEMO-20261025-001',
      'Demo order matching Wireframe Page 9 & 15.',
      '2026-10-25T09:30:00.000Z',
      '2026-10-25T10:20:00.000Z'
    );
    const o1Id = Number(o1Res.lastInsertRowid);
    await insertOrderItem.run(o1Id, demoProductId, var1Id, 'SCHA-001-A', 'Variant A', 12900, 1, 12900);
    await insertEvent.run(o1Id, 'order_created', 'awaiting_payment', 'unfulfilled', 'Order received', 'Awaiting payment via DuitNow QR', 'CUSTOMER', 'customer@example.com', 1, '2026-10-25T09:30:00.000Z');
    await insertEvent.run(o1Id, 'receipt_submitted', 'under_review', 'unfulfilled', 'Receipt submitted', 'Payment under review (Ref: CUST-REF-8821)', 'CUSTOMER', 'customer@example.com', 1, '2026-10-25T09:42:00.000Z');
    await insertEvent.run(o1Id, 'payment_confirmed', 'paid', 'unfulfilled', 'Payment confirmed', 'Admin verified received transaction in seller bank records (Ref: DNQR-DEMO-20261025-001)', 'ADMIN', adminEmail, 1, '2026-10-25T10:15:00.000Z');
    await insertEvent.run(o1Id, 'fulfilment_processing', 'paid', 'processing', 'Preparing your order', 'Delivery: Processing', 'ADMIN', adminEmail, 1, '2026-10-25T10:20:00.000Z');

    const sub1Res = await db.prepare(`
      INSERT INTO payment_submissions (
        order_id, declared_reference, declared_amount_minor, declared_paid_at,
        receipt_filename, receipt_original_name, receipt_mime_type, receipt_size_bytes,
        submitted_after_deadline, amount_mismatch, status, submitted_by_role, created_at
      ) VALUES (?, 'CUST-REF-8821', 13700, '2026-10-25T09:41:00.000Z', ?, 'duitnow_receipt_scha001.png', 'image/png', 68, 0, 0, 'approved', 'CUSTOMER', '2026-10-25T09:42:00.000Z')
    `).run(o1Id, sampleReceiptFile);
    await db.prepare(`
      INSERT INTO payment_reviews (
        order_id, submission_id, action, received_amount_minor, actual_bank_reference,
        bank_records_checked, audit_note, actor_user_id, actor_email, created_at
      ) VALUES (?, ?, 'confirm_payment', 13700, 'DNQR-DEMO-20261025-001', 1, 'Verified in demo merchant statement.', ?, ?, '2026-10-25T10:15:00.000Z')
    `).run(o1Id, Number(sub1Res.lastInsertRowid), adminUserId, adminEmail);

    // Order #SCHA-002: Paid / Shipped (RM258.00 [demo]) - matches Page 11 & 13
    const o2Res = await insertOrder.run(
      'SCHA-002',
      custAId,
      'customer@example.com',
      'Customer A [demo]',
      '+6012-345 6789',
      null,
      'demo-guest-token-scha-002',
      deadlineFuture,
      'paid',
      'shipped',
      25800,
      0,
      'West Malaysia',
      'Standard Tracked Courier (Demo)',
      25800,
      defaultAddrSnapshot,
      defaultAddrSnapshot,
      payVerId,
      paySnapshot,
      deadlineFuture,
      deadlineFuture,
      null,
      '2026-10-20T14:00:00.000Z',
      adminEmail,
      'DNQR-DEMO-20261020-002',
      'Demo shipped order with tracking.',
      '2026-10-20T12:00:00.000Z',
      '2026-10-21T09:00:00.000Z'
    );
    const o2Id = Number(o2Res.lastInsertRowid);
    await insertOrderItem.run(o2Id, demoProductId, var1Id, 'SCHA-001-A', 'Variant A', 12900, 2, 25800);
    await insertEvent.run(o2Id, 'order_created', 'awaiting_payment', 'unfulfilled', 'Order received', 'Awaiting payment', 'CUSTOMER', 'customer@example.com', 1, '2026-10-20T12:00:00.000Z');
    await insertEvent.run(o2Id, 'payment_confirmed', 'paid', 'unfulfilled', 'Payment confirmed', 'Admin verified received transaction (Ref: DNQR-DEMO-20261020-002)', 'ADMIN', adminEmail, 1, '2026-10-20T14:00:00.000Z');
    await insertEvent.run(o2Id, 'order_shipped', 'paid', 'shipped', 'Order shipped', 'Shipped via PosLaju Malaysia (Tracking: PL-MY-88291044)', 'ADMIN', adminEmail, 1, '2026-10-21T09:00:00.000Z');
    await db.prepare(`
      INSERT INTO shipments (order_id, courier_name, tracking_number, tracking_url, shipped_at, actor_email, created_at)
      VALUES (?, 'PosLaju Malaysia', 'PL-MY-88291044', 'https://tracking.pos.com.my/?trackingNo=PL-MY-88291044', '2026-10-21T09:00:00.000Z', ?, '2026-10-21T09:00:00.000Z')
    `).run(o2Id, adminEmail);

    // Order #SCHA-003: Under review / Unfulfilled (RM129.00 [demo]) - matches Page 10 & 11
    const o3Res = await insertOrder.run(
      'SCHA-003',
      custAId,
      'customer@example.com',
      'Customer A [demo]',
      '+6012-345 6789',
      null,
      'demo-guest-token-scha-003',
      deadlineFuture,
      'under_review',
      'unfulfilled',
      12900,
      0,
      'West Malaysia',
      'Standard Tracked Courier (Demo)',
      12900,
      defaultAddrSnapshot,
      defaultAddrSnapshot,
      payVerId,
      paySnapshot,
      deadlineFuture,
      deadlineFuture,
      null,
      null,
      null,
      null,
      'Demo order in Payment Review Queue (Under review).',
      '2026-10-26T04:00:00.000Z',
      '2026-10-26T04:10:00.000Z'
    );
    const o3Id = Number(o3Res.lastInsertRowid);
    await insertOrderItem.run(o3Id, demoProductId, var1Id, 'SCHA-001-A', 'Variant A', 12900, 1, 12900);
    await insertEvent.run(o3Id, 'order_created', 'awaiting_payment', 'unfulfilled', 'Order received', 'Awaiting payment via DuitNow QR', 'CUSTOMER', 'customer@example.com', 1, '2026-10-26T04:00:00.000Z');
    await insertEvent.run(o3Id, 'receipt_submitted', 'under_review', 'unfulfilled', 'Receipt submitted', 'Payment under review — awaiting independent admin verification', 'CUSTOMER', 'customer@example.com', 1, '2026-10-26T04:10:00.000Z');
    await db.prepare(`
      INSERT INTO payment_submissions (
        order_id, declared_reference, declared_amount_minor, declared_paid_at,
        receipt_filename, receipt_original_name, receipt_mime_type, receipt_size_bytes,
        submitted_after_deadline, amount_mismatch, status, submitted_by_role, created_at
      ) VALUES (?, 'MY-DUITNOW-99301', 12900, '2026-10-26T04:09:00.000Z', ?, 'receipt_scha003.png', 'image/png', 68, 0, 0, 'under_review', 'CUSTOMER', '2026-10-26T04:10:00.000Z')
    `).run(o3Id, sampleReceiptFile);
    await db.prepare(`
      INSERT INTO stock_reservations (order_id, variant_id, sku, quantity, status, payment_deadline_at, review_window_expires_at, created_at, updated_at)
      VALUES (?, ?, 'SCHA-001-A', 1, 'active_review_hold', ?, ?, '2026-10-26T04:00:00.000Z', '2026-10-26T04:10:00.000Z')
    `).run(o3Id, var1Id, deadlineFuture, deadlineFuture);

    // Order #SCHA-004: Awaiting payment / Unfulfilled (Customer B [demo])
    const o4Res = await insertOrder.run(
      'SCHA-004',
      custBId,
      'customer.b@example.com',
      'Customer B [demo]',
      '+6017-888 1234',
      null,
      'demo-guest-token-scha-004',
      deadlineFuture,
      'awaiting_payment',
      'unfulfilled',
      12900,
      800,
      'West Malaysia',
      'Standard Tracked Courier (Demo)',
      13700,
      defaultAddrSnapshot,
      defaultAddrSnapshot,
      payVerId,
      paySnapshot,
      deadlineFuture,
      null,
      null,
      null,
      null,
      null,
      'Demo order awaiting payment.',
      '2026-10-26T05:15:00.000Z',
      '2026-10-26T05:15:00.000Z'
    );
    const o4Id = Number(o4Res.lastInsertRowid);
    await insertOrderItem.run(o4Id, demoProductId, var1Id, 'SCHA-001-A', 'Variant A', 12900, 1, 12900);
    await insertEvent.run(o4Id, 'order_created', 'awaiting_payment', 'unfulfilled', 'Order received', 'Awaiting payment via DuitNow QR', 'CUSTOMER', 'customer.b@example.com', 1, '2026-10-26T05:15:00.000Z');
    await db.prepare(`
      INSERT INTO stock_reservations (order_id, variant_id, sku, quantity, status, payment_deadline_at, review_window_expires_at, created_at, updated_at)
      VALUES (?, ?, 'SCHA-001-A', 1, 'active_payment_hold', ?, NULL, '2026-10-26T05:15:00.000Z', '2026-10-26T05:15:00.000Z')
    `).run(o4Id, var1Id, deadlineFuture);

    // Order #SCHA-005: Needs resubmission / Unfulfilled (Customer C [demo])
    const o5Res = await insertOrder.run(
      'SCHA-005',
      custCId,
      'customer.c@example.com',
      'Customer C [demo]',
      '+6019-222 5678',
      null,
      'demo-guest-token-scha-005',
      deadlineFuture,
      'needs_resubmission',
      'unfulfilled',
      12900,
      800,
      'West Malaysia',
      'Standard Tracked Courier (Demo)',
      13700,
      defaultAddrSnapshot,
      defaultAddrSnapshot,
      payVerId,
      paySnapshot,
      deadlineFuture,
      deadlineFuture,
      'Uploaded image was cropped and the DuitNow reference ID was not visible. Please upload the full transaction receipt PDF or screenshot.',
      null,
      null,
      null,
      'Demo order showing Needs Resubmission workflow.',
      '2026-10-25T16:00:00.000Z',
      '2026-10-25T17:00:00.000Z'
    );
    const o5Id = Number(o5Res.lastInsertRowid);
    await insertOrderItem.run(o5Id, demoProductId, var2Id, 'SCHA-002-A', 'Variant B (Low Stock)', 12900, 1, 12900);
    await insertEvent.run(o5Id, 'order_created', 'awaiting_payment', 'unfulfilled', 'Order received', 'Awaiting payment', 'CUSTOMER', 'customer.c@example.com', 1, '2026-10-25T16:00:00.000Z');
    await insertEvent.run(o5Id, 'receipt_submitted', 'under_review', 'unfulfilled', 'Receipt submitted', 'Payment under review', 'CUSTOMER', 'customer.c@example.com', 1, '2026-10-25T16:20:00.000Z');
    await insertEvent.run(o5Id, 'resubmission_requested', 'needs_resubmission', 'unfulfilled', 'Resubmission requested', 'Uploaded image was cropped and the DuitNow reference ID was not visible. Please upload the full transaction receipt PDF or screenshot.', 'ADMIN', adminEmail, 1, '2026-10-25T17:00:00.000Z');
    await db.prepare(`
      INSERT INTO stock_reservations (order_id, variant_id, sku, quantity, status, payment_deadline_at, review_window_expires_at, created_at, updated_at)
      VALUES (?, ?, 'SCHA-002-A', 1, 'active_review_hold', ?, ?, '2026-10-25T16:00:00.000Z', '2026-10-25T17:00:00.000Z')
    `).run(o5Id, var2Id, deadlineFuture, deadlineFuture);

    // 9. Content Sections (H01/H02, N01-N03, E01-E03, C01-C04, B01/Policies)
    const insertContent = db.prepare(`
      INSERT INTO content_sections (section_key, title, draft_json, published_json, has_unpublished_changes, updated_by_email, updated_at, published_at)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?)
    `);

    const heroContent = JSON.stringify({
      slot_desktop: 'H01',
      slot_mobile: 'H02',
      headline: 'your next favourite',
      subheadline: 'A considered edit. Chosen by SCHA.',
      cta_text: 'Shop now',
      cta_link: '/shop',
      hero_reference_id: 'REF-08',
      hero_image_path: '/images/08_jacquemus_pink_flap_handbag.png',
      hero_image_alt: 'Jacquemus Pink Flap Handbag - Reference 08',
      desktop_product_scale: 1.0,
      desktop_offset_y_px: 0,
      mobile_focal_point: '50% 50%',
      show_chrome_accent: true,
      visible: true
    });
    await insertContent.run('H01_H02', 'H01 / H02 — Layered Hero + Display Text + CTA', heroContent, heroContent, adminEmail, now, now);

    const newArrivalsContent = JSON.stringify({
      slot_range: 'N01-N03',
      heading: 'NEW ARRIVALS',
      cta_label: 'View product',
      selected_references: ['REF-08', 'REF-01', 'REF-09'],
      visible: true
    });
    await insertContent.run('N01_N03', 'N01–N03 — Pink New Arrivals Product Selection', newArrivalsContent, newArrivalsContent, adminEmail, now, now);

    const editorialContent = JSON.stringify({
      slot_range: 'E01-E03',
      decorative_word: 'JUST SCHA',
      lead_paragraph: 'Your everyday edit, selected with a little personality.',
      body_paragraph: 'Sculptural frames, statement bags, beauty favourites and everyday sneakers - an edit with a little personality. Find the finishing touches that feel like you.',
      show_chrome_cue: true,
      images: [
      {
        slot: 'E01',
        reference_id: 'REF-04',
        path: '/images/04_gentle_monster_silver_sculptural_frame.png',
        alt: 'Gentle Monster Silver Sculptural Frame — Chrome/Silver Visual Cue',
        caption: 'Silver Sculptural Cue · REF-04',
        focal_point: '50% 50%'
      },
      {
        slot: 'E02',
        reference_id: 'REF-02',
        path: '/images/02_gentle_monster_black_cat_eye_eyewear.png',
        alt: 'Gentle Monster Black Cat-eye Eyewear — Editorial Portrait',
        caption: 'Editorial Eyewear · REF-02',
        focal_point: '50% 50%'
      },
      {
        slot: 'E03',
        reference_id: 'REF-05',
        path: '/images/05_jacquemus_pink_mini_bag_lifestyle.png',
        alt: 'Jacquemus Pink Mini Bag — Lifestyle Reference',
        caption: 'Pink Mini Bag · REF-05',
        focal_point: '50% 50%'
      }],

      visible: true
    });
    await insertContent.run('E01_E03', 'E01–E03 — Editorial Collage + JUST SCHA Copy', editorialContent, editorialContent, adminEmail, now, now);

    const collectionsContent = JSON.stringify({
      slot_range: 'C01-C04',
      heading: 'Our collections',
      items: [
      { slot: 'C01', slug: 'eyewear', title: 'Eyewear', image_path: '/images/03_gentle_monster_silver_rectangular_frame.png', alt: 'Eyewear Collection', link: '/collections/eyewear', focal_point: '50% 50%' },
      { slot: 'C02', slug: 'bags', title: 'Bags', image_path: '/images/06_jacquemus_pink_top_handle_bag.png', alt: 'Bags Collection', link: '/collections/bags', focal_point: '50% 50%' },
      { slot: 'C03', slug: 'beauty', title: 'Beauty', image_path: '/images/10_charlotte_tilbury_airbrush_flawless_finish_powder.png', alt: 'Beauty Collection', link: '/collections/beauty', focal_point: '50% 50%' },
      { slot: 'C04', slug: 'footwear', title: 'Footwear', image_path: '/images/12_onitsuka_tiger_pink_sneakers.png', alt: 'Footwear Collection', link: '/collections/footwear', focal_point: '50% 50%' }],

      visible: true
    });
    await insertContent.run('C01_C04', 'C01–C04 — Eyewear / Bags / Beauty / Footwear', collectionsContent, collectionsContent, adminEmail, now, now);

    const b01Content = JSON.stringify({
      slot: 'B01',
      announcement_enabled: true,
      announcement_text: 'Your next favourite, curated by SCHA.',
      campaign_strip_enabled: false,
      campaign_strip_text: '',
      footer_tagline: 'Playful editorial curation across eyewear, bags, beauty and footwear.',
      newsletter_enabled: true
    });
    await insertContent.run('B01_POLICIES', 'B01 — Optional Campaign / Announcement / Footer Content', b01Content, b01Content, adminEmail, now, now);

    // 10. Store Settings
    const shippingZones = JSON.stringify([
    {
      id: 'west-my',
      name: 'Peninsular Malaysia (West Malaysia)',
      states: [
      'Wilayah Persekutuan Kuala Lumpur', 'Wilayah Persekutuan Putrajaya', 'Selangor',
      'Pulau Pinang', 'Johor', 'Perak', 'Melaka', 'Negeri Sembilan', 'Pahang',
      'Kedah', 'Kelantan', 'Terengganu', 'Perlis'],

      methods: [
      { id: 'std-west', name: 'Standard Tracked Delivery (West MY — Demo Rate)', rate_minor: 800, lead_time: '2–4 business days', is_demo: true }]

    },
    {
      id: 'east-my',
      name: 'East Malaysia (Sabah, Sarawak & Labuan)',
      states: ['Sabah', 'Sarawak', 'Wilayah Persekutuan Labuan'],
      methods: [
      { id: 'std-east', name: 'Standard Air Parcel (East MY — Demo Rate)', rate_minor: 1500, lead_time: '4–7 business days', is_demo: true }]

    }]
    );

    const taxConfig = JSON.stringify({
      tax_enabled: false,
      tax_label: 'SST',
      tax_rate_percent: 0,
      prices_include_tax: true
    });

    const policies = JSON.stringify({
      about: {
        title: 'About Shop by SCHA',
        body: 'Shop by SCHA is an editorial concept store curating eyewear, bags, beauty and footwear with a playful Y2K luxury sensibility. Every item is verified before publication, and orders are processed with personal attention by our team.'
      },
      shipping: {
        title: 'Shipping Information',
        body: 'Orders are dispatched from Malaysia after your DuitNow QR payment has been independently verified by our admin team in our merchant bank statement. Delivery rates are calculated by Malaysian state at checkout. Tracking details are shared by email and inside your order status page as soon as a parcel is handed to the courier.'
      },
      returns: {
        title: 'Returns, Cancellations & Refunds',
        body: 'Unpaid orders may be cancelled before payment confirmation. Eligible return requests must be submitted within the configured return window in original unused condition. Approved refunds are processed manually via external bank transfer by the merchant and recorded with an external bank transfer reference.'
      },
      contact: {
        title: 'Contact & Customer Care',
        body: 'Merchant contact details are configured in Admin Settings. Quote your Order Number (e.g. #SCHA-001) and registered email for any payment verification or delivery enquiries.'
      },
      faq: {
        title: 'Frequently Asked Questions',
        body: '1. How does DuitNow QR checkout work? After placing an order, scan the merchant DuitNow QR, verify the recipient name and exact MYR amount, and upload your JPG/PNG/PDF receipt.\n2. Why does my order say "Payment under review"? Uploading a receipt places your order in our admin verification queue. Your order becomes "Payment confirmed" only after an admin verifies the actual received transaction in the seller bank statement.\n3. Why do some catalogue items say "Price to confirm"? Our 12 supplied catalogue references (REF-01 to REF-12) remain in draft preview until their exact price, SKU, stock and variant details are confirmed by the merchant.'
      },
      terms: {
        title: 'Terms of Service',
        body: 'Placing an order reserves available stock for the configured payment deadline. Orders are binding upon independent payment confirmation. Settlement and any bank/MDR charges between the merchant and their acquiring bank are governed by the merchant agreement.'
      },
      privacy: {
        title: 'Privacy Policy',
        body: 'Your profile, shipping addresses and uploaded payment receipts are stored privately and accessed only by you and authorised store administrators for order fulfilment and payment verification. Marketing newsletters require explicit opt-in consent and can be unsubscribed at any time.'
      }
    });

    await db.prepare(`
      INSERT INTO store_settings (
        id, store_name, tagline, support_email, support_phone, business_address,
        currency, timezone, design_preview_enabled, shipping_zones_json, tax_config_json,
        policies_json, physical_stores_json, smtp_configured, session_tracking_connected, updated_at
      ) VALUES (
        1, 'Shop by SCHA', 'A considered edit. Chosen by SCHA.',
        'care@shopbyscha.my [To confirm]', '+603-0000 0000 [To confirm]',
        'Kuala Lumpur, Malaysia [Merchant address to configure in Admin Settings]',
        'MYR', 'Asia/Kuala_Lumpur', 1, ?, ?, ?, '[]', 0, 0, ?
      )
    `).run(shippingZones, taxConfig, policies, now);
  });
  if(!sandbox) await runTransaction(async()=>{
    for(const table of ['notification_jobs','status_events','shipments','manual_refunds','payment_reviews','payment_submissions','stock_reservations','order_items','stock_movements']) await db.prepare(`DELETE FROM ${table}`).run();
    await db.prepare('DELETE FROM orders').run();await db.prepare('DELETE FROM product_variants WHERE is_demo = 1').run();await db.prepare('DELETE FROM products WHERE is_demo = 1').run();await db.prepare('DELETE FROM addresses').run();await db.prepare('DELETE FROM users WHERE is_demo = 1').run();
    await db.prepare("UPDATE payment_instruction_versions SET demo_qr_enabled=0, is_live_configured=0, recipient_name='', bank_name='', qr_image_path=NULL").run();
    await db.prepare("UPDATE store_settings SET design_preview_enabled=0, support_email='', support_phone='', business_address='', shipping_zones_json='[]', policies_json='{}'").run();
  });

}

module.exports = { seedIfNeeded };
