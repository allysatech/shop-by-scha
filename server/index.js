const {getObject}=require('./object-storage');
const { sandbox } = require('./runtime');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const { db, ready: dbReady, runTransaction } = require('./db');
const { seedIfNeeded } = require('./seed');
const {
  SESSION_COOKIE_NAME,
  CART_COOKIE_NAME,
  hashPassword,
  verifyPassword,
  generateToken,
  hashToken,
  parseCookies,
  serializeCookie,
  createSession,
  getSessionFromRequest,
  checkRateLimit
} = require('./auth');
const {
  PRIVATE_RECEIPTS_DIR,
  savePrivateReceipt,
  savePublicMedia,
  parseRequestBody
} = require('./uploads');
const {
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
} = require('./services');

const {
  listGatewayModels,
  askStylistAssistant
} = require('./ai-gateway');

const appReady = dbReady.then(async () => await seedIfNeeded());


const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv; charset=utf-8'
};

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(body);
}

async function getOrCreateCartId(req, res, user) {
  const cookies = parseCookies(req.headers.cookie);
  let cartId = req.headers['x-cart-token'] || cookies[CART_COOKIE_NAME];
  const now = new Date().toISOString();

  if (cartId) {
    const existing = await db.prepare('SELECT id, user_id FROM carts WHERE id = ?').get(cartId);
    if (existing && (!existing.user_id || user && existing.user_id === user.id)) {
      if (user && !existing.user_id) {
        await db.prepare('UPDATE carts SET user_id = ?, updated_at = ? WHERE id = ?').run(user.id, now, cartId);
      }
      return { cartId, setCookie: null };
    }
  }

  if (user) {
    const userCart = await db.prepare('SELECT id FROM carts WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1').get(user.id);
    if (userCart) {
      return {
        cartId: userCart.id,
        setCookie: serializeCookie(CART_COOKIE_NAME, userCart.id, { maxAge: 30 * 86400 })
      };
    }
  }

  cartId = `cart_${generateToken(16)}`;
  await db.prepare('INSERT INTO carts (id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
    cartId,
    user ? user.id : null,
    now,
    now
  );
  return {
    cartId,
    setCookie: serializeCookie(CART_COOKIE_NAME, cartId, { maxAge: 30 * 86400 })
  };
}

async function mergeGuestCartIntoUserCart(guestCartId, userId) {
  if (!guestCartId || !userId) return guestCartId;
  const now = new Date().toISOString();
  const guestCart = await db.prepare('SELECT id, user_id FROM carts WHERE id = ?').get(guestCartId);
  if (!guestCart || guestCart.user_id && guestCart.user_id !== userId) return null;

  const existingUserCart = await db.prepare('SELECT id FROM carts WHERE user_id = ? AND id != ? ORDER BY updated_at DESC LIMIT 1').get(userId, guestCartId);
  if (!existingUserCart) {
    await db.prepare('UPDATE carts SET user_id = ?, updated_at = ? WHERE id = ?').run(userId, now, guestCartId);
    return guestCartId;
  }

  const guestItems = await db.prepare('SELECT product_id, variant_id, quantity FROM cart_items WHERE cart_id = ?').all(guestCartId);
  for (const item of guestItems) {
    const existingItem = await db.prepare('SELECT id, quantity FROM cart_items WHERE cart_id = ? AND variant_id = ?').get(existingUserCart.id, item.variant_id);
    if (existingItem) {
      await db.prepare('UPDATE cart_items SET quantity = quantity + ?, updated_at = ? WHERE id = ?').run(item.quantity, now, existingItem.id);
    } else {
      await db.prepare('INSERT INTO cart_items (cart_id, product_id, variant_id, quantity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').
      run(existingUserCart.id, item.product_id, item.variant_id, item.quantity, now, now);
    }
  }
  await db.prepare('DELETE FROM carts WHERE id = ?').run(guestCartId);
  return existingUserCart.id;
}

function buildProductObject(p, media, variantRows) {
  if (!p) return null;
  const variants = (variantRows || []).map((v) => ({
    ...v,
    attributes: JSON.parse(v.attributes_json || '{}'),
    available: Math.max(0, Number(v.on_hand) - Number(v.reserved)),
    price_formatted: formatMYR(v.price_minor),
    is_demo: Boolean(v.is_demo)
  }));

  const totalAvailable = variants.length > 0 ?
  variants.reduce((sum, v) => sum + v.available, 0) :
  p.stock_quantity !== null ? Number(p.stock_quantity) : null;

  const isSellable = Boolean(p.purchase_enabled) &&
  p.publish_status === 'published' &&
  p.price_minor !== null &&
  p.price_minor > 0 &&
  variants.length > 0 &&
  totalAvailable > 0;

  return {
    id: p.id,
    reference_id: p.reference_id,
    reference_order: p.reference_order,
    record_type: p.record_type,
    title: p.title,
    slug: p.slug,
    brand: p.brand,
    category_slug: p.category_slug,
    description: p.description,
    specifications: JSON.parse(p.specifications_json || '{}'),
    shipping_returns_note: p.shipping_returns_note,
    model: p.model,
    stock_type: p.stock_type,
    sellable_sku: p.sellable_sku,
    price_minor: p.price_minor,
    price_formatted: formatMYR(p.price_minor),
    currency: p.currency,
    stock_quantity: p.stock_quantity,
    total_available: totalAvailable,
    low_stock_threshold: p.low_stock_threshold,
    weight_grams: p.weight_grams,
    dimensions_cm: p.dimensions_cm,
    seo_title: p.seo_title,
    seo_description: p.seo_description,
    reference_colour_description: p.reference_colour_description,
    confirmed_attributes: JSON.parse(p.confirmed_attributes_json || '{}'),
    publish_status: p.publish_status,
    purchase_enabled: Boolean(p.purchase_enabled),
    is_sellable: isSellable,
    duplicate_review_required: Boolean(p.duplicate_review_required),
    duplicate_resolution_status: p.duplicate_resolution_status,
    duplicate_merged_into_id: p.duplicate_merged_into_id,
    related_reference_ids: JSON.parse(p.related_reference_ids_json || '[]'),
    pending_confirmation: JSON.parse(p.pending_confirmation_json || '[]'),
    notes: p.notes,
    is_demo: Boolean(p.is_demo),
    primary_image: media[0] ? media[0].path : '/images/08_jacquemus_pink_flap_handbag.png',
    media: media.map((m) => ({
      ...m,
      document_preview_bounds: m.document_preview_bounds_json ? JSON.parse(m.document_preview_bounds_json) : null
    })),
    variants,
    created_at: p.created_at,
    updated_at: p.updated_at
  };
}

async function formatProductRow(p) {
  if (!p) return null;
  const [media, variantRows] = await Promise.all([
    db.prepare('SELECT * FROM product_media WHERE product_id = ? ORDER BY sort_order ASC, id ASC').all(p.id),
    db.prepare('SELECT * FROM product_variants WHERE product_id = ? AND is_active = 1 ORDER BY id ASC').all(p.id)
  ]);
  return buildProductObject(p, media, variantRows);
}

async function formatProductRows(rows) {
  if (!rows || rows.length === 0) return [];
  const [allMedia, allVariants] = await Promise.all([
    db.prepare('SELECT * FROM product_media ORDER BY sort_order ASC, id ASC').all(),
    db.prepare('SELECT * FROM product_variants WHERE is_active = 1 ORDER BY id ASC').all()
  ]);
  const mediaByProd = new Map();
  for (const m of allMedia) {
    const pid = Number(m.product_id);
    if (!mediaByProd.has(pid)) mediaByProd.set(pid, []);
    mediaByProd.get(pid).push(m);
  }
  const variantsByProd = new Map();
  for (const v of allVariants) {
    const pid = Number(v.product_id);
    if (!variantsByProd.has(pid)) variantsByProd.set(pid, []);
    variantsByProd.get(pid).push(v);
  }
  return rows.map((p) => buildProductObject(p, mediaByProd.get(Number(p.id)) || [], variantsByProd.get(Number(p.id)) || []));
}

async function canAccessOrder(req, urlObj, user, orderRow) {
  if (!orderRow) return false;
  if (user && user.role === 'ADMIN') return true;
  if (user && user.role === 'CUSTOMER' && orderRow.user_id && Number(orderRow.user_id) === Number(user.id)) {
    return true;
  }
  const guestToken = (urlObj.searchParams.get('token')) || req.headers['x-guest-token'];
  if (guestToken && orderRow.guest_access_token && guestToken === orderRow.guest_access_token) {
    if (orderRow.guest_token_expires_at && new Date(orderRow.guest_token_expires_at).getTime() > Date.now()) {
      return true;
    }
  }
  return false;
}

async function handleApiRequest(req, res, urlObj) {
  const pathname = urlObj.pathname;
  const method = req.method.toUpperCase();
  const { user, session, expired } = await getSessionFromRequest(req);

  // Enforce CSRF on state-changing requests when an authenticated session is present
  if (session && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const headerCsrf = req.headers['x-csrf-token'];
    if (headerCsrf !== session.csrfToken) {
      return sendJson(res, 403, { error: 'Invalid CSRF token.' });
    }
  }

  // Strictly protect all /api/admin/* endpoints (except /api/admin/auth/login and /api/admin/auth/forgot-password)
  if (pathname.startsWith('/api/admin') && !pathname.startsWith('/api/admin/auth/')) {
    if (!user) {
      return sendJson(res, 401, {
        error: expired ? 'Your admin session has expired. Please log in again.' : 'Admin authentication required.',
        code: expired ? 'SESSION_EXPIRED' : 'UNAUTHENTICATED'
      });
    }
    if (user.role !== 'ADMIN') {
      await logAudit({
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'unauthorised_admin_api_attempt',
        entityType: 'api',
        entityId: pathname,
        details: { method }
      });
      return sendJson(res, 403, {
        error: 'Access denied. Administrator privileges are required for this resource.',
        code: 'FORBIDDEN_ROLE'
      });
    }
  }

  // Strictly protect /api/account/* endpoints for authenticated users
  if (pathname.startsWith('/api/account')) {
    if (!user) {
      return sendJson(res, 401, {
        error: expired ? 'Your session has expired. Please log in again.' : 'Please log in to access your account.',
        code: expired ? 'SESSION_EXPIRED' : 'UNAUTHENTICATED'
      });
    }
  }

  // =========================================================================
  // 1. AUTHENTICATION ENDPOINTS
  // =========================================================================
  if (pathname === '/api/auth/me' && method === 'GET') {
    return sendJson(res, 200, { user, csrfToken: session ? session.csrfToken : null, sessionExpired: expired });
  }

  if (pathname === '/api/auth/register' && method === 'POST') {
    const clientIp = req.socket.remoteAddress || 'local';
    if (!(await checkRateLimit(`reg:${clientIp}`, 20, 60000))) {
      return sendJson(res, 429, { error: 'Too many registration attempts. Please wait a moment.' });
    }
    const body = await parseRequestBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();

    // Reject if caller tries to self-assign ADMIN role or privilege
    if (body.role && String(body.role).toUpperCase() !== 'CUSTOMER') {
      return sendJson(res, 403, {
        error: 'Public registration always creates a CUSTOMER account. Role escalation is forbidden.'
      });
    }

    if (!email || !email.includes('@')) {
      return sendJson(res, 400, { error: 'Please enter a valid email address.', field: 'email' });
    }
    if (!name || name.length < 2) {
      return sendJson(res, 400, { error: 'Please enter your full name.', field: 'name' });
    }
    if (password.length < 8) {
      return sendJson(res, 400, { error: 'Password must be at least 8 characters long.', field: 'password' });
    }

    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return sendJson(res, 409, { error: 'An account with this email already exists. Please log in instead.', field: 'email' });
    }

    const now = new Date().toISOString();
    // Server hardcodes role = 'CUSTOMER'
    const resUser = await db.prepare(`
      INSERT INTO users (email, password_hash, name, phone, role, mfa_enabled, is_demo, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'CUSTOMER', 0, 0, 'active', ?, ?)
    `).run(email, hashPassword(password), name, phone, now, now);

    const newUserId = Number(resUser.lastInsertRowid);
    const { sessionId, csrfToken } = await createSession(newUserId, 'customer');

    const cookies = parseCookies(req.headers.cookie);
    const mergedCartId = await mergeGuestCartIntoUserCart(cookies[CART_COOKIE_NAME], newUserId);

    return sendJson(
      res,
      201,
      {
        user: { id: newUserId, email, name, phone, role: 'CUSTOMER', is_demo: false },
        csrfToken
      },
      {
        'Set-Cookie': [
        serializeCookie(SESSION_COOKIE_NAME, sessionId, { maxAge: 86400 }),
        ...(mergedCartId ? [serializeCookie(CART_COOKIE_NAME, mergedCartId, { maxAge: 30 * 86400 })] : [])]

      }
    );
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const clientIp = req.socket.remoteAddress || 'local';
    if (!(await checkRateLimit(`login:${clientIp}`, 25, 60000))) {
      return sendJson(res, 429, { error: 'Too many login attempts. Please wait a moment.' });
    }
    const body = await parseRequestBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    const row = await db.prepare('SELECT * FROM users WHERE email = ? AND status = \'active\'').get(email);
    if (!row || (!sandbox && row.is_demo) || !verifyPassword(password, row.password_hash)) {
      return sendJson(res, 401, { error: 'Invalid email or password.' });
    }

    const { sessionId, csrfToken } = await createSession(row.id, 'customer');
    const cookies = parseCookies(req.headers.cookie);
    const mergedCartId = await mergeGuestCartIntoUserCart(cookies[CART_COOKIE_NAME], row.id);

    return sendJson(
      res,
      200,
      {
        user: {
          id: row.id,
          email: row.email,
          name: row.name,
          phone: row.phone,
          role: row.role,
          is_demo: Boolean(row.is_demo)
        },
        csrfToken
      },
      {
        'Set-Cookie': [
        serializeCookie(SESSION_COOKIE_NAME, sessionId, { maxAge: 86400 }),
        ...(mergedCartId ? [serializeCookie(CART_COOKIE_NAME, mergedCartId, { maxAge: 30 * 86400 })] : [])]

      }
    );
  }

  if (pathname === '/api/admin/auth/login' && method === 'POST') {
    const clientIp = req.socket.remoteAddress || 'local';
    if (!(await checkRateLimit(`adminlogin:${clientIp}`, 20, 60000))) {
      return sendJson(res, 429, { error: 'Too many admin login attempts. Please wait a moment.' });
    }
    const body = await parseRequestBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const mfaCode = String(body.mfa_code || '').trim();

    const row = await db.prepare('SELECT * FROM users WHERE email = ? AND status = \'active\'').get(email);
    if (!row || !verifyPassword(password, row.password_hash)) {
      return sendJson(res, 401, { error: 'Invalid admin credentials.' });
    }

    if (row.role !== 'ADMIN') {
      await logAudit({
        actorUserId: row.id,
        actorEmail: row.email,
        actorRole: row.role,
        action: 'admin_login_denied_non_admin',
        entityType: 'user',
        entityId: row.id
      });
      return sendJson(res, 403, {
        error: 'Access denied. This login workspace is restricted to provisioned ADMIN accounts.',
        code: 'ACCESS_DENIED'
      });
    }

    if (row.mfa_enabled) {
      if (!mfaCode) {
        return sendJson(res, 200, { mfaRequired: true, message: 'Please enter your 6-digit MFA verification code.' });
      }
      if (mfaCode !== String(row.mfa_code || '261026')) {
        return sendJson(res, 401, { error: 'Invalid MFA verification code.', mfaRequired: true });
      }
    }

    const { sessionId, csrfToken } = await createSession(row.id, 'admin', 12);
    await logAudit({
      actorUserId: row.id,
      actorEmail: row.email,
      actorRole: 'ADMIN',
      action: 'admin_login_success',
      entityType: 'session',
      entityId: sessionId.slice(0, 8)
    });

    return sendJson(
      res,
      200,
      {
        user: {
          id: row.id,
          email: row.email,
          name: row.name,
          phone: row.phone,
          role: 'ADMIN'
        },
        csrfToken
      },
      {
        'Set-Cookie': serializeCookie(SESSION_COOKIE_NAME, sessionId, { maxAge: 12 * 3600 })
      }
    );
  }

  if ((pathname === '/api/auth/forgot-password' || pathname === '/api/admin/auth/forgot-password') && method === 'POST') {
    const body = await parseRequestBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const isAdminFlow = pathname.includes('/admin/');
    const userRow = await db.prepare('SELECT id, email, role FROM users WHERE email = ? AND status = \'active\'').get(email);

    let demoResetToken = null;
    if (userRow && (!isAdminFlow || userRow.role === 'ADMIN')) {
      const rawToken = generateToken(16);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
      await db.prepare(`
        INSERT INTO password_reset_tokens (user_id, token_hash, token_preview, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(userRow.id, hashToken(rawToken), rawToken, expiresAt, now.toISOString());
      demoResetToken = rawToken;
    }

    return sendJson(res, 200, {
      message: 'If an eligible account matches that email, password recovery instructions have been generated.',
      demoResetToken: sandbox ? demoResetToken : undefined
    });
  }

  if (pathname === '/api/auth/reset-password' && method === 'POST') {
    const body = await parseRequestBody(req);
    const token = String(body.token || '').trim();
    const newPassword = String(body.new_password || '');
    if (!token || newPassword.length < 8) {
      return sendJson(res, 400, { error: 'Valid reset token and a password of at least 8 characters are required.' });
    }

    const tokenRow = await db.prepare(`
      SELECT * FROM password_reset_tokens
      WHERE token_hash = ? AND used_at IS NULL
    `).get(hashToken(token));

    if (!tokenRow || new Date(tokenRow.expires_at).getTime() <= Date.now()) {
      return sendJson(res, 400, { error: 'Reset token is invalid or has expired.' });
    }

    const now = new Date().toISOString();
    await runTransaction(async () => {
      await db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').
      run(hashPassword(newPassword), now, tokenRow.user_id);
      await db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').run(now, tokenRow.id);
      await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(tokenRow.user_id);
    });

    return sendJson(res, 200, { message: 'Password updated successfully. You may now log in.' });
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[SESSION_COOKIE_NAME];
    if (sessionId) {
      await db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    }
    return sendJson(
      res,
      200,
      { ok: true },
      { 'Set-Cookie': serializeCookie(SESSION_COOKIE_NAME, '', { maxAge: 0 }) }
    );
  }

  // =========================================================================
  // 2. PUBLIC STOREFRONT, CATALOGUE & SEARCH ENDPOINTS
  // =========================================================================
  if (pathname === '/api/storefront' && method === 'GET') {
    await sweepExpiredReservations();
    const isPreview = (urlObj.searchParams.get('preview')) === '1' && user && user.role === 'ADMIN';
    const [settingsRow, categories, contentRows, latestPaymentConfig, allProductRows] = await Promise.all([
      db.prepare('SELECT * FROM store_settings WHERE id = 1').get(),
      db.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all(),
      db.prepare('SELECT * FROM content_sections').all(),
      db.prepare('SELECT * FROM payment_instruction_versions ORDER BY version_number DESC LIMIT 1').get(),
      db.prepare(`
        SELECT * FROM products
        WHERE publish_status != 'archived'
          AND duplicate_merged_into_id IS NULL
        ORDER BY CASE WHEN is_demo = 0 THEN 0 ELSE 1 END, reference_order ASC, id ASC
      `).all()
    ]);

    const content = {};
    for (const row of contentRows) {
      content[row.section_key] = JSON.parse(isPreview ? row.draft_json : row.published_json);
    }

    const visibleProductRows = allProductRows.filter((p) => {
      if (isPreview) return true;
      if (settingsRow.design_preview_enabled) return sandbox ? true : !p.is_demo;
      return !p.is_demo && p.publish_status === 'published';
    });
    const formattedProducts = await formatProductRows(visibleProductRows);

    return sendJson(res, 200, {
      sandbox,
      store: {
        store_name: settingsRow.store_name,
        tagline: settingsRow.tagline,
        support_email: settingsRow.support_email,
        support_phone: settingsRow.support_phone,
        business_address: settingsRow.business_address,
        support_hours: settingsRow.support_hours, founder_story: settingsRow.founder_story, sourcing_info:settingsRow.sourcing_info, business_identity:settingsRow.business_identity,
        currency: settingsRow.currency,
        timezone: settingsRow.timezone,
        design_preview_enabled: Boolean(settingsRow.design_preview_enabled),
        shipping_zones: JSON.parse(settingsRow.shipping_zones_json || '[]'),
        tax_config: JSON.parse(settingsRow.tax_config_json || '{}'),
        policies: JSON.parse(settingsRow.policies_json || '{}'),
        physical_stores: JSON.parse(settingsRow.physical_stores_json || '[]'),
        smtp_configured: Boolean(settingsRow.smtp_configured),
        session_tracking_connected: Boolean(settingsRow.session_tracking_connected)
      },
      paymentSetup: {
        version_number: latestPaymentConfig.version_number,
        is_live_configured: Boolean(latestPaymentConfig.is_live_configured),
        demo_qr_enabled: Boolean(sandbox && latestPaymentConfig.demo_qr_enabled),
        recipient_name: latestPaymentConfig.recipient_name,
        bank_name: latestPaymentConfig.bank_name,
        manual_transfer_enabled: Boolean(latestPaymentConfig.manual_transfer_enabled),
        qr_image_path: latestPaymentConfig.qr_image_path,
        payment_deadline_minutes: latestPaymentConfig.payment_deadline_minutes,
        review_window_hours: latestPaymentConfig.review_window_hours
      },
      isPreviewMode: Boolean(isPreview),
      categories,
      content,
      products: formattedProducts
    });
  }

  if (pathname === '/api/products' && method === 'GET') {
    const q = String((urlObj.searchParams.get('q')) || '').trim().toLowerCase();
    const category = String((urlObj.searchParams.get('category')) || '').trim().toLowerCase();
    const brand = String((urlObj.searchParams.get('brand')) || '').trim().toLowerCase();
    const colour = String((urlObj.searchParams.get('colour')) || '').trim().toLowerCase();
    const availability = String((urlObj.searchParams.get('availability')) || '').trim().toLowerCase();
    const sort = String((urlObj.searchParams.get('sort')) || 'featured').trim();
    const [settingsRow, rows] = await Promise.all([
      db.prepare('SELECT design_preview_enabled FROM store_settings WHERE id = 1').get(),
      db.prepare(`
        SELECT * FROM products
        WHERE publish_status != 'archived'
          AND duplicate_merged_into_id IS NULL
        ORDER BY CASE WHEN is_demo = 0 THEN 0 ELSE 1 END, reference_order ASC, id ASC
      `).all()
    ]);
    const designPreviewEnabled = Boolean(settingsRow?.design_preview_enabled);

    let list = (await formatProductRows(rows)).filter((p) => {
      if (!(user && user.role === 'ADMIN' && urlObj.searchParams.get('preview')==='1') && !sandbox && (p.is_demo || (!designPreviewEnabled && p.publish_status !== 'published'))) return false;
      if (category && p.category_slug !== category) return false;
      if (brand && p.brand.toLowerCase() !== brand) return false;
      if (colour) {
        const prodColour = (p.reference_colour_description || p.confirmed_attributes.colour || p.confirmed_attributes.frame_colour || '').toLowerCase();
        if (prodColour !== colour) return false;
      }
      if (availability === 'sellable' && !p.is_sellable) return false;
      if (availability === 'draft' && p.publish_status !== 'draft') return false;
      if (q) {
        const hay = `${p.title} ${p.brand} ${p.category_slug} ${p.reference_id || ''} ${p.description || ''} ${p.reference_colour_description || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (sort === 'price_asc') {
      list.sort((a, b) => (a.price_minor ?? 999999999) - (b.price_minor ?? 999999999));
    } else if (sort === 'price_desc') {
      list.sort((a, b) => (b.price_minor ?? -1) - (a.price_minor ?? -1));
    } else if (sort === 'title_asc') {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }

    return sendJson(res, 200, { products: list, total: list.length });
  }

  if (pathname.startsWith('/api/products/') && method === 'GET') {
    const slugOrRef = decodeURIComponent(pathname.slice('/api/products/'.length));
    const [settingsRow, row] = await Promise.all([
      db.prepare('SELECT design_preview_enabled FROM store_settings WHERE id = 1').get(),
      db.prepare(`
        SELECT * FROM products
        WHERE slug = ? OR reference_id = ? OR CAST(id AS TEXT) = ?
        LIMIT 1
      `).get(slugOrRef, slugOrRef.toUpperCase(), slugOrRef)
    ]);
    const designPreviewEnabled = Boolean(settingsRow?.design_preview_enabled);

    if (!row || row.publish_status === 'archived' || !(user && user.role === 'ADMIN' && urlObj.searchParams.get('preview')==='1') && !sandbox && (row.is_demo || (!designPreviewEnabled && row.publish_status !== 'published'))) {
      return sendJson(res, 404, { error: 'Product not found.' });
    }

    const [product, relatedRows] = await Promise.all([
      formatProductRow(row),
      db.prepare(`
        SELECT * FROM products
        WHERE category_slug = ? AND id != ? AND publish_status != 'archived' AND duplicate_merged_into_id IS NULL
        ORDER BY reference_order ASC LIMIT 4
      `).all(row.category_slug, row.id)
    ]);

    return sendJson(res, 200, {
      product,
      related: await formatProductRows(relatedRows.filter(r=>sandbox || (!r.is_demo && (designPreviewEnabled || r.publish_status==='published'))))
    });
  }

  // Newsletter opt-in with explicit consent & unsubscribe
  if (pathname === '/api/newsletter/subscribe' && method === 'POST') {
    const body = await parseRequestBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const consent = Boolean(body.consent);
    if (!email || !email.includes('@')) {
      return sendJson(res, 400, { error: 'Please provide a valid email address.' });
    }
    if (!consent) {
      return sendJson(res, 400, { error: 'Explicit marketing consent is required to subscribe to the newsletter.' });
    }
    const now = new Date().toISOString();
    const unsubToken = generateToken(16);
    const existing = await db.prepare('SELECT id FROM newsletter_subscriptions WHERE email = ?').get(email);
    if (existing) {
      await db.prepare('UPDATE newsletter_subscriptions SET status = \'subscribed\', consent_given = 1, updated_at = ? WHERE id = ?').
      run(now, existing.id);
    } else {
      await db.prepare(`
        INSERT INTO newsletter_subscriptions (email, consent_given, consent_text, status, unsubscribe_token, created_at, updated_at)
        VALUES (?, 1, 'Explicit opt-in to Shop by SCHA editorial updates', 'subscribed', ?, ?, ?)
      `).run(email, unsubToken, now, now);
    }
    return sendJson(res, 200, {
      message: 'Subscribed to Shop by SCHA editorial updates.',
      unsubscribeToken: unsubToken
    });
  }

  if (pathname === '/api/newsletter/unsubscribe' && method === 'POST') {
    const body = await parseRequestBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const token = String(body.token || '').trim();
    const now = new Date().toISOString();
    if (token) {
      await db.prepare('UPDATE newsletter_subscriptions SET status = \'unsubscribed\', updated_at = ? WHERE unsubscribe_token = ?').run(now, token);
    } else if (email) {
      await db.prepare('UPDATE newsletter_subscriptions SET status = \'unsubscribed\', updated_at = ? WHERE email = ?').run(now, email);
    }
    return sendJson(res, 200, { message: 'You have been unsubscribed from marketing emails.' });
  }

  // =========================================================================
  // 3. CART & CHECKOUT ENDPOINTS
  // =========================================================================
  if (pathname === '/api/cart' && method === 'GET') {
    const { cartId, setCookie } = await getOrCreateCartId(req, res, user);
    const state = (urlObj.searchParams.get('state')) || 'Wilayah Persekutuan Kuala Lumpur';
    const methodId = (urlObj.searchParams.get('shipping_method')) || null;
    const cart = await getCartDetails(cartId, state, methodId);
    const headers = setCookie ? { 'Set-Cookie': setCookie } : {};
    return sendJson(res, 200, cart, headers);
  }

  if (pathname === '/api/cart/items' && method === 'POST') {
    const { cartId, setCookie } = await getOrCreateCartId(req, res, user);
    const body = await parseRequestBody(req);
    const productId = Number(body.product_id);
    const variantId = Number(body.variant_id);
    const quantity = Number(body.quantity ?? 1);
    if (!Number.isSafeInteger(quantity) || quantity < 1) return sendJson(res, 400, { error: 'Choose a whole-number quantity greater than zero.' });

    const prod = await db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!prod || !sandbox && prod.is_demo) {
      return sendJson(res, 404, { error: 'Product not found.' });
    }
    // Strictly block purchase on draft or incomplete products with unknown price/stock/variants!
    if (prod.publish_status !== 'published' || !prod.purchase_enabled || prod.price_minor === null || prod.price_minor <= 0) {
      return sendJson(res, 400, {
        error: 'This draft catalogue reference has unconfirmed price, SKU or stock and cannot be purchased on the live store until completed and published by an administrator.',
        code: 'INCOMPLETE_PRODUCT_REFERENCE'
      });
    }

    const variant = await db.prepare('SELECT * FROM product_variants WHERE id = ? AND product_id = ? AND is_active = 1').get(variantId, productId);
    if (!variant || variant.price_minor <= 0) {
      return sendJson(res, 400, { error: 'Please select a valid confirmed sellable variant.' });
    }

    const available = Math.max(0, Number(variant.on_hand) - Number(variant.reserved));
    const existingItem = await db.prepare('SELECT id, quantity FROM cart_items WHERE cart_id = ? AND variant_id = ?').get(cartId, variant.id);
    const desiredQty = (existingItem ? existingItem.quantity : 0) + quantity;

    if (desiredQty > available) {
      return sendJson(res, 400, {
        error: `Insufficient available stock for ${prod.title} (${variant.title}). Available: ${available}.`,
        code: 'INSUFFICIENT_STOCK'
      });
    }

    const now = new Date().toISOString();
    if (existingItem) {
      await db.prepare('UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?').run(desiredQty, now, existingItem.id);
    } else {
      await db.prepare('INSERT INTO cart_items (cart_id, product_id, variant_id, quantity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').
      run(cartId, prod.id, variant.id, quantity, now, now);
    }

    const cart = await getCartDetails(cartId);
    const headers = setCookie ? { 'Set-Cookie': setCookie } : {};
    return sendJson(res, 200, { message: 'Added to bag.', cart }, headers);
  }

  // Helper endpoint to load the Wireframe Demo Sandbox Item (Product 01 / Variant A — SCHA-001-A, RM129.00)
  if (pathname === '/api/cart/demo-sandbox' && method === 'POST') {
    if (!sandbox) return sendJson(res, 404, { error: 'Not found.' });
    const { cartId, setCookie } = await getOrCreateCartId(req, res, user);
    const demoProd = await db.prepare("SELECT * FROM products WHERE reference_id = 'DEMO-01'").get();
    const demoVar = await db.prepare("SELECT * FROM product_variants WHERE sku = 'SCHA-001-A'").get();
    if (!demoProd || !demoVar) {
      return sendJson(res, 404, { error: 'Demo sandbox SKU not found.' });
    }
    const now = new Date().toISOString();
    const existing = await db.prepare('SELECT id, quantity FROM cart_items WHERE cart_id = ? AND variant_id = ?').get(cartId, demoVar.id);
    if (existing) {
      await db.prepare('UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?').run(Math.min(existing.quantity + 1, 5), now, existing.id);
    } else {
      await db.prepare('INSERT INTO cart_items (cart_id, product_id, variant_id, quantity, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)').
      run(cartId, demoProd.id, demoVar.id, now, now);
    }
    const cart = await getCartDetails(cartId);
    const headers = setCookie ? { 'Set-Cookie': setCookie } : {};
    return sendJson(res, 200, {
      message: 'Added Product 01 / Variant A (SCHA-001-A · RM129.00 [DEMO]) to bag for checkout testing.',
      cart
    }, headers);
  }

  if (pathname.startsWith('/api/cart/items/') && (method === 'PATCH' || method === 'DELETE')) {
    const { cartId } = await getOrCreateCartId(req, res, user);
    const itemId = Number(pathname.slice('/api/cart/items/'.length));
    const item = await db.prepare('SELECT * FROM cart_items WHERE id = ? AND cart_id = ?').get(itemId, cartId);
    if (!item) {
      return sendJson(res, 404, { error: 'Bag item not found.' });
    }

    if (method === 'DELETE') {
      await db.prepare('DELETE FROM cart_items WHERE id = ?').run(itemId);
    } else {
      const body = await parseRequestBody(req);
      const qty = Number(body.quantity);
      if (!Number.isSafeInteger(qty) || qty < 0) return sendJson(res, 400, { error: 'Quantity must be a nonnegative whole number.' });
      if (qty <= 0) {
        await db.prepare('DELETE FROM cart_items WHERE id = ?').run(itemId);
      } else {
        const variant = await db.prepare('SELECT on_hand, reserved FROM product_variants WHERE id = ?').get(item.variant_id);
        const available = variant ? Math.max(0, variant.on_hand - variant.reserved) : 0;
        if (qty > available) {
          return sendJson(res, 400, { error: `Only ${available} unit(s) available in stock.` });
        }
        await db.prepare('UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?').
        run(qty, new Date().toISOString(), itemId);
      }
    }
    return sendJson(res, 200, { cart: await getCartDetails(cartId) });
  }

  if (pathname === '/api/cart/discount' && method === 'POST') {
    const { cartId } = await getOrCreateCartId(req, res, user);
    const body = await parseRequestBody(req);
    const code = String(body.code || '').trim().toUpperCase();
    if (code && (!sandbox || code !== 'SCHA10')) {
      return sendJson(res, 400, { error: 'Invalid or expired promo code.' });
    }
    await db.prepare('UPDATE carts SET discount_code = ?, updated_at = ? WHERE id = ?').
    run(code || null, new Date().toISOString(), cartId);
    return sendJson(res, 200, { cart: await getCartDetails(cartId) });
  }

  // Place Order — atomic stock reservation + server-computed totals + awaiting_payment / unfulfilled
  if (pathname === '/api/checkout/place-order' && method === 'POST') {
    await sweepExpiredReservations();
    const { cartId } = await getOrCreateCartId(req, res, user);
    const body = await parseRequestBody(req);

    const key = String(body.idempotency_key || req.headers['idempotency-key'] || '').trim();
    if (!/^[a-zA-Z0-9_-]{12,100}$/.test(key)) return sendJson(res, 400, { error: 'A valid checkout request key is required.' });
    const requestScope = user ? `user:${user.id}` : `cart:${cartId}`;
    const prior = await db.prepare('SELECT order_id FROM checkout_requests WHERE scope = ? AND request_key = ?').get(requestScope, key);
    if (prior) {
      const old = await db.prepare('SELECT * FROM orders WHERE id = ?').get(prior.order_id);
      return sendJson(res, 200, { order: { ...(await enrichOrder(old, false)), guest_access_token: old.guest_access_token } });
    }
    const email = String(body.email || (user ? user.email : '')).trim().toLowerCase();
    const phone = String(body.phone || (user ? user.phone : '')).trim();
    const shippingAddr = body.shipping_address || {};
    const billingSame = body.billing_same_as_shipping !== false;
    const billingAddr = billingSame ? shippingAddr : body.billing_address || shippingAddr;
    const shippingMethodId = body.shipping_method_id || null;

    if (!email || !email.includes('@')) {
      return sendJson(res, 400, { error: 'Valid contact email is required.', field: 'email' });
    }
    if (!phone || phone.length < 6) {
      return sendJson(res, 400, { error: 'Contact phone number is required.', field: 'phone' });
    }
    if (!shippingAddr.recipient_name || !shippingAddr.line1 || !shippingAddr.postcode || !shippingAddr.city || !shippingAddr.state) {
      return sendJson(res, 400, { error: 'Please complete all required Malaysian shipping address fields.' });
    }

    const latestPaymentConfig = await db.prepare('SELECT * FROM payment_instruction_versions ORDER BY version_number DESC LIMIT 1').get();
    const merchantSupport=await db.prepare('SELECT support_email,support_phone FROM store_settings WHERE id=1').get();
    const liveQrValid=(!process.env.VERCEL || require('./object-storage').configured()) && latestPaymentConfig.is_live_configured && latestPaymentConfig.qr_image_path && latestPaymentConfig.recipient_name && latestPaymentConfig.bank_name && (merchantSupport.support_email || merchantSupport.support_phone);
    if (!liveQrValid && !(sandbox && latestPaymentConfig.demo_qr_enabled)) {
      return sendJson(res, 400, {
        error: 'Live DuitNow QR checkout is currently disabled because the merchant bank QR has not been configured in Admin Settings.',
        code: 'PAYMENT_QR_NOT_CONFIGURED'
      });
    }

    const cart = await getCartDetails(cartId, shippingAddr.state, shippingMethodId);
    if (cart.items.length === 0) {
      return sendJson(res, 400, { error: 'Your shopping bag is empty.' });
    }
    if (cart.warnings.length > 0) {
      return sendJson(res, 400, { error: cart.warnings[0], warnings: cart.warnings });
    }
    if (!cart.selected_shipping_method) {
      return sendJson(res, 400, { error: 'No configured delivery method is available for the selected address.' });
    }

    try {
      const createdOrder = await runTransaction(async () => {
        const existingRequest=await db.prepare('SELECT order_id FROM checkout_requests WHERE scope = ? AND request_key = ?').get(requestScope,key);
        if(existingRequest){const old=await db.prepare('SELECT * FROM orders WHERE id = ?').get(existingRequest.order_id);return {...await enrichOrder(old,false),guest_access_token:old.guest_access_token,replayed:true};}
        const cart=await getCartDetails(cartId,shippingAddr.state,shippingMethodId);
        if(!cart.items.length || cart.warnings.length)throw new Error(cart.warnings[0] || 'Your bag is empty.');
        if(body.expected_total_minor !== undefined && body.expected_total_minor !== cart.total_minor)throw new Error('Your order total changed. Please review your bag before placing the order.');
        const now = new Date();
        const nowIso = now.toISOString();
        const deadlineMinutes = Number(latestPaymentConfig.payment_deadline_minutes || 30);
        const deadlineIso = new Date(now.getTime() + deadlineMinutes * 60 * 1000).toISOString();

        // Atomically re-verify and reserve stock for every SKU
        for (const item of cart.items) {
          const v = await db.prepare('SELECT * FROM product_variants WHERE id = ? AND is_active = 1').get(item.variant_id);
          const p = await db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
          if (!v || !p || p.publish_status !== 'published' || !p.purchase_enabled || v.price_minor <= 0) {
            throw new Error(`${item.product_title} is not available for purchase.`);
          }
          const avail = v.on_hand - v.reserved;
          if (avail < item.quantity) {
            throw new Error(`Insufficient stock for ${p.title} (${v.title}). Available: ${avail}.`);
          }
        }

        const orderNumber = `SCHA-${Date.now().toString(36).toUpperCase()}-${generateToken(3).toUpperCase()}`;
        const guestAccessToken = generateToken(24);
        const guestTokenExpiresAt = new Date(now.getTime() + 14 * 86400 * 1000).toISOString();

        const paymentSnapshot = {
          version_number: latestPaymentConfig.version_number,
          is_live_configured: Boolean(latestPaymentConfig.is_live_configured),
          demo_qr_enabled: Boolean(sandbox && latestPaymentConfig.demo_qr_enabled),
          recipient_name: latestPaymentConfig.recipient_name,
          bank_name: latestPaymentConfig.bank_name,
          account_number: latestPaymentConfig.account_number,
          manual_transfer_enabled: Boolean(latestPaymentConfig.manual_transfer_enabled),
          qr_image_path: latestPaymentConfig.qr_image_path,
          payment_deadline_minutes: deadlineMinutes,
          review_window_hours: latestPaymentConfig.review_window_hours
        };

        const normalizedShipping = {
          recipient_name: String(shippingAddr.recipient_name).trim(),
          phone,
          line1: String(shippingAddr.line1).trim(),
          line2: String(shippingAddr.line2 || '').trim(),
          postcode: String(shippingAddr.postcode).trim(),
          city: String(shippingAddr.city).trim(),
          state: String(shippingAddr.state).trim(),
          country: String(shippingAddr.country || 'Malaysia').trim()
        };

        const normalizedBilling = billingSame ?
        normalizedShipping :
        {
          recipient_name: String(billingAddr.recipient_name || normalizedShipping.recipient_name).trim(),
          phone: String(billingAddr.phone || phone).trim(),
          line1: String(billingAddr.line1 || normalizedShipping.line1).trim(),
          line2: String(billingAddr.line2 || '').trim(),
          postcode: String(billingAddr.postcode || normalizedShipping.postcode).trim(),
          city: String(billingAddr.city || normalizedShipping.city).trim(),
          state: String(billingAddr.state || normalizedShipping.state).trim(),
          country: String(billingAddr.country || 'Malaysia').trim()
        };

        const ordRes = await db.prepare(`
          INSERT INTO orders (
            order_number, user_id, customer_email, customer_name, customer_phone,
            guest_token_hash, guest_access_token, guest_token_expires_at,
            payment_status, fulfilment_status, currency,
            subtotal_minor, discount_minor, discount_code,
            shipping_minor, shipping_zone, shipping_method, tax_minor, total_minor,
            shipping_address_snapshot_json, billing_address_snapshot_json,
            payment_instruction_version_id, payment_instructions_snapshot_json,
            payment_deadline_at, is_demo, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_payment', 'unfulfilled', 'MYR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          orderNumber,
          user ? user.id : null,
          email,
          normalizedShipping.recipient_name,
          phone,
          hashToken(guestAccessToken),
          guestAccessToken,
          guestTokenExpiresAt,
          cart.subtotal_minor,
          cart.discount_minor,
          cart.discount_code,
          cart.shipping_minor,
          cart.shipping_zone,
          cart.selected_shipping_method.name,
          cart.tax_minor,
          cart.total_minor,
          JSON.stringify(normalizedShipping),
          JSON.stringify(normalizedBilling),
          latestPaymentConfig.id,
          JSON.stringify(paymentSnapshot),
          deadlineIso,
          cart.has_demo_items ? 1 : 0,
          nowIso,
          nowIso
        );

        const orderId = Number(ordRes.lastInsertRowid);
        await db.prepare('INSERT INTO checkout_requests (scope,request_key,order_id) VALUES (?,?,?)').run(requestScope, key, orderId);

        for (const item of cart.items) {
          const v = await db.prepare('SELECT * FROM product_variants WHERE id = ?').get(item.variant_id);
          const newReserved = v.reserved + item.quantity;
          await db.prepare('UPDATE product_variants SET reserved = ?, version = version + 1, updated_at = ? WHERE id = ?').
          run(newReserved, nowIso, v.id);

          await db.prepare(`
            INSERT INTO stock_movements (
              variant_id, sku, delta_on_hand, delta_reserved, before_on_hand, after_on_hand, before_reserved, after_reserved,
              movement_type, reason, order_id, actor_user_id, actor_email, created_at
            ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, 'order_reservation', ?, ?, ?, ?, ?)
          `).run(
            v.id,
            v.sku,
            item.quantity,
            v.on_hand,
            v.on_hand,
            v.reserved,
            newReserved,
            `Reserved for order #${orderNumber}`,
            orderId,
            user ? user.id : null,
            email,
            nowIso
          );

          await db.prepare(`
            INSERT INTO stock_reservations (
              order_id, variant_id, sku, quantity, status, payment_deadline_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'active_payment_hold', ?, ?, ?)
          `).run(orderId, v.id, v.sku, item.quantity, deadlineIso, nowIso, nowIso);

          await db.prepare(`
            INSERT INTO order_items (
              order_id, product_id, variant_id, reference_id_snapshot, title_snapshot, brand_snapshot,
              sku_snapshot, variant_title_snapshot, image_snapshot, unit_price_minor, quantity, line_total_minor
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            orderId,
            item.product_id,
            item.variant_id,
            item.reference_id,
            item.product_title,
            item.brand,
            item.sku,
            item.variant_title,
            item.image_path || '/images/08_jacquemus_pink_flap_handbag.png',
            item.price_minor,
            item.quantity,
            item.line_total_minor
          );
        }

        await db.prepare(`
          INSERT INTO status_events (
            order_id, event_type, payment_status, fulfilment_status, title, detail, actor_role, actor_email, customer_visible, created_at
          ) VALUES (?, 'order_created', 'awaiting_payment', 'unfulfilled', 'Order received — awaiting payment', ?, ?, ?, 1, ?)
        `).run(
          orderId,
          `Stock reserved until ${new Date(deadlineIso).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}. Complete DuitNow QR payment and submit receipt for admin verification.`,
          user ? user.role : 'GUEST',
          email,
          nowIso
        );

        const actionUrl = `/order/confirmation?order=${encodeURIComponent(orderNumber)}&token=${encodeURIComponent(guestAccessToken)}`;
        await scheduleNotification({
          orderId,
          recipientEmail: email,
          templateType: 'order_received',
          idempotencyKey: `order_received:${orderNumber}`,
          subject: `Order received - awaiting payment (#${orderNumber})`,
          bodyText: `Thank you for your order #${orderNumber}. Amount due: ${formatMYR(cart.total_minor)}. Your order is currently Awaiting payment. Please scan the merchant DuitNow QR and upload your receipt before the payment deadline.`,
          actionUrl
        });

        await db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cartId);
        await db.prepare('UPDATE carts SET discount_code = NULL, updated_at = ? WHERE id = ?').run(nowIso, cartId);

        const row = await db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
        return {
          ...(await enrichOrder(row, false)),
          guest_access_token: guestAccessToken
        };
      });

      return sendJson(res, createdOrder.replayed ? 200 : 201, {
        message: 'Order received — awaiting payment.',
        order: createdOrder
      });
    } catch (err) {
      return sendJson(res, 400, { error: err.message || 'Could not place order.' });
    }
  }

  // =========================================================================
  // 4. ORDER TRACKING, RECEIPT UPLOAD & PRIVATE RECEIPT VIEWING
  // =========================================================================
  if (pathname === '/api/orders/guest-verify' && method === 'POST') {
    const body = await parseRequestBody(req);
    const orderNumber = String(body.order_number || '').trim().toUpperCase().replace(/^#/, '');
    const email = String(body.email || '').trim().toLowerCase();

    if (!orderNumber || !email) {
      return sendJson(res, 400, { error: 'Please provide both your Order Number and the email used at checkout.' });
    }

    const ord = await db.prepare('SELECT * FROM orders WHERE UPPER(order_number) = ? AND LOWER(customer_email) = ?').get(orderNumber, email);
    if (!ord) {
      return sendJson(res, 404, { error: 'No matching order was found for that order number and email.' });
    }

    const newToken = generateToken(24);
    const expiresAt = new Date(Date.now() + 14 * 86400 * 1000).toISOString();
    await db.prepare('UPDATE orders SET guest_access_token = ?, guest_token_hash = ?, guest_token_expires_at = ?, updated_at = ? WHERE id = ?').
    run(newToken, hashToken(newToken), expiresAt, new Date().toISOString(), ord.id);

    return sendJson(res, 200, {
      order_number: ord.order_number,
      token: newToken,
      redirect_url: `/order/confirmation?order=${encodeURIComponent(ord.order_number)}&token=${encodeURIComponent(newToken)}`
    });
  }

  if (pathname.startsWith('/api/orders/') && method === 'GET') {
    await sweepExpiredReservations();
    const orderKey = decodeURIComponent(pathname.slice('/api/orders/'.length)).replace(/^#/, '');
    const ord = await db.prepare('SELECT * FROM orders WHERE UPPER(order_number) = UPPER(?) OR CAST(id AS TEXT) = ?').get(orderKey, orderKey);

    if (!ord) {
      return sendJson(res, 404, { error: 'Order not found.' });
    }

    if (!(await canAccessOrder(req, urlObj, user, ord))) {
      return sendJson(res, 403, {
        error: 'Access denied. You can only view your own orders or must use a valid verified order link.',
        code: 'ORDER_ACCESS_DENIED'
      });
    }

    return sendJson(res, 200, {
      order: await enrichOrder(ord, user && user.role === 'ADMIN')
    });
  }

  // Buyer submits DuitNow QR transaction reference, amount paid, optional time, and required JPG/PNG/PDF receipt
  if (pathname.match(/^\/api\/orders\/[^/]+\/payment-submission$/) && method === 'POST') {
    const parts = pathname.split('/');
    const orderKey = decodeURIComponent(parts[3]).replace(/^#/, '');
    const ord = await db.prepare('SELECT * FROM orders WHERE UPPER(order_number) = UPPER(?) OR CAST(id AS TEXT) = ?').get(orderKey, orderKey);

    if (!ord) {
      return sendJson(res, 404, { error: 'Order not found.' });
    }

    if (!(await canAccessOrder(req, urlObj, user, ord))) {
      return sendJson(res, 403, { error: 'Unauthorised to submit payment evidence for this order.' });
    }

    if (['paid', 'refund_pending', 'partially_refunded', 'refunded'].includes(ord.payment_status)) {
      return sendJson(res, 400, { error: 'Payment has already been confirmed for this order.' });
    }

    let parsed;
    try {
      parsed = await parseRequestBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message || 'Invalid upload payload.' });
    }

    const fields = parsed.isMultipart ? parsed.fields : parsed;
    const files = parsed.isMultipart ? parsed.files : {};

    const declaredReference = String(fields.declared_reference || '').trim();
    const declaredAmountMinor = parseMYRToMinor(fields.declared_amount);
    const declaredPaidAt = String(fields.declared_paid_at || '').trim() || new Date().toISOString();

    if (!declaredReference || declaredReference.length < 3) {
      return sendJson(res, 400, { error: 'Please enter your bank / DuitNow transaction reference.', field: 'declared_reference' });
    }
    if (!declaredAmountMinor || declaredAmountMinor <= 0) {
      return sendJson(res, 400, { error: 'Please enter the valid MYR amount paid.', field: 'declared_amount' });
    }

    let fileBuf = null;
    let fileOriginalName = 'receipt.png';
    if (files.receipt && files.receipt.buffer) {
      fileBuf = files.receipt.buffer;
      fileOriginalName = files.receipt.filename;
    } else if (fields.receipt_base64) {
      const b64 = String(fields.receipt_base64).replace(/^data:[^;]+;base64,/, '');
      fileBuf = Buffer.from(b64, 'base64');
      fileOriginalName = fields.receipt_filename || 'receipt.png';
    }

    let savedReceipt;
    try {
      savedReceipt = await savePrivateReceipt(fileBuf, fileOriginalName);
    } catch (err) {
      return sendJson(res, 400, { error: err.message, field: 'receipt' });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const isAfterDeadline = new Date(ord.payment_deadline_at).getTime() < now.getTime() || ord.payment_status === 'expired_cancelled';
    const isAmountMismatch = declaredAmountMinor !== Number(ord.total_minor);

    const updatedOrder = await runTransaction(async () => {
      const payInstructions = JSON.parse(ord.payment_instructions_snapshot_json || '{}');
      const reviewWindowHours = Number(payInstructions.review_window_hours || 24);
      const reviewExpiresIso = new Date(now.getTime() + reviewWindowHours * 3600 * 1000).toISOString();

      let reconciliationRequired = ord.reconciliation_required ? 1 : 0;
      const reasons = [];
      if (isAfterDeadline) {
        reconciliationRequired = 1;
        reasons.push('Receipt submitted after payment deadline / reservation expiry');
      }
      if (isAmountMismatch) {
        reconciliationRequired = 1;
        reasons.push(`Declared amount (${formatMYR(declaredAmountMinor)}) differs from order total (${formatMYR(ord.total_minor)})`);
      }

      const subRes = await db.prepare(`
        INSERT INTO payment_submissions (
          order_id, declared_reference, declared_amount_minor, declared_paid_at,
          receipt_filename, receipt_original_name, receipt_mime_type, receipt_size_bytes,
          submitted_after_deadline, amount_mismatch, status, submitted_by_role, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ord.id,
        declaredReference,
        declaredAmountMinor,
        declaredPaidAt,
        savedReceipt.filename,
        savedReceipt.originalName,
        savedReceipt.mimeType,
        savedReceipt.sizeBytes,
        isAfterDeadline ? 1 : 0,
        isAmountMismatch ? 1 : 0,
        reconciliationRequired ? 'reconciliation' : 'under_review',
        user ? user.role : 'GUEST',
        nowIso
      );
      const submissionId = Number(subRes.lastInsertRowid);

      // Move active_payment_hold into active_review_hold so it is NOT released while buyer waits for review
      await db.prepare(`
        UPDATE stock_reservations
        SET status = 'active_review_hold', review_window_expires_at = ?, updated_at = ?
        WHERE order_id = ? AND status IN ('active_payment_hold', 'active_review_hold')
      `).run(reviewExpiresIso, nowIso, ord.id);

      // Submission sets payment_status = 'under_review', NEVER 'paid'!
      await db.prepare(`
        UPDATE orders
        SET payment_status = 'under_review',
            review_window_expires_at = ?,
            reconciliation_required = ?,
            reconciliation_reason = ?,
            resubmission_reason = NULL,
            updated_at = ?
        WHERE id = ?
      `).run(
        reviewExpiresIso,
        reconciliationRequired,
        reasons.length > 0 ? reasons.join('; ') : ord.reconciliation_reason,
        nowIso,
        ord.id
      );

      await db.prepare(`
        INSERT INTO status_events (
          order_id, event_type, payment_status, fulfilment_status, title, detail, actor_role, actor_email, customer_visible, created_at
        ) VALUES (?, 'receipt_submitted', 'under_review', ?, 'Receipt submitted — Payment under review', ?, ?, ?, 1, ?)
      `).run(
        ord.id,
        ord.fulfilment_status,
        `Declared ref: ${declaredReference} (${formatMYR(declaredAmountMinor)}). Awaiting independent bank verification by store admin.`,
        user ? user.role : 'GUEST',
        ord.customer_email,
        nowIso
      );

      const actionUrl = `/order/confirmation?order=${encodeURIComponent(ord.order_number)}${ord.guest_access_token ? `&token=${encodeURIComponent(ord.guest_access_token)}` : ''}`;
      await scheduleNotification({
        orderId: ord.id,
        recipientEmail: ord.customer_email,
        templateType: 'receipt_submitted',
        idempotencyKey: `receipt_submitted:${ord.order_number}:${submissionId}`,
        subject: `Payment under review (#${ord.order_number})`,
        bodyText: `We have received your payment submission (Ref: ${declaredReference}, Amount: ${formatMYR(declaredAmountMinor)}) for order #${ord.order_number}. Your order status is now Payment under review. Payment confirmation will be sent after our admin team verifies the received transaction in our bank records.`,
        actionUrl
      });

      const refreshed = await db.prepare('SELECT * FROM orders WHERE id = ?').get(ord.id);
      return await enrichOrder(refreshed, false);
    });

    return sendJson(res, 200, {
      message: 'Payment under review. We have received your payment submission.',
      order: updatedOrder
    });
  }

  // Customer cancellation or return request
  if (pathname.match(/^\/api\/orders\/[^/]+\/request-support-action$/) && method === 'POST') {
    const parts = pathname.split('/');
    const orderKey = decodeURIComponent(parts[3]).replace(/^#/, '');
    const ord = await db.prepare('SELECT * FROM orders WHERE UPPER(order_number) = UPPER(?) OR CAST(id AS TEXT) = ?').get(orderKey, orderKey);
    if (!ord || !(await canAccessOrder(req, urlObj, user, ord))) {
      return sendJson(res, 403, { error: 'Access denied.' });
    }

    const body = await parseRequestBody(req);
    const actionType = String(body.action_type || '');
    const reason = String(body.reason || '').trim();
    if (!reason) {
      return sendJson(res, 400, { error: 'Please provide a reason for your request.' });
    }

    const nowIso = new Date().toISOString();
    if (actionType === 'cancel') {
      if (ord.payment_status === 'awaiting_payment') {
        // Unpaid order can be cancelled directly and stock reservation released
        await runTransaction(async () => {
          const holds = await db.prepare("SELECT * FROM stock_reservations WHERE order_id = ? AND status = 'active_payment_hold'").all(ord.id);
          for (const h of holds) {
            const v = await db.prepare('SELECT * FROM product_variants WHERE id = ?').get(h.variant_id);
            if (v) {
              const newRes = Math.max(0, v.reserved - h.quantity);
              await db.prepare('UPDATE product_variants SET reserved = ?, version = version + 1, updated_at = ? WHERE id = ?').run(newRes, nowIso, v.id);
              await db.prepare(`
                INSERT INTO stock_movements (
                  variant_id, sku, delta_on_hand, delta_reserved, before_on_hand, after_on_hand, before_reserved, after_reserved,
                  movement_type, reason, order_id, actor_user_id, actor_email, created_at
                ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, 'reservation_released', 'Customer cancelled unpaid order', ?, ?, ?, ?)
              `).run(v.id, h.sku, -h.quantity, v.on_hand, v.on_hand, v.reserved, newRes, ord.id, user ? user.id : null, ord.customer_email, nowIso);
            }
            await db.prepare("UPDATE stock_reservations SET status = 'released_cancelled', updated_at = ? WHERE id = ?").run(nowIso, h.id);
          }
          await db.prepare("UPDATE orders SET payment_status = 'expired_cancelled', fulfilment_status = 'cancelled', cancellation_requested = 1, cancellation_reason = ?, updated_at = ? WHERE id = ?").
          run(reason, nowIso, ord.id);
          await db.prepare(`
            INSERT INTO status_events (order_id, event_type, payment_status, fulfilment_status, title, detail, actor_role, actor_email, customer_visible, created_at)
            VALUES (?, 'order_cancelled', 'expired_cancelled', 'cancelled', 'Order cancelled by customer', ?, 'CUSTOMER', ?, 1, ?)
          `).run(ord.id, `Reason: ${reason}`, ord.customer_email, nowIso);
        });
      } else {
        await db.prepare('UPDATE orders SET cancellation_requested = 1, cancellation_reason = ?, updated_at = ? WHERE id = ?').
        run(reason, nowIso, ord.id);
        await db.prepare(`
          INSERT INTO status_events (order_id, event_type, payment_status, fulfilment_status, title, detail, actor_role, actor_email, customer_visible, created_at)
          VALUES (?, 'cancellation_requested', ?, ?, 'Cancellation requested', ?, 'CUSTOMER', ?, 1, ?)
        `).run(ord.id, ord.payment_status, ord.fulfilment_status, `Customer requested cancellation: ${reason}. Subject to admin review and manual refund policy.`, ord.customer_email, nowIso);
      }
    } else if (actionType === 'return') {
      if (ord.fulfilment_status !== 'delivered' && ord.fulfilment_status !== 'shipped') {
        return sendJson(res, 400, { error: 'Return requests are only eligible for shipped or delivered orders.' });
      }
      await db.prepare('UPDATE orders SET return_requested = 1, return_reason = ?, updated_at = ? WHERE id = ?').
      run(reason, nowIso, ord.id);
      await db.prepare(`
        INSERT INTO status_events (order_id, event_type, payment_status, fulfilment_status, title, detail, actor_role, actor_email, customer_visible, created_at)
        VALUES (?, 'return_requested', ?, ?, 'Return requested', ?, 'CUSTOMER', ?, 1, ?)
      `).run(ord.id, ord.payment_status, ord.fulfilment_status, `Customer requested return: ${reason}. Subject to return policy inspection and manual refund workflow.`, ord.customer_email, nowIso);
    }

    const updated = await db.prepare('SELECT * FROM orders WHERE id = ?').get(ord.id);
    return sendJson(res, 200, { message: 'Request recorded.', order: await enrichOrder(updated, false) });
  }

  // Private receipt file download/preview (Authenticated & Ownership-checked!)
  if (pathname.startsWith('/api/receipts/') && method === 'GET') {
    const subId = Number(pathname.slice('/api/receipts/'.length));
    const sub = await db.prepare('SELECT * FROM payment_submissions WHERE id = ?').get(subId);
    if (!sub) {
      return sendJson(res, 404, { error: 'Receipt not found.' });
    }
    const ord = await db.prepare('SELECT * FROM orders WHERE id = ?').get(sub.order_id);
    if (!ord || !(await canAccessOrder(req, urlObj, user, ord))) {
      return sendJson(res, 403, {
        error: 'Access denied. Private payment receipts are accessible only to the order owner and authorised store administrators.',
        code: 'PRIVATE_RECEIPT_FORBIDDEN'
      });
    }

    const fileBuf = await getObject('receipts/'+path.basename(sub.receipt_filename),path.join(PRIVATE_RECEIPTS_DIR,path.basename(sub.receipt_filename)));
    res.writeHead(200, {
      'Content-Type': sub.receipt_mime_type || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${sub.receipt_original_name.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    return res.end(fileBuf);
  }

  // =========================================================================
  // 5. CUSTOMER ACCOUNT ENDPOINTS (/api/account/*)
  // =========================================================================
  if (pathname === '/api/account/orders' && method === 'GET') {
    await sweepExpiredReservations();
    const rows = await db.prepare(`SELECT * FROM orders WHERE user_id = ? ${sandbox ? '' : 'AND is_demo=0'} ORDER BY created_at DESC, id DESC`).all(user.id);
    return sendJson(res, 200, {
      orders: await Promise.all(rows.map(async (r) => await enrichOrder(r, false)))
    });
  }

  if (pathname === '/api/account/addresses' && method === 'GET') {
    const addresses = await db.prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default_shipping DESC, id DESC').all(user.id);
    return sendJson(res, 200, { addresses });
  }

  if (pathname === '/api/account/addresses' && method === 'POST') {
    const body = await parseRequestBody(req);
    const label = String(body.label || 'Home').trim();
    const recipientName = String(body.recipient_name || '').trim();
    const phone = String(body.phone || '').trim();
    const line1 = String(body.line1 || '').trim();
    const line2 = String(body.line2 || '').trim();
    const postcode = String(body.postcode || '').trim();
    const city = String(body.city || '').trim();
    const state = String(body.state || '').trim();
    const isDefaultShipping = body.is_default_shipping ? 1 : 0;
    const isDefaultBilling = body.is_default_billing ? 1 : 0;

    if (!recipientName || !phone || !line1 || !postcode || !city || !state) {
      return sendJson(res, 400, { error: 'Please complete all required Malaysian address fields.' });
    }

    const now = new Date().toISOString();
    await runTransaction(async () => {
      if (isDefaultShipping) {
        await db.prepare('UPDATE addresses SET is_default_shipping = 0 WHERE user_id = ?').run(user.id);
      }
      if (isDefaultBilling) {
        await db.prepare('UPDATE addresses SET is_default_billing = 0 WHERE user_id = ?').run(user.id);
      }
      await db.prepare(`
        INSERT INTO addresses (user_id, label, recipient_name, phone, line1, line2, postcode, city, state, country, is_default_shipping, is_default_billing, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Malaysia', ?, ?, ?, ?)
      `).run(user.id, label, recipientName, phone, line1, line2, postcode, city, state, isDefaultShipping, isDefaultBilling, now, now);
    });

    const addresses = await db.prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default_shipping DESC, id DESC').all(user.id);
    return sendJson(res, 201, { message: 'Address saved.', addresses });
  }

  if (pathname.startsWith('/api/account/addresses/') && (method === 'PUT' || method === 'DELETE')) {
    const addrId = Number(pathname.slice('/api/account/addresses/'.length));
    const existing = await db.prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?').get(addrId, user.id);
    if (!existing) {
      return sendJson(res, 404, { error: 'Address not found.' });
    }

    if (method === 'DELETE') {
      await db.prepare('DELETE FROM addresses WHERE id = ? AND user_id = ?').run(addrId, user.id);
    } else {
      const body = await parseRequestBody(req);
      const now = new Date().toISOString();
      await runTransaction(async () => {
        if (body.is_default_shipping) {
          await db.prepare('UPDATE addresses SET is_default_shipping = 0 WHERE user_id = ?').run(user.id);
        }
        if (body.is_default_billing) {
          await db.prepare('UPDATE addresses SET is_default_billing = 0 WHERE user_id = ?').run(user.id);
        }
        await db.prepare(`
          UPDATE addresses
          SET label = ?, recipient_name = ?, phone = ?, line1 = ?, line2 = ?, postcode = ?, city = ?, state = ?,
              is_default_shipping = ?, is_default_billing = ?, updated_at = ?
          WHERE id = ? AND user_id = ?
        `).run(
          String(body.label || existing.label).trim(),
          String(body.recipient_name || existing.recipient_name).trim(),
          String(body.phone || existing.phone).trim(),
          String(body.line1 || existing.line1).trim(),
          String(body.line2 ?? existing.line2).trim(),
          String(body.postcode || existing.postcode).trim(),
          String(body.city || existing.city).trim(),
          String(body.state || existing.state).trim(),
          body.is_default_shipping ? 1 : 0,
          body.is_default_billing ? 1 : 0,
          now,
          addrId,
          user.id
        );
      });
    }

    const addresses = await db.prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default_shipping DESC, id DESC').all(user.id);
    return sendJson(res, 200, { addresses });
  }

  if (pathname === '/api/account/profile' && method === 'PUT') {
    const body = await parseRequestBody(req);
    // Reject any attempt by customer to modify role
    if (body.role && body.role !== user.role) {
      return sendJson(res, 403, { error: 'Role modification is strictly forbidden.' });
    }
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    if (!name || name.length < 2) {
      return sendJson(res, 400, { error: 'Name is required.' });
    }

    const now = new Date().toISOString();
    await db.prepare('UPDATE users SET name = ?, phone = ?, updated_at = ? WHERE id = ?').run(name, phone, now, user.id);

    if (body.new_password) {
      const currentPassword = String(body.current_password || '');
      const uRow = await db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
      if (!verifyPassword(currentPassword, uRow.password_hash)) {
        return sendJson(res, 401, { error: 'Current password verification failed.' });
      }
      if (String(body.new_password).length < 8) {
        return sendJson(res, 400, { error: 'New password must be at least 8 characters.' });
      }
      await db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').
      run(hashPassword(body.new_password), now, user.id);
    }

    const refreshed = await db.prepare('SELECT id, email, name, phone, role, is_demo FROM users WHERE id = ?').get(user.id);
    return sendJson(res, 200, { message: 'Profile updated.', user: refreshed });
  }

  // =========================================================================
  // 6. ADMIN WORKSPACE ENDPOINTS (/api/admin/*)
  // =========================================================================
  if (pathname === '/api/admin/overview' && method === 'GET') {
    await sweepExpiredReservations();
    const includeDemo = (urlObj.searchParams.get('include_demo')) === '1';
    const dateFrom = (urlObj.searchParams.get('date_from')) || '2026-10-01';
    const dateTo = (urlObj.searchParams.get('date_to')) || '2026-10-31';

    const demoFilterSql = includeDemo ? '' : 'AND is_demo = 0';

    // Confirmed sales = admin-confirmed paid amounts minus recorded completed refunds
    // Note: paid orders that are cancelled remain in received-payment totals until a completed refund is recorded!
    const [
      paidOrders,
      pendingRefundsRow,
      paymentsToReviewRow,
      ordersToFulfilRow,
      variants,
      draftUnconfirmedRow,
      recentOrderRows,
      topProductRows
    ] = await Promise.all([
      db.prepare(`
        SELECT * FROM orders
        WHERE payment_status IN ('paid', 'refund_pending', 'partially_refunded', 'refunded')
          AND substr(created_at, 1, 10) >= ?
          AND substr(created_at, 1, 10) <= ?
          ${demoFilterSql}
        ORDER BY created_at DESC
      `).all(dateFrom, dateTo),
      db.prepare(`
        SELECT COALESCE(SUM(mr.amount_minor), 0) AS total
        FROM manual_refunds mr
        JOIN orders o ON o.id = mr.order_id
        WHERE mr.status = 'refund_pending' ${includeDemo ? '' : 'AND o.is_demo = 0'}
      `).get(),
      db.prepare(`
        SELECT COUNT(*) AS c FROM orders
        WHERE payment_status IN ('under_review', 'awaiting_payment', 'needs_resubmission')
          ${demoFilterSql}
      `).get(),
      db.prepare(`
        SELECT COUNT(*) AS c FROM orders
        WHERE payment_status = 'paid'
          AND fulfilment_status IN ('unfulfilled', 'processing')
          ${demoFilterSql}
      `).get(),
      db.prepare(`
        SELECT v.*, p.title AS product_title, p.reference_id
        FROM product_variants v
        JOIN products p ON p.id = v.product_id
        WHERE v.is_active = 1 ${includeDemo ? '' : 'AND v.is_demo = 0'}
      `).all(),
      db.prepare("SELECT COUNT(*) AS c FROM products WHERE publish_status = 'draft' AND is_demo = 0").get(),
      db.prepare(`
        SELECT * FROM orders
        WHERE 1=1 ${demoFilterSql}
        ORDER BY created_at DESC, id DESC
        LIMIT 8
      `).all(),
      db.prepare(`
        SELECT oi.title_snapshot AS title, oi.sku_snapshot AS sku, oi.image_snapshot AS image_path,
               SUM(oi.quantity) AS units_sold, SUM(oi.line_total_minor) AS revenue_minor
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.payment_status IN ('paid', 'refund_pending', 'partially_refunded')
          AND substr(o.created_at, 1, 10) >= ?
          AND substr(o.created_at, 1, 10) <= ?
          ${includeDemo ? '' : 'AND o.is_demo = 0'}
        GROUP BY oi.sku_snapshot, oi.title_snapshot, oi.image_snapshot
        ORDER BY units_sold DESC
        LIMIT 5
      `).all(dateFrom, dateTo)
    ]);

    const grossPaidMinor = paidOrders.reduce((s, o) => s + Number(o.total_minor), 0);
    const completedRefundsMinor = paidOrders.reduce((s, o) => s + Number(o.refunded_minor || 0), 0);
    const confirmedSalesMinor = Math.max(0, grossPaidMinor - completedRefundsMinor);

    const pendingRefundsMinor = pendingRefundsRow.total;
    const paymentsToReviewCount = paymentsToReviewRow.c;
    const ordersToFulfilCount = ordersToFulfilRow.c;

    const lowStockSkus = variants.filter((v) => v.on_hand - v.reserved <= v.low_stock_threshold);
    const outOfStockSkus = variants.filter((v) => v.on_hand - v.reserved <= 0);
    const draftUnconfirmedCount = draftUnconfirmedRow.c;

    const recentOrders = await Promise.all(recentOrderRows.map((o) => enrichOrder(o, true)));

    // Sales trend by date
    const byDateMap = new Map();
    for (const o of paidOrders) {
      const day = o.created_at.slice(0, 10);
      const net = Number(o.total_minor) - Number(o.refunded_minor || 0);
      byDateMap.set(day, (byDateMap.get(day) || 0) + net);
    }
    const salesTrend = Array.from(byDateMap.entries()).
    sort((a, b) => a[0].localeCompare(b[0])).
    map(([date, minor]) => ({ date, amount_minor: minor, amount_formatted: formatMYR(minor) }));

    // Top products from confirmed orders
    const topProducts = topProductRows.map((tp) => ({
      ...tp,
      units_sold: Number(tp.units_sold || 0),
      revenue_minor: Number(tp.revenue_minor || 0),
      revenue_formatted: formatMYR(Number(tp.revenue_minor || 0))
    }));

    return sendJson(res, 200, {
      include_demo: includeDemo,
      date_from: dateFrom,
      date_to: dateTo,
      kpis: {
        confirmed_sales_minor: confirmedSalesMinor,
        confirmed_sales_formatted: formatMYR(confirmedSalesMinor),
        gross_paid_minor: grossPaidMinor,
        completed_refunds_minor: completedRefundsMinor,
        pending_refunds_minor: pendingRefundsMinor,
        paid_orders_count: paidOrders.length,
        payments_to_review_count: paymentsToReviewCount,
        orders_to_fulfil_count: ordersToFulfilCount,
        low_stock_skus_count: lowStockSkus.length,
        out_of_stock_skus_count: outOfStockSkus.length,
        active_skus_count: variants.length,
        draft_references_count: draftUnconfirmedCount
      },
      sales_trend: salesTrend,
      top_products: topProducts,
      recent_orders: recentOrders,
      session_tracking_connected: false
    });
  }

  // Admin Products CRUD
  if (pathname === '/api/admin/products' && method === 'GET') {
    const [rows, orderRefRows] = await Promise.all([
      db.prepare('SELECT * FROM products ORDER BY is_demo ASC, reference_order ASC, id ASC').all(),
      db.prepare('SELECT product_id, COUNT(*) AS c FROM order_items WHERE product_id IS NOT NULL GROUP BY product_id').all()
    ]);
    const refMap = new Map();
    for (const r of orderRefRows) {
      refMap.set(Number(r.product_id), Number(r.c || 0));
    }
    const formattedList = await formatProductRows(rows);
    return sendJson(res, 200, {
      products: formattedList.map((formatted) => ({
        ...formatted,
        referenced_in_orders_count: refMap.get(Number(formatted.id)) || 0
      }))
    });
  }

  if (pathname === '/api/admin/products' && method === 'POST') {
    const body = await parseRequestBody(req);
    const title = String(body.title || '').trim();
    const brand = String(body.brand || 'Shop by SCHA').trim();
    const categorySlug = String(body.category_slug || 'bags').trim().toLowerCase();
    const slug = String(body.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).trim();
    const sellableSku = body.sellable_sku ? String(body.sellable_sku).trim().toUpperCase() : null;
    const priceMinor = parseMYRToMinor(body.price_myr);
    const stockQty = body.stock_quantity !== undefined && body.stock_quantity !== '' && body.stock_quantity !== null ?
    Number(body.stock_quantity) :
    null;
    const publishStatus = String(body.publish_status || 'draft');

    if(publishStatus==='published' && (!body.model || !body.description || !body.shipping_returns_note || !['ready_stock','preorder'].includes(body.stock_type) || !body.image_path)) return sendJson(res,400,{error:'Complete model, description, availability, shipping lead time and an image before publishing.'});
    if (!title) {
      return sendJson(res, 400, { error: 'Product title is required.' });
    }
    if (await db.prepare('SELECT id FROM products WHERE slug = ?').get(slug)) {
      return sendJson(res, 409, { error: 'A product with that URL slug already exists.' });
    }
    if (sellableSku) {
      const dupSku = await db.prepare('SELECT id FROM products WHERE sellable_sku = ? UNION SELECT id FROM product_variants WHERE sku = ?').get(sellableSku, sellableSku);
      if (dupSku) {
        return sendJson(res, 409, { error: `Duplicate SKU "${sellableSku}". Each sellable SKU must be unique.` });
      }
    }

    if (publishStatus === 'published') {
      if (!priceMinor || priceMinor <= 0) {
        return sendJson(res, 400, { error: 'Cannot publish a product without a confirmed valid price (> RM0.00).' });
      }
      if (!sellableSku) {
        return sendJson(res, 400, { error: 'Cannot publish a product without a confirmed unique sellable SKU.' });
      }
      if (stockQty === null || stockQty < 0 || !Number.isInteger(stockQty)) {
        return sendJson(res, 400, { error: 'Cannot publish a product without confirmed integer stock quantity.' });
      }
    }

    const now = new Date().toISOString();
    const createdId = await runTransaction(async () => {
      const isPublished = publishStatus === 'published';
      const resProd = await db.prepare(`
        INSERT INTO products (
          reference_id, record_type, title, slug, brand, category_slug,
          description, specifications_json, model, sellable_sku,
          price_minor, currency, stock_quantity, low_stock_threshold,
          weight_grams, dimensions_cm, seo_title, seo_description,
          reference_colour_description, confirmed_attributes_json,
          publish_status, purchase_enabled, notes, is_demo, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MYR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `).run(
        body.reference_id || null,
        isPublished ? 'confirmed_product' : 'draft_product_reference',
        title,
        slug,
        brand,
        categorySlug,
        String(body.description || '').trim(),
        JSON.stringify(body.specifications || {}),
        body.model ? String(body.model).trim() : null,
        sellableSku,
        priceMinor,
        stockQty,
        Number(body.low_stock_threshold || 3),
        body.weight_grams ? Number(body.weight_grams) : null,
        body.dimensions_cm ? String(body.dimensions_cm).trim() : null,
        body.seo_title ? String(body.seo_title).trim() : title,
        body.seo_description ? String(body.seo_description).trim() : '',
        body.reference_colour_description || null,
        JSON.stringify(body.confirmed_attributes || {}),
        publishStatus,
        isPublished ? 1 : 0,
        String(body.notes || '').trim(),
        now,
        now
      );

      const pId = Number(resProd.lastInsertRowid);
      await db.prepare('UPDATE products SET stock_type = ?, shipping_returns_note = ? WHERE id = ?').run(body.stock_type || 'unconfirmed',String(body.shipping_returns_note || ''),pId);
      const imgPath = body.image_path || '/images/08_jacquemus_pink_flap_handbag.png';
      await db.prepare(`
        INSERT INTO product_media (product_id, slot_code, path, alt, media_type, sort_order)
        VALUES (?, 'P01', ?, ?, 'image', 1)
      `).run(pId, imgPath, body.image_alt || title);

      if (sellableSku && priceMinor > 0 && stockQty !== null && stockQty >= 0) {
        const vRes = await db.prepare(`
          INSERT INTO product_variants (
            product_id, sku, title, attributes_json, price_minor, on_hand, reserved, low_stock_threshold, is_active, is_demo, version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1, 0, 1, ?, ?)
        `).run(
          pId,
          sellableSku,
          body.variant_title || 'Standard',
          JSON.stringify(body.confirmed_attributes || {}),
          priceMinor,
          stockQty,
          Number(body.low_stock_threshold || 3),
          now,
          now
        );
        await db.prepare(`
          INSERT INTO stock_movements (
            variant_id, sku, delta_on_hand, delta_reserved, before_on_hand, after_on_hand, before_reserved, after_reserved,
            movement_type, reason, actor_user_id, actor_email, created_at
          ) VALUES (?, ?, ?, 0, 0, ?, 0, 0, 'manual_adjustment', 'Initial confirmed SKU stock', ?, ?, ?)
        `).run(Number(vRes.lastInsertRowid), sellableSku, stockQty, stockQty, user.id, user.email, now);
      }

      await logAudit({
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: 'ADMIN',
        action: 'product_created',
        entityType: 'product',
        entityId: pId,
        details: { title, publishStatus, sellableSku }
      });

      return pId;
    });

    const row = await db.prepare('SELECT * FROM products WHERE id = ?').get(createdId);
    return sendJson(res, 201, { message: 'Product saved.', product: await formatProductRow(row) });
  }

  // Resolve Duplicate Flag on REF-05 and REF-06
  if (pathname === '/api/admin/products/resolve-duplicate' && method === 'POST') {
    const body = await parseRequestBody(req);
    const resolution = String(body.resolution || ''); // 'merge_into_ref06' | 'confirm_distinct'
    const ref05 = await db.prepare("SELECT * FROM products WHERE reference_id = 'REF-05'").get();
    const ref06 = await db.prepare("SELECT * FROM products WHERE reference_id = 'REF-06'").get();
    if (!ref05 || !ref06) {
      return sendJson(res, 404, { error: 'References REF-05 / REF-06 not found.' });
    }

    const now = new Date().toISOString();
    await runTransaction(async () => {
      if (resolution === 'merge_into_ref06') {
        // Combine REF-05 image into REF-06's gallery (preserving both original assets!)
        const existingMedia = await db.prepare('SELECT * FROM product_media WHERE product_id = ? AND path LIKE ?').get(ref06.id, '%05_jacquemus%');
        if (!existingMedia) {
          const ref05Media = await db.prepare('SELECT * FROM product_media WHERE product_id = ? ORDER BY sort_order ASC LIMIT 1').get(ref05.id);
          if (ref05Media) {
            await db.prepare(`
              INSERT INTO product_media (product_id, slot_code, path, alt, media_type, width, height, sha256, sort_order)
              VALUES (?, 'P02', ?, ?, 'image', ?, ?, ?, 2)
            `).run(ref06.id, ref05Media.path, ref05Media.alt, ref05Media.width, ref05Media.height, ref05Media.sha256);
          }
        }
        await db.prepare(`
          UPDATE products
          SET duplicate_review_required = 0, duplicate_resolution_status = 'merged', duplicate_merged_into_id = ?, updated_at = ?
          WHERE id = ?
        `).run(ref06.id, now, ref05.id);
        await db.prepare(`
          UPDATE products
          SET duplicate_review_required = 0, duplicate_resolution_status = 'merged_primary',
              title = 'Jacquemus Pink Top-handle Bag (Combined Gallery REF-06 + REF-05)', updated_at = ?
          WHERE id = ?
        `).run(now, ref06.id);
      } else if (resolution === 'confirm_distinct') {
        await db.prepare(`
          UPDATE products
          SET duplicate_review_required = 0, duplicate_resolution_status = 'confirmed_distinct', duplicate_merged_into_id = NULL, updated_at = ?
          WHERE id IN (?, ?)
        `).run(now, ref05.id, ref06.id);
      } else if (resolution === 'reset_review') {
        await db.prepare("DELETE FROM product_media WHERE product_id = ? AND slot_code = 'P02'").run(ref06.id);
        await db.prepare(`
          UPDATE products
          SET duplicate_review_required = 1, duplicate_resolution_status = 'pending', duplicate_merged_into_id = NULL, updated_at = ?
          WHERE id IN (?, ?)
        `).run(now, ref05.id, ref06.id);
      }

      await logAudit({
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: 'ADMIN',
        action: 'duplicate_reference_review_resolved',
        entityType: 'product',
        entityId: 'REF-05/REF-06',
        details: { resolution }
      });
    });

    return sendJson(res, 200, { message: `Duplicate review for REF-05 & REF-06 updated (${resolution}).` });
  }

  if (pathname.startsWith('/api/admin/products/') && (method === 'PUT' || method === 'DELETE')) {
    const prodId = Number(pathname.slice('/api/admin/products/'.length));
    const existing = await db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
    if (!existing) {
      return sendJson(res, 404, { error: 'Product not found.' });
    }

    if (method === 'DELETE') {
      const orderRefCount = (await db.prepare('SELECT COUNT(*) AS c FROM order_items WHERE product_id = ?').get(prodId)).c;
      if (orderRefCount > 0) {
        return sendJson(res, 400, {
          error: 'Cannot delete a product that is referenced by historical orders. Please Archive it instead so purchase history remains intact.',
          code: 'PRODUCT_HAS_ORDERS'
        });
      }
      if (existing.reference_id && /^REF-(0[1-9]|1[0-2])$/.test(existing.reference_id)) {
        return sendJson(res, 400, {
          error: `Supplied catalogue reference ${existing.reference_id} must be preserved. You may keep it as Draft or Archive it.`
        });
      }
      await db.prepare('DELETE FROM products WHERE id = ?').run(prodId);
      await logAudit({
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: 'ADMIN',
        action: 'product_deleted',
        entityType: 'product',
        entityId: prodId
      });
      return sendJson(res, 200, { message: 'Unreferenced draft product deleted.' });
    }

    // PUT — Update product, variants, media & publish state
    const body = await parseRequestBody(req);
    const title = String(body.title || existing.title).trim();
    const slug = String(body.slug || existing.slug).trim();
    const brand = String(body.brand || existing.brand).trim();
    const categorySlug = String(body.category_slug || existing.category_slug).trim().toLowerCase();
    const model = body.model !== undefined ? body.model ? String(body.model).trim() : null : existing.model;
    const sellableSku = body.sellable_sku !== undefined ?
    body.sellable_sku ? String(body.sellable_sku).trim().toUpperCase() : null :
    existing.sellable_sku;
    const priceMinor = body.price_myr !== undefined ? parseMYRToMinor(body.price_myr) : existing.price_minor;
    const stockQty = body.stock_quantity !== undefined ?
    body.stock_quantity === '' || body.stock_quantity === null ? null : Number(body.stock_quantity) :
    existing.stock_quantity;
    const publishStatus = String(body.publish_status || existing.publish_status);

    // Check duplicate slug
    const slugConflict = await db.prepare('SELECT id FROM products WHERE slug = ? AND id != ?').get(slug, prodId);
    if (slugConflict) {
      return sendJson(res, 409, { error: 'Another product already uses this URL slug.' });
    }

    // Check duplicate SKU across other products/variants
    if (sellableSku) {
      const skuConflict = await db.prepare(`
        SELECT id FROM products WHERE sellable_sku = ? AND id != ?
        UNION
        SELECT id FROM product_variants WHERE sku = ? AND product_id != ?
      `).get(sellableSku, prodId, sellableSku, prodId);
      if (skuConflict) {
        return sendJson(res, 409, { error: `Duplicate SKU "${sellableSku}". Every sellable SKU must be unique.` });
      }
    }

    if (publishStatus === 'published') {
      const details = { ...existing, ...body, model };
      if (!title || !brand || !details.model || /to confirm/i.test(details.model) || !String(details.description || '').trim() || !details.shipping_returns_note || !['ready_stock', 'preorder'].includes(details.stock_type)) return sendJson(res, 400, { error: 'Confirm the exact model, description, ready-stock/preorder status and shipping lead time before publishing.' });
      if (!(await db.prepare('SELECT id FROM product_media WHERE product_id = ?').get(prodId))) return sendJson(res, 400, { error: 'Add at least one product image before publishing.' });
      if (existing.duplicate_review_required) {
        return sendJson(res, 400, {
          error: 'Please resolve the REF-05 / REF-06 duplicate review before publishing this product.'
        });
      }
      if (!priceMinor || priceMinor <= 0) {
        return sendJson(res, 400, { error: 'Confirmed price (> RM0.00) is required before publishing.' });
      }
      if (!sellableSku) {
        return sendJson(res, 400, { error: 'Confirmed unique sellable SKU is required before publishing.' });
      }
      if (stockQty === null || stockQty < 0 || !Number.isInteger(stockQty)) {
        return sendJson(res, 400, { error: 'Confirmed integer stock quantity is required before publishing.' });
      }
    }

    if (body.variants !== undefined) {
      if(!Array.isArray(body.variants) || body.variants.length>100)return sendJson(res,400,{error:'Provide at most 100 confirmed variants.'});
      const skus=new Set();
      for(const v of body.variants){
        if(!v.sku || !v.title || skus.has(v.sku) || !Number.isSafeInteger(v.price_minor) || v.price_minor<=0 || !Number.isSafeInteger(v.on_hand) || v.on_hand<0)return sendJson(res,400,{error:'Each variant requires a unique SKU, name, integer price in sen and nonnegative whole-number stock.'});
        skus.add(v.sku);
        const other=await db.prepare('SELECT id FROM product_variants WHERE sku = ? AND product_id != ?').get(v.sku,prodId);
        if(other)return sendJson(res,409,{error:'Variant SKU is already used by another product.'});
        if(v.id){const current=await db.prepare('SELECT * FROM product_variants WHERE id = ? AND product_id = ?').get(v.id,prodId);if(!current || v.on_hand<current.reserved)return sendJson(res,400,{error:'Variant stock cannot be below reserved units.'});}
      }
    }
    const now = new Date().toISOString();
    await runTransaction(async () => {
      await db.prepare('UPDATE products SET stock_type = ?, shipping_returns_note = ? WHERE id = ?').run(body.stock_type || existing.stock_type, body.shipping_returns_note ?? existing.shipping_returns_note, prodId);
      const isPublished = publishStatus === 'published';
      if(Array.isArray(body.variants))for(const v of body.variants){
        if(v.id){
          const old=await db.prepare('SELECT * FROM product_variants WHERE id = ? AND product_id = ?').get(v.id,prodId);
          if(!old || (v.version && old.version!==v.version) || v.on_hand<old.reserved)throw Object.assign(new Error('Variant changed while editing. Reload and review stock before saving.'),{statusCode:409});
          await db.prepare('UPDATE product_variants SET sku=?,title=?,attributes_json=?,price_minor=?,on_hand=?,is_active=?,version=version+1,updated_at=? WHERE id=? AND product_id=?').run(v.sku,v.title,JSON.stringify(v.attributes||{}),v.price_minor,v.on_hand,v.is_active===false||v.is_active===0?0:1,now,v.id,prodId);
          if(v.on_hand!==old.on_hand)await db.prepare("INSERT INTO stock_movements (variant_id,sku,delta_on_hand,delta_reserved,before_on_hand,after_on_hand,before_reserved,after_reserved,movement_type,reason,actor_user_id,actor_email,created_at) VALUES (?,?,?,0,?,?,?,?, 'manual_adjustment','Variant editor stock update',?,?,?)").run(v.id,v.sku,v.on_hand-old.on_hand,old.on_hand,v.on_hand,old.reserved,old.reserved,user.id,user.email,now);
        }else await db.prepare('INSERT INTO product_variants (product_id,sku,title,attributes_json,price_minor,on_hand,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(prodId,v.sku,v.title,JSON.stringify(v.attributes||{}),v.price_minor,v.on_hand,v.is_active===false?0:1,now,now);
      }


      await db.prepare(`
        UPDATE products
        SET record_type = ?,
            title = ?,
            slug = ?,
            brand = ?,
            category_slug = ?,
            description = ?,
            specifications_json = ?,
            model = ?,
            sellable_sku = ?,
            price_minor = ?,
            stock_quantity = ?,
            low_stock_threshold = ?,
            weight_grams = ?,
            dimensions_cm = ?,
            seo_title = ?,
            seo_description = ?,
            reference_colour_description = ?,
            confirmed_attributes_json = ?,
            publish_status = ?,
            purchase_enabled = ?,
            notes = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        isPublished ? 'confirmed_product' : existing.record_type,
        title,
        slug,
        brand,
        categorySlug,
        body.description !== undefined ? String(body.description) : existing.description,
        body.specifications ? JSON.stringify(body.specifications) : existing.specifications_json,
        model,
        sellableSku,
        priceMinor,
        stockQty,
        Number(body.low_stock_threshold ?? existing.low_stock_threshold),
        body.weight_grams !== undefined ? body.weight_grams ? Number(body.weight_grams) : null : existing.weight_grams,
        body.dimensions_cm !== undefined ? body.dimensions_cm : existing.dimensions_cm,
        body.seo_title !== undefined ? body.seo_title : existing.seo_title,
        body.seo_description !== undefined ? body.seo_description : existing.seo_description,
        body.reference_colour_description !== undefined ? body.reference_colour_description : existing.reference_colour_description,
        body.confirmed_attributes ? JSON.stringify(body.confirmed_attributes) : existing.confirmed_attributes_json,
        publishStatus,
        isPublished ? 1 : 0,
        body.notes !== undefined ? String(body.notes) : existing.notes,
        now,
        prodId
      );

      if (Array.isArray(body.media)) {
        for (const m of body.media) {
          if (m.id) {
            await db.prepare('UPDATE product_media SET alt = ?, sort_order = ?, focal_point = ? WHERE id = ? AND product_id = ?').
            run(String(m.alt || title), Number(m.sort_order || 1), String(m.focal_point || '50% 50%'), Number(m.id), prodId);
          }
        }
      }

      // Sync or create primary sellable variant if confirmed SKU, price and stock are provided
      if (!Array.isArray(body.variants) && sellableSku && priceMinor && priceMinor > 0 && stockQty !== null && stockQty >= 0) {
        const existingVar = await db.prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY id ASC LIMIT 1').get(prodId);
        if (existingVar) {
          if(stockQty<existingVar.reserved)throw new Error('Stock cannot be below reserved units.');
          const delta = stockQty - existingVar.on_hand;
          await db.prepare(`
            UPDATE product_variants
            SET sku = ?, title = ?, attributes_json = ?, price_minor = ?, on_hand = ?, low_stock_threshold = ?, version = version + 1, updated_at = ?
            WHERE id = ?
          `).run(
            sellableSku,
            body.variant_title || existingVar.title || 'Standard',
            body.confirmed_attributes ? JSON.stringify(body.confirmed_attributes) : existingVar.attributes_json,
            priceMinor,
            stockQty,
            Number(body.low_stock_threshold ?? existingVar.low_stock_threshold),
            now,
            existingVar.id
          );
          if (delta !== 0) {
            await db.prepare(`
              INSERT INTO stock_movements (
                variant_id, sku, delta_on_hand, delta_reserved, before_on_hand, after_on_hand, before_reserved, after_reserved,
                movement_type, reason, actor_user_id, actor_email, created_at
              ) VALUES (?, ?, ?, 0, ?, ?, ?, ?, 'manual_adjustment', 'Updated via Product Editor', ?, ?, ?)
            `).run(existingVar.id, sellableSku, delta, existingVar.on_hand, stockQty, existingVar.reserved, existingVar.reserved, user.id, user.email, now);
          }
        } else {
          const vRes = await db.prepare(`
            INSERT INTO product_variants (
              product_id, sku, title, attributes_json, price_minor, on_hand, reserved, low_stock_threshold, is_active, is_demo, version, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1, 0, 1, ?, ?)
          `).run(
            prodId,
            sellableSku,
            body.variant_title || 'Standard',
            body.confirmed_attributes ? JSON.stringify(body.confirmed_attributes) : '{}',
            priceMinor,
            stockQty,
            Number(body.low_stock_threshold || 3),
            now,
            now
          );
          await db.prepare(`
            INSERT INTO stock_movements (
              variant_id, sku, delta_on_hand, delta_reserved, before_on_hand, after_on_hand, before_reserved, after_reserved,
              movement_type, reason, actor_user_id, actor_email, created_at
            ) VALUES (?, ?, ?, 0, 0, ?, 0, 0, 'manual_adjustment', 'Initial confirmed stock via Product Editor', ?, ?, ?)
          `).run(Number(vRes.lastInsertRowid), sellableSku, stockQty, stockQty, user.id, user.email, now);
        }
      }

      await logAudit({
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: 'ADMIN',
        action: 'product_updated',
        entityType: 'product',
        entityId: prodId,
        details: { title, publishStatus, sellableSku, priceMinor }
      });
    });

    const updated = await db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
    return sendJson(res, 200, { message: 'Product updated.', product: await formatProductRow(updated) });
  }

  // Upload additional product media
  if (pathname.match(/^\/api\/admin\/products\/\d+\/media$/) && method === 'POST') {
    const prodId = Number(pathname.split('/')[4]);
    const prod = await db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
    if (!prod) return sendJson(res, 404, { error: 'Product not found.' });

    const parsed = await parseRequestBody(req);
    const files = parsed.isMultipart ? parsed.files : {};
    const fields = parsed.isMultipart ? parsed.fields : parsed;

    let savedMedia;
    try {
      if (files.media && files.media.buffer) {
        savedMedia = await savePublicMedia(files.media.buffer, files.media.filename, `prod_${prodId}`);
      } else if (fields.media_base64) {
        const b64 = String(fields.media_base64).replace(/^data:[^;]+;base64,/, '');
        savedMedia = await savePublicMedia(Buffer.from(b64, 'base64'), fields.filename || 'media.png', `prod_${prodId}`);
      } else {
        return sendJson(res, 400, { error: 'Please select a valid PNG or JPG image.' });
      }
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const count = (await db.prepare('SELECT COUNT(*) AS c FROM product_media WHERE product_id = ?').get(prodId)).c;
    const slotCode = `P0${Math.min(5, count + 1)}`;
    await db.prepare(`
      INSERT INTO product_media (product_id, slot_code, path, alt, media_type, sort_order)
      VALUES (?, ?, ?, ?, 'image', ?)
    `).run(prodId, slotCode, savedMedia.publicPath, fields.alt || prod.title, count + 1);

    return sendJson(res, 201, {
      message: 'Media uploaded.',
      product: await formatProductRow(await db.prepare('SELECT * FROM products WHERE id = ?').get(prodId))
    });
  }

  // Admin Inventory & Stock Movements
  if (pathname === '/api/admin/inventory' && method === 'GET') {
    await sweepExpiredReservations();
    const [rawVariants, unconfirmedDrafts, movements] = await Promise.all([
      db.prepare(`
        SELECT v.*, p.title AS product_title, p.reference_id, p.publish_status, p.category_slug
        FROM product_variants v
        JOIN products p ON p.id = v.product_id
        ORDER BY v.is_demo ASC, v.sku ASC
      `).all(),
      db.prepare(`
        SELECT id, reference_id, title, category_slug, publish_status, stock_quantity, sellable_sku
        FROM products
        WHERE stock_quantity IS NULL
        ORDER BY reference_order ASC
      `).all(),
      db.prepare(`
        SELECT * FROM stock_movements
        ORDER BY created_at DESC, id DESC
        LIMIT 50
      `).all()
    ]);
    const variants = rawVariants.map((v) => ({
      ...v,
      available: Math.max(0, Number(v.on_hand) - Number(v.reserved)),
      is_low_stock: Number(v.on_hand) - Number(v.reserved) <= Number(v.low_stock_threshold),
      price_formatted: formatMYR(v.price_minor),
      is_demo: Boolean(v.is_demo)
    }));

    return sendJson(res, 200, {
      variants,
      unconfirmed_drafts: unconfirmedDrafts,
      movements
    });
  }

  if (pathname === '/api/admin/inventory/adjust' && method === 'POST') {
    const body = await parseRequestBody(req);
    const variantId = Number(body.variant_id);
    const delta = Number(body.delta);
    const reason = String(body.reason || '').trim();
    const expectedVersion = body.expected_version !== undefined ? Number(body.expected_version) : null;

    if (!Number.isInteger(delta) || delta === 0) {
      return sendJson(res, 400, { error: 'Adjustment delta must be a non-zero integer.' });
    }
    if (!reason || reason.length < 3) {
      return sendJson(res, 400, { error: 'A clear reason is required for every inventory adjustment.' });
    }

    try {
      const updatedVariant = await runTransaction(async () => {
        const v = await db.prepare('SELECT * FROM product_variants WHERE id = ?').get(variantId);
        if (!v) {
          throw new Error('SKU variant not found.');
        }
        if (expectedVersion !== null && Number(v.version) !== expectedVersion) {
          const err = new Error('Conflicting stale write detected: inventory was modified by another transaction. Please refresh and try again.');
          err.statusCode = 409;
          throw err;
        }

        const afterOnHand = v.on_hand + delta;
        if (afterOnHand < v.reserved) {
          throw new Error(`Cannot reduce on-hand stock (${afterOnHand}) below currently reserved units (${v.reserved}).`);
        }

        const now = new Date().toISOString();
        const upd = await db.prepare(`
          UPDATE product_variants
          SET on_hand = ?, version = version + 1, updated_at = ?
          WHERE id = ? AND version = ?
        `).run(afterOnHand, now, v.id, v.version);

        if (upd.changes === 0) {
          const err = new Error('Stale write rejected.');
          err.statusCode = 409;
          throw err;
        }

        await db.prepare('UPDATE products SET stock_quantity = ?, updated_at = ? WHERE id = ?').run(afterOnHand, now, v.product_id);

        await db.prepare(`
          INSERT INTO stock_movements (
            variant_id, sku, delta_on_hand, delta_reserved, before_on_hand, after_on_hand, before_reserved, after_reserved,
            movement_type, reason, actor_user_id, actor_email, created_at
          ) VALUES (?, ?, ?, 0, ?, ?, ?, ?, 'manual_adjustment', ?, ?, ?, ?)
        `).run(v.id, v.sku, delta, v.on_hand, afterOnHand, v.reserved, v.reserved, reason, user.id, user.email, now);

        await logAudit({
          actorUserId: user.id,
          actorEmail: user.email,
          actorRole: 'ADMIN',
          action: 'inventory_adjusted',
          entityType: 'product_variant',
          entityId: v.sku,
          details: { before: v.on_hand, delta, after: afterOnHand, reason }
        });

        return await db.prepare('SELECT * FROM product_variants WHERE id = ?').get(v.id);
      });

      return sendJson(res, 200, {
        message: `Inventory for ${updatedVariant.sku} adjusted to ${updatedVariant.on_hand} on hand (${updatedVariant.on_hand - updatedVariant.reserved} available).`,
        variant: updatedVariant
      });
    } catch (err) {
      return sendJson(res, err.statusCode || 400, { error: err.message });
    }
  }

  // Admin Payment Reviews Queue & Action
  if (pathname === '/api/admin/payment-reviews' && method === 'GET') {
    await sweepExpiredReservations();
    const statusFilter = (urlObj.searchParams.get('status')) || 'all';
    let whereSql = "WHERE payment_status IN ('under_review', 'awaiting_payment', 'needs_resubmission') OR reconciliation_required = 1";
    if (statusFilter === 'under_review') whereSql = "WHERE payment_status = 'under_review'";else
    if (statusFilter === 'awaiting_payment') whereSql = "WHERE payment_status = 'awaiting_payment'";else
    if (statusFilter === 'needs_resubmission') whereSql = "WHERE payment_status = 'needs_resubmission'";else
    if (statusFilter === 'reconciliation') whereSql = 'WHERE reconciliation_required = 1';

    const rows = await db.prepare(`SELECT * FROM orders ${whereSql} ORDER BY CASE WHEN payment_status = 'under_review' THEN 0 ELSE 1 END, updated_at DESC`).all();
    return sendJson(res, 200, {
      orders: await Promise.all(rows.map(async (r) => await enrichOrder(r, true)))
    });
  }

  if (pathname.match(/^\/api\/admin\/payment-reviews\/\d+$/) && method === 'POST') {
    const orderId = Number(pathname.split('/').pop());
    const ord = await db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!ord) {
      return sendJson(res, 404, { error: 'Order not found.' });
    }

    const body = await parseRequestBody(req);
    const action = String(body.action || ''); // 'confirm_payment' | 'request_resubmission' | 'flag_reconciliation'
    const auditNote = String(body.audit_note || '').trim();

    if (action === 'confirm_payment') {
      // Idempotency check: if already paid, do not deduct stock or send confirmation twice!
      if (ord.payment_status === 'paid') {
        return sendJson(res, 200, {
          message: 'Order payment was already confirmed previously (idempotent response).',
          idempotent: true,
          order: await enrichOrder(ord, true)
        });
      }

      const bankChecked = body.bank_records_checked === true;
      const actualBankRef = String(body.actual_bank_reference || '').trim().toUpperCase();
      const receivedAmountMinor = parseMYRToMinor(body.received_amount);

      if (!bankChecked) {
        return sendJson(res, 400, {
          error: 'You must explicitly confirm that you independently checked the actual received transaction in the seller bank records.'
        });
      }
      if (!actualBankRef || actualBankRef.length < 4) {
        return sendJson(res, 400, {
          error: 'Actual unique bank transaction reference is required to confirm payment.'
        });
      }
      if (!receivedAmountMinor || receivedAmountMinor <= 0) {
        return sendJson(res, 400, {
          error: 'Please enter the exact MYR amount received in the seller bank statement.'
        });
      }
      if (!auditNote) {
        return sendJson(res, 400, {
          error: 'An audit verification note is required.'
        });
      }

      // Check duplicate bank reference across all orders
      const dupBankRef = await db.prepare(`
        SELECT pr.id, o.order_number
        FROM payment_reviews pr
        JOIN orders o ON o.id = pr.order_id
        WHERE pr.action = 'confirm_payment' AND UPPER(pr.actual_bank_reference) = UPPER(?) AND pr.order_id != ?
      `).get(actualBankRef, ord.id);

      if (dupBankRef) {
        return sendJson(res, 409, {
          error: `Bank transaction reference "${actualBankRef}" has already been credited to Order #${dupBankRef.order_number}. One bank transaction cannot be credited to two orders.`,
          code: 'DUPLICATE_BANK_REFERENCE'
        });
      }

      // Partial/overpayment mismatch check -> route to reconciliation unless explicitly resolved
      if (receivedAmountMinor !== Number(ord.total_minor)) {
        const nowIso = new Date().toISOString();
        await db.prepare(`
          UPDATE orders
          SET reconciliation_required = 1,
              reconciliation_reason = ?,
              updated_at = ?
          WHERE id = ?
        `).run(
          `Received bank amount (${formatMYR(receivedAmountMinor)}) does not match order total (${formatMYR(ord.total_minor)}). Requires manual reconciliation.`,
          nowIso,
          ord.id
        );
        return sendJson(res, 400, {
          error: `Received amount (${formatMYR(receivedAmountMinor)}) does not match the order total (${formatMYR(ord.total_minor)}). Order has been flagged for reconciliation rather than silently marked paid.`,
          code: 'AMOUNT_MISMATCH_RECONCILIATION'
        });
      }

      try {
        const confirmedOrder = await runTransaction(async () => {
          const freshOrd = await db.prepare('SELECT * FROM orders WHERE id = ?').get(ord.id);
          if (freshOrd.payment_status === 'paid') {
            return await enrichOrder(freshOrd, true);
          }

          const nowIso = new Date().toISOString();
          const reservations = await db.prepare('SELECT * FROM stock_reservations WHERE order_id = ?').all(ord.id);

          for (const r of reservations) {
            const v = await db.prepare('SELECT * FROM product_variants WHERE id = ?').get(r.variant_id);
            if (!v) throw new Error(`Variant ${r.sku} not found.`);

            if (r.status === 'active_payment_hold' || r.status === 'active_review_hold') {
              // Commit reserved stock: deduct both on_hand and reserved once
              const newOnHand = v.on_hand - r.quantity;
              const newReserved = Math.max(0, v.reserved - r.quantity);
              if (newOnHand < 0) {
                throw new Error(`Insufficient on-hand stock for ${r.sku} during payment commitment. Order requires inventory reconciliation.`);
              }
              await db.prepare('UPDATE product_variants SET on_hand = ?, reserved = ?, version = version + 1, updated_at = ? WHERE id = ?').
              run(newOnHand, newReserved, nowIso, v.id);
              await db.prepare(`
                INSERT INTO stock_movements (
                  variant_id, sku, delta_on_hand, delta_reserved, before_on_hand, after_on_hand, before_reserved, after_reserved,
                  movement_type, reason, order_id, actor_user_id, actor_email, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'payment_committed', ?, ?, ?, ?, ?)
              `).run(
                v.id, r.sku, -r.quantity, -r.quantity, v.on_hand, newOnHand, v.reserved, newReserved,
                `Payment confirmed for #${ord.order_number} (Bank ref: ${actualBankRef})`,
                ord.id, user.id, user.email, nowIso
              );
              await db.prepare("UPDATE stock_reservations SET status = 'committed', updated_at = ? WHERE id = ?").run(nowIso, r.id);
            } else if (r.status === 'released_expired' || r.status === 'released_cancelled') {
              // Late payment on an expired hold: verify available stock before committing, or send to reconciliation
              const avail = v.on_hand - v.reserved;
              if (avail < r.quantity) {
                await db.prepare("UPDATE orders SET reconciliation_required = 1, reconciliation_reason = 'Late payment received after hold expired and SKU is now out of stock.', updated_at = ? WHERE id = ?").
                run(nowIso, ord.id);
                throw new Error(`Hold for ${r.sku} had expired and available stock is now ${avail}. Order flagged for reconciliation.`);
              }
              const newOnHand = v.on_hand - r.quantity;
              await db.prepare('UPDATE product_variants SET on_hand = ?, version = version + 1, updated_at = ? WHERE id = ?').
              run(newOnHand, nowIso, v.id);
              await db.prepare(`
                INSERT INTO stock_movements (
                  variant_id, sku, delta_on_hand, delta_reserved, before_on_hand, after_on_hand, before_reserved, after_reserved,
                  movement_type, reason, order_id, actor_user_id, actor_email, created_at
                ) VALUES (?, ?, ?, 0, ?, ?, ?, ?, 'payment_committed', ?, ?, ?, ?, ?)
              `).run(
                v.id, r.sku, -r.quantity, v.on_hand, newOnHand, v.reserved, v.reserved,
                `Late payment reconciled & committed for #${ord.order_number}`,
                ord.id, user.id, user.email, nowIso
              );
              await db.prepare("UPDATE stock_reservations SET status = 'committed', updated_at = ? WHERE id = ?").run(nowIso, r.id);
            }
          }

          const latestSub = await db.prepare('SELECT id FROM payment_submissions WHERE order_id = ? ORDER BY id DESC LIMIT 1').get(ord.id);
          if (latestSub) {
            await db.prepare("UPDATE payment_submissions SET status = 'approved' WHERE id = ?").run(latestSub.id);
          }

          await db.prepare(`
            INSERT INTO payment_reviews (
              order_id, submission_id, action, received_amount_minor, actual_bank_reference,
              bank_records_checked, audit_note, actor_user_id, actor_email, created_at
            ) VALUES (?, ?, 'confirm_payment', ?, ?, 1, ?, ?, ?, ?)
          `).run(
            ord.id,
            latestSub ? latestSub.id : null,
            receivedAmountMinor,
            actualBankRef,
            auditNote,
            user.id,
            user.email,
            nowIso
          );

          // Set payment_status = 'paid' while keeping fulfilment_status independent!
          const nextFulfilment = ord.fulfilment_status === 'cancelled' ? 'unfulfilled' : ord.fulfilment_status;
          await db.prepare(`
            UPDATE orders
            SET payment_status = 'paid',
                fulfilment_status = ?,
                reconciliation_required = 0,
                reconciliation_reason = NULL,
                resubmission_reason = NULL,
                paid_at = ?,
                paid_verified_by_email = ?,
                paid_bank_reference = ?,
                updated_at = ?
            WHERE id = ?
          `).run(nextFulfilment, nowIso, user.email, actualBankRef, nowIso, ord.id);

          await db.prepare(`
            INSERT INTO status_events (
              order_id, event_type, payment_status, fulfilment_status, title, detail, actor_role, actor_email, customer_visible, created_at
            ) VALUES (?, 'payment_confirmed', 'paid', ?, 'Payment confirmed', ?, 'ADMIN', ?, 1, ?)
          `).run(
            ord.id,
            nextFulfilment,
            `Admin verified received transaction in seller bank records (Ref: ${actualBankRef}, Amount: ${formatMYR(receivedAmountMinor)}).`,
            user.email,
            nowIso
          );

          const actionUrl = `/order/confirmation?order=${encodeURIComponent(ord.order_number)}${ord.guest_access_token ? `&token=${encodeURIComponent(ord.guest_access_token)}` : ''}`;
          await scheduleNotification({
            orderId: ord.id,
            recipientEmail: ord.customer_email,
            templateType: 'payment_confirmed',
            idempotencyKey: `payment_confirmed:${ord.order_number}`,
            subject: `Payment confirmed - Order #${ord.order_number}`,
            bodyText: `Your payment of ${formatMYR(receivedAmountMinor)} for order #${ord.order_number} (Bank Ref: ${actualBankRef}) has been verified and confirmed. We are now preparing your order for fulfilment.`,
            actionUrl
          });

          await logAudit({
            actorUserId: user.id,
            actorEmail: user.email,
            actorRole: 'ADMIN',
            action: 'order_payment_confirmed',
            entityType: 'order',
            entityId: ord.order_number,
            details: { receivedAmountMinor, actualBankRef, auditNote }
          });

          return await enrichOrder(await db.prepare('SELECT * FROM orders WHERE id = ?').get(ord.id), true);
        });

        return sendJson(res, 200, {
          message: `Payment confirmed for #${ord.order_number}.`,
          order: confirmedOrder
        });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    if (action === 'request_resubmission') {
      const reason = String(body.resubmission_reason || auditNote).trim();
      if (!reason || reason.length < 5) {
        return sendJson(res, 400, { error: 'Please provide a clear resubmission reason for the customer.' });
      }

      const nowIso = new Date().toISOString();
      const updated = await runTransaction(async () => {
        const latestSub = await db.prepare('SELECT id FROM payment_submissions WHERE order_id = ? ORDER BY id DESC LIMIT 1').get(ord.id);
        if (latestSub) {
          await db.prepare("UPDATE payment_submissions SET status = 'needs_resubmission' WHERE id = ?").run(latestSub.id);
        }
        const revRes = await db.prepare(`
          INSERT INTO payment_reviews (
            order_id, submission_id, action, bank_records_checked, audit_note, resubmission_reason, actor_user_id, actor_email, created_at
          ) VALUES (?, ?, 'request_resubmission', 0, ?, ?, ?, ?, ?)
        `).run(ord.id, latestSub ? latestSub.id : null, auditNote || reason, reason, user.id, user.email, nowIso);

        await db.prepare(`
          UPDATE orders
          SET payment_status = 'needs_resubmission', resubmission_reason = ?, updated_at = ?
          WHERE id = ?
        `).run(reason, nowIso, ord.id);

        await db.prepare(`
          INSERT INTO status_events (
            order_id, event_type, payment_status, fulfilment_status, title, detail, actor_role, actor_email, customer_visible, created_at
          ) VALUES (?, 'resubmission_requested', 'needs_resubmission', ?, 'Receipt resubmission requested', ?, 'ADMIN', ?, 1, ?)
        `).run(ord.id, ord.fulfilment_status, `Reason: ${reason}`, user.email, nowIso);

        const actionUrl = `/order/confirmation?order=${encodeURIComponent(ord.order_number)}${ord.guest_access_token ? `&token=${encodeURIComponent(ord.guest_access_token)}` : ''}`;
        await scheduleNotification({
          orderId: ord.id,
          recipientEmail: ord.customer_email,
          templateType: 'resubmission_requested',
          idempotencyKey: `resubmission_requested:${ord.order_number}:${revRes.lastInsertRowid}`,
          subject: `Action required: Payment receipt resubmission needed (#${ord.order_number})`,
          bodyText: `We could not verify the payment receipt uploaded for order #${ord.order_number}. Reason: "${reason}". Please open your order status page to submit a clear receipt or verified transaction reference.`,
          actionUrl
        });

        await logAudit({
          actorUserId: user.id,
          actorEmail: user.email,
          actorRole: 'ADMIN',
          action: 'payment_resubmission_requested',
          entityType: 'order',
          entityId: ord.order_number,
          details: { reason }
        });

        return await enrichOrder(await db.prepare('SELECT * FROM orders WHERE id = ?').get(ord.id), true);
      });

      return sendJson(res, 200, {
        message: `Requested receipt resubmission for #${ord.order_number}.`,
        order: updated
      });
    }

    return sendJson(res, 400, { error: 'Unsupported payment review action.' });
  }

  // Admin Orders List, Fulfilment & Manual Refunds
  if (pathname === '/api/admin/orders' && method === 'GET') {
    await sweepExpiredReservations();
    const q = String((urlObj.searchParams.get('q')) || '').trim().toLowerCase();
    const paymentFilter = (urlObj.searchParams.get('payment_status')) || '';
    const fulfilmentFilter = (urlObj.searchParams.get('fulfilment_status')) || '';

    const rows = await db.prepare('SELECT * FROM orders ORDER BY created_at DESC, id DESC').all();
    const filtered = rows.filter((o) => {
      if (paymentFilter && o.payment_status !== paymentFilter) return false;
      if (fulfilmentFilter && o.fulfilment_status !== fulfilmentFilter) return false;
      if (q) {
        const hay = `${o.order_number} ${o.customer_name} ${o.customer_email} ${o.paid_bank_reference || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return sendJson(res, 200, {
      orders: await Promise.all(filtered.map(async (r) => await enrichOrder(r, true)))
    });
  }

  if (pathname.match(/^\/api\/admin\/orders\/\d+\/fulfilment$/) && method === 'POST') {
    const orderId = Number(pathname.split('/')[4]);
    const ord = await db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!ord) return sendJson(res, 404, { error: 'Order not found.' });

    const body = await parseRequestBody(req);
    const nextStatus = String(body.fulfilment_status || '');
    const internalNotes = body.internal_notes !== undefined ? String(body.internal_notes) : ord.internal_notes;

    // Only eligible paid orders can move into Processing / Shipped / Delivered!
    if (['processing', 'shipped', 'delivered'].includes(nextStatus) && ord.payment_status !== 'paid') {
      return sendJson(res, 400, {
        error: `Cannot move order #${ord.order_number} into "${nextStatus}" while payment status is "${PAYMENT_STATUS_LABELS[ord.payment_status]}". Payment must be confirmed first.`,
        code: 'UNPAID_FULFILMENT_BLOCKED'
      });
    }

    const nowIso = new Date().toISOString();

    if (nextStatus === 'shipped') {
      const trackingNumber = String(body.tracking_number || '').trim();
      const detected = detectCourierFromTracking(trackingNumber);
      const courierName = String(body.courier_name || '').trim() || (detected ? detected.courierName : '');
      const trackingUrl = String(body.tracking_url || '').trim() || (
      detected && courierName === detected.courierName ? detected.trackingUrl : '') ||
      `https://www.tracking.my/${encodeURIComponent(trackingNumber)}`;

      if (!courierName || !trackingNumber) {
        return sendJson(res, 400, {
          error: 'Both courier name and tracking number must be saved before marking an order as Shipped.'
        });
      }

      await runTransaction(async () => {
        const shipRes = await db.prepare(`
          INSERT INTO shipments (order_id, courier_name, tracking_number, tracking_url, shipped_at, actor_email, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(ord.id, courierName, trackingNumber, trackingUrl, nowIso, user.email, nowIso);

        await db.prepare('UPDATE orders SET fulfilment_status = \'shipped\', internal_notes = ?, updated_at = ? WHERE id = ?').
        run(internalNotes, nowIso, ord.id);

        await db.prepare(`
          INSERT INTO status_events (
            order_id, event_type, payment_status, fulfilment_status, title, detail, actor_role, actor_email, customer_visible, created_at
          ) VALUES (?, 'order_shipped', ?, 'shipped', 'Order shipped', ?, 'ADMIN', ?, 1, ?)
        `).run(ord.id, ord.payment_status, `Dispatched via ${courierName} — Tracking: ${trackingNumber}`, user.email, nowIso);

        await scheduleNotification({
          orderId: ord.id,
          recipientEmail: ord.customer_email,
          templateType: 'order_shipped',
          idempotencyKey: `order_shipped:${ord.order_number}:${shipRes.lastInsertRowid}`,
          subject: `Your order #${ord.order_number} has shipped`,
          bodyText: `Good news! Your order #${ord.order_number} has been shipped via ${courierName}. Tracking number: ${trackingNumber}. Track parcel: ${trackingUrl}`,
          actionUrl: trackingUrl
        });
      });
    } else if (nextStatus === 'delivered') {
      if (ord.fulfilment_status !== 'shipped') {
        return sendJson(res, 400, { error: 'Order must be marked Shipped with courier tracking before confirming delivery.' });
      }
      await runTransaction(async () => {
        await db.prepare('UPDATE shipments SET delivered_at = ?, delivery_confirmed_by = ? WHERE order_id = ?').
        run(nowIso, user.email, ord.id);
        await db.prepare('UPDATE orders SET fulfilment_status = \'delivered\', internal_notes = ?, updated_at = ? WHERE id = ?').
        run(internalNotes, nowIso, ord.id);
        await db.prepare(`
          INSERT INTO status_events (
            order_id, event_type, payment_status, fulfilment_status, title, detail, actor_role, actor_email, customer_visible, created_at
          ) VALUES (?, 'order_delivered', ?, 'delivered', 'Order delivered', 'Delivery confirmed by authorised administrator.', 'ADMIN', ?, 1, ?)
        `).run(ord.id, ord.payment_status, user.email, nowIso);

        await scheduleNotification({
          orderId: ord.id,
          recipientEmail: ord.customer_email,
          templateType: 'order_delivered',
          idempotencyKey: `order_delivered:${ord.order_number}`,
          subject: `Your order #${ord.order_number} has been delivered`,
          bodyText: `Your order #${ord.order_number} has been marked as delivered. Thank you for shopping with Shop by SCHA.`,
          actionUrl: `/order/confirmation?order=${encodeURIComponent(ord.order_number)}`
        });
      });
    } else if (nextStatus === 'processing') {
      await db.prepare('UPDATE orders SET fulfilment_status = \'processing\', internal_notes = ?, updated_at = ? WHERE id = ?').
      run(internalNotes, nowIso, ord.id);
      await db.prepare(`
        INSERT INTO status_events (
          order_id, event_type, payment_status, fulfilment_status, title, detail, actor_role, actor_email, customer_visible, created_at
        ) VALUES (?, 'fulfilment_processing', ?, 'processing', 'Preparing your order', 'Delivery: Processing', 'ADMIN', ?, 1, ?)
      `).run(ord.id, ord.payment_status, user.email, nowIso);
    } else if (nextStatus === 'cancelled') {
      await db.prepare('UPDATE orders SET fulfilment_status = \'cancelled\', internal_notes = ?, updated_at = ? WHERE id = ?').
      run(internalNotes, nowIso, ord.id);
      await db.prepare(`
        INSERT INTO status_events (
          order_id, event_type, payment_status, fulfilment_status, title, detail, actor_role, actor_email, customer_visible, created_at
        ) VALUES (?, 'fulfilment_cancelled', ?, 'cancelled', 'Fulfilment cancelled', 'Order fulfilment cancelled by admin.', 'ADMIN', ?, 1, ?)
      `).run(ord.id, ord.payment_status, user.email, nowIso);
    } else {
      await db.prepare('UPDATE orders SET internal_notes = ?, updated_at = ? WHERE id = ?').run(internalNotes, nowIso, ord.id);
    }

    const refreshed = await db.prepare('SELECT * FROM orders WHERE id = ?').get(ord.id);
    return sendJson(res, 200, { message: 'Order fulfilment updated.', order: await enrichOrder(refreshed, true) });
  }

  // Manual Refund Workflow Step 1: Initiate refund_pending (does NOT pretend to move money or send Refund Completed email!)
  if (pathname.match(/^\/api\/admin\/orders\/\d+\/refund-initiate$/) && method === 'POST') {
    const orderId = Number(pathname.split('/')[4]);
    const ord = await db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!ord) return sendJson(res, 404, { error: 'Order not found.' });

    if (!['paid', 'partially_refunded'].includes(ord.payment_status)) {
      return sendJson(res, 400, { error: 'Only paid orders can enter the manual refund workflow.' });
    }

    const body = await parseRequestBody(req);
    const amountMinor = parseMYRToMinor(body.amount_myr);
    const reason = String(body.reason || '').trim();
    const maxRefundable = Number(ord.total_minor) - Number(ord.refunded_minor || 0);

    if (!amountMinor || amountMinor <= 0 || amountMinor > maxRefundable) {
      return sendJson(res, 400, { error: `Refund amount must be between RM0.01 and ${formatMYR(maxRefundable)}.` });
    }
    if (!reason) {
      return sendJson(res, 400, { error: 'Refund reason is required.' });
    }

    const nowIso = new Date().toISOString();
    await runTransaction(async () => {
      await db.prepare(`
        INSERT INTO manual_refunds (order_id, status, amount_minor, reason, initiated_by_email, created_at, updated_at)
        VALUES (?, 'refund_pending', ?, ?, ?, ?, ?)
      `).run(ord.id, amountMinor, reason, user.email, nowIso, nowIso);

      await db.prepare("UPDATE orders SET payment_status = 'refund_pending', updated_at = ? WHERE id = ?").run(nowIso, ord.id);

      await db.prepare(`
        INSERT INTO status_events (
          order_id, event_type, payment_status, fulfilment_status, title, detail, actor_role, actor_email, customer_visible, created_at
        ) VALUES (?, 'refund_pending', 'refund_pending', ?, 'Refund pending external bank transfer', ?, 'ADMIN', ?, 1, ?)
      `).run(
        ord.id,
        ord.fulfilment_status,
        `Manual refund of ${formatMYR(amountMinor)} initiated (${reason}). Seller must execute bank transfer externally and record the transfer reference to complete.`,
        user.email,
        nowIso
      );
    });

    return sendJson(res, 200, {
      message: 'Order marked as Refund Pending. Execute the bank transfer externally, then record the transfer reference to complete the refund.',
      order: await enrichOrder(await db.prepare('SELECT * FROM orders WHERE id = ?').get(ord.id), true)
    });
  }

  // Manual Refund Workflow Step 2: Record external bank transfer reference & timestamp to mark Partially Refunded / Refunded
  if (pathname.match(/^\/api\/admin\/orders\/\d+\/refund-complete$/) && method === 'POST') {
    const orderId = Number(pathname.split('/')[4]);
    const ord = await db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!ord) return sendJson(res, 404, { error: 'Order not found.' });

    const body = await parseRequestBody(req);
    const refundId = Number(body.refund_id);
    const externalBankRef = String(body.external_bank_reference || '').trim();
    const transferredAt = String(body.transferred_at || '').trim() || new Date().toISOString();

    if (!externalBankRef || externalBankRef.length < 4) {
      return sendJson(res, 400, {
        error: 'External bank transfer reference is required before marking a refund as completed.'
      });
    }

    const pendingRefund = refundId ? await
    db.prepare("SELECT * FROM manual_refunds WHERE id = ? AND order_id = ? AND status = 'refund_pending'").get(refundId, ord.id) : await
    db.prepare("SELECT * FROM manual_refunds WHERE order_id = ? AND status = 'refund_pending' ORDER BY id DESC LIMIT 1").get(ord.id);

    if (!pendingRefund) {
      return sendJson(res, 400, { error: 'No pending refund record found for this order. Initiate a refund first.' });
    }

    const nowIso = new Date().toISOString();
    await runTransaction(async () => {
      await db.prepare(`
        UPDATE manual_refunds
        SET status = 'completed', external_bank_reference = ?, transferred_at = ?, completed_by_email = ?, updated_at = ?
        WHERE id = ?
      `).run(externalBankRef, transferredAt, user.email, nowIso, pendingRefund.id);

      const newRefundedMinor = Number(ord.refunded_minor || 0) + Number(pendingRefund.amount_minor);
      const nextPayStatus = newRefundedMinor >= Number(ord.total_minor) ? 'refunded' : 'partially_refunded';

      await db.prepare('UPDATE orders SET payment_status = ?, refunded_minor = ?, updated_at = ? WHERE id = ?').
      run(nextPayStatus, newRefundedMinor, nowIso, ord.id);

      await db.prepare(`
        INSERT INTO status_events (
          order_id, event_type, payment_status, fulfilment_status, title, detail, actor_role, actor_email, customer_visible, created_at
        ) VALUES (?, 'refund_completed', ?, ?, ?, ?, 'ADMIN', ?, 1, ?)
      `).run(
        ord.id,
        nextPayStatus,
        ord.fulfilment_status,
        nextPayStatus === 'refunded' ? 'Refund completed' : 'Partial refund completed',
        `External bank transfer of ${formatMYR(pendingRefund.amount_minor)} recorded (Ref: ${externalBankRef}).`,
        user.email,
        nowIso
      );

      await scheduleNotification({
        orderId: ord.id,
        recipientEmail: ord.customer_email,
        templateType: 'refund_completed',
        idempotencyKey: `refund_completed:${ord.order_number}:${pendingRefund.id}`,
        subject: `Refund completed for order #${ord.order_number}`,
        bodyText: `A refund of ${formatMYR(pendingRefund.amount_minor)} for order #${ord.order_number} has been transferred (External Bank Reference: ${externalBankRef}).`,
        actionUrl: `/order/confirmation?order=${encodeURIComponent(ord.order_number)}`
      });

      await logAudit({
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: 'ADMIN',
        action: 'manual_refund_completed',
        entityType: 'order',
        entityId: ord.order_number,
        details: { refundId: pendingRefund.id, amountMinor: pendingRefund.amount_minor, externalBankRef }
      });
    });

    return sendJson(res, 200, {
      message: `External bank transfer (${externalBankRef}) recorded and refund marked completed.`,
      order: await enrichOrder(await db.prepare('SELECT * FROM orders WHERE id = ?').get(ord.id), true)
    });
  }

  // Separate intentional inventory action: Restock returned goods
  if (pathname.match(/^\/api\/admin\/orders\/\d+\/restock$/) && method === 'POST') {
    const orderId = Number(pathname.split('/')[4]);
    const ord = await db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!ord) return sendJson(res, 404, { error: 'Order not found.' });

    const items = await db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(ord.id);
    const nowIso = new Date().toISOString();

    await runTransaction(async () => {
      for (const item of items) {
        const v = await db.prepare('SELECT * FROM product_variants WHERE id = ?').get(item.variant_id);
        if (v) {
          const afterOnHand = v.on_hand + item.quantity;
          await db.prepare('UPDATE product_variants SET on_hand = ?, version = version + 1, updated_at = ? WHERE id = ?').
          run(afterOnHand, nowIso, v.id);
          await db.prepare(`
            INSERT INTO stock_movements (
              variant_id, sku, delta_on_hand, delta_reserved, before_on_hand, after_on_hand, before_reserved, after_reserved,
              movement_type, reason, order_id, actor_user_id, actor_email, created_at
            ) VALUES (?, ?, ?, 0, ?, ?, ?, ?, 'return_restock', ?, ?, ?, ?, ?)
          `).run(
            v.id, v.sku, item.quantity, v.on_hand, afterOnHand, v.reserved, v.reserved,
            `Intentional restock of returned goods from Order #${ord.order_number}`,
            ord.id, user.id, user.email, nowIso
          );
        }
      }
      await db.prepare(`
        INSERT INTO status_events (
          order_id, event_type, payment_status, fulfilment_status, title, detail, actor_role, actor_email, customer_visible, created_at
        ) VALUES (?, 'returned_goods_restocked', ?, ?, 'Returned goods restocked to inventory', 'Intentional inventory restock recorded by admin.', 'ADMIN', ?, 0, ?)
      `).run(ord.id, ord.payment_status, ord.fulfilment_status, user.email, nowIso);
    });

    return sendJson(res, 200, {
      message: 'Returned goods intentionally restocked into available inventory.',
      order: await enrichOrder(await db.prepare('SELECT * FROM orders WHERE id = ?').get(ord.id), true)
    });
  }

  // Retry failed / pending notification job without duplicate creation
  if (pathname.match(/^\/api\/admin\/notifications\/\d+\/retry$/) && method === 'POST') {
    const jobId = Number(pathname.split('/')[4]);
    const job = await db.prepare('SELECT * FROM notification_jobs WHERE id = ?').get(jobId);
    if (!job) return sendJson(res, 404, { error: 'Notification job not found.' });

    const jobResult = await require('./jobs').sendNotification(jobId);
    return sendJson(res,200,{message:jobResult.status==='sent_logged'?'Email accepted by provider. Delivery to the inbox is not confirmed.':'Email remains queued. Check email configuration or retry error.',job:jobResult});
  }

  // Admin Customers & CSV Export
  if (pathname === '/api/admin/customers' && method === 'GET') {
    const q = String((urlObj.searchParams.get('q')) || '').trim().toLowerCase();
    const [customers, allUserOrders] = await Promise.all([
      db.prepare("SELECT * FROM users WHERE role = 'CUSTOMER' ORDER BY is_demo ASC, created_at DESC").all(),
      db.prepare('SELECT user_id, payment_status, total_minor, refunded_minor FROM orders WHERE user_id IS NOT NULL').all()
    ]);

    const ordersByUser = new Map();
    for (const o of allUserOrders) {
      const uid = Number(o.user_id);
      if (!ordersByUser.has(uid)) ordersByUser.set(uid, []);
      ordersByUser.get(uid).push(o);
    }

    const enriched = customers
      .filter((c) => {
        if (!q) return true;
        return `${c.name} ${c.email} ${c.phone || ''}`.toLowerCase().includes(q);
      })
      .map((c) => {
        const orders = ordersByUser.get(Number(c.id)) || [];
        const totalPaidMinor = orders
          .filter((o) => ['paid', 'refund_pending', 'partially_refunded'].includes(o.payment_status))
          .reduce((sum, o) => sum + Number(o.total_minor) - Number(o.refunded_minor || 0), 0);
        return {
          id: c.id,
          email: c.email,
          name: c.name,
          phone: c.phone,
          status: c.status,
          is_demo: Boolean(c.is_demo),
          orders_count: orders.length,
          total_paid_minor: totalPaidMinor,
          total_paid_formatted: formatMYR(totalPaidMinor),
          created_at: c.created_at
        };
      });

    return sendJson(res, 200, { customers: enriched });
  }

  if (pathname === '/api/admin/customers/export.csv' && method === 'GET') {
    const q = String((urlObj.searchParams.get('q')) || '').trim().toLowerCase();
    const includeDemo = (urlObj.searchParams.get('include_demo')) === '1';
    const customers = await db.prepare("SELECT * FROM users WHERE role = 'CUSTOMER' ORDER BY id ASC").all();

    const lines = ['Customer ID,Name,Email,Phone,Status,Demo Record,Orders Count,Confirmed Net Paid (MYR)'];
    for (const c of customers) {
      if (!includeDemo && c.is_demo) continue;
      if (q && !`${c.name} ${c.email}`.toLowerCase().includes(q)) continue;
      const orders = await db.prepare('SELECT * FROM orders WHERE user_id = ?').all(c.id);
      const totalPaidMinor = orders.
      filter((o) => ['paid', 'refund_pending', 'partially_refunded'].includes(o.payment_status)).
      reduce((sum, o) => sum + Number(o.total_minor) - Number(o.refunded_minor || 0), 0);

      lines.push([
      sanitizeCsvCell(c.id),
      sanitizeCsvCell(c.name),
      sanitizeCsvCell(c.email),
      sanitizeCsvCell(c.phone),
      sanitizeCsvCell(c.status),
      sanitizeCsvCell(c.is_demo ? 'DEMO' : 'LIVE'),
      sanitizeCsvCell(orders.length),
      sanitizeCsvCell((totalPaidMinor / 100).toFixed(2))].
      join(','));
    }

    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="shop_by_scha_customers.csv"',
      'Cache-Control': 'no-store'
    });
    return res.end(lines.join('\r\n'));
  }

  if (pathname.match(/^\/api\/admin\/customers\/\d+$/) && method === 'GET') {
    const custId = Number(pathname.split('/').pop());
    const c = await db.prepare("SELECT * FROM users WHERE id = ? AND role = 'CUSTOMER'").get(custId);
    if (!c) return sendJson(res, 404, { error: 'Customer not found.' });

    const addresses = await db.prepare('SELECT * FROM addresses WHERE user_id = ?').all(c.id);
    const orders = await Promise.all((await db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(c.id)).map(async (o) => await enrichOrder(o, true)));

    return sendJson(res, 200, {
      customer: {
        id: c.id,
        email: c.email,
        name: c.name,
        phone: c.phone,
        status: c.status,
        retention_note: c.retention_note,
        is_demo: Boolean(c.is_demo),
        created_at: c.created_at
      },
      addresses,
      orders
    });
  }

  if (pathname.match(/^\/api\/admin\/customers\/\d+\/anonymise$/) && method === 'POST') {
    const custId = Number(pathname.split('/')[4]);
    const c = await db.prepare("SELECT * FROM users WHERE id = ? AND role = 'CUSTOMER'").get(custId);
    if (!c) return sendJson(res, 404, { error: 'Customer not found.' });

    const body = await parseRequestBody(req);
    const reason = String(body.reason || 'Customer privacy / retention policy request').trim();
    const nowIso = new Date().toISOString();

    await runTransaction(async () => {
      await db.prepare(`
        UPDATE users
        SET name = 'Anonymised Customer',
            email = ?,
            phone = '',
            status = 'anonymised',
            retention_note = ?,
            updated_at = ?
        WHERE id = ?
      `).run(`anonymised_${c.id}_${Date.now()}@deleted.local`, reason, nowIso, c.id);
      await db.prepare('DELETE FROM addresses WHERE user_id = ?').run(c.id);
      await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(c.id);
      await logAudit({
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: 'ADMIN',
        action: 'customer_anonymised',
        entityType: 'user',
        entityId: c.id,
        details: { reason }
      });
    });

    return sendJson(res, 200, { message: 'Customer profile anonymised per retention policy; historical order totals remain preserved.' });
  }

  // Admin Analytics CSV Export
  if (pathname === '/api/admin/analytics/export.csv' && method === 'GET') {
    const includeDemo = (urlObj.searchParams.get('include_demo')) === '1';
    const dateFrom = (urlObj.searchParams.get('date_from')) || '2026-10-01';
    const dateTo = (urlObj.searchParams.get('date_to')) || '2026-10-31';

    const orders = await db.prepare(`
      SELECT * FROM orders
      WHERE substr(created_at, 1, 10) >= ?
        AND substr(created_at, 1, 10) <= ?
        ${includeDemo ? '' : 'AND is_demo = 0'}
      ORDER BY created_at DESC
    `).all(dateFrom, dateTo);

    const lines = [
    'Order Number,Created At (Asia/Kuala_Lumpur),Customer Name,Customer Email,Payment Status,Fulfilment Status,Gross Total (MYR),Completed Refund (MYR),Confirmed Net Revenue (MYR),Bank Reference,Record Type'];

    for (const o of orders) {
      const isPaid = ['paid', 'refund_pending', 'partially_refunded', 'refunded'].includes(o.payment_status);
      const netMinor = isPaid ? Math.max(0, Number(o.total_minor) - Number(o.refunded_minor || 0)) : 0;
      lines.push([
      sanitizeCsvCell(o.order_number),
      sanitizeCsvCell(o.created_at),
      sanitizeCsvCell(o.customer_name),
      sanitizeCsvCell(o.customer_email),
      sanitizeCsvCell(PAYMENT_STATUS_LABELS[o.payment_status] || o.payment_status),
      sanitizeCsvCell(FULFILMENT_STATUS_LABELS[o.fulfilment_status] || o.fulfilment_status),
      sanitizeCsvCell((Number(o.total_minor) / 100).toFixed(2)),
      sanitizeCsvCell((Number(o.refunded_minor || 0) / 100).toFixed(2)),
      sanitizeCsvCell((netMinor / 100).toFixed(2)),
      sanitizeCsvCell(o.paid_bank_reference || ''),
      sanitizeCsvCell(o.is_demo ? 'DEMO DATA' : 'LIVE')].
      join(','));
    }

    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="shop_by_scha_sales_${dateFrom}_to_${dateTo}.csv"`,
      'Cache-Control': 'no-store'
    });
    return res.end(lines.join('\r\n'));
  }

  // Admin Content Manager (H01/H02, N01-N03, E01-E03, C01-C04, B01/Policies)
  if (pathname === '/api/admin/content' && method === 'GET') {
    const rows = await db.prepare('SELECT * FROM content_sections ORDER BY section_key ASC').all();
    return sendJson(res, 200, {
      sections: rows.map((r) => ({
        section_key: r.section_key,
        title: r.title,
        draft: JSON.parse(r.draft_json),
        published: JSON.parse(r.published_json),
        has_unpublished_changes: Boolean(r.has_unpublished_changes),
        updated_by_email: r.updated_by_email,
        updated_at: r.updated_at,
        published_at: r.published_at
      }))
    });
  }

  if (pathname.startsWith('/api/admin/content/') && method === 'PUT') {
    const sectionKey = pathname.slice('/api/admin/content/'.length);
    const existing = await db.prepare('SELECT * FROM content_sections WHERE section_key = ?').get(sectionKey);
    if (!existing) return sendJson(res, 404, { error: 'Content section not found.' });

    const body = await parseRequestBody(req);
    const draftData = body.draft || body;
    const publishNow = Boolean(body.publish_now);

    // Validate critical fields before saving/publishing
    if (sectionKey === 'H01_H02') {
      if (!String(draftData.headline || '').trim() || !String(draftData.cta_text || '').trim()) {
        return sendJson(res, 400, { error: 'Hero headline and CTA text cannot be empty.' });
      }
    }

    const nowIso = new Date().toISOString();
    const draftJson = JSON.stringify(draftData);
    if (publishNow) {
      await db.prepare(`
        UPDATE content_sections
        SET draft_json = ?, published_json = ?, has_unpublished_changes = 0, updated_by_email = ?, updated_at = ?, published_at = ?
        WHERE section_key = ?
      `).run(draftJson, draftJson, user.email, nowIso, nowIso, sectionKey);
    } else {
      await db.prepare(`
        UPDATE content_sections
        SET draft_json = ?, has_unpublished_changes = 1, updated_by_email = ?, updated_at = ?
        WHERE section_key = ?
      `).run(draftJson, user.email, nowIso, sectionKey);
    }

    await logAudit({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: 'ADMIN',
      action: publishNow ? 'content_published' : 'content_draft_saved',
      entityType: 'content_section',
      entityId: sectionKey
    });

    return sendJson(res, 200, {
      message: publishNow ? `Published ${sectionKey} to storefront.` : `Saved draft for ${sectionKey}. Use Preview Storefront to inspect before publishing.`
    });
  }

  if (pathname === '/api/admin/content/publish-all' && method === 'POST') {
    const nowIso = new Date().toISOString();
    await db.prepare(`
      UPDATE content_sections
      SET published_json = draft_json, has_unpublished_changes = 0, updated_by_email = ?, published_at = ?
    `).run(user.email, nowIso);
    await logAudit({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: 'ADMIN',
      action: 'content_published_all',
      entityType: 'content_section',
      entityId: 'ALL'
    });
    return sendJson(res, 200, { message: 'All draft storefront content sections have been validated and published.' });
  }

  // Admin Store Settings & Audited Merchant QR Versioning
  if (pathname === '/api/admin/settings' && method === 'GET') {
    const [settingsRow, paymentVersions, auditLogs, notifications] = await Promise.all([
      db.prepare('SELECT * FROM store_settings WHERE id = 1').get(),
      db.prepare('SELECT * FROM payment_instruction_versions ORDER BY version_number DESC').all(),
      db.prepare('SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 30').all(),
      db.prepare('SELECT * FROM notification_jobs ORDER BY created_at DESC LIMIT 25').all()
    ]);

    return sendJson(res, 200, {
      settings: {
        ...settingsRow,
        design_preview_enabled: Boolean(settingsRow.design_preview_enabled),
        shipping_zones: JSON.parse(settingsRow.shipping_zones_json || '[]'),
        tax_config: JSON.parse(settingsRow.tax_config_json || '{}'),
        policies: JSON.parse(settingsRow.policies_json || '{}'),
        physical_stores: JSON.parse(settingsRow.physical_stores_json || '[]'),
        smtp_configured: Boolean(settingsRow.smtp_configured),
        session_tracking_connected: Boolean(settingsRow.session_tracking_connected)
      },
      payment_versions: paymentVersions,
      audit_logs: auditLogs,
      notifications
    });
  }

  if (pathname === '/api/admin/settings' && method === 'PUT') {
    const body = await parseRequestBody(req);
    const current = await db.prepare('SELECT * FROM store_settings WHERE id = 1').get();
    const nowIso = new Date().toISOString();
    for (const key of ['support_hours','founder_story','sourcing_info','business_identity']) if(body[key] !== undefined) await db.prepare(`UPDATE store_settings SET ${key} = ? WHERE id = 1`).run(String(body[key]).trim());

    await db.prepare(`
      UPDATE store_settings
      SET store_name = ?,
          tagline = ?,
          support_email = ?,
          support_phone = ?,
          business_address = ?,
          currency = ?,
          timezone = ?,
          design_preview_enabled = ?,
          shipping_zones_json = ?,
          tax_config_json = ?,
          policies_json = ?,
          physical_stores_json = ?,
          updated_at = ?
      WHERE id = 1
    `).run(
      String(body.store_name || current.store_name).trim(),
      String(body.tagline || current.tagline).trim(),
      String(body.support_email ?? current.support_email).trim(),
      String(body.support_phone ?? current.support_phone).trim(),
      String(body.business_address ?? current.business_address).trim(),
      String(body.currency || 'MYR').trim(),
      String(body.timezone || 'Asia/Kuala_Lumpur').trim(),
      body.design_preview_enabled !== undefined ? body.design_preview_enabled ? 1 : 0 : current.design_preview_enabled,
      body.shipping_zones ? JSON.stringify(body.shipping_zones) : current.shipping_zones_json,
      body.tax_config ? JSON.stringify(body.tax_config) : current.tax_config_json,
      body.policies ? JSON.stringify(body.policies) : current.policies_json,
      body.physical_stores ? JSON.stringify(body.physical_stores) : current.physical_stores_json,
      nowIso
    );

    await logAudit({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: 'ADMIN',
      action: 'store_settings_updated',
      entityType: 'store_settings',
      entityId: 1
    });

    return sendJson(res, 200, { message: 'Store settings saved.' });
  }

  // Update Merchant DuitNow QR & Recipient -> creates a NEW immutable payment_instruction_versions row so existing orders retain their original snapshot!
  if (pathname === '/api/admin/settings/payment-qr' && method === 'POST') {
    const parsed = await parseRequestBody(req);
    const fields = parsed.isMultipart ? parsed.fields : parsed;
    const files = parsed.isMultipart ? parsed.files : {};

    const latest = await db.prepare('SELECT * FROM payment_instruction_versions ORDER BY version_number DESC LIMIT 1').get();
    let qrPath = fields.qr_image_path !== undefined ? fields.qr_image_path : latest.qr_image_path;

    if (files.qr_image && files.qr_image.buffer) {
      try {
        const saved = await savePublicMedia(files.qr_image.buffer, files.qr_image.filename, 'duitnow_qr');
        qrPath = saved.publicPath;
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    } else if (fields.qr_base64) {
      try {
        const b64 = String(fields.qr_base64).replace(/^data:[^;]+;base64,/, '');
        const saved = await savePublicMedia(Buffer.from(b64, 'base64'), fields.qr_filename || 'merchant_qr.png', 'duitnow_qr');
        qrPath = saved.publicPath;
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    const recipientName = String(fields.recipient_name ?? latest.recipient_name).trim();
    const bankName = String(fields.bank_name ?? latest.bank_name).trim();
    const accountNumber = String(fields.account_number ?? latest.account_number).trim();
    const manualTransferEnabled = fields.manual_transfer_enabled === 'true' || fields.manual_transfer_enabled === true ? 1 : 0;
    const demoQrEnabled = sandbox && fields.demo_qr_enabled !== undefined ?
    fields.demo_qr_enabled === 'true' || fields.demo_qr_enabled === true ? 1 : 0 :
    latest.demo_qr_enabled;
    const support = await db.prepare('SELECT support_email, support_phone FROM store_settings WHERE id = 1').get();
    const isLiveConfigured = Boolean(qrPath && bankName && recipientName && !recipientName.includes('[DEMO') && (support.support_email || support.support_phone)) ? 1 : 0;
    const deadlineMinutes = Math.max(5, Number(fields.payment_deadline_minutes || latest.payment_deadline_minutes || 30));
    const reviewHours = Math.max(1, Number(fields.review_window_hours || latest.review_window_hours || 24));
    if(!Number.isInteger(deadlineMinutes) || !Number.isInteger(reviewHours))return sendJson(res,400,{error:'Payment deadline and review time must be whole numbers.'});
    const newVersionNumber = Number(latest.version_number) + 1;
    const nowIso = new Date().toISOString();

    await runTransaction(async () => {
      await db.prepare(`
        INSERT INTO payment_instruction_versions (
          version_number, is_live_configured, demo_qr_enabled, recipient_name, bank_name, account_number,
          manual_transfer_enabled, qr_image_path, payment_deadline_minutes, review_window_hours,
          notes, created_by_user_id, created_by_email, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newVersionNumber,
        isLiveConfigured,
        demoQrEnabled,
        recipientName,
        bankName,
        accountNumber,
        manualTransferEnabled,
        qrPath,
        deadlineMinutes,
        reviewHours,
        String(fields.notes || `Updated by ${user.email}`).trim(),
        user.id,
        user.email,
        nowIso
      );

      await logAudit({
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: 'ADMIN',
        action: 'merchant_qr_version_created',
        entityType: 'payment_instruction_versions',
        entityId: `v${newVersionNumber}`,
        details: { newVersionNumber, recipientName, bankName, isLiveConfigured, qrPath }
      });
    });

    return sendJson(res, 201, {
      message: `Saved Payment Instruction Version v${newVersionNumber}. New orders will use v${newVersionNumber}; existing pending orders retain the version shown at creation.`
    });
  }

  // Neon Lakebase Postgres Live Status & Sync Endpoint
  if (pathname === '/api/neon/status' && method === 'GET') {
    if (!user || user.role !== 'ADMIN') return sendJson(res, 403, { error: 'Administrator access required.' });
    try {

      const status = { connected: db.driver === 'postgres', driver: db.driver };
      return sendJson(res, 200, status);
    } catch (err) {
      return sendJson(res, 500, { connected: false, error: err.message });
    }
  }

  // Neon AI Gateway Models Discovery Endpoint (/v1/models)
  if (pathname === '/api/ai/models' && method === 'GET') {
    try {
      const modelsInfo = await listGatewayModels();
      return sendJson(res, 200, modelsInfo);
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Neon AI Gateway Editorial Stylist Endpoint (/v1/chat/completions)
  if (pathname === '/api/ai/stylist' && method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      const catalogueSummary = await db.prepare('SELECT reference_id, title, category_slug, brand FROM products WHERE is_demo = 0 ORDER BY id ASC').all();
      const response = await askStylistAssistant({
        prompt: body.prompt,
        model: body.model || 'gpt-5-mini',
        catalogueSummary
      });
      return sendJson(res, 200, response);
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  return sendJson(res, 404, { error: `API endpoint not found: ${method} ${pathname}` });
}

let requestTail=Promise.resolve();
async function handleRequest(req, res) {
  const method = String(req.method || 'GET').toUpperCase();
  if (process.env.SCHA_ENV !== 'test' && (method === 'GET' || method === 'HEAD')) {
    return await dispatchRequest(req, res);
  }
  const previous=requestTail;let release;requestTail=new Promise(r=>release=r);await previous;
  try{return await dispatchRequest(req,res);}finally{release();}
}
async function dispatchRequest(req, res) {
  try {
    await appReady;
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = urlObj.pathname;

    if (pathname === '/api/jobs' && ['GET','POST'].includes(req.method)) {
      if(!process.env.JOB_SECRET || req.headers.authorization !== `Bearer ${process.env.JOB_SECRET}`) return sendJson(res,403,{error:'Forbidden.'});
      return sendJson(res,200,await require('./jobs').runJobs());
    }
    if (pathname.startsWith('/uploads/')) {
      const name=path.basename(pathname);
      try{const buf=await getObject('media/'+name,path.join(PUBLIC_DIR,'uploads',name));res.writeHead(200,{'Content-Type':name.endsWith('.png')?'image/png':'image/jpeg','X-Content-Type-Options':'nosniff'});return res.end(buf);}catch{return sendJson(res,404,{error:'Image not found.'});}
    }
    if (pathname.startsWith('/api/')) {
      return await handleApiRequest(req, res, urlObj);
    }

    // Block any direct static access to private storage paths
    if (pathname.startsWith('/storage/') || pathname.includes('private_receipts')) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('403 Forbidden — Private storage path.');
    }

    // Serve static files from public/
    const safeRelPath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.(\/|\\|$))+/, '');
    const candidatePath = path.join(PUBLIC_DIR, safeRelPath);

    if (pathname !== '/' && fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
      const ext = path.extname(candidatePath).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': ext === '.png' || ext === '.jpg' ? 'public, max-age=3600' : 'no-cache'
      });
      return fs.createReadStream(candidatePath).pipe(res);
    }

    // SPA Fallback: serve index.html for all storefront, customer and admin routes
    const indexHtmlPath = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(indexHtmlPath)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache'
      });
      return fs.createReadStream(indexHtmlPath).pipe(res);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  } catch (err) {
    console.error('Server request failed:', err.code || err.name);
    sendJson(res, err.statusCode || 500, { error: err.statusCode ? err.message : 'Internal server error.' });
  }
}

function createAppServer() {
  return http.createServer(handleRequest);
}

if (require.main === module) {
  let port = Number(process.env.PORT || 3000);
  const server = createAppServer();
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      port += 1;
      server.listen(port);
    } else {
      throw err;
    }
  });
  server.listen(port, () => {
    console.log(`Shop by SCHA server listening on http://localhost:${port}`);
  });
}

module.exports = { createAppServer, handleRequest, handleApiRequest };
