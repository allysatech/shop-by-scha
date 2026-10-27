import {
  state,
  escapeHtml,
  showToast,
  apiFetch,
  bootstrapSessionAndStore,
  detectCourierFromTracking
} from './state.js';

import {
  renderHomePage,
  renderCollectionsOverviewPage,
  renderShopOrCollectionPage,
  renderProductDetailPage,
  renderCartPage,
  renderCheckoutPage,
  renderOrderConfirmationPage,
  renderCustomerAuthPage,
  renderCustomerAccountPage,
  renderHelpPolicyPage
} from './storefront-views.js';

import {
  renderAdminLoginPage,
  renderAdminOverview,
  renderAdminProductsList,
  renderAdminProductEditor,
  renderAdminInventory,
  renderAdminPaymentReviews,
  renderAdminOrdersList,
  renderAdminOrderDetail,
  renderAdminCustomers,
  renderAdminAnalytics,
  renderAdminContentManager,
  renderAdminSettings
} from './admin-views.js';

let currentPdpData = null;
let drawerFocusReturn=null;
let swipeStart=null;

export async function navigateTo(url, replace = false) {
  const currentKey=window.location.pathname+window.location.search;
  sessionStorage.setItem('scha:scroll:'+currentKey,String(window.scrollY));
  if (state.pollingTimer) {
    clearInterval(state.pollingTimer);
    state.pollingTimer = null;
  }
  if (replace) {
    window.history.replaceState({}, '', url);
  } else {
    window.history.pushState({}, '', url);
  }
  closeDrawer();
  await renderRoute();
  const hashIndex = String(url).indexOf('#');
  if (hashIndex !== -1) {
    const hashId = String(url).slice(hashIndex + 1);
    const targetEl = document.getElementById(hashId);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth' });
      return;
    }
  }
  const saved=Number(sessionStorage.getItem('scha:scroll:'+url)||0);
  window.scrollTo({ top: saved, behavior: 'instant' });
}

function openAddedToBagDrawer(productTitle) {
  const drawerRoot = document.getElementById('drawer-root');
  if (!drawerRoot) return;
  drawerFocusReturn=document.activeElement;
  const cart = state.cart;
  drawerRoot.innerHTML = `
    <div class="drawer-backdrop" data-action="close-drawer">
      <div class="drawer-panel" role="dialog" aria-modal="true" aria-label="Added to bag confirmation">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-warm);padding-bottom:12px;">
          <strong style="font-size:16px;">Added to your bag</strong>
          <button type="button" class="header-icon-btn" data-action="close-drawer" aria-label="Close drawer">✕</button>
        </div>
        <div style="background:var(--pink-soft);padding:14px;border-radius:var(--radius-sm);font-size:13.5px;">
          <strong>${escapeHtml(productTitle)}</strong> has been added to your bag.
        </div>
        <div style="font-size:14px;display:flex;justify-content:space-between;">
          <span>Bag Subtotal (${cart.itemCount} item${cart.itemCount === 1 ? '' : 's'})</span>
          <strong>${escapeHtml(cart.subtotal_formatted)}</strong>
        </div>
        <div style="margin-top:auto;display:flex;flex-direction:column;gap:10px;">
          <a href="/cart" data-nav class="btn-capsule-primary" style="width:100%;">View bag (${cart.itemCount})</a>
          <a href="/checkout" data-nav class="btn-capsule-secondary" style="width:100%;">Proceed to checkout</a>
          <button type="button" class="btn-capsule-secondary" data-action="close-drawer" style="width:100%;">Continue shopping</button>
        </div>
      </div>
    </div>
  `;
}

function openMobileMenuDrawer() {
  const drawerRoot = document.getElementById('drawer-root');
  if (!drawerRoot) return;
  const bagCount = state.cart?.itemCount || 0;
  const currentPath = window.location.pathname;

  drawerRoot.innerHTML = `
    <div class="drawer-backdrop left" data-action="close-drawer">
      <aside class="drawer-panel side-nav-drawer" role="dialog" aria-modal="true" aria-label="Storefront Side Navigation Menu">
        <div class="side-nav-header">
          <a href="/" data-nav aria-label="Shop by SCHA Home">
            <img src="/images/logo.png" alt="Shop by SCHA" class="brand-logo-img" style="height:52px;" />
          </a>
          <button type="button" class="header-icon-btn" data-action="close-drawer" aria-label="Close side menu" title="Close">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <nav class="side-nav-primary" aria-label="Primary Storefront Navigation">
          <a href="/" data-nav class="side-nav-item ${currentPath === '/' ? 'active' : ''}">
            <span>Home</span>
          </a>
          <a href="/shop" data-nav class="side-nav-item ${currentPath.startsWith('/shop') ? 'active' : ''}">
            <span>Shop</span>
          </a>
          <a href="/#new-arrivals" data-nav class="side-nav-item">
            <span>New arrivals</span>
            <span class="side-nav-badge">NEW</span>
          </a>

          <div id="side-nav-collections-dropdown" class="side-nav-dropdown ${currentPath.startsWith('/collections') ? 'open' : ''}">
            <button
              type="button"
              class="side-nav-item side-nav-dropdown-trigger ${currentPath.startsWith('/collections') ? 'active' : ''}"
              data-action="toggle-collections-dropdown"
              aria-expanded="${currentPath.startsWith('/collections') ? 'true' : 'false'}"
            >
              <span>Collections</span>
              <svg class="side-nav-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>

            <div class="side-nav-dropdown-menu">
              <a href="/collections" data-nav class="side-nav-dropdown-link ${currentPath === '/collections' ? 'active' : ''}">
                <span>All Collections</span>
              </a>
              <a href="/collections/eyewear" data-nav class="side-nav-dropdown-link ${currentPath === '/collections/eyewear' ? 'active' : ''}">
                <span>Eyewear</span>
              </a>
              <a href="/collections/bags" data-nav class="side-nav-dropdown-link ${currentPath === '/collections/bags' ? 'active' : ''}">
                <span>Bags</span>
              </a>
              <a href="/collections/beauty" data-nav class="side-nav-dropdown-link ${currentPath === '/collections/beauty' ? 'active' : ''}">
                <span>Beauty</span>
              </a>
              <a href="/collections/footwear" data-nav class="side-nav-dropdown-link ${currentPath === '/collections/footwear' ? 'active' : ''}">
                <span>Footwear</span>
              </a>
            </div>
          </div>

          <a href="/help/about" data-nav class="side-nav-item ${currentPath === '/help/about' ? 'active' : ''}">
            <span>About</span>
          </a>
        </nav>

        <div class="side-nav-footer">
          <a href="/search" data-nav class="side-nav-quicklink">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="7.5"></circle>
              <line x1="16.65" y1="16.65" x2="21" y2="21"></line>
            </svg>
            <span>Search Catalogue</span>
          </a>
          <a href="${state.user ? (state.user.role === 'ADMIN' ? '/admin' : '/account') : '/login'}" data-nav class="side-nav-quicklink">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <span>${state.user ? (state.user.role === 'ADMIN' ? 'Admin Overview' : 'My Account') : 'Customer Log in / Register'}</span>
          </a>
          <a href="/cart" data-nav class="side-nav-quicklink">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="9" cy="21" r="1.5"></circle>
              <circle cx="19" cy="21" r="1.5"></circle>
              <path d="M2.5 3h2.8l2.2 11.2a2 2 0 0 0 2 1.6h9.2a2 2 0 0 0 1.95-1.55L22 7H6.1"></path>
            </svg>
            <span>Shopping Cart (${bagCount})</span>
          </a>
          <a href="/order/confirmation" data-nav class="side-nav-quicklink">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2"></rect>
              <line x1="7" y1="9" x2="17" y2="9"></line>
              <line x1="7" y1="14" x2="13" y2="14"></line>
            </svg>
            <span>Track Guest Order</span>
          </a>
          <a href="${state.user && state.user.role === 'ADMIN' ? '/admin' : '/admin/login'}" data-nav class="side-nav-quicklink admin-link">
            <span>Admin Workspace</span>
          </a>
        </div>
      </aside>
    </div>
  `;
}

function closeDrawer() {
  const drawerRoot = document.getElementById('drawer-root');
  if (drawerRoot) drawerRoot.innerHTML = '';
  if(drawerFocusReturn?.isConnected)drawerFocusReturn.focus();
  drawerFocusReturn=null;
}

export async function renderRoute() {
  const appEl = document.getElementById('app');
  if (!appEl) return;

  const urlObj = new URL(window.location.href);
  const pathname = urlObj.pathname.replace(/\/+$/, '') || '/';
  const params = urlObj.searchParams;
  const isPreview = params.get('preview') === '1';

  appEl.setAttribute('aria-busy','true');
  if (!state.storefront) appEl.innerHTML = '<main class="page-container" role="status">Loading your shop...</main>';
  await bootstrapSessionAndStore(isPreview);
  appEl.removeAttribute('aria-busy');

  // Compatibility redirect: /account/payment-methods -> /account/payment-info
  if (pathname === '/account/payment-methods') {
    return navigateTo('/account/payment-info', true);
  }

  // Optional /stores and /stores/[slug] remain hidden when no real physical locations are configured
  if (pathname === '/stores' || pathname.startsWith('/stores/')) {
    const stores = state.storefront?.store?.physical_stores || [];
    if (!stores.length) {
      appEl.innerHTML = renderHelpPolicyPage('contact');
      return;
    }
  }

  // =========================================================================
  // ADMIN ROUTES (/admin/*)
  // =========================================================================
  if (pathname === '/admin/login') {
    if (state.user && state.user.role === 'ADMIN') {
      return navigateTo('/admin', true);
    }
    appEl.innerHTML = renderAdminLoginPage('login');
    return;
  }

  if (pathname === '/admin/forgot-password') {
    appEl.innerHTML = renderAdminLoginPage('forgot');
    return;
  }

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    if (!state.user) {
      const msg = state.sessionExpired ? 'Your admin session has expired. Please log in again.' : 'Please log in with a provisioned ADMIN account.';
      appEl.innerHTML = renderAdminLoginPage('login', msg);
      return;
    }
    if (state.user.role !== 'ADMIN') {
      appEl.innerHTML = renderAdminLoginPage('login', 'Access denied (403). Your account role is CUSTOMER; administrator privileges are required.');
      return;
    }

    try {
      if (pathname === '/admin') {
        const data = await apiFetch(`/api/admin/overview?include_demo=${state.adminIncludeDemo ? '1' : '0'}&date_from=${state.adminDateFrom}&date_to=${state.adminDateTo}`);
        appEl.innerHTML = renderAdminOverview(data);
        return;
      }

      if (pathname === '/admin/products') {
        const data = await apiFetch('/api/admin/products');
        appEl.innerHTML = renderAdminProductsList(data.products);
        return;
      }

      if (pathname === '/admin/products/new') {
        appEl.innerHTML = renderAdminProductEditor(null);
        return;
      }

      if (pathname.startsWith('/admin/products/')) {
        const prodId = pathname.slice('/admin/products/'.length);
        const data = await apiFetch('/api/admin/products');
        const found = (data.products || []).find((p) => String(p.id) === prodId || p.reference_id === prodId);
        appEl.innerHTML = renderAdminProductEditor(found || null);
        return;
      }

      if (pathname === '/admin/inventory' || pathname.startsWith('/admin/inventory/')) {
        const data = await apiFetch('/api/admin/inventory');
        if(params.get('filter')==='low-stock')data.variants=data.variants.filter(v=>v.is_low_stock);
        if(pathname.startsWith('/admin/inventory/')){const id=Number(pathname.split('/').pop());data.variants=data.variants.filter(v=>v.id===id);data.movements=(data.movements||[]).filter(m=>m.variant_id===id);}
        appEl.innerHTML = renderAdminInventory(data);
        return;
      }

      if (pathname === '/admin/payment-reviews') {
        const data = await apiFetch('/api/admin/payment-reviews');
        const selId = params.get('orderId') || null;
        appEl.innerHTML = renderAdminPaymentReviews(data.orders, selId);
        return;
      }

      if (pathname === '/admin/orders') {
        const q = params.get('q') || '';
        const ps = params.get('payment_status') || '';
        const fs = params.get('fulfilment_status') || '';
        const data = await apiFetch(`/api/admin/orders?q=${encodeURIComponent(q)}&payment_status=${encodeURIComponent(ps)}&fulfilment_status=${encodeURIComponent(fs)}`);
        appEl.innerHTML = renderAdminOrdersList(data.orders, { q, payment_status: ps, fulfilment_status: fs });
        return;
      }

      if (pathname.startsWith('/admin/orders/')) {
        const ordId = pathname.slice('/admin/orders/'.length);
        const data = await apiFetch(`/api/orders/${encodeURIComponent(ordId)}`);
        appEl.innerHTML = renderAdminOrderDetail(data.order);
        return;
      }

      if (pathname === '/admin/customers') {
        const data = await apiFetch('/api/admin/customers');
        appEl.innerHTML = renderAdminCustomers(data.customers, null);
        return;
      }

      if (pathname.startsWith('/admin/customers/')) {
        const custId = pathname.slice('/admin/customers/'.length);
        const [listData, detailData] = await Promise.all([
          apiFetch('/api/admin/customers'),
          apiFetch(`/api/admin/customers/${encodeURIComponent(custId)}`)
        ]);
        appEl.innerHTML = renderAdminCustomers(listData.customers, detailData);
        return;
      }

      if (pathname === '/admin/analytics') {
        const data = await apiFetch(`/api/admin/overview?include_demo=${state.adminIncludeDemo ? '1' : '0'}&date_from=${state.adminDateFrom}&date_to=${state.adminDateTo}`);
        appEl.innerHTML = renderAdminAnalytics(data);
        return;
      }

      if (pathname === '/admin/content') {
        const data = await apiFetch('/api/admin/content');
        appEl.innerHTML = renderAdminContentManager(data.sections);
        return;
      }

      if (pathname === '/admin/settings') {
        const data = await apiFetch('/api/admin/settings');
        appEl.innerHTML = renderAdminSettings(data);
        return;
      }
    } catch (err) {
      showToast(err.message || 'Admin error');
    }
  }

  // =========================================================================
  // PUBLIC & CUSTOMER ROUTES
  // =========================================================================
  if (pathname === '/') {
    appEl.innerHTML = renderHomePage();
    return;
  }

  if (pathname === '/collections') {
    appEl.innerHTML = renderCollectionsOverviewPage();
    return;
  }

  if (pathname.startsWith('/collections/')) {
    const slug = decodeURIComponent(pathname.slice('/collections/'.length));
    appEl.innerHTML = renderShopOrCollectionPage({ mode: 'collection', categorySlug: slug, queryParams: params });
    return;
  }

  if (pathname === '/shop') {
    appEl.innerHTML = renderShopOrCollectionPage({ mode: 'shop', queryParams: params });
    return;
  }

  if (pathname === '/search') {
    appEl.innerHTML = renderShopOrCollectionPage({ mode: 'search', queryParams: params });
    return;
  }

  if (pathname.startsWith('/products/')) {
    const slug = decodeURIComponent(pathname.slice('/products/'.length));
    try {
      currentPdpData = await apiFetch(`/api/products/${encodeURIComponent(slug)}${isPreview ? '?preview=1' : ''}`);
      appEl.innerHTML = renderProductDetailPage(currentPdpData, 0);
    } catch (err) {
      appEl.innerHTML = renderShopOrCollectionPage({ mode: 'shop', queryParams: params });
      showToast('Product reference not found.');
    }
    return;
  }

  if (pathname === '/cart') {
    appEl.innerHTML = renderCartPage();
    return;
  }

  if (pathname === '/checkout') {
    let savedAddresses = [];
    if (state.user) {
      try {
        const addrRes = await apiFetch('/api/account/addresses');
        savedAddresses = addrRes.addresses || [];
        const defShip = savedAddresses.find((a) => a.is_default_shipping) || savedAddresses[0];
        if (defShip && !state.checkoutDraft.line1) {
          state.checkoutDraft.recipient_name = defShip.recipient_name;
          state.checkoutDraft.phone = defShip.phone;
          state.checkoutDraft.line1 = defShip.line1;
          state.checkoutDraft.line2 = defShip.line2 || '';
          state.checkoutDraft.postcode = defShip.postcode;
          state.checkoutDraft.city = defShip.city;
          state.checkoutDraft.state = defShip.state;
        }
      } catch (_) {}
    }
    state.cart = await apiFetch(`/api/cart?state=${encodeURIComponent(state.checkoutDraft.state)}&shipping_method=${encodeURIComponent(state.checkoutDraft.shipping_method_id || '')}`);
    appEl.innerHTML = renderCheckoutPage(savedAddresses);
    return;
  }

  if (pathname === '/order/confirmation') {
    const orderKey = params.get('order') || (state.checkoutDraft.createdOrder && state.checkoutDraft.createdOrder.order_number) || '';
    const token = params.get('token') || (state.checkoutDraft.createdOrder && state.checkoutDraft.createdOrder.guest_access_token) || '';

    if (!orderKey) {
      appEl.innerHTML = renderOrderConfirmationPage(null, '');
      return;
    }

    try {
      const data = await apiFetch(`/api/orders/${encodeURIComponent(orderKey)}${token ? `?token=${encodeURIComponent(token)}` : ''}`);
      appEl.innerHTML = renderOrderConfirmationPage(data.order, token);

      // Short polling every 6 seconds so admin payment/shipping updates reflect live on customer view!
      state.pollingTimer = setInterval(async () => {
        try {
          const fresh = await apiFetch(`/api/orders/${encodeURIComponent(orderKey)}${token ? `?token=${encodeURIComponent(token)}` : ''}`);
          if (fresh.order && (fresh.order.payment_status !== data.order.payment_status || fresh.order.fulfilment_status !== data.order.fulfilment_status)) {
            data.order = fresh.order;
            appEl.innerHTML = renderOrderConfirmationPage(fresh.order, token);
            showToast(`Order #${fresh.order.order_number} status updated: ${fresh.order.payment_status_label} / ${fresh.order.fulfilment_status_label}`);
          }
        } catch (_) {}
      }, 6000);
    } catch (err) {
      showToast(err.message);
      appEl.innerHTML = renderOrderConfirmationPage(null, '');
    }
    return;
  }

  if (pathname === '/login') {
    if (state.user) {
      return navigateTo(state.user.role === 'ADMIN' ? '/admin' : '/account', true);
    }
    appEl.innerHTML = renderCustomerAuthPage('login');
    return;
  }

  if (pathname === '/register') {
    appEl.innerHTML = renderCustomerAuthPage('register');
    return;
  }

  if (pathname === '/forgot-password') {
    appEl.innerHTML = renderCustomerAuthPage('forgot');
    return;
  }

  if (pathname === '/account' || pathname.startsWith('/account/')) {
    if (!state.user) {
      return navigateTo('/login', true);
    }
    if (state.user.role === 'ADMIN') {
      return navigateTo('/admin', true);
    }
    try {
      const [ordersData, addrData] = await Promise.all([
        apiFetch('/api/account/orders'),
        apiFetch('/api/account/addresses')
      ]);
      const orders = ordersData.orders || [];
      const addresses = addrData.addresses || [];

      if (pathname === '/account' || pathname === '/account/orders') {
        appEl.innerHTML = renderCustomerAccountPage({ tab: 'orders', orders, addresses });
        return;
      }
      if (pathname.startsWith('/account/orders/')) {
        const ordKey = decodeURIComponent(pathname.slice('/account/orders/'.length));
        const ordRes = await apiFetch(`/api/orders/${encodeURIComponent(ordKey)}`);
        appEl.innerHTML = renderCustomerAccountPage({ tab: 'order-detail', orders, addresses, selectedOrder: ordRes.order });
        return;
      }
      if (pathname === '/account/addresses') {
        appEl.innerHTML = renderCustomerAccountPage({ tab: 'addresses', orders, addresses });
        return;
      }
      if (pathname === '/account/payment-info') {
        appEl.innerHTML = renderCustomerAccountPage({ tab: 'payment-info', orders, addresses });
        return;
      }
      if (pathname === '/account/profile') {
        appEl.innerHTML = renderCustomerAccountPage({ tab: 'profile', orders, addresses });
        return;
      }
    } catch (err) {
      showToast(err.message);
      return navigateTo('/login', true);
    }
  }

  if (pathname.startsWith('/help/')) {
    const pageKey = pathname.slice('/help/'.length) || 'about';
    appEl.innerHTML = renderHelpPolicyPage(pageKey);
    return;
  }

  appEl.innerHTML = renderHomePage();
}

// =========================================================================
// GLOBAL EVENT DELEGATION
// =========================================================================
document.addEventListener('click', async (e) => {
  const navLink = e.target.closest('a[data-nav]');
  if (navLink) {
    e.preventDefault();
    const href = navLink.getAttribute('href');
    if (href) await navigateTo(href);
    return;
  }

  const actionBtn = e.target.closest('[data-action]');
  if (actionBtn) {
    if(actionBtn.dataset.action==='toggle-admin-menu') {const sidebar=document.querySelector('.admin-sidebar');const open=sidebar.classList.toggle('is-open');actionBtn.setAttribute('aria-expanded',String(open));return;}
    if(actionBtn.dataset.action==='zoom-product'){const img=document.getElementById('pdp-active-img');const root=document.getElementById('drawer-root');root.innerHTML=`<div class="drawer-backdrop" data-action="close-drawer"><div class="zoom-panel" role="dialog" aria-modal="true" aria-label="Product image zoom"><button type="button" class="btn-capsule-secondary" data-action="close-drawer">Close image</button><img src="${escapeHtml(img.src)}" alt="${escapeHtml(img.alt)}" /></div></div>`;root.querySelector('button').focus();return;}

    const action = actionBtn.getAttribute('data-action');

    if (action === 'open-mobile-menu') {
      openMobileMenuDrawer();
      return;
    }
    if (action === 'close-drawer') {
      if(actionBtn.classList.contains('drawer-backdrop') && e.target!==actionBtn)return;
      closeDrawer();
      return;
    }
    if (action === 'toggle-collections-dropdown') {
      const container = document.getElementById('side-nav-collections-dropdown');
      if (container) {
        const isOpen = container.classList.toggle('open');
        actionBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      }
      return;
    }
    if (action === 'logout') {
      await apiFetch('/api/auth/logout', { method: 'POST' });
      state.user = null;
      showToast('Logged out successfully.');
      await navigateTo('/');
      return;
    }
    if (action === 'add-demo-sandbox') {
      actionBtn.disabled = true;
      try {
        const res = await apiFetch('/api/cart/demo-sandbox', { method: 'POST' });
        state.cart = res.cart;
        openAddedToBagDrawer('Product 01 / Variant A (SCHA-001-A · RM129.00 [DEMO])');
        await renderRoute();
      } catch (err) {
        showToast(err.message);
      } finally {
        actionBtn.disabled = false;
      }
      return;
    }
    if (action === 'clear-shop-filters') {
      const path = window.location.pathname.startsWith('/collections/') ? window.location.pathname : '/shop';
      await navigateTo(path);
      return;
    }
    if (action === 'continue-as-guest') {
      state.checkoutDraft.guestContinued = true;
      await renderRoute();
      return;
    }
    if (action === 'checkout-back-to-shipping') {
      state.checkoutDraft.step = 1;
      await renderRoute();
      return;
    }
    if (action === 'place-order-submit') {
      actionBtn.disabled = true;
      actionBtn.textContent = 'Reserving stock & placing order...';
      try {
        const d = state.checkoutDraft;
        const res = await apiFetch('/api/checkout/place-order', {
          method: 'POST',
          body: {
            expected_total_minor: state.cart.total_minor,
            idempotency_key: d.orderRequestKey || (d.orderRequestKey = crypto.randomUUID()),
            email: d.email,
            phone: d.phone,
            shipping_method_id: d.shipping_method_id,
            billing_same_as_shipping: d.billing_same_as_shipping,
            shipping_address: {
              recipient_name: d.recipient_name,
              line1: d.line1,
              line2: d.line2,
              postcode: d.postcode,
              city: d.city,
              state: d.state,
              country: 'Malaysia'
            }
          }
        });
        state.checkoutDraft.createdOrder = res.order;
        state.checkoutDraft.step = 1;
        showToast(`Order #${res.order.order_number} created — Awaiting DuitNow QR payment.`);
        await navigateTo(`/order/confirmation?order=${encodeURIComponent(res.order.order_number)}&token=${encodeURIComponent(res.order.guest_access_token || '')}`);
      } catch (err) {
        showToast(err.message);
        actionBtn.disabled = false;
        actionBtn.textContent = 'Place order';
      }
      return;
    }
    if (action === 'refresh-order-status') {
      const ord = actionBtn.getAttribute('data-order');
      const tok = actionBtn.getAttribute('data-token');
      await navigateTo(`/order/confirmation?order=${encodeURIComponent(ord)}${tok ? `&token=${encodeURIComponent(tok)}` : ''}`, true);
      showToast('Refreshed saved order state.');
      return;
    }
    if (action === 'fill-demo-customer' || action === 'fill-demo-admin') {showToast('Use the account supplied with your isolated test environment.');return;}
    if (action === 'newsletter-unsubscribe') {
      const form = document.getElementById('newsletter-form');
      const email = form ? form.querySelector('input[name="email"]').value : '';
      if (!email) {
        showToast('Enter your email in the newsletter field to unsubscribe.');
        return;
      }
      await apiFetch('/api/newsletter/unsubscribe', { method: 'POST', body: { email } });
      showToast('Unsubscribed from marketing emails.');
      return;
    }
    if (action === 'publish-all-content') {
      await apiFetch('/api/admin/content/publish-all', { method: 'POST' });
      showToast('Published all homepage content sections.');
      await renderRoute();
      return;
    }
    if (action === 'delete-or-archive-product') {
      const prodId = actionBtn.getAttribute('data-product-id');
      try {
        const res = await apiFetch(`/api/admin/products/${prodId}`, { method: 'DELETE' });
        showToast(res.message);
        await navigateTo('/admin/products');
      } catch (err) {
        showToast(err.message);
      }
      return;
    }
    if (action === 'restock-order-goods') {
      const ordId = actionBtn.getAttribute('data-order-id');
      try {
        const res = await apiFetch(`/api/admin/orders/${ordId}/restock`, { method: 'POST' });
        showToast(res.message);
        await renderRoute();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }
    if (action === 'anonymise-customer') {
      const custId = actionBtn.getAttribute('data-customer-id');
      try {
        const res = await apiFetch(`/api/admin/customers/${custId}/anonymise`, {
          method: 'POST',
          body: { reason: 'Admin executed privacy anonymisation per policy' }
        });
        showToast(res.message);
        await navigateTo('/admin/customers');
      } catch (err) {
        showToast(err.message);
      }
      return;
    }
  }

  // Filter buttons on /shop and /collections/[slug]
  const filterBtn = e.target.closest('[data-filter-key]');
  if (filterBtn) {
    const key = filterBtn.getAttribute('data-filter-key');
    const val = filterBtn.getAttribute('data-filter-val');
    const urlObj = new URL(window.location.href);
    if (key === 'category') {
      if (val) {
        await navigateTo(`/collections/${encodeURIComponent(val)}`);
      } else {
        await navigateTo('/shop');
      }
      return;
    }
    if (val) urlObj.searchParams.set(key, val);
    else urlObj.searchParams.delete(key);
    urlObj.searchParams.delete('page');
    await navigateTo(urlObj.pathname + urlObj.search);
    return;
  }

  // Pagination button
  const pageBtn = e.target.closest('[data-page]');
  if (pageBtn) {
    const pNum = pageBtn.getAttribute('data-page');
    const urlObj = new URL(window.location.href);
    urlObj.searchParams.set('page', pNum);
    await navigateTo(urlObj.pathname + urlObj.search);
    return;
  }

  // PDP Thumbnail switcher
  const thumbBtn = e.target.closest('[data-pdp-thumb]');
  if (thumbBtn && currentPdpData) {
    const idx = Number(thumbBtn.getAttribute('data-pdp-thumb'));
    const appEl = document.getElementById('app');
    appEl.innerHTML = renderProductDetailPage(currentPdpData, idx);
    return;
  }

  // Cart Quantity & Remove
  const qtyBtn = e.target.closest('[data-cart-qty]');
  if (qtyBtn) {
    const itemId = Number(qtyBtn.getAttribute('data-cart-qty'));
    const delta = Number(qtyBtn.getAttribute('data-delta'));
    const item = (state.cart.items || []).find((i) => i.cart_item_id === itemId);
    if (item) {
      try {
        const res = await apiFetch(`/api/cart/items/${itemId}`, {
          method: 'PATCH',
          body: { quantity: item.quantity + delta }
        });
        state.cart = res.cart;
        await renderRoute();
      } catch (err) {
        showToast(err.message);
      }
    }
    return;
  }

  const removeBtn = e.target.closest('[data-cart-remove]');
  if (removeBtn) {
    if(removeBtn.disabled)return;removeBtn.disabled=true;
    try{const itemId=Number(removeBtn.getAttribute('data-cart-remove'));const result=await apiFetch(`/api/cart/items/${itemId}`,{method:'DELETE'});state.cart=result.cart;showToast('Item removed from bag.');await renderRoute();}
    catch(err){showToast(err.message);removeBtn.disabled=false;}
    return;
  }

  // Delete customer address
  const delAddrBtn = e.target.closest('[data-delete-address]');
  if (delAddrBtn) {
    const id = delAddrBtn.getAttribute('data-delete-address');
    await apiFetch(`/api/account/addresses/${id}`, { method: 'DELETE' });
    showToast('Address deleted.');
    await renderRoute();
    return;
  }

  // Admin REF-05 / REF-06 duplicate resolution
  const dupBtn = e.target.closest('[data-dup-resolve]');
  if (dupBtn) {
    const resolution = dupBtn.getAttribute('data-dup-resolve');
    try {
      const res = await apiFetch('/api/admin/products/resolve-duplicate', {
        method: 'POST',
        body: { resolution }
      });
      showToast(res.message);
      await renderRoute();
    } catch (err) {
      showToast(err.message);
    }
    return;
  }

  // Admin Payment Review Queue Selection
  const reviewSelBtn = e.target.closest('[data-select-review-order]');
  if (reviewSelBtn) {
    const ordId = reviewSelBtn.getAttribute('data-select-review-order');
    await navigateTo(`/admin/payment-reviews?orderId=${encodeURIComponent(ordId)}`, true);
    return;
  }

  // Admin Retry Notification
  const retryBtn = e.target.closest('[data-retry-notification]');
  if (retryBtn) {
    const jobId = retryBtn.getAttribute('data-retry-notification');
    try {
      const res = await apiFetch(`/api/admin/notifications/${jobId}/retry`, { method: 'POST' });
      showToast(res.message);
      await renderRoute();
    } catch (err) {
      showToast(err.message);
    }
    return;
  }
});

// Change events (Checkout state shipping recalculation, Saved address picker, Admin demo toggle, Inventory preview)
document.addEventListener('change', async (e) => {
  if (e.target.id === 'co-state' || e.target.name === 'shipping_method_id') {
    const form = document.getElementById('checkout-shipping-form');
    if (form) {
      const fd = new FormData(form);
      state.checkoutDraft.email = fd.get('email') || '';
      state.checkoutDraft.phone = fd.get('phone') || '';
      state.checkoutDraft.recipient_name = fd.get('recipient_name') || '';
      state.checkoutDraft.line1 = fd.get('line1') || '';
      state.checkoutDraft.line2 = fd.get('line2') || '';
      state.checkoutDraft.postcode = fd.get('postcode') || '';
      state.checkoutDraft.city = fd.get('city') || '';
      state.checkoutDraft.state = fd.get('state') || 'Wilayah Persekutuan Kuala Lumpur';
      state.checkoutDraft.shipping_method_id = fd.get('shipping_method_id') || null;
      await renderRoute();
    }
    return;
  }

  if (e.target.id === 'saved-address-picker') {
    const opt = e.target.selectedOptions[0];
    if (opt && opt.dataset.addr) {
      const addr = JSON.parse(opt.dataset.addr);
      state.checkoutDraft.recipient_name = addr.recipient_name;
      state.checkoutDraft.phone = addr.phone;
      state.checkoutDraft.line1 = addr.line1;
      state.checkoutDraft.line2 = addr.line2 || '';
      state.checkoutDraft.postcode = addr.postcode;
      state.checkoutDraft.city = addr.city;
      state.checkoutDraft.state = addr.state;
      await renderRoute();
    }
    return;
  }

  if (e.target.id === 'admin-toggle-demo') {
    state.adminIncludeDemo = e.target.checked;
    await renderRoute();
    return;
  }

  if (e.target.id === 'admin-upload-prod-media') {
    const file = e.target.files[0];
    const prodId = e.target.getAttribute('data-product-id');
    if (file && prodId) {
      const fd = new FormData();
      fd.append('media', file);
      try {
        const res = await apiFetch(`/api/admin/products/${prodId}/media`, { method: 'POST', body: fd });
        showToast(res.message);
        await renderRoute();
      } catch (err) {
        showToast(err.message);
      }
    }
    return;
  }

  if (e.target.id === 'fulfil-courier-select') {
    const badge = document.getElementById('courier-autodetect-badge');
    const trackingInput = document.getElementById('fulfil-tracking-input');
    const detected = trackingInput ? detectCourierFromTracking(trackingInput.value) : null;
    if (badge) {
      badge.style.display = detected && e.target.value === detected.courierName ? 'inline-flex' : 'none';
    }
    return;
  }
});

// Input live before/after preview on Admin Inventory Adjustment & Courier Auto-Detection
document.addEventListener('input', (e) => {
  if (e.target.id === 'inv-delta' || e.target.id === 'inv-sku-select') {
    const sel = document.getElementById('inv-sku-select');
    const deltaInput = document.getElementById('inv-delta');
    const banner = document.getElementById('inv-preview-banner');
    if (sel && deltaInput && banner) {
      const opt = sel.selectedOptions[0];
      const before = Number(opt?.dataset?.onhand || 0);
      const delta = Number(deltaInput.value || 0);
      const after = before + delta;
      banner.textContent = `Preview (${opt?.dataset?.sku || 'SKU'}): On hand ${before} > ${after} (${delta >= 0 ? `+${delta}` : delta})`;
    }
    return;
  }

  if (e.target.id === 'fulfil-tracking-input') {
    const trackingVal = e.target.value;
    const detected = detectCourierFromTracking(trackingVal);
    const courierSelect = document.getElementById('fulfil-courier-select');
    const badge = document.getElementById('courier-autodetect-badge');
    const hint = document.getElementById('courier-autodetect-hint');

    if (detected && courierSelect) {
      courierSelect.value = detected.courierName;
      if (badge) badge.style.display = 'inline-flex';
      if (hint) {
        hint.innerHTML = `Detected <strong>${escapeHtml(detected.courierName)}</strong> (${escapeHtml(detected.matchedRule)})`;
      }
    } else {
      if (badge) badge.style.display = 'none';
      if (hint) {
        hint.textContent = String(trackingVal || '').trim().length >= 3
          ? 'Custom tracking number — please select the courier from the dropdown.'
          : 'Enter tracking number to auto-detect PosLaju, J&T, NinjaVan, SPX, DHL, Flash, GDEX or City-Link.';
      }
    }
  }
});

// Form Submissions
document.addEventListener('submit', async (e) => {
  const form = e.target;

  if (form.id === 'shop-search-sort-form') {
    e.preventDefault();
    const fd = new FormData(form);
    const urlObj = new URL(window.location.href);
    const q = String(fd.get('q') || '').trim();
    const sort = String(fd.get('sort') || 'featured');
    if (q) urlObj.searchParams.set('q', q);
    else urlObj.searchParams.delete('q');
    urlObj.searchParams.set('sort', sort);
    await navigateTo(urlObj.pathname + urlObj.search);
    return;
  }

  if (form.id === 'pdp-add-to-bag-form') {
    e.preventDefault();
    const prodId = Number(form.getAttribute('data-product-id'));
    const fd = new FormData(form);
    const submit=form.querySelector('[type=submit]');if(submit.disabled)return;submit.disabled=true;const label=submit.textContent;submit.textContent='Adding...';
    try {
      const res = await apiFetch('/api/cart/items', {
        method: 'POST',
        body: {
          product_id: prodId,
          variant_id: Number(fd.get('variant_id')),
          quantity: Number(fd.get('quantity') || 1)
        }
      });
      state.cart = res.cart;
      document.querySelector('.bag-pill-count')?.replaceChildren(document.createTextNode(String(state.cart.itemCount)));
      const bagLink=document.querySelector('.header-cart-btn');if(bagLink){bagLink.setAttribute('aria-label',`Shopping Cart (${state.cart.itemCount} items)`);bagLink.title=`Shopping Cart (${state.cart.itemCount} items)`;}
      openAddedToBagDrawer(currentPdpData?.product?.title || 'Item');
    } catch (err) {
      showToast(err.message);showFormError(form,err);
    } finally {submit.disabled=false;submit.textContent=label;}
    return;
  }

  if (form.id === 'checkout-shipping-form') {
    e.preventDefault();
    const fd = new FormData(form);
    state.checkoutDraft.email = String(fd.get('email') || '').trim();
    state.checkoutDraft.phone = String(fd.get('phone') || '').trim();
    state.checkoutDraft.recipient_name = String(fd.get('recipient_name') || '').trim();
    state.checkoutDraft.line1 = String(fd.get('line1') || '').trim();
    state.checkoutDraft.line2 = String(fd.get('line2') || '').trim();
    state.checkoutDraft.postcode = String(fd.get('postcode') || '').trim();
    state.checkoutDraft.city = String(fd.get('city') || '').trim();
    state.checkoutDraft.state = String(fd.get('state') || 'Wilayah Persekutuan Kuala Lumpur');
    state.checkoutDraft.shipping_method_id = fd.get('shipping_method_id') || null;
    state.checkoutDraft.billing_same_as_shipping = fd.get('billing_same_as_shipping') === 'on';
    state.checkoutDraft.orderRequestKey = crypto.randomUUID();
    state.checkoutDraft.step = 2;
    await renderRoute();
    return;
  }

  if (form.id === 'submit-receipt-form') {
    e.preventDefault();
    const ordNum = form.getAttribute('data-order-number');
    const tok = form.getAttribute('data-guest-token');
    const fd = new FormData(form);
    const fileInput = form.querySelector('input[type="file"]');

    const payload = new FormData();
    payload.append('declared_reference', String(fd.get('declared_reference') || '').trim());
    payload.append('declared_amount', String(fd.get('declared_amount') || '').trim());
    payload.append('declared_paid_at', String(fd.get('declared_paid_at') || '').trim());

    if (fileInput && fileInput.files && fileInput.files[0]) {
      payload.append('receipt', fileInput.files[0]);
    } else if (fd.get('use_demo_sample_receipt')) {
      // Attach valid minimal 1x1 PNG receipt for testing
      payload.append('receipt_base64', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
      payload.append('receipt_filename', 'duitnow_receipt.png');
    }

    try {
      const res = await apiFetch(`/api/orders/${encodeURIComponent(ordNum)}/payment-submission${tok ? `?token=${encodeURIComponent(tok)}` : ''}`, {
        method: 'POST',
        body: payload
      });
      showToast(res.message);
      await renderRoute();
    } catch (err) {
      showToast(err.message);showFormError(form,err);
    }
    return;
  }

  if (form.id === 'guest-verify-form') {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      const res = await apiFetch('/api/orders/guest-verify', {
        method: 'POST',
        body: {
          order_number: fd.get('order_number'),
          email: fd.get('email')
        }
      });
      showToast('Order verified.');
      await navigateTo(res.redirect_url);
    } catch (err) {
      showToast(err.message);showFormError(form,err);
    }
    return;
  }

  if (form.id === 'customer-login-form') {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: { email: fd.get('email'), password: fd.get('password') }
      });
      if (res.user) {
        state.user = res.user;
      }
      if (res.csrfToken) {
        state.csrfToken = res.csrfToken;
      }
      if (res.user && res.user.role === 'ADMIN') {
        showToast('Logged in to Shop by SCHA Admin Workspace.');
        await navigateTo('/admin');
        return;
      }
      showToast('Welcome back to Shop by SCHA.');
      const requestedRedirect=new URLSearchParams(window.location.search).get('redirect');
      const redir = requestedRedirect?.startsWith('/') && !requestedRedirect.startsWith('//') ? requestedRedirect : '/account';
      await navigateTo(redir);
    } catch (err) {
      showToast(err.message);showFormError(form,err);
    }
    return;
  }

  if (form.id === 'customer-register-form') {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      await apiFetch('/api/auth/register', {
        method: 'POST',
        body: {
          name: fd.get('name'),
          email: fd.get('email'),
          phone: fd.get('phone'),
          password: fd.get('password')
        }
      });
      showToast('Customer account created.');
      await navigateTo('/account');
    } catch (err) {
      showToast(err.message);showFormError(form,err);
    }
    return;
  }

  if (form.id === 'customer-forgot-form' || form.id === 'admin-forgot-form') {
    e.preventDefault();
    const fd = new FormData(form);
    const isAdmin = form.id === 'admin-forgot-form';
    try {
      const res = await apiFetch(isAdmin ? '/api/admin/auth/forgot-password' : '/api/auth/forgot-password', {
        method: 'POST',
        body: { email: fd.get('email') }
      });
      showToast(res.message);
      const box = document.getElementById(isAdmin ? 'admin-reset-box' : 'forgot-reset-box');
      if (box && res.demoResetToken) {
        box.innerHTML = `
          <form id="complete-reset-form" style="background:var(--pink-soft);padding:14px;border-radius:var(--radius-sm);margin:12px 0;">
            <div class="field-group">
              <label class="field-label">Recovery Token</label>
              <input type="text" name="token" class="input-field" value="${escapeHtml(res.demoResetToken)}" required />
            </div>
            <div class="field-group">
              <label class="field-label">New Password (min 8 chars)</label>
              <input type="password" name="new_password" class="input-field" minlength="8" required />
            </div>
            <button type="submit" class="btn-capsule-primary" style="width:100%;">Set New Password</button>
          </form>
        `;
      }
    } catch (err) {
      showToast(err.message);showFormError(form,err);
    }
    return;
  }

  if (form.id === 'complete-reset-form') {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      const res = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: { token: fd.get('token'), new_password: fd.get('new_password') }
      });
      showToast(res.message);
      await navigateTo('/login');
    } catch (err) {
      showToast(err.message);showFormError(form,err);
    }
    return;
  }

  if (form.id === 'account-address-form') {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      await apiFetch('/api/account/addresses', {
        method: 'POST',
        body: {
          label: fd.get('label'),
          recipient_name: fd.get('recipient_name'),
          phone: fd.get('phone'),
          line1: fd.get('line1'),
          postcode: fd.get('postcode'),
          city: fd.get('city'),
          state: fd.get('state'),
          is_default_shipping: fd.get('is_default_shipping') === 'on',
          is_default_billing: fd.get('is_default_billing') === 'on'
        }
      });
      showToast('Address added.');
      await renderRoute();
    } catch (err) {
      showToast(err.message);showFormError(form,err);
    }
    return;
  }

  if (form.id === 'account-profile-form') {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      const res = await apiFetch('/api/account/profile', {
        method: 'PUT',
        body: {
          name: fd.get('name'),
          phone: fd.get('phone'),
          current_password: fd.get('current_password'),
          new_password: fd.get('new_password')
        }
      });
      showToast(res.message);
      await renderRoute();
    } catch (err) {
      showToast(err.message);showFormError(form,err);
    }
    return;
  }

  if (form.id === 'newsletter-form') {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      const res = await apiFetch('/api/newsletter/subscribe', {
        method: 'POST',
        body: { email: fd.get('email'), consent: fd.get('consent') === 'on' }
      });
      showToast(res.message);
      form.reset();
    } catch (err) {
      showToast(err.message);showFormError(form,err);
    }
    return;
  }

  // ADMIN FORMS
  if (form.id === 'admin-login-form') {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      const res = await apiFetch('/api/admin/auth/login', {
        method: 'POST',
        body: {
          email: fd.get('email'),
          password: fd.get('password'),
          mfa_code: fd.get('mfa_code')
        }
      });
      if (res.mfaRequired) {
        const mfaGroup = document.getElementById('admin-mfa-group');
        if (mfaGroup) mfaGroup.style.display = 'flex';
        showToast(res.message);
        return;
      }
      if (res.user) {
        state.user = res.user;
      }
      if (res.csrfToken) {
        state.csrfToken = res.csrfToken;
      }
      showToast('Logged in to Shop by SCHA Admin Workspace.');
      await navigateTo('/admin');
    } catch (err) {
      showToast(err.message);showFormError(form,err);
    }
    return;
  }

  if (form.id === 'admin-overview-date-form') {
    e.preventDefault();
    const fd = new FormData(form);
    state.adminDateFrom = fd.get('date_from') || '2026-10-01';
    state.adminDateTo = fd.get('date_to') || '2026-10-31';
    await renderRoute();
    return;
  }

  if (form.id === 'admin-product-editor-form') {
    e.preventDefault();
    const prodId = form.getAttribute('data-product-id');
    const submitter = e.submitter;
    const forcedStatus = submitter ? submitter.getAttribute('data-submit-status') : null;
    const fd = new FormData(form);

    const payload = {
      title: fd.get('title'),
      slug: fd.get('slug'),
      sellable_sku: fd.get('sellable_sku'),
      category_slug: fd.get('category_slug'),
      brand: fd.get('brand'),
      price_myr: fd.get('price_myr'),
      stock_quantity: fd.get('stock_quantity'),
      publish_status: forcedStatus || fd.get('publish_status'),
      model: fd.get('model'),
      reference_colour_description: fd.get('reference_colour_description'),
      low_stock_threshold: fd.get('low_stock_threshold'),
      description: fd.get('description'),
      stock_type: fd.get('stock_type'),
      shipping_returns_note: fd.get('shipping_returns_note'),
      notes: fd.get('notes')
    };

    try {
      payload.specifications=JSON.parse(fd.get('specifications_json') || '{}');
      const variants=JSON.parse(fd.get('variants_json') || '[]');
      if(variants.length)payload.variants=variants;
      const res = await apiFetch(prodId ? `/api/admin/products/${prodId}` : '/api/admin/products', {
        method: prodId ? 'PUT' : 'POST',
        body: payload
      });
      showToast(res.message);
      await navigateTo(`/admin/products/${res.product.id}`);
    } catch (err) {
      showToast(err.message);showFormError(form,err);
    }
    return;
  }

  if (form.id === 'admin-adjust-stock-form') {
    e.preventDefault();
    const fd = new FormData(form);
    const sel = document.getElementById('inv-sku-select');
    const opt = sel ? sel.selectedOptions[0] : null;
    try {
      const res = await apiFetch('/api/admin/inventory/adjust', {
        method: 'POST',
        body: {
          variant_id: Number(fd.get('variant_id')),
          delta: Number(fd.get('delta')),
          reason: fd.get('reason'),
          expected_version: opt ? Number(opt.dataset.version) : undefined
        }
      });
      showToast(res.message);
      await renderRoute();
    } catch (err) {
      showToast(err.message);showFormError(form,err);
    }
    return;
  }

  if (form.id === 'admin-payment-verify-form') {
    e.preventDefault();
    const ordId = form.getAttribute('data-order-id');
    const action = e.submitter ? e.submitter.getAttribute('data-review-action') : 'confirm_payment';
    const fd = new FormData(form);

    try {
      const res = await apiFetch(`/api/admin/payment-reviews/${ordId}`, {
        method: 'POST',
        body: {
          action,
          received_amount: fd.get('received_amount'),
          actual_bank_reference: fd.get('actual_bank_reference'),
          audit_note: fd.get('audit_note'),
          resubmission_reason: fd.get('audit_note'),
          bank_records_checked: fd.get('bank_records_checked') === 'on'
        }
      });
      showToast(res.message);
      await renderRoute();
    } catch (err) {
      showToast(err.message);showFormError(form,err);
    }
    return;
  }

  if (form.id === 'admin-orders-filter-form') {
    e.preventDefault();
    const fd = new FormData(form);
    const q = fd.get('q') || '';
    const ps = fd.get('payment_status') || '';
    const fs = fd.get('fulfilment_status') || '';
    await navigateTo(`/admin/orders?q=${encodeURIComponent(q)}&payment_status=${encodeURIComponent(ps)}&fulfilment_status=${encodeURIComponent(fs)}`);
    return;
  }

  if (form.id === 'admin-fulfilment-form') {
    e.preventDefault();
    const ordId = form.getAttribute('data-order-id');
    const nextStatus = e.submitter ? e.submitter.getAttribute('data-fulfil-status') : 'processing';
    const fd = new FormData(form);
    const trackingNumber = String(fd.get('tracking_number') || '').trim();
    const detected = detectCourierFromTracking(trackingNumber);
    const courierName = String(fd.get('courier_name') || '').trim() || (detected ? detected.courierName : '');
    const trackingUrl = detected && courierName === detected.courierName ? detected.trackingUrl : '';

    try {
      const res = await apiFetch(`/api/admin/orders/${ordId}/fulfilment`, {
        method: 'POST',
        body: {
          fulfilment_status: nextStatus,
          courier_name: courierName,
          tracking_number: trackingNumber,
          tracking_url: trackingUrl,
          internal_notes: fd.get('internal_notes')
        }
      });
      showToast(res.message);
      await renderRoute();
    } catch (err) {
      showToast(err.message);showFormError(form,err);
    }
    return;
  }

  if (form.id === 'admin-refund-initiate-form') {
    e.preventDefault();
    const ordId = form.getAttribute('data-order-id');
    const fd = new FormData(form);
    try {
      const res = await apiFetch(`/api/admin/orders/${ordId}/refund-initiate`, {
        method: 'POST',
        body: {
          amount_myr: fd.get('amount_myr'),
          reason: fd.get('reason')
        }
      });
      showToast(res.message);
      await renderRoute();
    } catch (err) {
      showToast(err.message);showFormError(form,err);
    }
    return;
  }

  if (form.id === 'admin-refund-complete-form') {
    e.preventDefault();
    const ordId = form.getAttribute('data-order-id');
    const refundId = form.getAttribute('data-refund-id');
    const fd = new FormData(form);
    try {
      const res = await apiFetch(`/api/admin/orders/${ordId}/refund-complete`, {
        method: 'POST',
        body: {
          refund_id: Number(refundId),
          external_bank_reference: fd.get('external_bank_reference'),
          transferred_at: fd.get('transferred_at')
        }
      });
      showToast(res.message);
      await renderRoute();
    } catch (err) {
      showToast(err.message);showFormError(form,err);
    }
    return;
  }

  if (form.id === 'admin-content-hero-form') {
    e.preventDefault();
    const publishNow = e.submitter?.getAttribute('data-publish') === '1';
    const fd = new FormData(form);
    try {
      const res = await apiFetch('/api/admin/content/H01_H02', {
        method: 'PUT',
        body: {
          publish_now: publishNow,
          draft: {
            slot_desktop: 'H01',
            slot_mobile: 'H02',
            headline: fd.get('headline'),
            subheadline: fd.get('subheadline'),
            cta_text: fd.get('cta_text'),
            cta_link: fd.get('cta_link'),
            hero_image_path: fd.get('hero_image_path'),
            hero_image_alt: 'Hero Product Layer',
            show_chrome_accent: true,
            visible: true
          }
        }
      });
      showToast(res.message);
      await renderRoute();
    } catch (err) {
      showToast(err.message);showFormError(form,err);
    }
    return;
  }

  if (form.id === 'admin-content-newarrivals-form') {
    e.preventDefault();
    const publishNow = e.submitter?.getAttribute('data-publish') === '1';
    const fd = new FormData(form);
    const refs = String(fd.get('selected_references') || '').split(',').map((s) => s.trim()).filter(Boolean);
    try {
      const res = await apiFetch('/api/admin/content/N01_N03', {
        method: 'PUT',
        body: {
          publish_now: publishNow,
          draft: {
            slot_range: 'N01-N03',
            heading: fd.get('heading'),
            cta_pill_text: fd.get('cta_pill_text'),
            selected_references: refs,
            visible: true
          }
        }
      });
      showToast(res.message);
      await renderRoute();
    } catch (err) {
      showToast(err.message);showFormError(form,err);
    }
    return;
  }

  if (form.id === 'admin-content-editorial-form') {
    e.preventDefault();
    const publishNow = e.submitter?.getAttribute('data-publish') === '1';
    const fd = new FormData(form);
    const existingEd = state.storefront?.content?.E01_E03 || {};
    try {
      const res = await apiFetch('/api/admin/content/E01_E03', {
        method: 'PUT',
        body: {
          publish_now: publishNow,
          draft: {
            ...existingEd,
            decorative_word: fd.get('decorative_word'),
            lead_paragraph: fd.get('lead_paragraph'),
            body_paragraph: fd.get('body_paragraph'),
            visible: true
          }
        }
      });
      showToast(res.message);
      await renderRoute();
    } catch (err) {
      showToast(err.message);showFormError(form,err);
    }
    return;
  }

  if (form.id === 'admin-qr-settings-form') {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = new FormData();
    payload.append('recipient_name', String(fd.get('recipient_name') || '').trim());
    payload.append('bank_name', String(fd.get('bank_name') || '').trim());
    payload.append('payment_deadline_minutes', String(fd.get('payment_deadline_minutes') || '30'));
    payload.append('review_window_hours', String(fd.get('review_window_hours') || '24'));
    payload.append('demo_qr_enabled', fd.get('demo_qr_enabled') === 'on' ? 'true' : 'false');
    const fileInput = form.querySelector('input[type="file"]');
    if (fileInput && fileInput.files && fileInput.files[0]) {
      payload.append('qr_image', fileInput.files[0]);
    }
    try {
      const res = await apiFetch('/api/admin/settings/payment-qr', { method: 'POST', body: payload });
      showToast(res.message);
      await renderRoute();
    } catch (err) {
      showToast(err.message);showFormError(form,err);
    }
    return;
  }

  if (form.id === 'admin-general-settings-form') {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      const res = await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: {
          store_name: fd.get('store_name'),
          support_hours:fd.get('support_hours'),business_identity:fd.get('business_identity'),founder_story:fd.get('founder_story'),sourcing_info:fd.get('sourcing_info'),
          policies:JSON.parse(fd.get('policies_json') || '{}'),shipping_zones:JSON.parse(fd.get('shipping_zones_json') || '[]'),
          support_email: fd.get('support_email'),
          support_phone: fd.get('support_phone'),
          design_preview_enabled: fd.get('design_preview_enabled') === 'on'
        }
      });
      showToast(res.message);
      await renderRoute();
    } catch (err) {
      showToast(err.message);showFormError(form,err);
    }
    return;
  }
});

window.addEventListener('popstate', () => {
  renderRoute();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeDrawer();
  }
});

renderRoute().catch(err=>{document.getElementById('app').innerHTML='<main class="page-container"><h1>We could not load the shop</h1><p>Please refresh to try again.</p></main>';showToast(err.message);});

document.addEventListener('keydown',e=>{
 const dialog=document.querySelector('[role="dialog"]');if(!dialog)return;
 if(e.key==='Escape'){e.preventDefault();closeDrawer();return;}
 if(e.key==='Tab'){const targets=[...dialog.querySelectorAll('button,a[href],input,select,textarea')].filter(el=>!el.disabled && el.getClientRects().length);const first=targets[0],last=targets.at(-1);if(e.shiftKey && document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
});
document.addEventListener('touchstart',e=>{if(e.target.closest('.pdp-main-media'))swipeStart=e.touches[0].clientX;},{passive:true});
document.addEventListener('touchend',e=>{if(swipeStart===null)return;const dx=e.changedTouches[0].clientX-swipeStart;swipeStart=null;if(Math.abs(dx)<45)return;const thumbs=[...document.querySelectorAll('[data-pdp-thumb]')];const i=thumbs.findIndex(el=>el.classList.contains('active'));thumbs[(i+(dx<0?1:-1)+thumbs.length)%thumbs.length]?.click();},{passive:true});

function showFormError(form,error){
 if(!form)return;form.querySelector('[data-form-error]')?.remove();
 const alert=document.createElement('div');alert.dataset.formError='1';alert.className='form-error';alert.setAttribute('role','alert');alert.tabIndex=-1;alert.textContent=error.message;form.prepend(alert);
 if(error.data?.field){const input=form.querySelector(`[name="${CSS.escape(error.data.field)}"]`);input?.setAttribute('aria-invalid','true');input?.focus();}else alert.focus();
}
let fieldSequence=0;
new MutationObserver(()=>{for(const label of document.querySelectorAll('label.field-label:not([for])')){const control=label.nextElementSibling;if(control?.matches('input,select,textarea')){if(!control.id)control.id='scha-field-'+(++fieldSequence);label.htmlFor=control.id;}}}).observe(document.getElementById('app'),{childList:true,subtree:true});
