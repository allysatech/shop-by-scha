const crypto = require('node:crypto');
const { db } = require('./db');

const SESSION_COOKIE_NAME = 'scha_session';
const CART_COOKIE_NAME = 'scha_cart';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, key] = storedHash.split(':');
  const derived = crypto.scryptSync(String(password), salt, 64);
  const keyBuf = Buffer.from(key, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx > -1) {
      const k = pair.slice(0, idx).trim();
      const v = decodeURIComponent(pair.slice(idx + 1).trim());
      cookies[k] = v;
    }
  }
  return cookies;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || '/'}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join('; ');
}

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.DATABASE_URL || 'scha-editorial-session-secret-2026';

function signSessionPayload(payloadStr) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('base64url');
}

function deriveCsrfToken(sessionId) {
  return crypto.createHmac('sha256', `${SESSION_SECRET}:csrf`).update(String(sessionId)).digest('hex').slice(0, 48);
}

function createSession(userId, loginContext = 'customer', ttlHours = 24) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlHours * 3600 * 1000).toISOString();
  const payloadObj = {
    u: Number(userId),
    c: loginContext,
    e: new Date(expiresAt).getTime(),
    n: crypto.randomBytes(12).toString('hex')
  };
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = signSessionPayload(payloadB64);
  const sessionId = `${payloadB64}.${sig}`;
  const csrfToken = deriveCsrfToken(sessionId);

  db.prepare(`
    INSERT OR REPLACE INTO sessions (id, user_id, csrf_token, login_context, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionId, userId, csrfToken, loginContext, expiresAt, now.toISOString());
  return { sessionId, csrfToken, expiresAt };
}

function tryRestoreSignedSession(sessionId) {
  if (!sessionId || !sessionId.includes('.')) return null;
  const [payloadB64, sig] = sessionId.split('.');
  if (!payloadB64 || !sig) return null;
  const expectedSig = signSessionPayload(payloadB64);
  if (sig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload.u || !payload.e || payload.e <= Date.now()) return null;
    const expiresAt = new Date(payload.e).toISOString();
    const csrfToken = deriveCsrfToken(sessionId);
    const userExists = db.prepare('SELECT id FROM users WHERE id = ? AND status = ?').get(payload.u, 'active');
    if (!userExists) return null;
    db.prepare(`
      INSERT OR IGNORE INTO sessions (id, user_id, csrf_token, login_context, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, payload.u, csrfToken, payload.c || 'customer', expiresAt, new Date().toISOString());
    return true;
  } catch {
    return null;
  }
}

function getSessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = req.headers['x-session-token'] || cookies[SESSION_COOKIE_NAME];
  if (!sessionId) return { user: null, session: null, expired: false };

  let row = db.prepare(`
    SELECT s.id AS session_id, s.user_id, s.csrf_token, s.login_context, s.expires_at,
           u.id, u.email, u.name, u.phone, u.role, u.status, u.mfa_enabled, u.is_demo
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
  `).get(sessionId);

  if (!row && tryRestoreSignedSession(sessionId)) {
    row = db.prepare(`
      SELECT s.id AS session_id, s.user_id, s.csrf_token, s.login_context, s.expires_at,
             u.id, u.email, u.name, u.phone, u.role, u.status, u.mfa_enabled, u.is_demo
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.id = ?
    `).get(sessionId);
  }

  if (!row) {
    return { user: null, session: null, expired: true };
  }

  if (new Date(row.expires_at).getTime() <= Date.now() || row.status !== 'active') {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return { user: null, session: null, expired: true };
  }

  return {
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      phone: row.phone,
      role: row.role,
      mfa_enabled: Boolean(row.mfa_enabled),
      is_demo: Boolean(row.is_demo)
    },
    session: {
      id: row.session_id,
      csrfToken: row.csrf_token,
      loginContext: row.login_context,
      expiresAt: row.expires_at
    },
    expired: false
  };
}

// Simple in-memory rate limiter for auth and mutation endpoints
const rateBuckets = new Map();
function checkRateLimit(key, maxRequests = 40, windowMs = 60000) {
  const now = Date.now();
  const entry = rateBuckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  entry.count += 1;
  rateBuckets.set(key, entry);
  return entry.count <= maxRequests;
}

module.exports = {
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
};
