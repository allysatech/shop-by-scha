export const MALAYSIAN_STATES = [
  'Wilayah Persekutuan Kuala Lumpur',
  'Selangor',
  'Pulau Pinang',
  'Johor',
  'Perak',
  'Kedah',
  'Kelantan',
  'Melaka',
  'Negeri Sembilan',
  'Pahang',
  'Perlis',
  'Sabah',
  'Sarawak',
  'Terengganu',
  'Wilayah Persekutuan Putrajaya',
  'Wilayah Persekutuan Labuan'
];

export const MALAYSIAN_COURIERS = [
  { name: 'PosLaju Malaysia', hint: 'PL / ER / EN / EP...MY' },
  { name: 'J&T Express Malaysia', hint: '60... / 62... (12 digits) / JT' },
  { name: 'NinjaVan Malaysia', hint: 'NVMY / NV / SHP' },
  { name: 'DHL eCommerce Malaysia', hint: 'DHL / MYP / JD / 10 digits' },
  { name: 'SPX Express (Shopee Xpress)', hint: 'SPXMY / SPX / MY2' },
  { name: 'Flash Express Malaysia', hint: 'MYS / FE' },
  { name: 'GDEX (GD Express)', hint: 'GD / MYG / CN / 3-5...' },
  { name: 'City-Link Express', hint: 'CL / CT / 15 digits' },
  { name: 'FedEx / International Express', hint: 'FDX / 77...' },
  { name: 'Lalamove / GrabExpress (Same-Day)', hint: 'LLM / GRAB / GX' },
  { name: 'Other Tracked Courier', hint: 'Custom tracking' }
];

export function detectCourierFromTracking(rawTracking) {
  const raw = String(rawTracking || '').trim();
  if (!raw || raw.length < 3) return null;

  const compact = raw.toUpperCase().replace(/[\s-]+/g, '');
  const encoded = encodeURIComponent(raw);

  // 1. PosLaju / Pos Malaysia: starts with PL, ER, EN, EP, EE, EH, EM, ES, EF, EB, ED or standard 13-char UPU ending in MY
  if (
    /^(PL|POS|ER|EN|EP|EE|EH|EM|ES|EF|EB|ED)/.test(compact) ||
    /^[A-Z]{2}\d{9}MY$/.test(compact)
  ) {
    return {
      courierName: 'PosLaju Malaysia',
      trackingUrl: `https://tracking.pos.com.my/?trackingNo=${encoded}`,
      matchedRule: 'PosLaju prefix / MY UPU format'
    };
  }

  // 2. NinjaVan Malaysia: starts with NVMY, NVSG, NV, SHP, NINJA
  if (/^(NVMY|NVSG|NV|SHP|NINJA)/.test(compact)) {
    return {
      courierName: 'NinjaVan Malaysia',
      trackingUrl: `https://www.ninjavan.co/en-my/tracking?id=${encoded}`,
      matchedRule: 'NinjaVan prefix'
    };
  }

  // 3. SPX Express (Shopee Xpress): starts with SPXMY, SPX, MY2, SHOPEE
  if (/^(SPXMY|SPX|MY2|SHOPEE)/.test(compact)) {
    return {
      courierName: 'SPX Express (Shopee Xpress)',
      trackingUrl: `https://spx.com.my/`,
      matchedRule: 'SPX Express prefix'
    };
  }

  // 4. J&T Express Malaysia: starts with JT, JNT or 12 digits starting with 6 (e.g., 600..., 620..., 630..., 650...)
  if (/^(JT|JNT|J&T)/.test(compact) || /^6\d{11}$/.test(compact)) {
    return {
      courierName: 'J&T Express Malaysia',
      trackingUrl: `https://www.jtexpress.my/tracking/${encoded}`,
      matchedRule: 'J&T 12-digit waybill / JT prefix'
    };
  }

  // 5. Flash Express Malaysia: starts with MYS, FE, FLASH, P0
  if (/^(MYS|FE|FLASH|P0)/.test(compact)) {
    return {
      courierName: 'Flash Express Malaysia',
      trackingUrl: `https://www.flashexpress.my/fle/tracking?se=${encoded}`,
      matchedRule: 'Flash Express prefix'
    };
  }

  // 6. DHL eCommerce / Express Malaysia: starts with DHL, MYP, MYD, GM, JD, JJD, RX or 10 digits starting with 1, 2, 8, 9
  if (/^(DHL|MYP|MYD|GM|JD|JJD|RX)/.test(compact) || /^[1289]\d{9}$/.test(compact)) {
    return {
      courierName: 'DHL eCommerce Malaysia',
      trackingUrl: `https://www.dhl.com/my-en/home/tracking.html?tracking-id=${encoded}`,
      matchedRule: 'DHL prefix / 10-digit waybill'
    };
  }

  // 7. GDEX (GD Express): starts with GD, GDEX, MYG, CN or 10-11 digits starting with 3, 4, 5
  if (/^(GDEX|GD|MYG|CN)/.test(compact) || /^[345]\d{9,10}$/.test(compact)) {
    return {
      courierName: 'GDEX (GD Express)',
      trackingUrl: `https://gdexpress.com/tracking/`,
      matchedRule: 'GDEX prefix / waybill'
    };
  }

  // 8. City-Link Express: starts with CL, CT, CITY or 15 digits
  if (/^(CITY|CL|CT)/.test(compact) || /^\d{15}$/.test(compact)) {
    return {
      courierName: 'City-Link Express',
      trackingUrl: `https://www.citylinkexpress.com/tracking-result/?track_num=${encoded}`,
      matchedRule: 'City-Link prefix / 15-digit waybill'
    };
  }

  // 9. FedEx / International Express: starts with FDX, FEDEX or 12-14 digits starting with 7
  if (/^(FDX|FEDEX)/.test(compact) || /^7\d{11,13}$/.test(compact)) {
    return {
      courierName: 'FedEx / International Express',
      trackingUrl: `https://www.fedex.com/fedextrack/?trknbr=${encoded}`,
      matchedRule: 'FedEx prefix / 12-digit waybill'
    };
  }

  // 10. Lalamove / GrabExpress (Same-Day)
  if (/^(LLM|LALA|GRAB|GX)/.test(compact)) {
    return {
      courierName: 'Lalamove / GrabExpress (Same-Day)',
      trackingUrl: `https://www.tracking.my/${encoded}`,
      matchedRule: 'Same-day courier prefix'
    };
  }

  return null;
}

export const state = {
  user: null,
  csrfToken: null,
  sessionExpired: false,
  storefront: null,
  cart: { items: [], itemCount: 0, subtotal_formatted: 'RM0.00', total_formatted: 'RM0.00', warnings: [] },
  checkoutDraft: {
    guestContinued: false,
    step: 1,
    email: '',
    phone: '',
    recipient_name: '',
    line1: '',
    line2: '',
    postcode: '',
    city: 'Kuala Lumpur',
    state: 'Wilayah Persekutuan Kuala Lumpur',
    country: 'Malaysia',
    billing_same_as_shipping: true,
    shipping_method_id: null,
    createdOrder: null
  },
  adminIncludeDemo: true,
  adminDateFrom: '2026-10-01',
  adminDateTo: '2026-10-31',
  pollingTimer: null
};

export function escapeHtml(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function showToast(message, duration = 4200) {
  const region = document.getElementById('toast-region');
  if (!region) return;
  const el = document.createElement('div');
  el.className = 'toast-msg';
  el.textContent = message;
  region.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, duration);
}

export async function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.csrfToken) {
    headers['X-CSRF-Token'] = state.csrfToken;
  }
  if (options.body && !(options.body instanceof FormData) && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'same-origin'
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    if (res.status === 401 && data && data.code === 'SESSION_EXPIRED') {
      state.user = null;
      state.sessionExpired = true;
      showToast('Your session has expired. Please log in again.');
    }
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export async function bootstrapSessionAndStore(isPreview = false) {
  const [authData, sfData, cartData] = await Promise.all([
    apiFetch('/api/auth/me'),
    apiFetch(`/api/storefront${isPreview ? '?preview=1' : ''}`),
    apiFetch('/api/cart')
  ]);
  state.user = authData.user;
  state.csrfToken = authData.csrfToken;
  state.sessionExpired = authData.sessionExpired;
  state.storefront = sfData;
  state.cart = cartData;

  if (state.user && !state.checkoutDraft.email) {
    state.checkoutDraft.email = state.user.email || '';
    state.checkoutDraft.phone = state.user.phone || '';
    state.checkoutDraft.recipient_name = state.user.name || '';
  }
}

export function formatKLDate(isoStr) {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleString('en-MY', {
      timeZone: 'Asia/Kuala_Lumpur',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (_) {
    return isoStr;
  }
}

export function getPaymentBadgeClass(status) {
  if (status === 'paid') return 'badge badge-paid';
  if (status === 'under_review' || status === 'awaiting_payment' || status === 'refund_pending') return 'badge badge-review';
  return 'badge badge-alert';
}

export function getFulfilmentBadgeClass(status) {
  if (status === 'shipped' || status === 'delivered') return 'badge badge-paid';
  if (status === 'processing' || status === 'unfulfilled') return 'badge badge-draft';
  return 'badge badge-alert';
}
