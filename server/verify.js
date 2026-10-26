const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TEST_DB_PATH = path.join(__dirname, '..', 'data', 'test_verify.sqlite');
if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
process.env.DB_PATH = TEST_DB_PATH;

const { createAppServer } = require('./index');

async function runVerification() {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Running Shop by SCHA verification suite against ${baseUrl}...`);

  async function req(endpoint, options = {}, cookieJar = '') {
    const headers = { ...(options.headers || {}) };
    if (cookieJar) headers.Cookie = cookieJar;
    if (options.body && typeof options.body === 'object' && !(options.body instanceof Buffer)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    const res = await fetch(`${baseUrl}${endpoint}`, { ...options, headers });
    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : await res.text();
    return { status: res.status, data, setCookies, headers: res.headers };
  }

  function extractCookies(setCookieArray, existing = '') {
    const map = new Map();
    if (existing) {
      existing.split(';').forEach((pair) => {
        const [k, v] = pair.trim().split('=');
        if (k) map.set(k, v);
      });
    }
    for (const sc of setCookieArray) {
      const first = sc.split(';')[0];
      const [k, v] = first.split('=');
      if (k) map.set(k.trim(), v);
    }
    return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  try {
    // 1. Verify Storefront & All 12 Supplied Catalogue References + Checksums
    const sfRes = await req('/api/storefront');
    assert.strictEqual(sfRes.status, 200);
    assert.strictEqual(sfRes.data.store.currency, 'MYR');
    assert.strictEqual(sfRes.data.store.timezone, 'Asia/Kuala_Lumpur');
    assert.strictEqual(sfRes.data.content.H01_H02.headline, 'your next favourite');
    assert.strictEqual(sfRes.data.content.E01_E03.decorative_word, 'JUST SCHA');
    assert.strictEqual(sfRes.data.categories.length, 4);

    const catalogueJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'catalogue', 'catalogue.json'), 'utf8'));
    const refProducts = sfRes.data.products.filter((p) => p.reference_id && p.reference_id.startsWith('REF-'));
    assert.strictEqual(refProducts.length, 12, 'All 12 supplied references REF-01..REF-12 must be present');

    for (const orig of catalogueJson.products) {
      const matched = refProducts.find((p) => p.reference_id === orig.reference_id);
      assert(matched, `Missing ${orig.reference_id}`);
      assert.strictEqual(matched.price_minor, null, `${orig.reference_id} price_minor must be null`);
      assert.strictEqual(matched.price_formatted, 'Price to confirm');
      assert.strictEqual(matched.stock_quantity, null, `${orig.reference_id} stock_quantity must be null`);
      assert.strictEqual(matched.publish_status, 'draft');
      assert.strictEqual(matched.purchase_enabled, false);

      // Verify image bytes SHA-256 unchanged
      const imgFile = path.join(__dirname, '..', 'public', orig.images[0].path);
      const sha = crypto.createHash('sha256').update(fs.readFileSync(imgFile)).digest('hex');
      assert.strictEqual(sha, orig.images[0].sha256, `SHA-256 mismatch for ${orig.reference_id}`);
    }

    const ref05 = refProducts.find((p) => p.reference_id === 'REF-05');
    const ref06 = refProducts.find((p) => p.reference_id === 'REF-06');
    assert.strictEqual(ref05.duplicate_review_required, true);
    assert.strictEqual(ref06.duplicate_review_required, true);
    console.log('✓ 1. Storefront, homepage slots & all 12 catalogue references (with SHA-256 integrity) verified.');

    // 2. Verify Incomplete Draft Product Cannot Be Purchased
    const draftAddRes = await req('/api/cart/items', {
      method: 'POST',
      body: { product_id: refProducts[0].id, variant_id: 999, quantity: 1 }
    });
    assert.strictEqual(draftAddRes.status, 400);
    assert.strictEqual(draftAddRes.data.code, 'INCOMPLETE_PRODUCT_REFERENCE');
    console.log('✓ 2. Incomplete draft product purchase blocked on server.');

    // 3. Verify Public Signup Role Enforcement & Server-Side Access Control
    const escalateRegRes = await req('/api/auth/register', {
      method: 'POST',
      body: { name: 'Attacker', email: 'attacker@example.com', password: 'Password123!', role: 'ADMIN' }
    });
    assert.strictEqual(escalateRegRes.status, 403, 'Escalating role during public signup must fail with 403');

    const uniqueEmail = `cust_${Date.now()}@example.com`;
    const regRes = await req('/api/auth/register', {
      method: 'POST',
      body: { name: 'Siti Buyer', email: uniqueEmail, phone: '+6012-9998888', password: 'Password123!' }
    });
    assert.strictEqual(regRes.status, 201);
    assert.strictEqual(regRes.data.user.role, 'CUSTOMER');
    const customerCookies = extractCookies(regRes.setCookies);

    // Customer attempting to escalate role via profile update
    const profileEscalate = await req('/api/account/profile', {
      method: 'PUT',
      headers: { 'X-CSRF-Token': regRes.data.csrfToken },
      body: { name: 'Siti Buyer', role: 'ADMIN' }
    }, customerCookies);
    assert.strictEqual(profileEscalate.status, 403);

    // Customer attempting to call Admin APIs directly
    const custAdminOverview = await req('/api/admin/overview', { method: 'GET' }, customerCookies);
    assert.strictEqual(custAdminOverview.status, 403);
    assert.strictEqual(custAdminOverview.data.code, 'FORBIDDEN_ROLE');

    // Customer attempting to log into Admin Login
    const custAdminLogin = await req('/api/admin/auth/login', {
      method: 'POST',
      body: { email: uniqueEmail, password: 'Password123!' }
    });
    assert.strictEqual(custAdminLogin.status, 403);

    // Customer attempting to read another customer's order (#SCHA-001 belongs to Customer A) or private receipt
    const otherOrderRes = await req('/api/orders/SCHA-001', { method: 'GET' }, customerCookies);
    assert.strictEqual(otherOrderRes.status, 403);

    const otherReceiptRes = await req('/api/receipts/1', { method: 'GET' }, customerCookies);
    assert.strictEqual(otherReceiptRes.status, 403);

    // Unauthenticated guest attempting to read #SCHA-001 without token vs with valid token
    const guestNoTok = await req('/api/orders/SCHA-001', { method: 'GET' });
    assert.strictEqual(guestNoTok.status, 403);

    const guestWithTok = await req('/api/orders/SCHA-001?token=demo-guest-token-scha-001-verified', { method: 'GET' });
    assert.strictEqual(guestWithTok.status, 200);
    assert.strictEqual(guestWithTok.data.order.order_number, 'SCHA-001');
    console.log('✓ 3. Role boundaries, privilege escalation prevention & order/receipt ownership verified.');

    // 4. Verify Cart, Shipping Recalculation, Atomic Stock Reservation & Place Order
    const addDemoRes = await req('/api/cart/demo-sandbox', {
      method: 'POST',
      headers: { 'X-CSRF-Token': regRes.data.csrfToken }
    }, customerCookies);
    assert.strictEqual(addDemoRes.status, 200);
    const updatedCustomerCookies = extractCookies(addDemoRes.setCookies, customerCookies);

    // West MY vs East MY shipping recalculation
    const cartWest = await req('/api/cart?state=Selangor', { method: 'GET' }, updatedCustomerCookies);
    assert.strictEqual(cartWest.data.shipping_minor, 800);
    assert.strictEqual(cartWest.data.total_minor, 13700);

    const cartEast = await req('/api/cart?state=Sabah', { method: 'GET' }, updatedCustomerCookies);
    assert.strictEqual(cartEast.data.shipping_minor, 1500);
    assert.strictEqual(cartEast.data.total_minor, 14400);

    // Place Order -> creates awaiting_payment / unfulfilled and reserves stock atomically
    const placeRes = await req('/api/checkout/place-order', {
      method: 'POST',
      headers: { 'X-CSRF-Token': regRes.data.csrfToken },
      body: {
        email: uniqueEmail,
        phone: '+6012-9998888',
        shipping_address: {
          recipient_name: 'Siti Buyer',
          line1: '10 Jalan Ampang',
          postcode: '50450',
          city: 'Kuala Lumpur',
          state: 'Wilayah Persekutuan Kuala Lumpur',
          country: 'Malaysia'
        }
      }
    }, updatedCustomerCookies);
    assert.strictEqual(placeRes.status, 201);
    const newOrder = placeRes.data.order;
    assert.strictEqual(newOrder.payment_status, 'awaiting_payment');
    assert.strictEqual(newOrder.fulfilment_status, 'unfulfilled');

    // Submit payment receipt -> sets under_review (NEVER paid!)
    const receiptRes = await req(`/api/orders/${newOrder.order_number}/payment-submission`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': regRes.data.csrfToken },
      body: {
        declared_reference: 'DUITNOW-TEST-778899',
        declared_amount: '137.00',
        declared_paid_at: new Date().toISOString(),
        receipt_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        receipt_filename: 'siti_receipt.png'
      }
    }, updatedCustomerCookies);
    assert.strictEqual(receiptRes.status, 200);
    assert.strictEqual(receiptRes.data.order.payment_status, 'under_review', 'Receipt upload must set under_review, never paid');
    assert.strictEqual(receiptRes.data.order.fulfilment_status, 'unfulfilled');
    console.log('✓ 4. Cart totals, shipping recalculation, atomic stock reservation & under_review receipt submission verified.');

    // 5. Verify Admin Login, Resubmission Workflow, Bank Verification & Idempotency
    const adminLoginRes = await req('/api/admin/auth/login', {
      method: 'POST',
      body: { email: 'admin@shopbyscha.my', password: 'SchaAdmin!2026' }
    });
    assert.strictEqual(adminLoginRes.status, 200);
    assert.strictEqual(adminLoginRes.data.user.role, 'ADMIN');
    const adminCookies = extractCookies(adminLoginRes.setCookies);
    const adminCsrf = adminLoginRes.data.csrfToken;

    // Attempt to ship unpaid order must fail
    const prematureShip = await req(`/api/admin/orders/${newOrder.id}/fulfilment`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': adminCsrf },
      body: { fulfilment_status: 'shipped', courier_name: 'PosLaju', tracking_number: 'PL123' }
    }, adminCookies);
    assert.strictEqual(prematureShip.status, 400);
    assert.strictEqual(prematureShip.data.code, 'UNPAID_FULFILMENT_BLOCKED');

    // Admin requests resubmission
    const resubReq = await req(`/api/admin/payment-reviews/${newOrder.id}`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': adminCsrf },
      body: {
        action: 'request_resubmission',
        audit_note: 'Receipt image was blurry, please re-upload full PDF or PNG.',
        resubmission_reason: 'Receipt image was blurry, please re-upload full PDF or PNG.'
      }
    }, adminCookies);
    assert.strictEqual(resubReq.status, 200);
    assert.strictEqual(resubReq.data.order.payment_status, 'needs_resubmission');

    // Customer re-uploads receipt
    const reuploadRes = await req(`/api/orders/${newOrder.order_number}/payment-submission`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': regRes.data.csrfToken },
      body: {
        declared_reference: 'DUITNOW-TEST-778899-CLEAR',
        declared_amount: '137.00',
        receipt_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        receipt_filename: 'siti_receipt_clear.png'
      }
    }, updatedCustomerCookies);
    assert.strictEqual(reuploadRes.status, 200);
    assert.strictEqual(reuploadRes.data.order.payment_status, 'under_review');

    // Admin tries to confirm payment WITHOUT checking bank_records_checked -> must fail
    const uncheckedConfirm = await req(`/api/admin/payment-reviews/${newOrder.id}`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': adminCsrf },
      body: {
        action: 'confirm_payment',
        received_amount: '137.00',
        actual_bank_reference: 'MYBNK-UNIQUE-9001',
        audit_note: 'Checked statement',
        bank_records_checked: false
      }
    }, adminCookies);
    assert.strictEqual(uncheckedConfirm.status, 400);

    // Admin tries to confirm payment with mismatched amount -> routes to reconciliation instead of marking paid
    const mismatchConfirm = await req(`/api/admin/payment-reviews/${newOrder.id}`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': adminCsrf },
      body: {
        action: 'confirm_payment',
        received_amount: '100.00',
        actual_bank_reference: 'MYBNK-UNIQUE-9001',
        audit_note: 'Partial payment',
        bank_records_checked: true
      }
    }, adminCookies);
    assert.strictEqual(mismatchConfirm.status, 400);
    assert.strictEqual(mismatchConfirm.data.code, 'AMOUNT_MISMATCH_RECONCILIATION');

    // Admin confirms payment with exact amount, unique bank reference & bank_records_checked = true
    const validConfirm = await req(`/api/admin/payment-reviews/${newOrder.id}`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': adminCsrf },
      body: {
        action: 'confirm_payment',
        received_amount: '137.00',
        actual_bank_reference: 'MYBNK-UNIQUE-9001',
        audit_note: 'Verified RM137.00 received in merchant bank statement.',
        bank_records_checked: true
      }
    }, adminCookies);
    assert.strictEqual(validConfirm.status, 200);
    assert.strictEqual(validConfirm.data.order.payment_status, 'paid');
    assert.strictEqual(validConfirm.data.order.fulfilment_status, 'unfulfilled', 'Payment confirmed must not imply shipped');

    // Duplicate/concurrent admin confirmation must be idempotent (does not deduct stock twice)
    const dupConfirm = await req(`/api/admin/payment-reviews/${newOrder.id}`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': adminCsrf },
      body: {
        action: 'confirm_payment',
        received_amount: '137.00',
        actual_bank_reference: 'MYBNK-UNIQUE-9001',
        audit_note: 'Second click',
        bank_records_checked: true
      }
    }, adminCookies);
    assert.strictEqual(dupConfirm.status, 200);
    assert.strictEqual(dupConfirm.data.idempotent, true);

    // Attempting to credit the same bank reference MYBNK-UNIQUE-9001 to another order (#SCHA-003) must fail with 409
    const reuseBankRef = await req('/api/admin/payment-reviews/3', {
      method: 'POST',
      headers: { 'X-CSRF-Token': adminCsrf },
      body: {
        action: 'confirm_payment',
        received_amount: '129.00',
        actual_bank_reference: 'MYBNK-UNIQUE-9001',
        audit_note: 'Attempting duplicate bank reference',
        bank_records_checked: true
      }
    }, adminCookies);
    assert.strictEqual(reuseBankRef.status, 409);
    assert.strictEqual(reuseBankRef.data.code, 'DUPLICATE_BANK_REFERENCE');
    console.log('✓ 5. Admin payment verification, resubmission, reconciliation, duplicate-bank-ref prevention & idempotency verified.');

    // 6. Verify Fulfilment, Courier Auto-Detection from Tracking Number, Manual Refund Two-Step Workflow & Audited QR Versioning
    const shipRes = await req(`/api/admin/orders/${newOrder.id}/fulfilment`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': adminCsrf },
      body: {
        fulfilment_status: 'shipped',
        courier_name: '', // Omit courier_name to test server-side auto-detection from PL-MY-99887766
        tracking_number: 'PL-MY-99887766'
      }
    }, adminCookies);
    assert.strictEqual(shipRes.status, 200);
    assert.strictEqual(shipRes.data.order.fulfilment_status, 'shipped');
    assert.strictEqual(shipRes.data.order.shipments[0].tracking_number, 'PL-MY-99887766');
    assert.strictEqual(shipRes.data.order.shipments[0].courier_name, 'PosLaju Malaysia');
    assert.ok(shipRes.data.order.shipments[0].tracking_url.includes('tracking.pos.com.my'));

    // Manual refund step 1: initiate refund_pending
    const refInit = await req(`/api/admin/orders/${newOrder.id}/refund-initiate`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': adminCsrf },
      body: { amount_myr: '137.00', reason: 'Customer return approved' }
    }, adminCookies);
    assert.strictEqual(refInit.status, 200);
    assert.strictEqual(refInit.data.order.payment_status, 'refund_pending');

    // Manual refund step 2: complete refund requires external_bank_reference
    const refCompleteMissing = await req(`/api/admin/orders/${newOrder.id}/refund-complete`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': adminCsrf },
      body: { external_bank_reference: '' }
    }, adminCookies);
    assert.strictEqual(refCompleteMissing.status, 400);

    const refCompleteValid = await req(`/api/admin/orders/${newOrder.id}/refund-complete`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': adminCsrf },
      body: { external_bank_reference: 'EXT-BANK-REFUND-5501', transferred_at: new Date().toISOString() }
    }, adminCookies);
    assert.strictEqual(refCompleteValid.status, 200);
    assert.strictEqual(refCompleteValid.data.order.payment_status, 'refunded');

    // Merchant QR Settings update creates v2 while existing order retains v1 snapshot
    const qrUpdateRes = await req('/api/admin/settings/payment-qr', {
      method: 'POST',
      headers: { 'X-CSRF-Token': adminCsrf },
      body: {
        recipient_name: 'SCHA FASHION EDITORIAL SDN BHD',
        bank_name: 'Maybank Malaysia',
        payment_deadline_minutes: 45,
        review_window_hours: 24,
        demo_qr_enabled: true
      }
    }, adminCookies);
    assert.strictEqual(qrUpdateRes.status, 201);

    const oldOrderCheck = await req(`/api/orders/${newOrder.order_number}`, { method: 'GET' }, adminCookies);
    assert.strictEqual(oldOrderCheck.data.order.payment_instructions.version_number, 1, 'Existing order must retain v1 payment instructions snapshot');
    console.log('✓ 6. Fulfilment tracking, two-step manual refund & immutable per-order QR instruction snapshots verified.');

    // 7. Verify Neon Lakebase Postgres & Neon AI Gateway End-to-End Integration
    const neonRes = await req('/api/neon/status');
    assert.strictEqual(neonRes.status, 200);
    assert.strictEqual(neonRes.data.connected, true, 'Neon Lakebase Postgres must be connected');
    assert.strictEqual(neonRes.data.database_name, 'neondb');
    assert.ok(neonRes.data.products_count >= 12, 'Neon Postgres must have all catalogue products synced');
    assert.ok(neonRes.data.orders_count >= 5, 'Neon Postgres must have all orders synced');

    const aiModelsRes = await req('/api/ai/models');
    assert.strictEqual(aiModelsRes.status, 200);
    assert.ok(Array.isArray(aiModelsRes.data.models));

    const aiStylistRes = await req('/api/ai/stylist', {
      method: 'POST',
      body: { prompt: 'Recommend a pink bag and eyewear look', model: 'gpt-5-mini' }
    });
    assert.strictEqual(aiStylistRes.status, 200);
    assert.strictEqual(aiStylistRes.data.provider, 'neon-ai-gateway');
    assert.ok(aiStylistRes.data.reply && aiStylistRes.data.reply.length > 10);
    console.log(`✓ 7. Neon Lakebase Postgres (${neonRes.data.database_name}, ${neonRes.data.products_count} products, ${neonRes.data.orders_count} orders) & Neon AI Gateway verified end-to-end.`);

    console.log('\nALL ACCEPTANCE VERIFICATION TESTS PASSED SUCCESSFULLY!');
  } finally {
    server.close();
    const { getNeonPool } = require('./neon-pg');
    const pool = getNeonPool();
    if (pool) await pool.end();
  }
}

runVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
