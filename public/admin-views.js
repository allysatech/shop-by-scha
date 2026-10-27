import {
  state,
  escapeHtml,
  formatKLDate,
  getPaymentBadgeClass,
  getFulfilmentBadgeClass,
  MALAYSIAN_COURIERS,
  detectCourierFromTracking
} from './state.js';


function recordCards(records, type) {
 return `<div class="mobile-card-list">${records.map(r=>{
  const href=type==='product'?`/admin/products/${r.id}`:type==='inventory'?`/admin/inventory/${r.id}`:type==='customer'?`/admin/customers/${r.id}`:type==='review'?`/admin/payment-reviews?orderId=${r.id}`:`/admin/orders/${r.id}`;
  const title=r.title || r.name || r.order_number || r.sku;
  const detail=type==='product'?`${r.brand} / ${r.price_formatted} / ${r.publish_status}`:type==='inventory'?`On hand ${r.on_hand} / Reserved ${r.reserved} / Available ${r.available}`:type==='customer'?`${r.email} / ${r.orders_count} orders`:`${r.customer_name} / ${r.total_formatted} / ${r.payment_status_label || r.payment_status} / ${r.fulfilment_status_label || r.fulfilment_status}`;
  return `<a class="admin-record-card" href="${escapeHtml(href)}" data-nav><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p><span>View details →</span></a>`;
 }).join('')}</div>`;
}

export function renderAdminLoginPage(mode = 'login', errorMsg = '') {
  return `
    <main id="main-content" class="page-container admin-login-container">
      <div class="card-panel admin-login-card">
        <!-- Left Brand Panel (Matches Wireframe Page 12) -->
        <div class="admin-login-brand-panel">
          <div>
            <img src="/images/logo.png" alt="Shop by SCHA" class="admin-login-logo" />
            <p style="font-size:18px;font-weight:600;color:var(--charcoal);margin:0 0 20px;">
              A quiet workspace<br/>for your growing shop.
            </p>
          </div>
          <div style="background:rgba(255,255,255,0.65);border:1.5px dashed var(--pink-editorial);border-radius:var(--radius-sm);padding:20px;text-align:center;">
            <strong style="font-size:12px;letter-spacing:0.08em;">PRIVATE ADMIN WORKSPACE</strong>
            <div style="font-size:11.5px;color:var(--text-muted);margin-top:4px;">
              Provisioned administrator access only · Server-enforced role guardrails
            </div>
          </div>
        </div>

        <!-- Right Login Form -->
        <div style="display:flex;flex-direction:column;justify-content:center;">
          <div style="margin-bottom:12px;">
            <span class="badge badge-ref">PRIVATE WORKSPACE</span>
          </div>
          <h1 style="font-family:var(--font-display);font-size:clamp(1.5rem,3vw,1.8rem);font-weight:800;margin:0 0 18px;">
            ${mode === 'forgot' ? 'Admin password recovery' : 'Admin login'}
          </h1>

          ${errorMsg ? `
            <div style="background:var(--status-alert-bg);color:var(--status-alert-text);padding:10px 14px;border-radius:var(--radius-sm);margin-bottom:14px;font-size:13px;font-weight:600;">
              ${escapeHtml(errorMsg)}
            </div>
          ` : ''}

          ${mode === 'forgot' ? `
            <form id="admin-forgot-form">
              <div class="field-group">
                <label class="field-label" for="af-email">Provisioned Admin Email</label>
                <input id="af-email" type="email" name="email" class="input-field" placeholder="admin@shopbyscha.my" required />
              </div>
              <button type="submit" class="btn-capsule-primary" style="width:100%;margin-bottom:14px;">Generate Admin Recovery Token</button>
            </form>
            <div id="admin-reset-box"></div>
            <a href="/admin/login" data-nav style="font-size:13px;color:var(--rose-deep);font-weight:700;">&lt; Back to Admin login</a>
          ` : `
            <form id="admin-login-form">
              <div class="field-group">
                <label class="field-label" for="al-email">Admin email</label>
                <input id="al-email" type="email" name="email" class="input-field" placeholder="Your work email" required />
              </div>
              <div class="field-group">
                <label class="field-label" for="al-pass">Password</label>
                <input id="al-pass" type="password" name="password" class="input-field" placeholder="********" required />
              </div>
              <div id="admin-mfa-group" class="field-group" style="display:none;">
                <label class="field-label" for="al-mfa">MFA Verification Code</label>
                <input id="al-mfa" type="text" name="mfa_code" class="input-field" placeholder="261026" />
              </div>

              <div style="margin-bottom:16px;font-size:13px;">
                <a href="/admin/forgot-password" data-nav style="color:var(--rose-deep);font-weight:600;">Forgot password?</a>
              </div>

              <button type="submit" class="btn-capsule-primary" style="width:100%;margin-bottom:14px;">
                Log in to dashboard
              </button>
            </form>

            <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid var(--border-warm);font-size:12.5px;">
              <a href="/" data-nav style="color:var(--text-muted);font-weight:600;">Back to storefront &gt;</a>
              <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
                <span class="badge badge-draft">NO SIGN-UP</span>
                ${state.storefront?.sandbox ? `<button type="button" class="nav-btn" data-action="fill-demo-admin" style="font-size:12px;color:var(--rose-deep);font-weight:700;">
                  Fill Provisioned Admin
                </button>` : ''}
              </div>
            </div>
          `}
        </div>
      </div>
    </main>
  `;
}

export function renderAdminShell(activeModule, innerHtml) {
  const navItems = [
    { key: 'overview', label: 'Overview', href: '/admin' },
    { key: 'products', label: 'Products', href: '/admin/products' },
    { key: 'inventory', label: 'Inventory', href: '/admin/inventory' },
    { key: 'orders', label: 'Orders', href: '/admin/orders' },
    { key: 'payment-reviews', label: 'Payment reviews', href: '/admin/payment-reviews' },
    { key: 'customers', label: 'Customers', href: '/admin/customers' },
    { key: 'analytics', label: 'Analytics', href: '/admin/analytics' },
    { key: 'content', label: 'Content', href: '/admin/content' },
    { key: 'settings', label: 'Settings', href: '/admin/settings' }
  ];

  return `
    <div class="admin-shell">
      <button type="button" class="admin-menu-toggle btn-capsule-secondary" data-action="toggle-admin-menu" aria-expanded="false">Menu</button><aside class="admin-sidebar" aria-label="Admin Workspace Navigation">
        <div class="admin-sidebar-header">
          <a href="/admin" data-nav aria-label="Shop by SCHA Admin">
            <img src="/images/logo.png" alt="Shop by SCHA" class="admin-sidebar-logo" />
          </a>
          <div class="admin-mobile-quick-actions">
            <a href="/" data-nav class="admin-nav-item"><span>Store &gt;</span></a>
            <button type="button" class="admin-nav-item" data-action="logout" style="border:none;background:none;color:var(--rose-deep);">
              <span>Log out</span>
            </button>
          </div>
        </div>

        <nav class="admin-nav-links-list" aria-label="Admin Modules">
          ${navItems.map((it) => `
            <a href="${it.href}" data-nav class="admin-nav-item ${activeModule === it.key ? 'active' : ''}">
              <span>${escapeHtml(it.label)}</span>
            </a>
          `).join('')}
        </nav>

        <div class="admin-sidebar-footer">
          <a href="/" data-nav class="admin-nav-item"><span>View store &gt;</span></a>
          <button type="button" class="admin-nav-item" data-action="logout" style="border:none;background:none;width:100%;text-align:left;color:var(--rose-deep);">
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <main id="main-content" class="admin-main">
        <div class="admin-topbar">
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;">
            <span class="badge badge-ref">ADMIN: ${escapeHtml(state.user?.email || '')}</span>
            ${state.adminIncludeDemo ? `<span class="badge badge-demo">DEMO DATA INCLUDED</span>` : `<span class="badge badge-paid">LIVE CONFIRMED ONLY</span>`}
          </div>
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;font-size:13px;">
            <label style="display:${state.storefront?.sandbox ? 'flex' : 'none'};align-items:center;gap:6px;cursor:pointer;font-weight:600;">
              <input type="checkbox" id="admin-toggle-demo" ${state.adminIncludeDemo ? 'checked' : ''} />
              <span>Include explicit DEMO dataset</span>
            </label>
            <a href="/" data-nav style="color:var(--rose-deep);font-weight:700;">View store</a>
          </div>
        </div>
        ${innerHtml}
      </main>
    </div>
  `;
}

// =========================================================================
// ADMIN 1: OVERVIEW (/admin) — Matches Wireframe Page 13
// =========================================================================
export function renderAdminOverview(data) {
  const k = data.kpis || {};
  const trend = data.sales_trend || [];

  // Build simple SVG polyline for Sales Trend
  const maxVal = Math.max(1000, ...trend.map((t) => t.amount_minor));
  const points = trend.length > 0
    ? trend.map((t, idx) => {
        const x = trend.length === 1 ? 200 : Math.round((idx / (trend.length - 1)) * 380) + 10;
        const y = 110 - Math.round((t.amount_minor / maxVal) * 85);
        return `${x},${y}`;
      }).join(' ')
    : '10,100 200,100 390,100';

  const html = `
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;margin-bottom:20px;">
      <h1 class="page-title" style="font-size:clamp(1.4rem,2.6vw,1.7rem);">Store overview</h1>
      <form id="admin-overview-date-form" class="admin-date-filter-form">
        <span>Date range:</span>
        <input type="date" name="date_from" value="${escapeHtml(data.date_from)}" class="input-field admin-date-input" />
        <span>to</span>
        <input type="date" name="date_to" value="${escapeHtml(data.date_to)}" class="input-field admin-date-input" />
        <button type="submit" class="btn-capsule-secondary" style="padding:7px 14px;">Filter</button>
      </form>
    </div>

    <!-- 5 Clickable KPI Cards (Each links to the matching filtered list!) -->
    <div class="admin-kpi-grid">
      <a href="/admin/analytics" data-nav class="kpi-card">
        <span class="kpi-label">Confirmed sales ${data.include_demo ? '[DEMO]' : ''}</span>
        <span class="kpi-value">${escapeHtml(k.confirmed_sales_formatted || 'RM0.00')}</span>
        <span class="kpi-link">Revenue view &gt;</span>
      </a>
      <a href="/admin/orders?payment_status=paid" data-nav class="kpi-card">
        <span class="kpi-label">Paid orders</span>
        <span class="kpi-value">${k.paid_orders_count || 0}</span>
        <span class="kpi-link">Paid orders &gt;</span>
      </a>
      <a href="/admin/payment-reviews" data-nav class="kpi-card">
        <span class="kpi-label">Payments to review</span>
        <span class="kpi-value">${k.payments_to_review_count || 0}</span>
        <span class="kpi-link">Payment review queue &gt;</span>
      </a>
      <a href="/admin/orders?payment_status=paid&fulfilment_status=unfulfilled" data-nav class="kpi-card">
        <span class="kpi-label">Orders to fulfil</span>
        <span class="kpi-value">${k.orders_to_fulfil_count || 0}</span>
        <span class="kpi-link">Fulfilment queue &gt;</span>
      </a>
      <a href="/admin/inventory?filter=low-stock" data-nav class="kpi-card">
        <span class="kpi-label">Low-stock SKUs</span>
        <span class="kpi-value">${k.low_stock_skus_count || 0}</span>
        <span class="kpi-link">Inventory alerts &gt;</span>
      </a>
    </div>

    <div class="checkout-grid">
      <div style="display:flex;flex-direction:column;gap:20px;min-width:0;">
        <!-- Sales Trend Chart -->
        <div class="card-panel">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
            <h2 style="font-size:17px;font-weight:800;margin:0;">Sales trend</h2>
            <span style="font-size:12px;color:var(--text-muted);">Net paid sales / selected dates</span>
          </div>
          <svg viewBox="0 0 400 130" style="width:100%;height:140px;background:var(--bg-offwhite);border-radius:var(--radius-sm);padding:8px;">
            <polyline fill="none" stroke="#8D3656" stroke-width="3" points="${points}" />
          </svg>
          <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--text-muted);margin-top:8px;">
            <span>${escapeHtml(data.date_from)}</span>
            <span>Confirmed paid minus completed refunds</span>
            <span>${escapeHtml(data.date_to)}</span>
          </div>
        </div>

        <!-- Recent Orders -->
        <div class="card-panel">
          <h2 style="font-size:17px;font-weight:800;margin:0 0 12px;">Recent orders</h2>
          <div class="table-scroll">
            <table class="data-table compact-mobile-table">
              <thead>
                <tr>
                  <th>ORDER</th>
                  <th>TOTAL</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                ${(data.recent_orders || []).map((o) => `
                  <tr>
                    <td>
                      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;">
                        <a href="/admin/orders/${o.id}" data-nav style="font-weight:700;color:var(--rose-deep);">#${escapeHtml(o.order_number)}</a>
                        ${o.is_demo ? `<span class="badge badge-demo">DEMO</span>` : ''}
                      </div>
                    </td>
                    <td style="font-weight:700;white-space:nowrap;">${escapeHtml(o.total_formatted)}</td>
                    <td>
                      <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">
                        <span class="${getPaymentBadgeClass(o.payment_status)}">${escapeHtml(o.payment_status_label)}</span>
                        <span class="${getFulfilmentBadgeClass(o.fulfilment_status)}">${escapeHtml(o.fulfilment_status_label)}</span>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:20px;min-width:0;">
        <!-- Best-selling Products -->
        <div class="card-panel">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;">
            <h2 style="font-size:17px;font-weight:800;margin:0;">Best-selling products</h2>
            <a href="/admin/products" data-nav style="font-size:12px;color:var(--rose-deep);font-weight:700;">View all &gt;</a>
          </div>
          ${(data.top_products || []).length === 0 ? `
            <p style="font-size:13px;color:var(--text-muted);margin:0;">No confirmed product sales in this period.</p>
          ` : `
            <div style="display:flex;flex-direction:column;gap:10px;">
              ${data.top_products.map((tp) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--bg-offwhite);border-radius:var(--radius-sm);font-size:13px;">
                  <div>
                    <strong>${escapeHtml(tp.title)}</strong>
                    <div style="font-size:11.5px;color:var(--text-muted);">SKU: ${escapeHtml(tp.sku)} · Units: ${tp.units_sold}</div>
                  </div>
                  <strong>${escapeHtml(tp.revenue_formatted)}</strong>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <!-- Inventory Snapshot -->
        <div class="card-panel">
          <h2 style="font-size:17px;font-weight:800;margin:0 0 12px;">Inventory snapshot</h2>
          <div style="display:flex;flex-direction:column;gap:12px;font-size:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding-bottom:8px;border-bottom:1px solid var(--border-warm);">
              <span>Low stock SKUs</span><strong style="color:var(--rose-deep);flex-shrink:0;">${k.low_stock_skus_count || 0}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding-bottom:8px;border-bottom:1px solid var(--border-warm);">
              <span>Out of stock SKUs</span><strong style="color:var(--status-alert-text);flex-shrink:0;">${k.out_of_stock_skus_count || 0}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding-bottom:8px;border-bottom:1px solid var(--border-warm);">
              <span>Active sellable SKUs</span><strong style="flex-shrink:0;">${k.active_skus_count || 0}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
              <span>Unconfirmed draft references (REF-01..12)</span><strong style="flex-shrink:0;">${k.draft_references_count || 0}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  return renderAdminShell('overview', html);
}

// =========================================================================
// ADMIN 2: PRODUCTS CRUD & EDITOR (/admin/products, /admin/products/new, /admin/products/[id])
// Matches Wireframe Page 14
// =========================================================================
export function renderAdminProductsList(products = []) {
  const ref05 = products.find((p) => p.reference_id === 'REF-05');
  const ref06 = products.find((p) => p.reference_id === 'REF-06');

  const html = `
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;margin-bottom:20px;">
      <div>
        <h1 class="page-title" style="font-size:26px;">Products (${products.length})</h1>
        <p style="margin:4px 0 0;font-size:13px;color:var(--text-muted);">
          All 12 supplied references (REF-01 to REF-12) remain in Draft with null price/stock until confirmed.
        </p>
      </div>
      <a href="/admin/products/new" data-nav class="btn-capsule-primary" style="min-width:auto;padding:10px 22px;">+ Add product</a>
    </div>

    <!-- REF-05 / REF-06 Duplicate Review Banner -->
    ${(ref05 || ref06) ? `
      <div style="background:var(--pink-soft);border:1px solid var(--pink-editorial);border-radius:var(--radius-md);padding:16px 20px;margin-bottom:20px;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:14px;">
        <div style="font-size:13px;max-width:680px;">
          <strong style="color:var(--rose-deep);">Duplicate / Model Review: REF-05 &amp; REF-06 (Jacquemus Pink Bag)</strong><br/>
          References 05 and 06 may depict the same pink top-handle bag. Current resolution status: <strong>${escapeHtml(ref06?.duplicate_resolution_status || 'pending')}</strong>.
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          <button type="button" class="btn-capsule-secondary" data-dup-resolve="merge_into_ref06" style="padding:7px 14px;font-size:12px;">
            Combine into one product gallery (REF-06 + REF-05)
          </button>
          <button type="button" class="btn-capsule-secondary" data-dup-resolve="confirm_distinct" style="padding:7px 14px;font-size:12px;">
            Confirm as distinct products
          </button>
          <button type="button" class="nav-btn" data-dup-resolve="reset_review" style="font-size:12px;">Reset</button>
        </div>
      </div>
    ` : ''}

    <div class="card-panel">
      ${recordCards(products,'product')}<div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>PRODUCT / SKU</th>
              <th>CATEGORY</th>
              <th>PRICE</th>
              <th>STOCK</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            ${products.map((p) => `
              <tr>
                <td>
                  <div style="display:flex;align-items:center;gap:12px;">
                    <img src="${escapeHtml(p.primary_image)}" alt="${escapeHtml(p.title)}" style="width:44px;height:44px;object-fit:contain;background:#F7F5F2;border-radius:6px;padding:4px;" />
                    <div>
                      <strong>${escapeHtml(p.title)}</strong>
                      <div style="font-size:12px;color:var(--text-muted);">
                        ${escapeHtml(p.reference_id || 'Custom')} · SKU: ${escapeHtml(p.sellable_sku || 'To confirm')}
                        ${p.duplicate_review_required ? `<span class="badge badge-review" style="margin-left:6px;">Review 05/06</span>` : ''}
                      </div>
                    </div>
                  </div>
                </td>
                <td style="text-transform:capitalize;">${escapeHtml(p.category_slug)}</td>
                <td>${p.price_minor !== null ? `<strong>${escapeHtml(p.price_formatted)}</strong>` : '<span style="color:var(--text-muted);">Pending</span>'}</td>
                <td>${p.stock_quantity !== null ? p.total_available : '<span style="color:var(--text-muted);">TBC</span>'}</td>
                <td>
                  <span class="badge ${p.publish_status === 'published' ? 'badge-paid' : 'badge-draft'}">
                    ${escapeHtml(p.publish_status)}
                  </span>
                </td>
                <td>
                  <div style="display:flex;gap:10px;font-size:12.5px;font-weight:700;">
                    <a href="/products/${encodeURIComponent(p.slug)}?preview=1" data-nav style="color:var(--text-muted);">Preview</a>
                    <a href="/admin/products/${p.id}" data-nav style="color:var(--rose-deep);">Edit</a>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  return renderAdminShell('products', html);
}

export function renderAdminProductEditor(product = null) {
  const isNew = !product;
  const p = product || {
    title: '',
    slug: '',
    brand: 'Gentle Monster',
    category_slug: 'eyewear',
    reference_id: '',
    sellable_sku: '',
    model: '',
    price_minor: null,
    stock_quantity: null,
    low_stock_threshold: 3,
    publish_status: 'draft',
    description: '',
    notes: '',
    reference_colour_description: '',
    media: []
  };

  const priceVal = p.price_minor !== null && p.price_minor > 0 ? (p.price_minor / 100).toFixed(2) : '';
  const stockVal = p.stock_quantity !== null ? String(p.stock_quantity) : '';

  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <div>
        <h1 class="page-title" style="font-size:26px;">
          ${isNew ? 'Create New Product' : `Product editor — ${escapeHtml(p.reference_id || p.title)}`}
        </h1>
      </div>
      <a href="/admin/products" data-nav class="btn-capsule-secondary" style="padding:8px 18px;">&lt; Back to Products</a>
    </div>

    <form id="admin-product-editor-form" data-product-id="${isNew ? '' : p.id}" class="card-panel"><div class="form-grid-2"><div class="field-group"><label class="field-label" for="stock-type">Availability type</label><select id="stock-type" name="stock_type" class="input-field"><option value="unconfirmed">Confirm availability</option><option value="ready_stock" ${p?.stock_type==='ready_stock'?'selected':''}>Ready stock</option><option value="preorder" ${p?.stock_type==='preorder'?'selected':''}>Preorder</option></select></div><div class="field-group"><label class="field-label" for="lead-time">Shipping / preorder lead time</label><input id="lead-time" class="input-field" name="shipping_returns_note" value="${escapeHtml(p?.shipping_returns_note || '')}" placeholder="Merchant-confirmed dispatch estimate" /></div></div>
<details class="field-group"><summary>Variants: size, colour or shade</summary><label class="field-label" for="variants-json">Confirmed sellable variants (JSON)</label><textarea ${isNew ? 'disabled' : ''} id="variants-json" name="variants_json" rows="7" class="textarea-field">${escapeHtml(JSON.stringify((p.variants||[]).map(v=>({id:v.id,sku:v.sku,title:v.title,attributes:v.attributes,price_minor:v.price_minor,on_hand:v.on_hand,is_active:v.is_active,version:v.version})),null,2))}</textarea><small>Save a new draft first to edit variants. Prices are integer sen. Keep existing IDs. Stock cannot be below reserved units. Disable unavailable variants instead of deleting purchase history.</small></details>
<details class="field-group"><summary>Product specifications</summary><label class="field-label" for="specifications-json">Merchant-confirmed specifications</label><textarea id="specifications-json" name="specifications_json" class="textarea-field" rows="5">${escapeHtml(JSON.stringify(p.specifications||{},null,2))}</textarea></details>

      <div class="form-grid-2">
        <div class="field-group">
          <label class="field-label">Product title</label>
          <input type="text" name="title" class="input-field" value="${escapeHtml(p.title)}" required />
        </div>
        <div class="field-group">
          <label class="field-label">URL Slug</label>
          <input type="text" name="slug" class="input-field" value="${escapeHtml(p.slug)}" placeholder="auto-generated-from-title" />
        </div>
      </div>

      <div class="form-grid-3">
        <div class="field-group">
          <label class="field-label">Sellable SKU (Unique)</label>
          <input type="text" name="sellable_sku" class="input-field" value="${escapeHtml(p.sellable_sku || '')}" placeholder="To confirm - e.g. SCHA-REF06-PNK" />
        </div>
        <div class="field-group">
          <label class="field-label">Category</label>
          <select name="category_slug" class="select-field">
            ${['eyewear', 'bags', 'beauty', 'footwear'].map((c) => `
              <option value="${c}" ${p.category_slug === c ? 'selected' : ''}>${c.toUpperCase()}</option>
            `).join('')}
          </select>
        </div>
        <div class="field-group">
          <label class="field-label">Brand</label>
          <input type="text" name="brand" class="input-field" value="${escapeHtml(p.brand)}" required />
        </div>
      </div>

      <!-- Images / Media Gallery -->
      <div class="field-group">
        <label class="field-label">Images / Gallery (Slots P01–P05)</label>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-bottom:10px;">
          ${(p.media || []).map((m) => `
            <div style="border:1px solid var(--border-warm);border-radius:var(--radius-sm);padding:10px;text-align:center;background:var(--bg-offwhite);">
              <img src="${escapeHtml(m.path)}" alt="${escapeHtml(m.alt)}" style="height:80px;max-width:100%;object-fit:contain;margin-bottom:6px;" />
              <div style="font-size:11px;font-weight:700;">${escapeHtml(m.slot_code)}</div>
            </div>
          `).join('')}
          ${!isNew ? `
            <label style="border:1.5px dashed var(--pink-editorial);background:var(--pink-subtle);border-radius:var(--radius-sm);padding:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;text-align:center;">
              <strong style="font-size:12px;color:var(--rose-deep);">UPLOAD</strong>
              <span style="font-size:11px;color:var(--text-muted);">Additional media</span>
              <input type="file" id="admin-upload-prod-media" data-product-id="${p.id}" accept="image/png,image/jpeg" style="display:none;" />
            </label>
          ` : ''}
        </div>
      </div>

      <div class="form-grid-3">
        <div class="field-group">
          <label class="field-label">Price (RM)</label>
          <input type="text" name="price_myr" class="input-field" value="${escapeHtml(priceVal)}" placeholder="To confirm (e.g. 890.00)" />
        </div>
        <div class="field-group">
          <label class="field-label">Stock quantity (On hand)</label>
          <input type="number" name="stock_quantity" class="input-field" value="${escapeHtml(stockVal)}" placeholder="To confirm (e.g. 10)" />
        </div>
        <div class="field-group">
          <label class="field-label">Status</label>
          <select name="publish_status" class="select-field">
            <option value="draft" ${p.publish_status === 'draft' ? 'selected' : ''}>Draft</option>
            <option value="published" ${p.publish_status === 'published' ? 'selected' : ''}>Published (Requires SKU, Price &amp; Stock)</option>
            <option value="archived" ${p.publish_status === 'archived' ? 'selected' : ''}>Archived</option>
          </select>
        </div>
      </div>

      <div class="form-grid-3">
        <div class="field-group">
          <label class="field-label">Confirmed Model / Range</label>
          <input type="text" name="model" class="input-field" value="${escapeHtml(p.model || '')}" placeholder="Official model / shade / size" />
        </div>
        <div class="field-group">
          <label class="field-label">Colour Description</label>
          <input type="text" name="reference_colour_description" class="input-field" value="${escapeHtml(p.reference_colour_description || '')}" placeholder="Pink / Black / Silver" />
        </div>
        <div class="field-group">
          <label class="field-label">Low-stock Threshold</label>
          <input type="number" name="low_stock_threshold" class="input-field" value="${escapeHtml(p.low_stock_threshold ?? 3)}" />
        </div>
      </div>

      <div class="field-group">
        <label class="field-label">Description</label>
        <textarea name="description" rows="3" class="textarea-field">${escapeHtml(p.description || '')}</textarea>
      </div>

      <div class="field-group">
        <label class="field-label">Internal Reference / Verification Notes</label>
        <textarea name="notes" rows="2" class="textarea-field">${escapeHtml(p.notes || '')}</textarea>
      </div>

      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;margin-top:20px;padding-top:16px;border-top:1px solid var(--border-warm);">
        <div style="display:flex;gap:10px;">
          ${!isNew ? `
            <a href="/products/${encodeURIComponent(p.slug)}" data-nav class="btn-capsule-secondary">Preview on Storefront</a>
            <button type="button" class="btn-capsule-secondary" data-action="delete-or-archive-product" data-product-id="${p.id}" style="color:var(--status-alert-text);">
              Delete Draft / Archive
            </button>
          ` : ''}
        </div>
        <div style="display:flex;gap:12px;">
          <button type="submit" data-submit-status="draft" class="btn-capsule-secondary">Save draft</button>
          <button type="submit" data-submit-status="published" class="btn-capsule-primary">Publish</button>
        </div>
      </div>
    </form>
  `;

  return renderAdminShell('products', html);
}

// =========================================================================
// ADMIN 3: INVENTORY (/admin/inventory) — Matches Wireframe Page 15 Left
// =========================================================================
export function renderAdminInventory(invData) {
  const variants = invData.variants || [];
  const drafts = invData.unconfirmed_drafts || [];
  const movements = invData.movements || [];

  const html = `
    <h1 class="page-title" style="font-size:26px;margin-bottom:6px;">Inventory</h1>
    <p style="margin:0 0 20px;color:var(--text-muted);font-size:13.5px;">
      <strong>Available = on hand - reserved</strong>. Unknown draft reference stock remains <em>TBC (null)</em> and is never treated as zero available real inventory.
    </p>

    <div class="checkout-grid" style="margin-bottom:24px;">
      <div class="card-panel">
        <h2 style="font-size:17px;font-weight:800;margin:0 0 12px;">Confirmed Sellable SKUs</h2>
        ${recordCards(variants,'inventory')}<div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>PRODUCT / VARIANT</th>
                <th>ON HAND</th>
                <th>RESERVED</th>
                <th>AVAILABLE</th>
              </tr>
            </thead>
            <tbody>
              ${variants.map((v) => `
                <tr>
                  <td>
                    <strong>${escapeHtml(v.sku)}</strong>
                    ${v.is_demo ? `<span class="badge badge-demo" style="margin-left:4px;">DEMO</span>` : ''}
                  </td>
                  <td>${escapeHtml(v.product_title)} (${escapeHtml(v.title)})</td>
                  <td>${v.on_hand}</td>
                  <td>${v.reserved}</td>
                  <td>
                    <strong style="color:${v.available <= 0 ? 'var(--status-alert-text)' : v.is_low_stock ? 'var(--status-review-text)' : 'var(--status-paid-text)'};">
                      ${v.available}
                    </strong>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Adjust Stock Panel with Before/After Preview -->
      <div class="card-panel">
        <h2 style="font-size:17px;font-weight:800;margin:0 0 12px;">Adjust stock</h2>
        <form id="admin-adjust-stock-form">
          <div class="field-group">
            <label class="field-label" for="inv-sku-select">Select Sellable SKU</label>
            <select id="inv-sku-select" name="variant_id" class="select-field" required>
              ${variants.map((v) => `
                <option value="${v.id}" data-onhand="${v.on_hand}" data-version="${v.version}" data-sku="${escapeHtml(v.sku)}">
                  ${escapeHtml(v.sku)} — On hand: ${v.on_hand} (Reserved: ${v.reserved}, Available: ${v.available})
                </option>
              `).join('')}
            </select>
          </div>
          <div class="form-grid-2">
            <div class="field-group">
              <label class="field-label" for="inv-delta">Delta (+ / - integer)</label>
              <input id="inv-delta" type="number" name="delta" class="input-field" value="10" required />
            </div>
            <div class="field-group">
              <label class="field-label" for="inv-reason">Reason (Required)</label>
              <input id="inv-reason" type="text" name="reason" class="input-field" placeholder="e.g. Stock received / recount" required />
            </div>
          </div>
          <div id="inv-preview-banner" style="background:var(--pink-soft);padding:10px 14px;border-radius:var(--radius-sm);font-size:13px;font-weight:700;margin-bottom:14px;">
            Preview: On hand adjustment will be logged with actor, timestamp and movement history.
          </div>
          <button type="submit" class="btn-capsule-primary" style="width:100%;">
            Confirm adjustment
          </button>
        </form>
      </div>
    </div>

    <!-- Unconfirmed Draft References (Stock = NULL / TBC) -->
    <div class="card-panel" style="margin-bottom:24px;">
      <h2 style="font-size:17px;font-weight:800;margin:0 0 8px;">Unconfirmed Draft References (${drafts.length})</h2>
      <p style="font-size:12.5px;color:var(--text-muted);margin:0 0 12px;">
        These supplied catalogue references have <code>stock_quantity = null</code> until confirmed in Product Editor.
      </p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${drafts.map((d) => `
          <a href="/admin/products/${d.id}" data-nav class="badge badge-draft" style="padding:6px 12px;">
            ${escapeHtml(d.reference_id)}: ${escapeHtml(d.title)} · Stock: TBC
          </a>
        `).join('')}
      </div>
    </div>

    <!-- Stock Movement Audit Log -->
    <div class="card-panel">
      <h2 style="font-size:17px;font-weight:800;margin:0 0 12px;">Stock movement history</h2>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>TIME</th>
              <th>SKU</th>
              <th>TYPE</th>
              <th>ON HAND (BEFORE &gt; AFTER)</th>
              <th>RESERVED (BEFORE &gt; AFTER)</th>
              <th>REASON &amp; ACTOR</th>
            </tr>
          </thead>
          <tbody>
            ${movements.map((m) => `
              <tr>
                <td>${escapeHtml(formatKLDate(m.created_at))}</td>
                <td><strong>${escapeHtml(m.sku)}</strong></td>
                <td><span class="badge badge-ref">${escapeHtml(m.movement_type)}</span></td>
                <td>${m.before_on_hand} &gt; <strong>${m.after_on_hand}</strong> (${m.delta_on_hand >= 0 ? `+${m.delta_on_hand}` : m.delta_on_hand})</td>
                <td>${m.before_reserved} &gt; <strong>${m.after_reserved}</strong></td>
                <td>${escapeHtml(m.reason)} <span style="color:var(--text-muted);">(${escapeHtml(m.actor_email)})</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  return renderAdminShell('inventory', html);
}

// =========================================================================
// ADMIN 4: PAYMENT REVIEWS (/admin/payment-reviews) — Matches Wireframe Page 10
// =========================================================================
export function renderAdminPaymentReviews(orders = [], selectedOrderId = null) {
  const activeOrder = orders.find((o) => Number(o.id) === Number(selectedOrderId)) || orders[0] || null;
  const latestSub = activeOrder && activeOrder.submissions && activeOrder.submissions[0] ? activeOrder.submissions[0] : null;
  const payInstr = activeOrder?.payment_instructions || {};

  const html = `
${recordCards(orders,'review')}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <div>
        <h1 class="page-title" style="font-size:26px;">Payment reviews</h1>
        <p style="margin:4px 0 0;font-size:13px;color:var(--text-muted);">
          Verify actual received transactions in the seller bank statement before confirming payment. Customer receipt upload alone never marks an order paid.
        </p>
      </div>
    </div>

    ${orders.length === 0 ? `
      <div class="card-panel" style="text-align:center;padding:48px;">
        <h2>No orders currently in the payment review queue</h2>
      </div>
    ` : `
      <div class="payment-review-workspace">
        <!-- Column 1: Review Queue -->
        <div class="card-panel" style="padding:18px;">
          <h2 style="font-size:16px;font-weight:800;margin:0 0 12px;">Review queue (${orders.length})</h2>
          ${orders.map((o) => `
            <button type="button" class="review-queue-item ${activeOrder && activeOrder.id === o.id ? 'active' : ''}" data-select-review-order="${o.id}">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <strong>#${escapeHtml(o.order_number)}</strong>
                ${o.is_demo ? `<span class="badge badge-demo">DEMO</span>` : ''}
              </div>
              <div style="font-size:12px;color:var(--text-muted);">${escapeHtml(o.payment_status_label)} · ${escapeHtml(o.total_formatted)}</div>
              ${o.reconciliation_required ? `<div style="font-size:11px;color:var(--status-alert-text);font-weight:700;margin-top:4px;">Reconciliation Flagged</div>` : ''}
            </button>
          `).join('')}
        </div>

        <!-- Column 2: Order Summary & Private Receipt Preview -->
        ${activeOrder ? `
          <div class="card-panel">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <h2 style="font-size:20px;font-weight:800;margin:0;">Order #${escapeHtml(activeOrder.order_number)}</h2>
              <span class="${getPaymentBadgeClass(activeOrder.payment_status)}">${escapeHtml(activeOrder.payment_status_label)}</span>
            </div>
            <p style="font-size:13px;color:var(--text-muted);margin:0 0 14px;">
              Due: <strong>${escapeHtml(activeOrder.total_formatted)}</strong> ${activeOrder.is_demo ? '[demo]' : ''} | QR instructions v${escapeHtml(payInstr.version_number || 1)} (${escapeHtml(payInstr.recipient_name || 'Seller')})
            </p>

            ${activeOrder.reconciliation_required ? `
              <div style="background:var(--status-alert-bg);color:var(--status-alert-text);padding:10px 14px;border-radius:var(--radius-sm);margin-bottom:14px;font-size:12.5px;font-weight:600;">
                Reconciliation Alert: ${escapeHtml(activeOrder.reconciliation_reason)}
              </div>
            ` : ''}

            <div style="background:var(--pink-soft);border:1.5px dashed var(--pink-editorial);border-radius:var(--radius-md);min-height:200px;padding:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;margin-bottom:16px;">
              <strong style="color:var(--rose-deep);font-size:14px;">PRIVATE RECEIPT PREVIEW</strong>
              <span style="font-size:12px;color:var(--text-muted);margin-top:4px;">
                ${latestSub ? `${escapeHtml(latestSub.receipt_original_name)} (${escapeHtml(latestSub.receipt_mime_type)})` : 'No receipt uploaded by customer yet'}
              </span>
              ${latestSub && latestSub.receipt_mime_type.startsWith('image/') ? `
                <img src="${escapeHtml(latestSub.receipt_url)}" alt="Customer uploaded receipt" style="max-height:140px;margin-top:12px;border-radius:6px;border:1px solid var(--border-warm);" />
              ` : ''}
            </div>

            <div style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">
              <p style="margin:0 0 4px;"><strong>Declared reference:</strong> ${escapeHtml(latestSub ? latestSub.declared_reference : '[awaiting customer submission]')}</p>
              <p style="margin:0;"><strong>Declared amount / time:</strong> ${latestSub ? `${escapeHtml(latestSub.declared_amount_formatted)} · ${escapeHtml(formatKLDate(latestSub.declared_paid_at || latestSub.created_at))}` : '—'}</p>
            </div>

            ${latestSub ? `
              <a href="${escapeHtml(latestSub.receipt_url)}" target="_blank" rel="noopener" class="btn-capsule-secondary" style="width:100%;">
                Open private receipt
              </a>
            ` : ''}
          </div>

          <!-- Column 3: Verify Actual Bank Transaction Form -->
          <div class="card-panel">
            <h2 style="font-size:18px;font-weight:800;margin:0 0 14px;">Verify actual bank transaction</h2>
            <form id="admin-payment-verify-form" data-order-id="${activeOrder.id}">
              <div class="field-group">
                <label class="field-label" for="pv-amt">Received amount (RM)</label>
                <input id="pv-amt" type="text" name="received_amount" class="input-field" value="${(Number(activeOrder.total_minor) / 100).toFixed(2)}" placeholder="Enter amount actually received" required />
              </div>

              <div class="field-group">
                <label class="field-label" for="pv-ref">Actual bank transaction reference</label>
                <input id="pv-ref" type="text" name="actual_bank_reference" class="input-field" value="${escapeHtml(latestSub ? `BNK-${latestSub.declared_reference}` : '')}" placeholder="Unique bank reference" required />
              </div>

              <div class="field-group">
                <label class="field-label" for="pv-note">Audit note / resubmission reason</label>
                <input id="pv-note" type="text" name="audit_note" class="input-field" placeholder="Reason or verification note" required />
              </div>

              <label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;font-weight:600;margin:14px 0 18px;cursor:pointer;">
                <input type="checkbox" name="bank_records_checked" style="margin-top:3px;" />
                <span>I checked the actual received transaction in the seller bank records.</span>
              </label>

              <div style="display:flex;flex-direction:column;gap:10px;">
                <button type="submit" data-review-action="confirm_payment" class="btn-capsule-primary" style="width:100%;">
                  Confirm payment
                </button>
                <button type="submit" data-review-action="request_resubmission" class="btn-capsule-secondary" style="width:100%;">
                  Request resubmission
                </button>
              </div>
            </form>
          </div>
        ` : ''}
      </div>
    `}
  `;

  return renderAdminShell('payment-reviews', html);
}

// =========================================================================
// ADMIN 5: ORDERS & DETAIL (/admin/orders, /admin/orders/[id])
// Matches Wireframe Page 15 Right
// =========================================================================
export function renderAdminOrdersList(orders = [], filters = {}) {
  const html = `
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;margin-bottom:20px;">
      <h1 class="page-title" style="font-size:clamp(1.4rem,2.6vw,1.7rem);">Orders (${orders.length})</h1>
      <form id="admin-orders-filter-form" class="admin-orders-filter-form">
        <input type="search" name="q" value="${escapeHtml(filters.q || '')}" class="input-field admin-filter-search" placeholder="Search order ID, customer..." />
        <select name="payment_status" class="select-field admin-filter-select">
          <option value="">All Payment States</option>
          ${['awaiting_payment', 'under_review', 'needs_resubmission', 'paid', 'refund_pending', 'partially_refunded', 'refunded', 'expired_cancelled'].map((s) => `
            <option value="${s}" ${filters.payment_status === s ? 'selected' : ''}>${s}</option>
          `).join('')}
        </select>
        <select name="fulfilment_status" class="select-field admin-filter-select">
          <option value="">All Fulfilment States</option>
          ${['unfulfilled', 'processing', 'shipped', 'delivered', 'cancelled'].map((s) => `
            <option value="${s}" ${filters.fulfilment_status === s ? 'selected' : ''}>${s}</option>
          `).join('')}
        </select>
        <button type="submit" class="btn-capsule-secondary admin-filter-btn">Filter</button>
      </form>
    </div>

    <div class="card-panel">
      ${recordCards(orders,'order')}<div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>ORDER</th>
              <th>CUSTOMER</th>
              <th>DATE</th>
              <th>TOTAL</th>
              <th>PAYMENT</th>
              <th>FULFILMENT</th>
              <th>ACTION</th>
            </tr>
          </thead>
          <tbody>
            ${orders.map((o) => `
              <tr>
                <td>
                  <strong>#${escapeHtml(o.order_number)}</strong>
                  ${o.is_demo ? `<span class="badge badge-demo" style="margin-left:4px;">DEMO</span>` : ''}
                </td>
                <td>${escapeHtml(o.customer_name)}<div style="font-size:11.5px;color:var(--text-muted);">${escapeHtml(o.customer_email)}</div></td>
                <td>${escapeHtml(formatKLDate(o.created_at))}</td>
                <td><strong>${escapeHtml(o.total_formatted)}</strong></td>
                <td><span class="${getPaymentBadgeClass(o.payment_status)}">${escapeHtml(o.payment_status_label)}</span></td>
                <td><span class="${getFulfilmentBadgeClass(o.fulfilment_status)}">${escapeHtml(o.fulfilment_status_label)}</span></td>
                <td><a href="/admin/orders/${o.id}" data-nav style="color:var(--rose-deep);font-weight:700;">Manage &gt;</a></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  return renderAdminShell('orders', html);
}

export function renderAdminOrderDetail(order) {
  const latestShipment = (order.shipments || [])[0] || {};
  const pendingRefund = (order.refunds || []).find((r) => r.status === 'refund_pending');

  const existingTracking = latestShipment.tracking_number || '';
  const initialDetected = detectCourierFromTracking(existingTracking);
  const currentCourier = latestShipment.courier_name || (initialDetected ? initialDetected.courierName : '');
  const courierNames = MALAYSIAN_COURIERS.map((c) => c.name);
  const hasCustomCourier = Boolean(currentCourier && !courierNames.includes(currentCourier));

  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
      <div>
        <h1 class="page-title" style="font-size:26px;">Order #${escapeHtml(order.order_number)}</h1>
        <div style="display:flex;gap:8px;margin-top:6px;">
          <span class="${getPaymentBadgeClass(order.payment_status)}">${escapeHtml(order.payment_status_label)}</span>
          <span class="${getFulfilmentBadgeClass(order.fulfilment_status)}">${escapeHtml(order.fulfilment_status_label)}</span>
          ${order.is_demo ? `<span class="badge badge-demo">DEMO</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:10px;">
        <a href="/admin/payment-reviews?orderId=${order.id}" data-nav class="btn-capsule-secondary" style="padding:8px 16px;">Open in Payment Reviews</a>
        <a href="/admin/orders" data-nav class="btn-capsule-secondary" style="padding:8px 16px;">&lt; All Orders</a>
      </div>
    </div>

    <div class="checkout-grid">
      <div class="card-panel">
        <h2 style="font-size:17px;font-weight:800;margin:0 0 12px;">Purchased Items &amp; Snapshots</h2>
        <div class="table-scroll" style="margin-bottom:18px;">
          <table class="data-table">
            <thead>
              <tr><th>PURCHASED ITEM</th><th>QTY</th><th>AMOUNT</th></tr>
            </thead>
            <tbody>
              ${(order.items || []).map((it) => `
                <tr>
                  <td><strong>${escapeHtml(it.title_snapshot)}</strong> / ${escapeHtml(it.variant_title_snapshot)} (${escapeHtml(it.sku_snapshot)})</td>
                  <td>${it.quantity}</td>
                  <td><strong>${escapeHtml(it.line_total_formatted)}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="background:var(--bg-offwhite);padding:14px;border-radius:var(--radius-sm);margin-bottom:18px;font-size:13px;">
          <strong>Customer + Delivery Address Snapshot</strong><br/>
          ${escapeHtml(order.customer_name)} · ${escapeHtml(order.customer_email)} · ${escapeHtml(order.customer_phone)}<br/>
          ${escapeHtml(order.shipping_address?.line1)}, ${escapeHtml(order.shipping_address?.postcode)} ${escapeHtml(order.shipping_address?.city)}, ${escapeHtml(order.shipping_address?.state)}
        </div>

        <!-- Fulfilment & Courier Tracking Form -->
        <form id="admin-fulfilment-form" data-order-id="${order.id}" style="border-top:1px solid var(--border-warm);padding-top:16px;margin-bottom:20px;">
          <h3 style="font-size:16px;font-weight:800;margin:0 0 12px;">Fulfilment &amp; Shipment Tracking</h3>
          <div class="form-grid-2">
            <div class="field-group">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                <label class="field-label" for="fulfil-courier-select">Courier</label>
                <span id="courier-autodetect-badge" class="badge badge-paid" style="font-size:10.5px;padding:2px 8px;display:${initialDetected && currentCourier === initialDetected.courierName ? 'inline-flex' : 'none'};">
                  Auto-detected
                </span>
              </div>
              <select id="fulfil-courier-select" name="courier_name" class="select-field">
                <option value="">— Select courier (or type tracking # to auto-detect) —</option>
                ${hasCustomCourier ? `<option value="${escapeHtml(currentCourier)}" selected>${escapeHtml(currentCourier)}</option>` : ''}
                ${MALAYSIAN_COURIERS.map((c) => `
                  <option value="${escapeHtml(c.name)}" ${currentCourier === c.name ? 'selected' : ''}>
                    ${escapeHtml(c.name)} (${escapeHtml(c.hint)})
                  </option>
                `).join('')}
              </select>
            </div>
            <div class="field-group">
              <label class="field-label" for="fulfil-tracking-input">Tracking number</label>
              <input id="fulfil-tracking-input" type="text" name="tracking_number" class="input-field" value="${escapeHtml(existingTracking)}" placeholder="e.g. PL-MY-88291044, NVMY123456, 600123456789" autocomplete="off" />
              <span id="courier-autodetect-hint" style="font-size:11.5px;color:var(--text-muted);">
                ${initialDetected
                  ? `Detected <strong>${escapeHtml(initialDetected.courierName)}</strong> (${escapeHtml(initialDetected.matchedRule)})`
                  : 'Enter tracking number to auto-detect PosLaju, J&amp;T, NinjaVan, SPX, DHL, Flash, GDEX or City-Link.'}
              </span>
            </div>
          </div>
          <div class="field-group">
            <label class="field-label">Internal note</label>
            <input type="text" name="internal_notes" class="input-field" value="${escapeHtml(order.internal_notes || '')}" placeholder="Internal operations note" />
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:10px;">
            <button type="submit" data-fulfil-status="processing" class="btn-capsule-secondary">Mark Processing</button>
            <button type="submit" data-fulfil-status="shipped" class="btn-capsule-primary" style="min-width:auto;">Mark as shipped</button>
            <button type="submit" data-fulfil-status="delivered" class="btn-capsule-secondary">Confirm Delivered</button>
          </div>
        </form>

        <!-- Manual Refund Two-Step Workflow -->
        <div style="border-top:1px solid var(--border-warm);padding-top:16px;">
          <h3 style="font-size:16px;font-weight:800;margin:0 0 6px;">Manual Refund &amp; Return Restock Workflow</h3>
          <p style="font-size:12.5px;color:var(--text-muted);margin:0 0 12px;">
            Merely clicking Refund does not transfer bank funds. Step 1 sets <code>refund_pending</code>. Step 2 records the completed external bank transfer reference before marking <code>refunded</code> / <code>partially_refunded</code>.
          </p>

          ${pendingRefund ? `
            <form id="admin-refund-complete-form" data-order-id="${order.id}" data-refund-id="${pendingRefund.id}" style="background:var(--pink-soft);padding:14px;border-radius:var(--radius-sm);margin-bottom:12px;">
              <strong>Step 2: Complete Pending Refund (${escapeHtml(pendingRefund.amount_formatted)})</strong>
              <div class="form-grid-2" style="margin-top:8px;">
                <div class="field-group">
                  <label class="field-label">External Bank Transfer Reference</label>
                  <input type="text" name="external_bank_reference" class="input-field" placeholder="e.g. EXT-REF-99201" required />
                </div>
                <div class="field-group">
                  <label class="field-label">Transfer Timestamp</label>
                  <input type="text" name="transferred_at" class="input-field" value="${new Date().toISOString()}" required />
                </div>
              </div>
              <button type="submit" class="btn-capsule-primary" style="min-width:auto;padding:8px 18px;font-size:13px;">Record External Transfer &amp; Complete Refund</button>
            </form>
          ` : `
            <form id="admin-refund-initiate-form" data-order-id="${order.id}" style="margin-bottom:12px;">
              <div class="form-grid-2">
                <div class="field-group">
                  <label class="field-label">Refund Amount (RM)</label>
                  <input type="text" name="amount_myr" class="input-field" value="${((order.total_minor - (order.refunded_minor || 0)) / 100).toFixed(2)}" required />
                </div>
                <div class="field-group">
                  <label class="field-label">Refund Reason</label>
                  <input type="text" name="reason" class="input-field" placeholder="Approved return / adjustment" required />
                </div>
              </div>
              <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <button type="submit" class="btn-capsule-secondary">Step 1: Initiate Refund Pending...</button>
                <button type="button" class="btn-capsule-secondary" data-action="restock-order-goods" data-order-id="${order.id}">
                  Intentional Action: Restock Returned Goods
                </button>
              </div>
            </form>
          `}
        </div>
      </div>

      <!-- Timeline & Transactional Email Log -->
      <aside class="card-panel">
        <h2 style="font-size:17px;font-weight:800;margin:0 0 12px;">Timeline &amp; Audit</h2>
        <div class="order-timeline" style="margin-bottom:24px;">
          ${(order.timeline || []).map((ev) => `
            <div class="timeline-row">
              <span class="timeline-dot"></span>
              <div>
                <strong>${escapeHtml(ev.title)}</strong>
                <div style="font-size:12px;color:var(--text-muted);">${escapeHtml(ev.detail)}</div>
              </div>
              <span style="font-size:11px;color:var(--text-muted);">${escapeHtml(formatKLDate(ev.created_at))}</span>
            </div>
          `).join('')}
        </div>

        <h3 style="font-size:15px;font-weight:800;margin:0 0 10px;">Transactional Email Jobs</h3>
        ${(order.notifications || []).map((n) => `
          <div style="background:var(--bg-offwhite);border:1px solid var(--border-warm);border-radius:var(--radius-sm);padding:10px;font-size:12px;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;">
              <strong>${escapeHtml(n.subject)}</strong>
              <span class="badge badge-draft">${escapeHtml(n.status)} (Tries: ${n.attempt_count})</span>
            </div>
            <div style="color:var(--text-muted);margin:4px 0;">${escapeHtml(n.body_text)}</div>
            <button type="button" class="nav-btn" data-retry-notification="${n.id}" style="color:var(--rose-deep);font-weight:700;padding:0;font-size:11.5px;">
              Retry email safely (idempotent) &gt;
            </button>
          </div>
        `).join('')}
      </aside>
    </div>
  `;

  return renderAdminShell('orders', html);
}

// =========================================================================
// ADMIN 6: CUSTOMERS & ANALYTICS (/admin/customers, /admin/analytics)
// Matches Wireframe Page 16
// =========================================================================
export function renderAdminCustomers(customers = [], selectedCustomerData = null) {
  if (selectedCustomerData) {
    const c = selectedCustomerData.customer;
    const html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
        <h1 class="page-title" style="font-size:26px;">Customer: ${escapeHtml(c.name)}</h1>
        <a href="/admin/customers" data-nav class="btn-capsule-secondary">&lt; Back to Customers</a>
      </div>
      <div class="checkout-grid">
        <div class="card-panel">
          <h2 style="font-size:17px;font-weight:800;margin:0 0 12px;">Order History (${selectedCustomerData.orders.length})</h2>
          ${selectedCustomerData.orders.map((o) => `
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border-warm);font-size:13.5px;">
              <div>
                <a href="/admin/orders/${o.id}" data-nav style="color:var(--rose-deep);font-weight:700;">#${escapeHtml(o.order_number)}</a>
                · ${escapeHtml(o.total_formatted)}
              </div>
              <div>
                <span class="${getPaymentBadgeClass(o.payment_status)}">${escapeHtml(o.payment_status_label)}</span>
                <span class="${getFulfilmentBadgeClass(o.fulfilment_status)}">${escapeHtml(o.fulfilment_status_label)}</span>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="card-panel">
          <h2 style="font-size:17px;font-weight:800;margin:0 0 12px;">Contact &amp; Privacy Policy</h2>
          <p style="font-size:13.5px;">
            <strong>Email:</strong> ${escapeHtml(c.email)}<br/>
            <strong>Phone:</strong> ${escapeHtml(c.phone || '—')}<br/>
            <strong>Status:</strong> ${escapeHtml(c.status)}
          </p>
          ${c.status === 'active' ? `
            <button type="button" class="btn-capsule-secondary" data-action="anonymise-customer" data-customer-id="${c.id}" style="color:var(--status-alert-text);width:100%;">
              Anonymise Customer Profile (Retain Order History)
            </button>
          ` : ''}
        </div>
      </div>
    `;
    return renderAdminShell('customers', html);
  }

  const html = `
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;margin-bottom:20px;">
      <h1 class="page-title" style="font-size:26px;">Customers (${customers.length})</h1>
      <a href="/api/admin/customers/export.csv?include_demo=${state.adminIncludeDemo ? '1' : '0'}" target="_blank" class="btn-capsule-secondary" style="padding:8px 18px;">
        Export CSV (Formula-Safe)
      </a>
    </div>

    <div class="card-panel">
      ${recordCards(customers,'customer')}<div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>CUSTOMER</th>
              <th>EMAIL / PHONE</th>
              <th>ORDERS</th>
              <th>TOTAL PAID</th>
              <th>ACTION</th>
            </tr>
          </thead>
          <tbody>
            ${customers.map((c) => `
              <tr>
                <td>
                  <strong>${escapeHtml(c.name)}</strong>
                  ${c.is_demo ? `<span class="badge badge-demo" style="margin-left:4px;">DEMO</span>` : ''}
                </td>
                <td>${escapeHtml(c.email)} · ${escapeHtml(c.phone || '—')}</td>
                <td>${c.orders_count}</td>
                <td><strong>${escapeHtml(c.total_paid_formatted)}</strong></td>
                <td><a href="/admin/customers/${c.id}" data-nav style="color:var(--rose-deep);font-weight:700;">View detail &gt;</a></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  return renderAdminShell('customers', html);
}

export function renderAdminAnalytics(overviewData) {
  const k = overviewData.kpis || {};
  const html = `
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;margin-bottom:20px;">
      <div>
        <h1 class="page-title" style="font-size:26px;">Analytics &amp; Financial Reports</h1>
        <p style="margin:4px 0 0;font-size:13px;color:var(--text-muted);">
          Confirmed sales = admin-confirmed bank payments minus completed external refunds. Unpaid, under-review and cancelled unpaid orders are strictly excluded.
        </p>
      </div>
      <a href="/api/admin/analytics/export.csv?include_demo=${state.adminIncludeDemo ? '1' : '0'}&date_from=${encodeURIComponent(overviewData.date_from)}&date_to=${encodeURIComponent(overviewData.date_to)}" target="_blank" class="btn-capsule-primary" style="min-width:auto;padding:9px 20px;">
        Export Sales CSV
      </a>
    </div>

    <div class="form-grid-3" style="margin-bottom:24px;">
      <div class="card-panel">
        <span class="kpi-label">Confirmed Net Sales ${overviewData.include_demo ? '[DEMO]' : '[LIVE]'}</span>
        <div class="kpi-value" style="margin:6px 0;">${escapeHtml(k.confirmed_sales_formatted || 'RM0.00')}</div>
        <span style="font-size:12px;color:var(--text-muted);">Bank-confirmed payments minus completed refunds</span>
      </div>
      <div class="card-panel">
        <span class="kpi-label">Paid Orders</span>
        <div class="kpi-value" style="margin:6px 0;">${k.paid_orders_count || 0}</div>
        <span style="font-size:12px;color:var(--text-muted);">Selected reporting period (${escapeHtml(overviewData.date_from)} to ${escapeHtml(overviewData.date_to)})</span>
      </div>
      <div class="card-panel">
        <span class="kpi-label">Pending External Refunds</span>
        <div class="kpi-value" style="margin:6px 0;">RM${((k.pending_refunds_minor || 0) / 100).toFixed(2)}</div>
        <span style="font-size:12px;color:var(--text-muted);">Reported separately until external bank transfer is recorded</span>
      </div>
    </div>

    <div class="card-panel">
      <h2 style="font-size:17px;font-weight:800;margin:0 0 8px;">Metric &amp; Attribution Integrity Notice</h2>
      <p style="font-size:13.5px;color:var(--text-muted);margin:0;">
        <strong>Conversion rate hidden:</strong> Consent-appropriate storefront session tracking is currently unconnected in this launch scope. Per specification, conversion rate is hidden rather than fabricated from order counts alone.
      </p>
    </div>
  `;

  return renderAdminShell('analytics', html);
}

// =========================================================================
// ADMIN 7: CONTENT MANAGER (/admin/content) & SETTINGS (/admin/settings)
// Matches Wireframe Page 17
// =========================================================================
export function renderAdminContentManager(sections = []) {
  const heroSec = sections.find((s) => s.section_key === 'H01_H02')?.draft || {};
  const newArrSec = sections.find((s) => s.section_key === 'N01_N03')?.draft || {};
  const edSec = sections.find((s) => s.section_key === 'E01_E03')?.draft || {};

  const html = `
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;margin-bottom:20px;">
      <div>
        <h1 class="page-title" style="font-size:26px;">Homepage content manager</h1>
        <p style="margin:4px 0 0;font-size:13px;color:var(--text-muted);">
          Edit asset slots H01/H02, N01–N03, E01–E03, C01–C04 and B01 without baking text into images.
        </p>
      </div>
      <div style="display:flex;gap:10px;">
        <a href="/?preview=1" data-nav class="btn-capsule-secondary" style="padding:9px 18px;">Preview Draft Storefront</a>
        <button type="button" class="btn-capsule-primary" data-action="publish-all-content" style="min-width:auto;padding:9px 22px;">Publish all changes</button>
      </div>
    </div>

    <!-- H01 / H02 Layered Hero Editor -->
    <form id="admin-content-hero-form" class="card-panel" style="margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
        <h2 style="font-size:18px;font-weight:800;margin:0;">H01 / H02 — Layered Hero + Display Text + CTA</h2>
        <span class="badge badge-ref">Real HTML Text + Transparent Product Layer</span>
      </div>
      <div class="form-grid-2">
        <div class="field-group">
          <label class="field-label">Oversized Hero Headline (Charcoal #30282D)</label>
          <input type="text" name="headline" class="input-field" value="${escapeHtml(heroSec.headline || 'your next favourite')}" required />
        </div>
        <div class="field-group">
          <label class="field-label">Hero Product Image Path (Transparent layer in front of headline)</label>
          <input type="text" name="hero_image_path" class="input-field" value="${escapeHtml(heroSec.hero_image_path || '/images/08_jacquemus_pink_flap_handbag.png')}" required />
        </div>
      </div>
      <div class="form-grid-3">
        <div class="field-group">
          <label class="field-label">Brand Subheadline</label>
          <input type="text" name="subheadline" class="input-field" value="${escapeHtml(heroSec.subheadline || 'A considered edit. Chosen by SCHA.')}" />
        </div>
        <div class="field-group">
          <label class="field-label">Capsule CTA Label</label>
          <input type="text" name="cta_text" class="input-field" value="${escapeHtml(heroSec.cta_text || 'Shop now')}" required />
        </div>
        <div class="field-group">
          <label class="field-label">CTA Destination</label>
          <input type="text" name="cta_link" class="input-field" value="${escapeHtml(heroSec.cta_link || '/shop')}" required />
        </div>
      </div>
      <div style="display:flex;gap:10px;">
        <button type="submit" data-publish="0" class="btn-capsule-secondary">Save draft</button>
        <button type="submit" data-publish="1" class="btn-capsule-primary" style="min-width:auto;">Publish Hero</button>
      </div>
    </form>

    <!-- N01-N03 Pink New Arrivals Selection -->
    <form id="admin-content-newarrivals-form" class="card-panel" style="margin-bottom:20px;">
      <h2 style="font-size:18px;font-weight:800;margin:0 0 12px;">N01–N03 — Pink New Arrivals Block</h2>
      <div class="form-grid-3">
        <div class="field-group">
          <label class="field-label">Block Heading</label>
          <input type="text" name="heading" class="input-field" value="${escapeHtml(newArrSec.heading || 'NEW ARRIVALS')}" required />
        </div>
        <div class="field-group">
          <label class="field-label">Pill CTA Text</label>
          <input type="text" name="cta_pill_text" class="input-field" value="${escapeHtml(newArrSec.cta_pill_text || 'View product')}" required />
        </div>
        <div class="field-group">
          <label class="field-label">3 Highlighted Reference IDs (comma-separated)</label>
          <input type="text" name="selected_references" class="input-field" value="${escapeHtml((newArrSec.selected_references || ['REF-08', 'REF-01', 'REF-09']).join(', '))}" required />
        </div>
      </div>
      <div style="display:flex;gap:10px;">
        <button type="submit" data-publish="0" class="btn-capsule-secondary">Save draft</button>
        <button type="submit" data-publish="1" class="btn-capsule-primary" style="min-width:auto;">Publish New Arrivals</button>
      </div>
    </form>

    <!-- E01-E03 Editorial Collage -->
    <form id="admin-content-editorial-form" class="card-panel">
      <h2 style="font-size:18px;font-weight:800;margin:0 0 12px;">E01–E03 — Editorial Story &amp; JUST SCHA Collage</h2>
      <div class="form-grid-2">
        <div class="field-group">
          <label class="field-label">Oversized Decorative Word (#D77F9F)</label>
          <input type="text" name="decorative_word" class="input-field" value="${escapeHtml(edSec.decorative_word || 'JUST SCHA')}" required />
        </div>
        <div class="field-group">
          <label class="field-label">Lead Paragraph</label>
          <input type="text" name="lead_paragraph" class="input-field" value="${escapeHtml(edSec.lead_paragraph || '')}" required />
        </div>
      </div>
      <div class="field-group">
        <label class="field-label">Body Copy</label>
        <textarea name="body_paragraph" rows="2" class="textarea-field">${escapeHtml(edSec.body_paragraph || '')}</textarea>
      </div>
      <div style="display:flex;gap:10px;">
        <button type="submit" data-publish="0" class="btn-capsule-secondary">Save draft</button>
        <button type="submit" data-publish="1" class="btn-capsule-primary" style="min-width:auto;">Publish Editorial Story</button>
      </div>
    </form>
  `;

  return renderAdminShell('content', html);
}

export function renderAdminSettings(settingsData) {
  const s = settingsData.settings || {};
  const versions = settingsData.payment_versions || [];
  const latestQr = versions[0] || {};
  const auditLogs = settingsData.audit_logs || [];

  const html = `
    <h1 class="page-title" style="font-size:26px;margin-bottom:20px;">Store settings &amp; Merchant QR</h1>

    <div style="margin-bottom:24px;">
      <!-- Merchant DuitNow QR & Recipient Versioning (Slot Q01) -->
      <div class="card-panel">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h2 style="font-size:18px;font-weight:800;margin:0;">Q01 — Merchant DuitNow QR + Recipient</h2>
          <span class="badge badge-ref">Current: v${escapeHtml(latestQr.version_number || 1)}</span>
        </div>
        <p style="font-size:12.5px;color:var(--text-muted);margin:0 0 14px;">
          Changes create a new audited instruction version applied deliberately to new orders; existing pending orders retain the version shown at creation. Never enter online-banking login credentials here.
        </p>

        <form id="admin-qr-settings-form">
          <div id="admin-qr-preview-box" style="display:${latestQr.qr_image_path ? 'flex' : 'none'};align-items:center;gap:16px;padding:14px;margin-bottom:16px;background:var(--bg-offwhite);border:1.5px solid var(--border-warm);border-radius:var(--radius-md);flex-wrap:wrap;">
            <div style="width:130px;height:130px;background:#fff;border:1px solid var(--border-warm);border-radius:var(--radius-sm);padding:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <img id="admin-qr-preview-img" src="${escapeHtml(latestQr.qr_image_path || '')}" alt="Uploaded Merchant DuitNow QR" style="max-width:100%;max-height:100%;object-fit:contain;display:block;" />
            </div>
            <div style="flex:1;min-width:180px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
                <span class="badge badge-paid" id="admin-qr-preview-badge">ACTIVE BANK QR (v${escapeHtml(latestQr.version_number || 1)})</span>
              </div>
              <div style="font-size:14px;font-weight:800;color:var(--charcoal);">${escapeHtml(latestQr.recipient_name || 'SCHA STUDIO SDN BHD')}</div>
              <div style="font-size:12.5px;color:var(--text-muted);margin-top:2px;">${escapeHtml(latestQr.bank_name || '')}</div>
              ${latestQr.qr_image_path ? `<a href="${escapeHtml(latestQr.qr_image_path)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;font-size:12px;font-weight:700;color:var(--rose-deep);">View full QR image &nearr;</a>` : ''}
            </div>
          </div>

          <div class="field-group">
            <label class="field-label">Registered Seller Recipient Display Name</label>
            <input type="text" name="recipient_name" class="input-field" value="${escapeHtml(latestQr.recipient_name || '')}" required />
          </div>
          <div class="form-grid-2">
            <div class="field-group">
              <label class="field-label">Acquiring Bank / Provider Name</label>
              <input type="text" name="bank_name" class="input-field" value="${escapeHtml(latestQr.bank_name || '')}" />
            </div>
            <div class="field-group">
              <label class="field-label">Upload Bank-Issued Merchant QR (PNG/JPG)</label>
              <input type="file" id="admin-qr-file-input" name="qr_image" accept="image/png,image/jpeg" class="input-field" />
            </div>
          </div>
          <div class="form-grid-2">
            <div class="field-group">
              <label class="field-label">Payment Deadline (Minutes)</label>
              <input type="number" name="payment_deadline_minutes" class="input-field" value="${escapeHtml(latestQr.payment_deadline_minutes || 30)}" min="5" required />
            </div>
            <div class="field-group">
              <label class="field-label">Admin Review Reservation Window (Hours)</label>
              <input type="number" name="review_window_hours" class="input-field" value="${escapeHtml(latestQr.review_window_hours || 24)}" min="1" required />
            </div>
          </div>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:14px;cursor:pointer;">
            <input type="checkbox" name="demo_qr_enabled" ${latestQr.demo_qr_enabled ? 'checked' : ''} />
            <span>Allow Demo QR Placeholder (Q01) checkout when live bank QR is not uploaded</span>
          </label>
          <button type="submit" class="btn-capsule-primary" style="width:100%;">
            Save New Audited QR Instruction Version (v${Number(latestQr.version_number || 1) + 1})
          </button>
        </form>
      </div>
    </div>

    <!-- Audit Log -->
    <div class="card-panel">
      <h2 style="font-size:17px;font-weight:800;margin:0 0 12px;">Recent Admin Audit Trail</h2>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr><th>TIME</th><th>ACTOR</th><th>ACTION</th><th>ENTITY</th><th>DETAILS</th></tr>
          </thead>
          <tbody>
            ${auditLogs.map((a) => `
              <tr>
                <td>${escapeHtml(formatKLDate(a.created_at))}</td>
                <td>${escapeHtml(a.actor_email)} (${escapeHtml(a.actor_role)})</td>
                <td><strong>${escapeHtml(a.action)}</strong></td>
                <td>${escapeHtml(a.entity_type)} #${escapeHtml(a.entity_id)}</td>
                <td style="font-size:12px;color:var(--text-muted);">${escapeHtml(a.details_json)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  return renderAdminShell('settings', html);
}
