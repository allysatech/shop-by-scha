const { db, runTransaction } = require('./db');
const { generateToken, hashToken } = require('./auth');

function formatMYR(minorUnits) {
  if (minorUnits === null || minorUnits === undefined) return 'Price to confirm';
  const rm = (Number(minorUnits) / 100).toFixed(2);
  return `RM${rm}`;
}

function parseMYRToMinor(val) {
  if (val === null || val === undefined || String(val).trim() === '') return null;
  const num = Number(String(val).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num * 100);
}

// Protect against spreadsheet formula injection in CSV exports
function sanitizeCsvCell(val) {
  if (val === null || val === undefined) return '';
  let str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function logAudit({ actorUserId = null, actorEmail = 'system', actorRole = 'SYSTEM', action, entityType, entityId, details = {} }) {
  await db.prepare(`
    INSERT INTO audit_events (actor_user_id, actor_email, actor_role, action, entity_type, entity_id, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(actorUserId, actorEmail, actorRole, action, entityType, String(entityId), JSON.stringify(details), new Date().toISOString());
}

// Idempotent transactional email scheduling (supports Resend API & local audit queue)
async function scheduleNotification({ orderId, recipientEmail, templateType, idempotencyKey, subject, bodyText, actionUrl }) {
  const existing = await db.prepare('SELECT id, status FROM notification_jobs WHERE idempotency_key = ?').get(idempotencyKey);
  if (existing) {
    return existing;
  }
  const resendApiKey = String(process.env.RESEND_API_KEY || '').trim();
  const settings = await db.prepare('SELECT smtp_configured FROM store_settings WHERE id = 1').get();
  const isConfigured = Boolean(resendApiKey || settings && settings.smtp_configured);
  const status = 'pending_smtp';
  const lastError = isConfigured ? null : 'Resend / SMTP transport not connected in environment; email logged locally and ready for retry.';
  const now = new Date().toISOString();
  const res = await db.prepare(`
    INSERT INTO notification_jobs (
      order_id, recipient_email, template_type, idempotency_key, subject, body_text, action_url,
      status, attempt_count, last_error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(orderId, recipientEmail, templateType, idempotencyKey, subject, bodyText, actionUrl, status, lastError, now, now);

  const jobId = Number(res.lastInsertRowid);


  return { id: jobId, status };
}

// Sweep expired unpaid stock reservations (never releases active_review_hold while buyer awaits review!)
let lastSweepTimestamp = 0;
async function sweepExpiredReservations() {
  if (process.env.SCHA_ENV !== 'test') {
    const nowMs = Date.now();
    if (nowMs - lastSweepTimestamp < 15000) return 0;
    lastSweepTimestamp = nowMs;
  }
  const now = new Date().toISOString();
  const expiredOrders = await db.prepare(`
    SELECT id, order_number, customer_email, payment_status, fulfilment_status
    FROM orders
    WHERE payment_status = 'awaiting_payment'
      AND payment_deadline_at < ?
      AND is_demo = 0
  `).all(now);

  if (expiredOrders.length === 0) return 0;

  let releasedCount = 0;
  await runTransaction(async () => {
    for (const ord of expiredOrders) {
      // Double check no payment submission was uploaded
      const subCount = (await db.prepare('SELECT COUNT(*) AS c FROM payment_submissions WHERE order_id = ?').get(ord.id)).c;
      if (subCount > 0) continue;

      const holds = await db.prepare(`
        SELECT id, variant_id, sku, quantity
        FROM stock_reservations
        WHERE order_id = ? AND status = 'active_payment_hold'
      `).all(ord.id);

      for (const h of holds) {
        const v = await db.prepare('SELECT id, on_hand, reserved FROM product_variants WHERE id = ?').get(h.variant_id);
        if (v) {
          const newReserved = Math.max(0, v.reserved - h.quantity);
          await db.prepare('UPDATE product_variants SET reserved = ?, version = version + 1, updated_at = ? WHERE id = ?').
          run(newReserved, now, v.id);
          await db.prepare(`
            INSERT INTO stock_movements (
              variant_id, sku, delta_on_hand, delta_reserved, before_on_hand, after_on_hand, before_reserved, after_reserved,
              movement_type, reason, order_id, actor_user_id, actor_email, created_at
            ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, 'reservation_released', 'Unpaid order deadline expired', ?, NULL, 'system', ?)
          `).run(v.id, h.sku, -h.quantity, v.on_hand, v.on_hand, v.reserved, newReserved, ord.id, now);
        }
        await db.prepare(`UPDATE stock_reservations SET status = 'released_expired', updated_at = ? WHERE id = ?`).run(now, h.id);
      }

      await db.prepare(`
        UPDATE orders
        SET payment_status = 'expired_cancelled', fulfilment_status = 'cancelled', updated_at = ?
        WHERE id = ?
      `).run(now, ord.id);

      await db.prepare(`
        INSERT INTO status_events (
          order_id, event_type, payment_status, fulfilment_status, title, detail, actor_role, actor_email, customer_visible, created_at
        ) VALUES (?, 'order_expired', 'expired_cancelled', 'cancelled', 'Payment deadline expired', 'Stock reservation was released because no payment receipt was submitted before the deadline.', 'SYSTEM', 'system', 1, ?)
      `).run(ord.id, now);

      releasedCount += 1;
    }
  });
  return releasedCount;
}

async function getShippingQuote(stateName) {
  const settings = await db.prepare('SELECT shipping_zones_json, tax_config_json FROM store_settings WHERE id = 1').get();
  const zones = JSON.parse(settings.shipping_zones_json || '[]');
  const normalizedState = String(stateName || '').trim().toLowerCase();

  let matchedZone = zones.find((z) =>
  (z.states || []).some((s) => s.toLowerCase() === normalizedState)
  );
  if (!matchedZone && zones.length > 0) {
    matchedZone = normalizedState.includes('sabah') || normalizedState.includes('sarawak') || normalizedState.includes('labuan') ?
    zones.find((z) => z.id === 'east-my') || zones[0] :
    zones[0];
  }

  if (!matchedZone || !matchedZone.methods || matchedZone.methods.length === 0) {
    return {
      zoneName: 'Unconfigured Zone',
      methods: [],
      defaultMethod: null
    };
  }

  return {
    zoneName: matchedZone.name,
    methods: matchedZone.methods,
    defaultMethod: matchedZone.methods[0]
  };
}

async function getCartDetails(cartId, stateName = 'Wilayah Persekutuan Kuala Lumpur', selectedMethodId = null) {
  const [items, cartRow, shippingQuote] = await Promise.all([
    db.prepare(`
      SELECT ci.id AS cart_item_id, ci.quantity, ci.product_id, ci.variant_id,
             p.title AS product_title, p.slug AS product_slug, p.brand, p.reference_id,
             p.publish_status, p.purchase_enabled, p.is_demo AS product_is_demo,
             v.sku, v.title AS variant_title, v.price_minor, v.on_hand, v.reserved, v.is_active, v.is_demo AS variant_is_demo,
             (SELECT path FROM product_media pm WHERE pm.product_id = p.id ORDER BY pm.sort_order ASC LIMIT 1) AS image_path
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      JOIN product_variants v ON v.id = ci.variant_id
      WHERE ci.cart_id = ?
      ORDER BY ci.id ASC
    `).all(cartId),
    db.prepare('SELECT discount_code FROM carts WHERE id = ?').get(cartId),
    getShippingQuote(stateName)
  ]);

  let subtotalMinor = 0;
  let hasDemoItems = false;
  const warnings = [];

  const enrichedItems = items.map((it) => {
    const available = Math.max(0, Number(it.on_hand) - Number(it.reserved));
    const sellable = Boolean(it.purchase_enabled) && it.publish_status === 'published' && Boolean(it.is_active) && it.price_minor > 0;
    if (!sellable) {
      warnings.push(`${it.product_title} (${it.sku}) is no longer enabled for purchase.`);
    } else if (it.quantity > available) {
      warnings.push(`Only ${available} unit(s) available for ${it.product_title} (${it.variant_title}).`);
    }
    const lineTotalMinor = Number(it.price_minor) * Number(it.quantity);
    subtotalMinor += lineTotalMinor;
    if (it.product_is_demo || it.variant_is_demo) hasDemoItems = true;
    return {
      ...it,
      available,
      sellable,
      line_total_minor: lineTotalMinor,
      unit_price_formatted: formatMYR(it.price_minor),
      line_total_formatted: formatMYR(lineTotalMinor)
    };
  });

  let discountMinor = 0;
  let discountCode = cartRow ? cartRow.discount_code : null;
  if (discountCode === 'SCHA10' && subtotalMinor > 0) {
    discountMinor = Math.round(subtotalMinor * 0.10);
  } else {
    discountCode = null;
  }

  const chosenMethod = (shippingQuote.methods || []).find((m) => m.id === selectedMethodId) || shippingQuote.defaultMethod;
  const shippingMinor = enrichedItems.length > 0 && chosenMethod ? Number(chosenMethod.rate_minor) : 0;
  const taxMinor = 0;
  const totalMinor = Math.max(0, subtotalMinor - discountMinor + shippingMinor + taxMinor);

  return {
    cartId,
    items: enrichedItems,
    itemCount: enrichedItems.reduce((acc, i) => acc + i.quantity, 0),
    subtotal_minor: subtotalMinor,
    subtotal_formatted: formatMYR(subtotalMinor),
    discount_code: discountCode,
    discount_minor: discountMinor,
    discount_formatted: formatMYR(discountMinor),
    shipping_zone: shippingQuote.zoneName,
    shipping_methods: shippingQuote.methods,
    selected_shipping_method: chosenMethod,
    shipping_minor: shippingMinor,
    shipping_formatted: formatMYR(shippingMinor),
    tax_minor: taxMinor,
    tax_formatted: formatMYR(taxMinor),
    total_minor: totalMinor,
    total_formatted: formatMYR(totalMinor),
    has_demo_items: hasDemoItems || chosenMethod && chosenMethod.is_demo,
    warnings
  };
}

const PAYMENT_STATUS_LABELS = {
  awaiting_payment: 'Awaiting payment',
  under_review: 'Payment under review',
  needs_resubmission: 'Needs resubmission',
  paid: 'Payment confirmed',
  expired_cancelled: 'Expired/Cancelled',
  refund_pending: 'Refund pending',
  partially_refunded: 'Partially refunded',
  refunded: 'Refunded'
};

const FULFILMENT_STATUS_LABELS = {
  unfulfilled: 'Unfulfilled',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
};

async function enrichOrder(orderRow, includeAdminFields = false) {
  if (!orderRow) return null;
  const [items, events, submissions, shipments, refunds] = await Promise.all([
    db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC').all(orderRow.id),
    db.prepare(`
      SELECT * FROM status_events
      WHERE order_id = ? ${includeAdminFields ? '' : 'AND customer_visible = 1'}
      ORDER BY created_at ASC, id ASC
    `).all(orderRow.id),
    db.prepare('SELECT * FROM payment_submissions WHERE order_id = ? ORDER BY id DESC').all(orderRow.id),
    db.prepare('SELECT * FROM shipments WHERE order_id = ? ORDER BY id DESC').all(orderRow.id),
    db.prepare('SELECT * FROM manual_refunds WHERE order_id = ? ORDER BY id DESC').all(orderRow.id)
  ]);

  const result = {
    id: orderRow.id,
    order_number: orderRow.order_number,
    user_id: orderRow.user_id,
    customer_email: orderRow.customer_email,
    customer_name: orderRow.customer_name,
    customer_phone: orderRow.customer_phone,
    payment_status: orderRow.payment_status,
    payment_status_label: PAYMENT_STATUS_LABELS[orderRow.payment_status] || orderRow.payment_status,
    fulfilment_status: orderRow.fulfilment_status,
    fulfilment_status_label: FULFILMENT_STATUS_LABELS[orderRow.fulfilment_status] || orderRow.fulfilment_status,
    reconciliation_required: Boolean(orderRow.reconciliation_required),
    reconciliation_reason: orderRow.reconciliation_reason,
    currency: orderRow.currency,
    subtotal_minor: orderRow.subtotal_minor,
    subtotal_formatted: formatMYR(orderRow.subtotal_minor),
    discount_minor: orderRow.discount_minor,
    discount_formatted: formatMYR(orderRow.discount_minor),
    shipping_minor: orderRow.shipping_minor,
    shipping_formatted: formatMYR(orderRow.shipping_minor),
    shipping_zone: orderRow.shipping_zone,
    shipping_method: orderRow.shipping_method,
    tax_minor: orderRow.tax_minor,
    total_minor: orderRow.total_minor,
    total_formatted: formatMYR(orderRow.total_minor),
    refunded_minor: orderRow.refunded_minor,
    refunded_formatted: formatMYR(orderRow.refunded_minor),
    shipping_address: JSON.parse(orderRow.shipping_address_snapshot_json || '{}'),
    billing_address: JSON.parse(orderRow.billing_address_snapshot_json || '{}'),
    payment_instructions: JSON.parse(orderRow.payment_instructions_snapshot_json || '{}'),
    payment_instruction_version_id: orderRow.payment_instruction_version_id,
    payment_deadline_at: orderRow.payment_deadline_at,
    review_window_expires_at: orderRow.review_window_expires_at,
    resubmission_reason: orderRow.resubmission_reason,
    paid_at: orderRow.paid_at,
    cancellation_requested: Boolean(orderRow.cancellation_requested),
    cancellation_reason: orderRow.cancellation_reason,
    return_requested: Boolean(orderRow.return_requested),
    return_reason: orderRow.return_reason,
    is_demo: Boolean(orderRow.is_demo),
    created_at: orderRow.created_at,
    updated_at: orderRow.updated_at,
    items: items.map((it) => ({
      ...it,
      unit_price_formatted: formatMYR(it.unit_price_minor),
      line_total_formatted: formatMYR(it.line_total_minor)
    })),
    timeline: events,
    submissions: submissions.map((s) => ({
      id: s.id,
      declared_reference: s.declared_reference,
      declared_amount_minor: s.declared_amount_minor,
      declared_amount_formatted: formatMYR(s.declared_amount_minor),
      declared_paid_at: s.declared_paid_at,
      receipt_original_name: s.receipt_original_name,
      receipt_mime_type: s.receipt_mime_type,
      receipt_size_bytes: s.receipt_size_bytes,
      receipt_url: `/api/receipts/${s.id}`,
      submitted_after_deadline: Boolean(s.submitted_after_deadline),
      amount_mismatch: Boolean(s.amount_mismatch),
      status: s.status,
      created_at: s.created_at
    })),
    shipments,
    refunds: refunds.map((r) => ({
      ...r,
      amount_formatted: formatMYR(r.amount_minor)
    }))
  };

  if (includeAdminFields) {
    result.internal_notes = orderRow.internal_notes;
    result.paid_verified_by_email = orderRow.paid_verified_by_email;
    result.paid_bank_reference = orderRow.paid_bank_reference;
    result.guest_access_token = orderRow.guest_access_token;
    result.reviews = await db.prepare('SELECT * FROM payment_reviews WHERE order_id = ? ORDER BY id DESC').all(orderRow.id);
    result.notifications = await db.prepare('SELECT * FROM notification_jobs WHERE order_id = ? ORDER BY id DESC').all(orderRow.id);
    result.reservations = await db.prepare('SELECT * FROM stock_reservations WHERE order_id = ?').all(orderRow.id);
  }

  return result;
}

function detectCourierFromTracking(rawTracking) {
  const raw = String(rawTracking || '').trim();
  if (!raw || raw.length < 3) return null;

  const compact = raw.toUpperCase().replace(/[\s-]+/g, '');
  const encoded = encodeURIComponent(raw);

  if (
  /^(PL|POS|ER|EN|EP|EE|EH|EM|ES|EF|EB|ED)/.test(compact) ||
  /^[A-Z]{2}\d{9}MY$/.test(compact))
  {
    return {
      courierName: 'PosLaju Malaysia',
      trackingUrl: `https://tracking.pos.com.my/?trackingNo=${encoded}`
    };
  }
  if (/^(NVMY|NVSG|NV|SHP|NINJA)/.test(compact)) {
    return {
      courierName: 'NinjaVan Malaysia',
      trackingUrl: `https://www.ninjavan.co/en-my/tracking?id=${encoded}`
    };
  }
  if (/^(SPXMY|SPX|MY2|SHOPEE)/.test(compact)) {
    return {
      courierName: 'SPX Express (Shopee Xpress)',
      trackingUrl: `https://spx.com.my/`
    };
  }
  if (/^(JT|JNT|J&T)/.test(compact) || /^6\d{11}$/.test(compact)) {
    return {
      courierName: 'J&T Express Malaysia',
      trackingUrl: `https://www.jtexpress.my/tracking/${encoded}`
    };
  }
  if (/^(MYS|FE|FLASH|P0)/.test(compact)) {
    return {
      courierName: 'Flash Express Malaysia',
      trackingUrl: `https://www.flashexpress.my/fle/tracking?se=${encoded}`
    };
  }
  if (/^(DHL|MYP|MYD|GM|JD|JJD|RX)/.test(compact) || /^[1289]\d{9}$/.test(compact)) {
    return {
      courierName: 'DHL eCommerce Malaysia',
      trackingUrl: `https://www.dhl.com/my-en/home/tracking.html?tracking-id=${encoded}`
    };
  }
  if (/^(GDEX|GD|MYG|CN)/.test(compact) || /^[345]\d{9,10}$/.test(compact)) {
    return {
      courierName: 'GDEX (GD Express)',
      trackingUrl: `https://gdexpress.com/tracking/`
    };
  }
  if (/^(CITY|CL|CT)/.test(compact) || /^\d{15}$/.test(compact)) {
    return {
      courierName: 'City-Link Express',
      trackingUrl: `https://www.citylinkexpress.com/tracking-result/?track_num=${encoded}`
    };
  }
  if (/^(FDX|FEDEX)/.test(compact) || /^7\d{11,13}$/.test(compact)) {
    return {
      courierName: 'FedEx / International Express',
      trackingUrl: `https://www.fedex.com/fedextrack/?trknbr=${encoded}`
    };
  }
  if (/^(LLM|LALA|GRAB|GX)/.test(compact)) {
    return {
      courierName: 'Lalamove / GrabExpress (Same-Day)',
      trackingUrl: `https://www.tracking.my/${encoded}`
    };
  }
  return null;
}

module.exports = {
  formatMYR,
  parseMYRToMinor,
  sanitizeCsvCell,
  logAudit,
  scheduleNotification,
  sweepExpiredReservations,
  getShippingQuote,
  getCartDetails,
  enrichOrder,
  detectCourierFromTracking,
  PAYMENT_STATUS_LABELS,
  FULFILMENT_STATUS_LABELS
};
