import {
  state,
  escapeHtml,
  formatKLDate,
  getPaymentBadgeClass,
  getFulfilmentBadgeClass,
  MALAYSIAN_STATES
} from './state.js';

export function renderStorefrontHeader(currentPath = '/') {
  const sf = state.storefront;
  const b01 = sf?.content?.B01_POLICIES || {};
  const bagCount = state.cart?.itemCount || 0;
  const accountHref = state.user ? (state.user.role === 'ADMIN' ? '/admin' : '/account') : '/login';
  const accountLabel = state.user ? (state.user.role === 'ADMIN' ? 'Admin Workspace' : 'My Account') : 'Customer Account';

  return `
    ${sf?.sandbox ? '<div class="preview-mode-banner" role="status">TEST PREVIEW — Sample data. No real payments or purchases.</div>' : ''}
    ${sf?.isPreviewMode ? `
      <div class="preview-mode-banner" role="region" aria-label="Admin Draft Preview Mode">
        <div><strong>ADMIN DRAFT PREVIEW</strong> — Viewing unpublished homepage content changes.</div>
        <div style="display:flex;gap:12px;">
          <a href="/admin/content" data-nav class="btn-pill-view" style="padding:5px 14px;font-size:12px;">Back to Content Editor</a>
          <a href="/" data-nav class="btn-pill-view" style="padding:5px 14px;font-size:12px;">Exit Preview</a>
        </div>
      </div>
    ` : ''}
    ${b01.announcement_enabled && b01.announcement_text ? `
      <div class="announcement-bar">${escapeHtml(b01.announcement_text.startsWith('DESIGN PREVIEW & LAUNCH STOREFRONT') ? 'Your next favourite, curated by SCHA.' : b01.announcement_text)}</div>
    ` : ''}
    <header class="site-header">
      <div class="header-inner">
        <div class="nav-left">
          <button
            type="button"
            class="header-icon-btn side-menu-trigger"
            data-action="open-mobile-menu"
            aria-label="Open side navigation menu"
            title="Menu"
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
        </div>

        <a href="/" data-nav class="brand-wordmark" aria-label="Shop by SCHA Home">
          <img src="/images/logo.png" alt="Shop by SCHA" class="brand-logo-img" />
        </a>

        <div class="nav-right">
          <a
            href="/search"
            data-nav
            class="header-icon-btn ${currentPath.startsWith('/search') ? 'active' : ''}"
            aria-label="Search products"
            title="Search"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7.5"></circle>
              <line x1="16.65" y1="16.65" x2="21" y2="21"></line>
            </svg>
          </a>

          <a
            href="${accountHref}"
            data-nav
            class="header-icon-btn ${currentPath.startsWith('/account') || currentPath === '/login' || currentPath.startsWith('/admin') ? 'active' : ''}"
            aria-label="${escapeHtml(accountLabel)}"
            title="${escapeHtml(accountLabel)}"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </a>

          <a
            href="/cart"
            data-nav
            class="header-icon-btn header-cart-btn ${currentPath === '/cart' ? 'active' : ''}"
            aria-label="Shopping Cart (${bagCount} items)"
            title="Shopping Cart (${bagCount} items)"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="9" cy="21" r="1.5"></circle>
              <circle cx="19" cy="21" r="1.5"></circle>
              <path d="M2.5 3h2.8l2.2 11.2a2 2 0 0 0 2 1.6h9.2a2 2 0 0 0 1.95-1.55L22 7H6.1"></path>
            </svg>
            <span class="bag-pill-count">${bagCount}</span>
          </a>
        </div>
      </div>
    </header>
  `;
}

export function renderStorefrontFooter() {
  const sf = state.storefront;
  const b01 = sf?.content?.B01_POLICIES || {};
  const stores = sf?.store?.physical_stores || [];
  const hasRealStores = Array.isArray(stores) && stores.length > 0;

  return `
    <footer class="site-footer" style="position:relative;z-index:2;background:var(--bg-offwhite);">
      <div class="footer-inner">
        <div class="footer-col footer-brand-col">
          <a href="/" data-nav class="brand-wordmark footer-brand-link">
            <img src="/images/logo.png" alt="Shop by SCHA" class="footer-logo-img" />
          </a>
          <div class="footer-brand-meta">
            <p class="footer-tagline">
              ${escapeHtml(b01.footer_tagline || 'Playful editorial curation across eyewear, bags, beauty and footwear.')}
            </p>
            <p class="footer-currency-note">
              Prices in MYR (RM)
            </p>
          </div>
        </div>

        <div class="footer-col footer-links-col">
          <h3 class="filter-group-title">Collections</h3>
          <div class="footer-links-list">
            <a href="/shop" data-nav class="nav-link">Shop All</a>
            <a href="/collections/eyewear" data-nav class="nav-link">Eyewear</a>
            <a href="/collections/bags" data-nav class="nav-link">Bags</a>
            <a href="/collections/beauty" data-nav class="nav-link">Beauty</a>
            <a href="/collections/footwear" data-nav class="nav-link">Footwear</a>
          </div>
        </div>

        <div class="footer-col footer-links-col">
          <h3 class="filter-group-title">Support &amp; Policies</h3>
          <div class="footer-links-list">
            <a href="/help/faq" data-nav class="nav-link">Help &amp; FAQ</a>
            <a href="/help/shipping" data-nav class="nav-link">Shipping</a>
            <a href="/help/returns" data-nav class="nav-link">Returns &amp; Refunds</a>
            <a href="/help/contact" data-nav class="nav-link">Contact</a>
            <a href="/help/privacy" data-nav class="nav-link">Privacy Policy</a>
            <a href="/help/terms" data-nav class="nav-link">Terms of Service</a>
            <a href="/order/confirmation" data-nav class="nav-link">Track Guest Order</a>
            ${hasRealStores ? `<a href="/stores" data-nav class="nav-link">Store Locator</a>` : ''}
          </div>
        </div>

        <div class="footer-col footer-newsletter-col">
          ${b01.newsletter_enabled !== false ? `
            <h3 class="filter-group-title">Editorial Newsletter</h3>
            <p class="footer-newsletter-desc">
              Optional marketing updates. Separate from transactional order emails.
            </p>
            <form id="newsletter-form" class="footer-newsletter-form">
              <div class="footer-newsletter-input-row">
                <input type="email" name="email" class="input-field" placeholder="Enter your email" required aria-label="Newsletter email" />
                <button type="submit" class="btn-capsule-primary footer-subscribe-btn">Subscribe</button>
              </div>
              <div class="footer-newsletter-consent-row">
                <label class="footer-consent-label">
                  <input type="checkbox" name="consent" required style="margin-top:2px;" />
                  <span>I explicitly consent to receive marketing emails from Shop by SCHA.</span>
                </label>
                <button type="button" class="nav-btn footer-unsub-btn" data-action="newsletter-unsubscribe">Unsubscribe</button>
              </div>
            </form>
          ` : ''}
        </div>
      </div>
      <div class="footer-bottom-bar">
        <span>© 2026 Shop by SCHA. Curated by SCHA.</span>
        <div class="footer-bottom-links">
          <a href="/help/about" data-nav>About</a>
          <a href="/help/shipping" data-nav>Shipping</a>
          <a href="/help/returns" data-nav>Returns</a>
          <a href="/help/contact" data-nav>Contact</a>
          <a href="/help/privacy" data-nav>Privacy</a>
          <a href="/help/terms" data-nav>Terms</a>
          <a href="/admin/login" data-nav style="color:var(--rose-deep);font-weight:600;">Admin Workspace</a>
        </div>
      </div>
    </footer>
  `;
}

function productMedia(p,media=null) {
 const m=media || p.media?.[0];
 if(m?.document_preview_bounds && m.width && m.height){const [x,y,right,bottom]=m.document_preview_bounds;const w=right-x,h=bottom-y,pad=Math.max(w,h)*.04;return `<svg class="product-image-view" viewBox="${x-pad} ${y-pad} ${w+2*pad} ${h+2*pad}" role="img" aria-label="${escapeHtml(m.alt||p.title)}"><image href="${escapeHtml(m.path)}" width="${m.width}" height="${m.height}" /></svg>`;}
 return `<img src="${escapeHtml(m?.path || p.primary_image)}" alt="${escapeHtml(m?.alt || p.title)}" loading="lazy" />`;
}
export function renderProductCard(p) {
  const isDraft = p.publish_status === 'draft';
  return `
    <article class="product-card">
      <div class="product-card-badges" ${state.storefront?.sandbox || state.storefront?.isPreviewMode ? '' : 'hidden'}>
        ${p.reference_id ? `<span class="badge badge-ref">${escapeHtml(p.reference_id)}</span>` : '<span></span>'}
        ${p.is_demo
          ? `<span class="badge badge-demo">DEMO SELLABLE</span>`
          : isDraft
            ? `<span class="badge badge-draft">DRAFT</span>`
            : `<span class="badge badge-paid">PUBLISHED</span>`
        }
      </div>
      <a href="/products/${encodeURIComponent(p.slug)}" data-nav class="product-card-media">
        ${productMedia(p)}
      </a>
      <p class="product-card-brand">${escapeHtml(p.brand)} · ${escapeHtml(p.category_slug)}</p>
      <h3 class="product-card-title">
        <a href="/products/${encodeURIComponent(p.slug)}" data-nav>${escapeHtml(p.title)}</a>
      </h3>
      <p class="product-card-price">${escapeHtml(p.price_formatted)}</p>
      <p class="product-card-meta">
        ${p.is_sellable ? (p.stock_type==='preorder'?'Preorder':'Available now') : 'Coming soon'}
      </p>
      <a href="/products/${encodeURIComponent(p.slug)}" data-nav class="product-card-link">
        ${p.is_sellable ? 'Select variant &amp; buy &gt;' : 'View product &gt;'}
      </a>
    </article>
  `;
}

// =========================================================================
// HOMEPAGE (/) — Matches Wireframe Page 5 & Visual Reference
// =========================================================================
export function renderHomePage() {
  const sf = state.storefront;
  const hero = sf?.content?.H01_H02 || {};
  const newArr = sf?.content?.N01_N03 || {};
  const editorial = sf?.content?.E01_E03 || {};
  const colls = sf?.content?.C01_C04 || {};
  const allProducts = sf?.products || [];

  const selectedRefs = newArr.selected_references || ['REF-08', 'REF-01', 'REF-09'];
  const newArrivalProducts = selectedRefs
    .map((ref) => allProducts.find((p) => p.reference_id === ref || p.slug === ref))
    .filter(Boolean);
  if (newArrivalProducts.length === 0) {
    newArrivalProducts.push(...allProducts.slice(0, 3));
  }

  const collageImages = editorial.images || [];
  const collectionItems = colls.items || [];

  return `
    ${renderStorefrontHeader('/')}
    <main id="main-content">
      <!-- 1. INTERACTIVE SHOPPING COLLAGE HERO (H01 Desktop / H02 Mobile) -->
      ${hero.visible !== false ? `
        <section class="hero-editorial hero-collage-section" aria-label="Editorial Hero">
          ${hero.show_chrome_accent !== false ? `<div class="chrome-accent-orb" aria-hidden="true"></div>` : ''}
          <div class="hero-collage-layout">
            <!-- Left Column on Desktop / Top on Mobile: Headline, Supporting Copy & Shopping CTA -->
            <div class="hero-copy-column">
              <span class="chrome-pill-tag hero-kicker-pill">CURATED BY SCHA · PERSONAL SHOPPER EDIT</span>
              <h1 class="hero-oversized-headline">${escapeHtml(hero.headline || 'your next favourite')}</h1>
              <p class="hero-brand-line">${escapeHtml(hero.subheadline || 'A considered edit.\nChosen by SCHA.').replace(/\n/g, '<br/>')}</p>
              <p class="hero-supporting-copy">
                Statement eyewear, sculptural handbags, complexion icons, and everyday footwear — hover any piece above the pink trolley to spotlight its collection.
              </p>
              <div class="hero-cta-row">
                <a href="${escapeHtml(hero.cta_link || '/shop')}" data-nav class="btn-capsule-primary">
                  ${escapeHtml(hero.cta_text || 'Shop now')}
                </a>
                <a href="/collections" data-nav class="btn-capsule-secondary">
                  Explore Collections
                </a>
              </div>
              <nav class="hero-desktop-category-pills" aria-label="Quick category spotlight links">
                <a href="/collections/eyewear" data-nav class="hero-cat-pill" data-collage-trigger="eyewear">Shop Eyewear</a>
                <a href="/collections/bags" data-nav class="hero-cat-pill" data-collage-trigger="bags">Shop Bags</a>
                <a href="/collections/footwear" data-nav class="hero-cat-pill" data-collage-trigger="footwear">Shop Footwear</a>
                <a href="/collections/beauty" data-nav class="hero-cat-pill" data-collage-trigger="beauty">Shop Beauty</a>
                <a href="/shop" data-nav class="hero-cat-pill" data-collage-trigger="watches">Shop Watches</a>
              </nav>
            </div>

            <!-- Right Column on Desktop / Portrait Composition on Mobile: Interactive Product Collage -->
            <div class="hero-collage-column">
              <div class="hero-collage-stage" id="hero-collage-stage" role="group" aria-label="Interactive product collage">
                <!-- Semi-transparent spotlight dimming overlay (below active object, above inactive objects) -->
                <div class="hero-collage-dimmer" aria-hidden="true"></div>

                <!-- Decorative Objects (Non-interactive) -->
                <div class="collage-item collage-item-decorative collage-pos-shopping-bag" aria-hidden="true">
                  <img src="/images/collage_shopping_bag.png" alt="" draggable="false" />
                </div>
                <div class="collage-item collage-item-decorative collage-pos-trolley" aria-hidden="true">
                  <img src="/images/collage_trolley.png" alt="" draggable="false" />
                </div>

                <!-- Interactive Product 1: Sunglasses -> Shop Eyewear -->
                <a
                  href="/collections/eyewear"
                  data-nav
                  class="collage-item collage-item-interactive collage-pos-sunglasses"
                  data-collage-item="eyewear"
                  aria-label="Shop Eyewear"
                >
                  <span class="collage-hit-area" data-collage-hit="eyewear"></span>
                  <img src="/images/collage_sunglasses.png" alt="Pink Cat-Eye Sunglasses" draggable="false" />
                  <span class="collage-spotlight-label label-bottom-left">Shop Eyewear</span>
                </a>

                <!-- Interactive Product 2: Handbag -> Shop Bags -->
                <a
                  href="/collections/bags"
                  data-nav
                  class="collage-item collage-item-interactive collage-pos-handbag"
                  data-collage-item="bags"
                  aria-label="Shop Bags"
                >
                  <span class="collage-hit-area" data-collage-hit="bags"></span>
                  <img src="/images/collage_handbag.png" alt="Cream Top-Handle Handbag" draggable="false" />
                  <span class="collage-spotlight-label label-top-left">Shop Bags</span>
                </a>

                <!-- Interactive Product 3: Slingback Heel -> Shop Footwear -->
                <a
                  href="/collections/footwear"
                  data-nav
                  class="collage-item collage-item-interactive collage-pos-heel"
                  data-collage-item="footwear"
                  aria-label="Shop Footwear"
                >
                  <span class="collage-hit-area" data-collage-hit="footwear"></span>
                  <img src="/images/collage_heel.png" alt="Pink Slingback Heel" draggable="false" />
                  <span class="collage-spotlight-label label-left">Shop Footwear</span>
                </a>

                <!-- Interactive Product 4: Lipstick -> Shop Beauty -->
                <a
                  href="/collections/beauty"
                  data-nav
                  class="collage-item collage-item-interactive collage-pos-lipstick"
                  data-collage-item="lipstick"
                  aria-label="Shop Beauty — Lip Edit"
                >
                  <span class="collage-hit-area" data-collage-hit="lipstick"></span>
                  <img src="/images/collage_lipstick.png" alt="Pink Satin Lipstick" draggable="false" />
                  <span class="collage-spotlight-label label-left">Shop Beauty</span>
                </a>

                <!-- Interactive Product 5: Perfume -> Shop Beauty -->
                <a
                  href="/collections/beauty"
                  data-nav
                  class="collage-item collage-item-interactive collage-pos-perfume"
                  data-collage-item="beauty"
                  aria-label="Shop Beauty &amp; Fragrance"
                >
                  <span class="collage-hit-area" data-collage-hit="beauty"></span>
                  <img src="/images/collage_perfume.png" alt="Pink Ribbon Perfume" draggable="false" />
                  <span class="collage-spotlight-label label-top">Shop Beauty</span>
                </a>

                <!-- Interactive Product 6: Watch -> Shop Watches -->
                <a
                  href="/shop"
                  data-nav
                  class="collage-item collage-item-interactive collage-pos-watch"
                  data-collage-item="watches"
                  aria-label="Shop Watches"
                >
                  <span class="collage-hit-area" data-collage-hit="watches"></span>
                  <img src="/images/collage_watch.png" alt="Rose-Gold Watch" draggable="false" />
                  <span class="collage-spotlight-label label-left">Shop Watches</span>
                </a>
              </div>

              <!-- Mobile visible single-tap category links underneath the portrait collage -->
              <nav class="hero-mobile-category-links" aria-label="Shop by Category">
                <a href="/collections/eyewear" data-nav class="hero-cat-pill">Shop Eyewear</a>
                <a href="/collections/bags" data-nav class="hero-cat-pill">Shop Bags</a>
                <a href="/collections/footwear" data-nav class="hero-cat-pill">Shop Footwear</a>
                <a href="/collections/beauty" data-nav class="hero-cat-pill">Shop Beauty</a>
                <a href="/shop" data-nav class="hero-cat-pill">Shop Watches</a>
              </nav>
            </div>
          </div>
        </section>
      ` : ''}

      <!-- 2. FULL-WIDTH PINK NEW ARRIVALS BLOCK (N01-N03) -->
      ${newArr.visible !== false ? `
        <section id="new-arrivals" class="new-arrivals-section" aria-label="New Arrivals">
          <div class="new-arrivals-inner">
            <h2 class="new-arrivals-heading">${escapeHtml(newArr.heading || 'NEW ARRIVALS')}</h2>
            <div class="new-arrivals-grid">
              ${newArrivalProducts.map((p) => `
                <article class="new-arrival-card">
                  <a href="/products/${encodeURIComponent(p.slug)}" data-nav class="new-arrival-media">
                    ${productMedia(p)}
                  </a>
                  <h3 class="new-arrival-brand">${escapeHtml(p.brand)}</h3>
                  <p class="new-arrival-title"><a href="/products/${encodeURIComponent(p.slug)}" data-nav>${escapeHtml(p.title)}</a></p>${p.price_minor !== null ? `<p class="product-card-price">${escapeHtml(p.price_formatted)}</p>` : ''}
                  <a href="/products/${encodeURIComponent(p.slug)}" data-nav class="btn-pill-view">
                    ${escapeHtml(newArr.cta_pill_text || 'View product')}
                  </a>
                </article>
              `).join('')}
            </div>
          </div>
        </section>
      ` : ''}

      <!-- 3. EDITORIAL BRAND STORY / COLLAGE (E01-E03) -->
      ${editorial.visible !== false ? `
        <section class="editorial-story-section" aria-label="Editorial Brand Story">
          <div class="editorial-copy-col">
            ${editorial.show_chrome_cue !== false ? `
              <span class="chrome-pill-tag">Editorial Story · Silver &amp; Pink Edit</span>
            ` : ''}
            <p class="editorial-lead">${escapeHtml(editorial.lead_paragraph || 'Your everyday edit, selected with a little personality.')}</p>
            <p class="editorial-body">${escapeHtml((editorial.body_paragraph || '').replace('Every reference in our launch preview is preserved with its original proportions and detail.','Find the finishing touches that feel like you.'))}</p>
            <div class="editorial-decorative-word" aria-label="${escapeHtml(editorial.decorative_word || 'JUST SCHA')}">
              ${escapeHtml(editorial.decorative_word || 'JUST SCHA')}
            </div>
          </div>

          <div class="editorial-collage-stage">
            ${collageImages.map((img, idx) => `
              <a href="/products/${encodeURIComponent(img.reference_id || 'REF-04')}" data-nav class="collage-card slot-e0${idx + 1}">
                <img src="${escapeHtml(img.path)}" alt="${escapeHtml(img.alt || 'Editorial reference')}" loading="lazy" />
              </a>
            `).join('')}
          </div>
        </section>
      ` : ''}

      <!-- 4. OUR COLLECTIONS (C01-C04) -->
      ${colls.visible !== false ? `
        <section class="collections-home-section" aria-label="Our Collections">
          <h2 class="section-heading">${escapeHtml(colls.heading || 'Our collections')}</h2>
          <div class="collections-pill-grid">
            ${collectionItems.map((c) => `
              <a href="${escapeHtml(c.link || `/collections/${c.slug}`)}" data-nav class="collection-entry-card">
                <div class="collection-entry-media">
                  <img src="${escapeHtml(c.image_path)}" alt="${escapeHtml(c.alt || c.title)}" loading="lazy" />
                </div>
                <div class="collection-entry-pill">${escapeHtml(c.title)}</div>
              </a>
            `).join('')}
          </div>
        </section>
      ` : ''}
    </main>
    ${renderStorefrontFooter()}
  `;
}

// =========================================================================
// SHOP, COLLECTIONS & SEARCH RESULTS (/shop, /collections, /collections/[slug], /search)
// =========================================================================
export function renderCollectionsOverviewPage() {
  const categories = state.storefront?.categories || [];
  const products = (state.storefront?.products || []).filter((p) => !p.is_demo);

  return `
    ${renderStorefrontHeader('/collections')}
    <main id="main-content" class="page-container">
      <div class="shop-header-bar">
        <div>
          <span class="badge badge-ref" style="margin-bottom:8px;">4 Curated Categories</span>
          <h1 class="page-title">Collections overview</h1>
          <p style="margin:6px 0 0;color:var(--text-muted);font-size:14px;">
            Explore eyewear, bags, beauty and footwear.
          </p>
        </div>
        <a href="/shop" data-nav class="btn-capsule-secondary">Shop All &gt;</a>
      </div>

      <div class="collections-pill-grid">
        ${categories.map((cat) => {
          const count = products.filter((p) => p.category_slug === cat.slug).length;
          return `
            <a href="/collections/${encodeURIComponent(cat.slug)}" data-nav class="collection-entry-card">
              <div class="collection-entry-media">
                <img src="${escapeHtml(cat.image_path)}" alt="${escapeHtml(cat.name)}" />
              </div>
              <div>
                <h2 style="font-size:18px;font-weight:800;margin:0 0 4px;">${escapeHtml(cat.name)} (${count})</h2>
                <p style="font-size:12.5px;color:var(--text-muted);margin:0 0 12px;">${escapeHtml(cat.description)}</p>
                <div class="collection-entry-pill">Explore ${escapeHtml(cat.name)}</div>
              </div>
            </a>
          `;
        }).join('')}
      </div>
    </main>
    ${renderStorefrontFooter()}
  `;
}

export function renderShopOrCollectionPage({ mode = 'shop', categorySlug = '', queryParams = new URLSearchParams() }) {
  const sf = state.storefront;
  const allProducts = sf?.products || [];
  const q = (queryParams.get('q') || '').trim();
  const activeCat = (categorySlug || queryParams.get('category') || '').toLowerCase();
  const activeBrand = (queryParams.get('brand') || '').trim();
  const activeColour = (queryParams.get('colour') || '').trim();
  const activeAvailability = (queryParams.get('availability') || '').trim();
  const sort = queryParams.get('sort') || 'featured';
  const page = Math.max(1, Number(queryParams.get('page') || 1));

  let filtered = allProducts.filter((p) => {
    if (activeCat && p.category_slug !== activeCat) return false;
    if (activeBrand && p.brand.toLowerCase() !== activeBrand.toLowerCase()) return false;
    if (activeColour) {
      const col = (p.reference_colour_description || p.confirmed_attributes?.colour || p.confirmed_attributes?.frame_colour || '').toLowerCase();
      if (col !== activeColour.toLowerCase()) return false;
    }
    if (activeAvailability === 'sellable' && !p.is_sellable) return false;
    if (activeAvailability === 'draft' && p.publish_status !== 'draft') return false;
    if (q) {
      const hay = `${p.title} ${p.brand} ${p.category_slug} ${p.reference_id || ''} ${p.notes || ''} ${p.reference_colour_description || ''}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  if (sort === 'price_asc') {
    filtered.sort((a, b) => (a.price_minor ?? 999999999) - (b.price_minor ?? 999999999));
  } else if (sort === 'price_desc') {
    filtered.sort((a, b) => (b.price_minor ?? -1) - (a.price_minor ?? -1));
  } else if (sort === 'title_asc') {
    filtered.sort((a, b) => a.title.localeCompare(b.title));
  }

  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const catInfo = (sf?.categories || []).find((c) => c.slug === activeCat);
  const pageHeading = mode === 'search'
    ? (q ? `Search: "${q}"` : 'SEARCH')
    : catInfo
      ? catInfo.name.toUpperCase()
      : 'SHOP';

  const brands = Array.from(new Set(allProducts.filter((p) => !activeCat || p.category_slug === activeCat).map((p) => p.brand)));
  const colours = Array.from(new Set(allProducts.filter((p) => !activeCat || p.category_slug === activeCat).map((p) => p.reference_colour_description).filter(Boolean)));

  return `
    ${renderStorefrontHeader(mode === 'collection' ? `/collections/${activeCat}` : '/shop')}
    <main id="main-content" class="page-container">
      <div class="shop-header-bar">
        <div>
          <h1 class="page-title">${escapeHtml(pageHeading)}</h1>
        </div>

        <form id="shop-search-sort-form" class="shop-controls-row">
          <input
            type="search"
            name="q"
            value="${escapeHtml(q)}"
            class="input-field shop-search-input"
            placeholder="Search products, brand or REF-ID..."
            aria-label="Search products"
          />
          <select name="sort" class="select-field shop-sort-select" aria-label="Sort products">
            <option value="featured" ${sort === 'featured' ? 'selected' : ''}>Sort: Featured (Ref Order)</option>
            <option value="title_asc" ${sort === 'title_asc' ? 'selected' : ''}>Sort: Title A–Z</option>
            <option value="price_asc" ${sort === 'price_asc' ? 'selected' : ''}>Sort: Price Low to High</option>
            <option value="price_desc" ${sort === 'price_desc' ? 'selected' : ''}>Sort: Price High to Low</option>
          </select>
          <button type="submit" class="btn-capsule-secondary shop-apply-btn">Apply</button>
        </form>
      </div>

      <div class="shop-layout">
        <aside class="shop-sidebar shop-filter-sidebar" aria-label="Product Filters">
          <div>
            <h2 class="filter-group-title">Category</h2>
            <button type="button" class="filter-btn ${!activeCat ? 'active' : ''}" data-filter-key="category" data-filter-val="">
              <span>All Categories</span>
            </button>
            ${['eyewear', 'bags', 'beauty', 'footwear'].map((c) => `
              <button type="button" class="filter-btn ${activeCat === c ? 'active' : ''}" data-filter-key="category" data-filter-val="${c}">
                <span style="text-transform:capitalize;">${c}</span>
              </button>
            `).join('')}
          </div>

          <div>
            <h2 class="filter-group-title">Brand</h2>
            <button type="button" class="filter-btn ${!activeBrand ? 'active' : ''}" data-filter-key="brand" data-filter-val="">
              <span>All Brands</span>
            </button>
            ${brands.map((b) => `
              <button type="button" class="filter-btn ${activeBrand.toLowerCase() === b.toLowerCase() ? 'active' : ''}" data-filter-key="brand" data-filter-val="${escapeHtml(b)}">
                <span>${escapeHtml(b)}</span>
              </button>
            `).join('')}
          </div>

          ${colours.length > 0 ? `
            <div>
              <h2 class="filter-group-title">Colour</h2>
              <button type="button" class="filter-btn ${!activeColour ? 'active' : ''}" data-filter-key="colour" data-filter-val="">
                <span>All Colours</span>
              </button>
              ${colours.map((col) => `
                <button type="button" class="filter-btn ${activeColour.toLowerCase() === col.toLowerCase() ? 'active' : ''}" data-filter-key="colour" data-filter-val="${escapeHtml(col)}">
                  <span>${escapeHtml(col)}</span>
                </button>
              `).join('')}
            </div>
          ` : ''}

          <div>
            <h2 class="filter-group-title">Catalogue State</h2>
            <button type="button" class="filter-btn ${!activeAvailability ? 'active' : ''}" data-filter-key="availability" data-filter-val="">
              <span>All Items</span>
            </button>
            <button type="button" class="filter-btn ${activeAvailability === 'draft' ? 'active' : ''}" data-filter-key="availability" data-filter-val="draft">
              <span>Draft References (TBC)</span>
            </button>
            <button type="button" class="filter-btn ${activeAvailability === 'sellable' ? 'active' : ''}" data-filter-key="availability" data-filter-val="sellable">
              <span>Confirmed / Sellable</span>
            </button>
          </div>

          <button type="button" class="btn-capsule-secondary" data-action="clear-shop-filters" style="width:100%;padding:9px 14px;font-size:13px;">
            Clear filters
          </button>
        </aside>

        <div>
          ${paginated.length === 0 ? `
            <div class="card-panel" style="text-align:center;padding:48px 24px;">
              <h2 style="margin:0 0 8px;font-size:20px;">No matching products found</h2>
              <p style="color:var(--text-muted);margin:0 0 20px;">
                Try adjusting your search query or clearing active category/brand filters.
              </p>
              <button type="button" class="btn-capsule-primary" data-action="clear-shop-filters">Reset all filters</button>
            </div>
          ` : `
            <div class="product-grid cols-3">
              ${paginated.map(renderProductCard).join('')}
            </div>

            ${totalPages > 1 ? `
              <nav aria-label="Pagination" style="margin-top:28px;display:flex;justify-content:center;gap:8px;">
                ${Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pNum) => `
                  <button
                    type="button"
                    class="btn-capsule-secondary"
                    data-page="${pNum}"
                    style="padding:8px 16px;${pNum === currentPage ? 'background:var(--pink-soft);border-color:var(--rose-deep);color:var(--rose-deep);' : ''}"
                  >
                    ${pNum}
                  </button>
                `).join('')}
              </nav>
            ` : ''}
          `}
        </div>
      </div>
    </main>
    ${renderStorefrontFooter()}
  `;
}

// =========================================================================
// PRODUCT DETAIL PAGE (/products/[slug]) — Matches Wireframe Page 6 Right
// =========================================================================
export function renderProductDetailPage(detailData, activeImageIndex = 0) {
  const p = detailData.product;
  const related = detailData.related || [];
  const mediaList = p.media && p.media.length > 0 ? p.media : [{ path: p.primary_image, alt: p.title, slot_code: 'P01' }];
  const currentImg = mediaList[activeImageIndex] || mediaList[0];

  const isDraft = p.publish_status === 'draft';
  const canBuy = p.is_sellable;
  const firstVariant = p.variants && p.variants[0] ? p.variants[0] : null;

  return `
    ${renderStorefrontHeader(`/products/${p.slug}`)}
    <main id="main-content" class="page-container">
      <nav aria-label="Breadcrumb" style="font-size:13px;color:var(--text-muted);margin-bottom:20px;">
        <a href="/" data-nav>Home</a> /
        <a href="/shop" data-nav>Shop</a> /
        <a href="/collections/${encodeURIComponent(p.category_slug)}" data-nav style="text-transform:capitalize;">${escapeHtml(p.category_slug)}</a> /
        <span style="color:var(--charcoal);font-weight:600;">${escapeHtml(p.title)}</span>
      </nav>

      <div class="pdp-grid">
        <!-- Left: Contained Media Gallery (Slots P01-P05) -->
        <div>
          <div class="pdp-main-media" role="group" aria-label="Product gallery"><button type="button" class="image-zoom-trigger" data-action="zoom-product" aria-label="Zoom product image">Zoom +</button>
            <img id="pdp-active-img" src="${escapeHtml(currentImg.path)}" alt="${escapeHtml(currentImg.alt || p.title)}" />
          </div>
          <div class="pdp-thumbs-row">
            ${mediaList.map((m,idx)=>`<button type="button" class="pdp-thumb ${idx===activeImageIndex?'active':''}" data-pdp-thumb="${idx}" aria-label="View image ${idx+1}"><img src="${escapeHtml(m.path)}" alt="${escapeHtml(m.alt || p.title)}" /></button>`).join('')}

          </div>
        </div>

        <!-- Right: Product Details & Purchase / Draft Guardrail -->
        <div class="pdp-info-panel">
          <div style="display:${state.storefront?.sandbox || state.storefront?.isPreviewMode ? 'flex' : 'none'};flex-wrap:wrap;gap:8px;margin-bottom:12px;">
            ${p.reference_id ? `<span class="badge badge-ref">${ isDraft ? `DRAFT ${escapeHtml(p.reference_id)}` : escapeHtml(p.reference_id) }</span>` : ''}
            ${p.is_demo ? `<span class="badge badge-demo">DEMO SANDBOX ITEM</span>` : ''}
            ${p.duplicate_review_required ? `<span class="badge badge-review">DUPLICATE REVIEW 05 / 06</span>` : ''}
          </div>

          <p style="font-size:13px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin:0 0 4px;">
            ${escapeHtml(p.brand)}
          </p>
          <h1 style="font-family:var(--font-display);font-size:clamp(1.6rem,2.6vw,2.2rem);font-weight:800;margin:0 0 10px;line-height:1.2;">
            ${escapeHtml(p.title)}
          </h1>

          <div style="font-size:20px;font-weight:800;color:var(--rose-deep);margin-bottom:14px;">
            ${escapeHtml(p.price_formatted)}
          </div>

          ${!canBuy ? `
            <div style="background:var(--pink-subtle);border:1px solid var(--border-warm);border-radius:var(--radius-md);padding:14px 16px;margin-bottom:18px;font-size:13.5px;">
              <p style="margin:0 0 6px;font-weight:700;color:var(--charcoal);">
                This item is not available to order yet.
              </p>
              <p style="margin:0;color:var(--text-muted);">
                Please explore our available collection or contact us for more information.
              </p>

            </div>

            <div style="margin-bottom:16px;">
              <p style="font-weight:700;font-size:13.5px;margin:0 0 4px;">Variants / availability pending</p>
              <p style="font-size:13px;color:var(--text-muted);margin:0;">Quantity available: not confirmed</p>
            </div>

            <button type="button" class="btn-capsule-secondary" disabled style="width:100%;padding:14px;opacity:0.75;cursor:not-allowed;margin-bottom:12px;">
              Complete details before sale
            </button>

            <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;padding:12px 14px;background:#F7F4F0;border-radius:var(--radius-sm);font-size:12.5px;">
              <span>Want to test buying this item or testing checkout?</span>
              <div style="display:flex;gap:8px;">
                <a href="/admin/products/${p.id}" data-nav class="nav-link" style="color:var(--rose-deep);font-weight:700;">Confirm in Admin &gt;</a>
                ${state.storefront?.sandbox ? `<button type="button" class="nav-btn" data-action="add-demo-sandbox" style="color:var(--rose-deep);font-weight:700;">+ Load Demo Cart SKU</button>` : ''}
              </div>
            </div>
          ` : `
            <form id="pdp-add-to-bag-form" data-product-id="${p.id}" style="margin-bottom:20px;">
              <div class="field-group">
                <label class="field-label" for="pdp-variant-select">Select Confirmed Variant / SKU</label>
                <select id="pdp-variant-select" name="variant_id" class="select-field" required>
                  ${p.variants.map((v) => `
                    <option value="${v.id}" ${v.available <= 0 ? 'disabled' : ''}>
                      ${escapeHtml(v.title)} (${escapeHtml(v.sku)}) — ${escapeHtml(v.price_formatted)} · ${v.available > 0 ? `${v.available} available` : 'Sold out'}
                    </option>
                  `).join('')}
                </select>
              </div>

              <div class="field-group" style="max-width:160px;">
                <label class="field-label" for="pdp-qty-input">Quantity</label>
                <input
                  id="pdp-qty-input"
                  type="number"
                  name="quantity"
                  min="1"
                  max="${firstVariant ? Math.max(1, firstVariant.available) : 1}"
                  value="1"
                  class="input-field"
                  required
                />
              </div>

              <button type="submit" class="btn-capsule-primary" style="width:100%;">
                Add to bag
              </button>
            </form>
          `}

          <!-- Expandable Details Accordions -->
          <div style="margin-top:24px;">
            <div class="accordion-item">
              <button type="button" class="accordion-trigger" data-accordion="desc">
                <span>Description</span><span>+</span>
              </button>
              <div id="acc-desc" class="accordion-body">
                ${escapeHtml(p.description || p.notes || 'Supplied reference item.')}
              </div>
            </div>
            <div class="accordion-item">
              <button type="button" class="accordion-trigger" data-accordion="specs">
                <span>Specifications</span><span>+</span>
              </button>
              <div id="acc-specs" class="accordion-body">
                <ul style="margin:0;padding-left:18px;">

                  <li><strong>Brand:</strong> ${escapeHtml(p.brand)}</li>${Object.entries(p.specifications||{}).filter(([k,v])=>!['reference_id','brand','category','colour_reference'].includes(k) && typeof v!=='object' && !/to confirm|reference/i.test(String(v))).map(([k,v])=>`<li><strong>${escapeHtml(k.replaceAll('_',' '))}:</strong> ${escapeHtml(v)}</li>`).join('')}
                  <li><strong>Category:</strong> ${escapeHtml(p.category_slug)}</li>
                  <li><strong>Confirmed Model:</strong> ${escapeHtml(p.model || 'To confirm')}</li>
                  <li><strong>Sellable SKU:</strong> ${escapeHtml(p.sellable_sku || 'To confirm')}</li>
                  <li><strong>Colour:</strong> ${escapeHtml(p.reference_colour_description || 'To confirm')}</li>
                </ul>
              </div>
            </div>
            <div class="accordion-item" style="border-bottom:1px solid var(--border-warm);">
              <button type="button" class="accordion-trigger" data-accordion="ship">
                <span>Shipping &amp; returns</span><span>+</span>
              </button>
              <div id="acc-ship" class="accordion-body">
                ${escapeHtml(p.shipping_returns_note || 'See our shipping and returns pages for details before ordering.')}
              </div>
            </div>
          </div>
        </div>
      </div>

      ${related.length > 0 ? `
        <section style="margin-top:56px;">
          <h2 class="section-heading">You might also love</h2>
          <div class="product-grid">
            ${related.map(renderProductCard).join('')}
          </div>
        </section>
      ` : ''}
    </main>
    ${renderStorefrontFooter()}
  `;
}

// =========================================================================
// SHOPPING BAG (/cart) — Matches Wireframe Page 7 Left
// =========================================================================
export function renderCartPage() {
  const cart = state.cart || { items: [], itemCount: 0, subtotal_formatted: 'RM0.00', warnings: [] };

  return `
    ${renderStorefrontHeader('/cart')}
    <main id="main-content" class="page-container" style="max-width:960px;">
      <h1 class="page-title" style="margin-bottom:24px;">Your bag (${cart.itemCount || 0})</h1>

      ${(cart.warnings || []).map((w) => `
        <div style="background:var(--status-alert-bg);color:var(--status-alert-text);padding:12px 16px;border-radius:var(--radius-sm);margin-bottom:16px;font-weight:600;font-size:13.5px;">
          ${escapeHtml(w)}
        </div>
      `).join('')}

      ${cart.items.length === 0 ? `
        <div class="card-panel" style="text-align:center;padding:48px 24px;">
          <h2 style="margin:0 0 8px;">Your shopping bag is empty</h2>
          <p style="color:var(--text-muted);margin:0 0 24px;">
            Browse the editorial catalogue or load the Demo Sandbox SKU (` + 'SCHA-001-A · RM129.00' + `) to test the checkout &amp; DuitNow QR verification workflow.
          </p>
          <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:12px;">
            <a href="/shop" data-nav class="btn-capsule-secondary">Continue shopping &gt;</a>
            ${state.storefront?.sandbox ? `<button type="button" class="btn-capsule-primary" data-action="add-demo-sandbox">
              + Load Demo Item (Product 01 · RM129.00 [DEMO])
            </button>` : ''}
          </div>
        </div>
      ` : `
        <div class="checkout-grid">
          <div class="card-panel">
            ${cart.items.map((item) => `
              <div class="cart-item-row">
                <a href="/products/${encodeURIComponent(item.product_slug)}" data-nav class="cart-item-thumb">
                  <img src="${escapeHtml(item.image_path || '/images/08_jacquemus_pink_flap_handbag.png')}" alt="${escapeHtml(item.product_title)}" />
                </a>
                <div class="cart-item-info">
                  <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:4px;">
                    <strong style="font-size:15px;">${escapeHtml(item.product_title)}</strong>
                    ${item.product_is_demo || item.variant_is_demo ? `<span class="badge badge-demo">DEMO</span>` : ''}
                  </div>
                  <p style="margin:0 0 4px;font-size:13px;color:var(--text-muted);">
                    ${escapeHtml(item.variant_title)} · SKU: ${escapeHtml(item.sku)}
                  </p>
                  <p style="margin:0 0 10px;font-weight:700;color:var(--rose-deep);">
                    ${escapeHtml(item.unit_price_formatted)}
                  </p>
                  <div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;">
                    <div style="display:inline-flex;align-items:center;border:1px solid var(--border-warm);border-radius:var(--radius-pill);overflow:hidden;">
                      <button type="button" class="nav-btn" data-cart-qty="${item.cart_item_id}" data-delta="-1" style="padding:4px 12px;" aria-label="Decrease quantity">-</button>
                      <span style="padding:0 10px;font-weight:700;font-size:13px;">${item.quantity}</span>
                      <button type="button" class="nav-btn" data-cart-qty="${item.cart_item_id}" data-delta="1" style="padding:4px 12px;" aria-label="Increase quantity">+</button>
                    </div>
                    <button type="button" class="nav-btn" data-cart-remove="${item.cart_item_id}" style="color:var(--rose-deep);font-size:12.5px;">
                      Remove
                    </button>
                  </div>
                </div>
                <div class="cart-item-total">
                  ${escapeHtml(item.line_total_formatted)}
                </div>
              </div>
            `).join('')}

            <a href="/shop" data-nav style="font-size:13.5px;font-weight:700;color:var(--rose-deep);">Continue shopping &gt;</a>
          </div>

          <div class="card-panel">
            <h2 style="font-size:18px;font-weight:800;margin:0 0 16px;">Bag Summary</h2>
            <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:14px;">
              <span>Subtotal</span>
              <strong>${escapeHtml(cart.subtotal_formatted)}</strong>
            </div>
            ${cart.discount_minor > 0 ? `
              <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:14px;color:var(--status-paid-text);">
                <span>Discount (${escapeHtml(cart.discount_code)})</span>
                <strong>-${escapeHtml(cart.discount_formatted)}</strong>
              </div>
            ` : ''}
            <p style="font-size:12.5px;color:var(--text-muted);margin:12px 0 18px;">
              Shipping is calculated according to your Malaysian state during checkout.
            </p>
            ${cart.has_demo_items ? `
              <div style="margin-bottom:14px;"><span class="badge badge-demo">DEMO TOTALS</span></div>
            ` : ''}
            <a href="/checkout" data-nav class="btn-capsule-primary" style="width:100%;">
              Proceed to checkout
            </a>
          </div>
        </div>
      `}
    </main>
    ${renderStorefrontFooter()}
  `;
}

// =========================================================================
// CHECKOUT FLOW (/checkout) — Matches Wireframe Pages 7 Right & 8 Left
// =========================================================================
export function renderCheckoutPage(savedAddresses = []) {
  const cart = state.cart || { items: [] };
  const draft = state.checkoutDraft;
  const paySetup = state.storefront?.paymentSetup || {};

  if (cart.items.length === 0) {
    return renderCartPage();
  }

  // Step 0 for unauthenticated visitors: offer Log in or Continue as guest (skipped for signed-in customers)
  const needsGuestChoice = !state.user && !draft.guestContinued;

  return `
    ${renderStorefrontHeader('/checkout')}
    <main id="main-content" class="page-container" style="max-width:1120px;">
      <div style="margin-bottom:24px;">
        <h1 class="page-title" style="margin-bottom:8px;">Checkout</h1>
        <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:13.5px;font-weight:700;">
          <span style="color:${draft.step === 1 ? 'var(--rose-deep)' : 'var(--text-muted)'};">1 Shipping</span>
          <span>&gt;</span>
          <span style="color:${draft.step === 2 ? 'var(--rose-deep)' : 'var(--text-muted)'};">2 Review &amp; Place order</span>
          <span>&gt;</span>
          <span style="color:var(--text-muted);">3 Pay by QR</span>
        </div>
      </div>

      ${!paySetup.is_live_configured ? `
        <div style="background:var(--pink-soft);border:1px solid var(--pink-editorial);border-radius:var(--radius-md);padding:12px 18px;margin-bottom:20px;font-size:13px;">
          <strong>Checkout is temporarily unavailable.</strong> Please contact SCHA for assistance.
          ${paySetup.demo_qr_enabled
            ? 'Demo QR Checkout Mode is active using the non-scannable test QR placeholder so you can test the order &amp; manual verification flow.'
            : 'Checkout is disabled until the merchant configures their bank QR.'}
        </div>
      ` : ''}

      <div class="checkout-grid">
        <div>
          ${needsGuestChoice ? `
            <div class="card-panel" style="margin-bottom:20px;">
              <h2 style="font-size:18px;font-weight:800;margin:0 0 8px;">How would you like to check out?</h2>
              <p style="font-size:13.5px;color:var(--text-muted);margin:0 0 18px;">
                Sign in to use saved Malaysian addresses and track orders in My Account, or continue as a guest (we never silently create an account for guests, and your bag is preserved either way).
              </p>
              <div style="display:flex;flex-wrap:wrap;gap:12px;">
                <a href="/login?redirect=/checkout" data-nav class="btn-capsule-primary">Log in to account</a>
                <button type="button" class="btn-capsule-secondary" data-action="continue-as-guest">Continue as guest</button>
              </div>
            </div>
          ` : draft.step === 1 ? `
            <form id="checkout-shipping-form" class="card-panel">
              <h2 style="font-size:18px;font-weight:800;margin:0 0 16px;">1. Contact &amp; Shipping (Malaysia)</h2>

              ${savedAddresses.length > 0 ? `
                <div class="field-group">
                  <label class="field-label" for="saved-address-picker">Use a saved address</label>
                  <select id="saved-address-picker" class="select-field">
                    <option value="">-- Fill manually or choose saved address --</option>
                    ${savedAddresses.map((a) => `
                      <option value="${a.id}" data-addr='${escapeHtml(JSON.stringify(a))}'>
                        ${escapeHtml(a.label)}: ${escapeHtml(a.recipient_name)} — ${escapeHtml(a.line1)}, ${escapeHtml(a.postcode)} ${escapeHtml(a.city)}, ${escapeHtml(a.state)}
                      </option>
                    `).join('')}
                  </select>
                </div>
              ` : ''}

              <div class="form-grid-2">
                <div class="field-group">
                  <label class="field-label" for="co-email">Email</label>
                  <input id="co-email" type="email" name="email" class="input-field" value="${escapeHtml(draft.email)}" placeholder="you@example.com" required />
                </div>
                <div class="field-group">
                  <label class="field-label" for="co-phone">Phone</label>
                  <input id="co-phone" type="tel" name="phone" class="input-field" value="${escapeHtml(draft.phone)}" placeholder="+6012-345 6789" required />
                </div>
              </div>

              <div class="field-group">
                <label class="field-label" for="co-recipient">Recipient name</label>
                <input id="co-recipient" type="text" name="recipient_name" class="input-field" value="${escapeHtml(draft.recipient_name)}" placeholder="Your full name" required />
              </div>

              <div class="field-group">
                <label class="field-label" for="co-line1">Shipping address</label>
                <input id="co-line1" type="text" name="line1" class="input-field" value="${escapeHtml(draft.line1)}" placeholder="Street, building, unit" required />
              </div>

              <div class="field-group">
                <label class="field-label" for="co-line2">Address line 2 (Optional)</label>
                <input id="co-line2" type="text" name="line2" class="input-field" value="${escapeHtml(draft.line2)}" placeholder="Neighbourhood, landmark" />
              </div>

              <div class="form-grid-3">
                <div class="field-group">
                  <label class="field-label" for="co-postcode">Postcode</label>
                  <input id="co-postcode" type="text" name="postcode" class="input-field" value="${escapeHtml(draft.postcode)}" placeholder="59100" required />
                </div>
                <div class="field-group">
                  <label class="field-label" for="co-city">City</label>
                  <input id="co-city" type="text" name="city" class="input-field" value="${escapeHtml(draft.city)}" placeholder="Kuala Lumpur" required />
                </div>
                <div class="field-group">
                  <label class="field-label" for="co-state">State</label>
                  <select id="co-state" name="state" class="select-field" required>
                    ${MALAYSIAN_STATES.map((st) => `
                      <option value="${escapeHtml(st)}" ${draft.state === st ? 'selected' : ''}>${escapeHtml(st)}</option>
                    `).join('')}
                  </select>
                </div>
              </div>

              <div class="field-group">
                <label class="field-label">Configured Delivery Method (${escapeHtml(cart.shipping_zone || 'Malaysia')})</label>
                ${(cart.shipping_methods || []).map((m) => `
                  <label style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border:1.5px solid var(--border-warm);border-radius:var(--radius-sm);cursor:pointer;background:var(--bg-offwhite);">
                    <span>
                      <input type="radio" name="shipping_method_id" value="${escapeHtml(m.id)}" ${(!draft.shipping_method_id || draft.shipping_method_id === m.id) ? 'checked' : ''} />
                      <strong style="margin-left:6px;">${escapeHtml(m.name)}</strong>
                      <span style="font-size:12px;color:var(--text-muted);margin-left:6px;">(${escapeHtml(m.lead_time || '2-4 days')})</span>
                    </span>
                    <strong>RM${(Number(m.rate_minor) / 100).toFixed(2)}</strong>
                  </label>
                `).join('')}
              </div>

              <div style="display:flex;align-items:center;justify-content:space-between;font-size:13px;color:var(--text-muted);margin:14px 0 20px;">
                <span>Country: Malaysia</span>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;color:var(--charcoal);font-weight:600;">
                  <input type="checkbox" name="billing_same_as_shipping" ${draft.billing_same_as_shipping !== false ? 'checked' : ''} />
                  <span>Billing same as shipping</span>
                </label>
              </div>

              <button type="submit" class="btn-capsule-primary" style="width:100%;">
                Continue to review
              </button>
            </form>
          ` : `
            <!-- STEP 2: REVIEW & PLACE ORDER -->
            <div class="card-panel">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                <h2 style="font-size:18px;font-weight:800;margin:0;">2. Review &amp; Place order</h2>
                <button type="button" class="btn-capsule-secondary" data-action="checkout-back-to-shipping" style="padding:7px 16px;font-size:12.5px;">
                  Edit contact &amp; shipping
                </button>
              </div>

              <div style="background:var(--bg-offwhite);border:1px solid var(--border-warm);border-radius:var(--radius-md);padding:16px;margin-bottom:18px;font-size:13.5px;">
                <p style="margin:0 0 6px;"><strong>Contact:</strong> ${escapeHtml(draft.email)} · ${escapeHtml(draft.phone)}</p>
                <p style="margin:0 0 6px;">
                  <strong>Delivery Address:</strong> ${escapeHtml(draft.recipient_name)}, ${escapeHtml(draft.line1)}${draft.line2 ? `, ${escapeHtml(draft.line2)}` : ''}, ${escapeHtml(draft.postcode)} ${escapeHtml(draft.city)}, ${escapeHtml(draft.state)}, Malaysia
                </p>
                <p style="margin:0;">
                  <strong>Delivery Method:</strong> ${escapeHtml(cart.selected_shipping_method?.name || 'Standard')} (${escapeHtml(cart.shipping_formatted)})
                </p>
              </div>

              <div style="background:var(--pink-soft);border:1px solid var(--pink-editorial);border-radius:var(--radius-md);padding:16px;margin-bottom:20px;">
                <p style="margin:0 0 6px;font-weight:800;color:var(--rose-deep);">
                  Payment Method: DuitNow QR — admin verification
                </p>
                <p style="margin:0;font-size:13px;color:var(--charcoal);">
                  Clicking <strong>Place order</strong> creates your order with status <strong>Awaiting payment</strong> and reserves stock for <strong>${paySetup.payment_deadline_minutes || 30} minutes</strong>. You will then scan the seller's DuitNow QR and upload your payment receipt for independent admin verification.
                </p>
              </div>

              <button type="button" id="place-order-btn" class="btn-capsule-primary" data-action="place-order-submit" style="width:100%;">
                Place order (${escapeHtml(cart.total_formatted)})
              </button>
            </div>
          `}
        </div>

        <!-- Order Summary Panel -->
        <aside class="card-panel">
          <h2 style="font-size:18px;font-weight:800;margin:0 0 16px;">Order summary</h2>
          ${cart.items.map((it) => `
            <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:12px;font-size:13.5px;">
              <div>
                <strong>${escapeHtml(it.product_title)} x${it.quantity}</strong>
                <div style="font-size:12px;color:var(--text-muted);">${escapeHtml(it.variant_title)} (${escapeHtml(it.sku)})</div>
              </div>
              <strong>${escapeHtml(it.line_total_formatted)}</strong>
            </div>
          `).join('')}

          <hr style="border:none;border-top:1px solid var(--border-warm);margin:14px 0;" />

          <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13.5px;">
            <span>Subtotal</span><span>${escapeHtml(cart.subtotal_formatted)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13.5px;">
            <span>Discount</span><span>${escapeHtml(cart.discount_formatted)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:12px;font-size:13.5px;">
            <span>Shipping ${cart.has_demo_items ? '(demo)' : ''}</span><span>${escapeHtml(cart.shipping_formatted)}</span>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:baseline;padding-top:12px;border-top:1px solid var(--border-warm);font-size:18px;font-weight:800;">
            <span>Total</span>
            <span style="color:var(--rose-deep);">${escapeHtml(cart.total_formatted)}</span>
          </div>
          ${cart.has_demo_items ? `
            <div style="margin-top:10px;"><span class="badge badge-demo">DEMO TOTALS</span></div>
          ` : ''}
        </aside>
      </div>
    </main>
    ${renderStorefrontFooter()}
  `;
}

// =========================================================================
// STATE-AWARE ORDER CONFIRMATION, PAY BY QR & GUEST TRACKING (/order/confirmation)
// Matches Wireframe Pages 8 & 9
// =========================================================================
export function renderOrderConfirmationPage(order, guestToken = '') {
  if (!order) {
    return `
      ${renderStorefrontHeader('/order/confirmation')}
      <main id="main-content" class="page-container" style="max-width:640px;">
        <div class="card-panel">
          <span class="badge badge-ref" style="margin-bottom:10px;">Verified Order Lookup</span>
          <h1 class="page-title" style="font-size:24px;margin-bottom:8px;">Track your order status</h1>
          <p style="font-size:13.5px;color:var(--text-muted);margin:0 0 20px;">
            Guest orders are protected and cannot be opened using a predictable ID alone. Enter your Order Number and checkout email to verify ownership and open your order status &amp; DuitNow QR instructions. (Demo hint: try <strong>SCHA-001</strong> with <strong>customer@example.com</strong>)
          </p>
          <form id="guest-verify-form">
            <div class="field-group">
              <label class="field-label" for="gv-order">Order Number</label>
              <input id="gv-order" type="text" name="order_number" class="input-field" placeholder="Your order number" required />
            </div>
            <div class="field-group">
              <label class="field-label" for="gv-email">Checkout Email</label>
              <input id="gv-email" type="email" name="email" class="input-field" placeholder="Email used at checkout" required />
            </div>
            <button type="submit" class="btn-capsule-primary" style="width:100%;">Verify &amp; Open Order</button>
          </form>
        </div>
      </main>
      ${renderStorefrontFooter()}
    `;
  }

  const payInstr = order.payment_instructions || {};
  const isAwaiting = order.payment_status === 'awaiting_payment';
  const isUnderReview = order.payment_status === 'under_review';
  const isNeedsResub = order.payment_status === 'needs_resubmission';
  const isPaid = order.payment_status === 'paid';
  const showQrUploadForm = isAwaiting || isNeedsResub;

  let stateHeadline = 'Order received — awaiting payment';
  let stateSubcopy = 'Please scan the merchant DuitNow QR below, verify the recipient name and exact MYR amount, and submit your payment receipt for admin verification.';
  if (isUnderReview) {
    stateHeadline = 'We have received your payment submission.';
    stateSubcopy = 'Kami sedang menyemak bayaran untuk order ini. Confirmation will be sent after our admin team independently verifies the received transaction in our seller bank statement.';
  } else if (isNeedsResub) {
    stateHeadline = 'Action required: Payment receipt resubmission needed.';
    stateSubcopy = `A message from SCHA: "${order.resubmission_reason || 'Please upload a clearer receipt showing the transaction reference and amount.'}"`;
  } else if (isPaid) {
    stateHeadline = 'Payment confirmed.';
    stateSubcopy = 'Thank you! Our admin team has verified your payment in our bank records. Your official receipt and delivery progress are shown below.';
  } else if (order.payment_status === 'expired_cancelled') {
    stateHeadline = 'Order expired / cancelled.';
    stateSubcopy = 'This order reservation has expired or was cancelled.';
  }

  return `
    ${renderStorefrontHeader('/order/confirmation')}
    <main id="main-content" class="page-container" style="max-width:1020px;">
      <!-- State-Aware Banner -->
      <div class="card-panel" style="margin-bottom:24px;">
        <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;">
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
            <span class="${getPaymentBadgeClass(order.payment_status)}">${escapeHtml(order.payment_status_label)}</span>
            <span class="${getFulfilmentBadgeClass(order.fulfilment_status)}">Delivery: ${escapeHtml(order.fulfilment_status_label)}</span>
            ${order.is_demo ? `<span class="badge badge-demo">DEMO STATE</span>` : ''}
          </div>
          <button type="button" class="btn-capsule-secondary" data-action="refresh-order-status" data-order="${escapeHtml(order.order_number)}" data-token="${escapeHtml(guestToken)}" style="padding:6px 14px;font-size:12px;">
            Refresh live status
          </button>
        </div>

        <h1 style="font-family:var(--font-display);font-size:clamp(1.6rem,2.6vw,2.2rem);font-weight:800;margin:0 0 8px;">
          ${escapeHtml(stateHeadline)}
        </h1>
        <p style="font-size:14px;color:var(--text-muted);margin:0 0 18px;max-width:740px;">
          ${escapeHtml(stateSubcopy)}
        </p>

        <div style="background:var(--bg-offwhite);border:1px solid var(--border-warm);border-radius:var(--radius-md);padding:16px;display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px;">
          <div>
            <strong style="font-size:16px;">Order #${escapeHtml(order.order_number)} ${order.is_demo ? '[demo]' : ''}</strong>
            <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">
              Payment: <strong>${escapeHtml(order.payment_status_label)}</strong> · Delivery: <strong>${escapeHtml(order.fulfilment_status_label)}</strong>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px;color:var(--text-muted);">Order Total</div>
            <div style="font-size:20px;font-weight:800;color:var(--rose-deep);">${escapeHtml(order.total_formatted)}</div>
          </div>
        </div>
      </div>

      ${showQrUploadForm ? `
        <!-- PAY BY DUITNOW QR & SUBMIT RECEIPT (Matches Wireframe Page 8 Left) -->
        <section class="card-panel" style="margin-bottom:24px;" aria-label="Pay by DuitNow QR">
          <h2 style="font-family:var(--font-display);font-size:22px;font-weight:800;margin:0 0 6px;">
            Pay by DuitNow QR
          </h2>
          <p style="font-size:13px;font-weight:700;color:var(--rose-deep);margin:0 0 16px;">
            Order #${escapeHtml(order.order_number)} | ${escapeHtml(order.payment_status_label)} ${order.is_demo ? '| DEMO' : ''}
          </p>

          <div class="qr-payment-layout">
            <!-- Slot Q01: Preserves full QR quiet zone without cropping/text overlay -->
            <div class="qr-slot-frame ${payInstr.qr_image_path ? 'live-qr' : ''}">
              ${payInstr.qr_image_path ? `
                <img src="${escapeHtml(payInstr.qr_image_path)}" alt="Seller Bank-Issued DuitNow Merchant QR" /><a href="${escapeHtml(payInstr.qr_image_path)}" download="Shop-by-SCHA-DuitNow.png" class="btn-capsule-secondary">Download QR</a>
              ` : `
                <div class="qr-placeholder-box">
                  <strong style="font-size:14px;">Q01 / BANK QR</strong>
                  <span style="font-size:11.5px;margin-top:4px;">NOT SCANNABLE</span>
                  <span style="font-size:11px;margin-top:8px;color:var(--text-muted);">
                    Upload real bank-issued DuitNow QR in Admin Settings
                  </span>
                </div>
              `}
            </div>

            <div>
              <div style="font-size:20px;font-weight:800;color:var(--rose-deep);margin-bottom:8px;">
                Amount to pay: ${escapeHtml(order.total_formatted)}
              </div>
              <p style="font-size:13.5px;color:var(--text-muted);margin:0 0 4px;">
                <strong>Recipient:</strong> ${escapeHtml(payInstr.recipient_name || '[seller registered name]')}
              </p>
              <p style="font-size:13.5px;color:var(--text-muted);margin:0 0 4px;">
                <strong>Reference:</strong> #${escapeHtml(order.order_number)}
              </p>
              <p style="font-size:13.5px;color:var(--text-muted);margin:0 0 14px;">
                <strong>Payment deadline:</strong> ${escapeHtml(formatKLDate(order.payment_deadline_at))}
              </p>

              <ol style="margin:0 0 16px;padding-left:18px;font-size:13.5px;font-weight:600;line-height:1.7;">
                <li>Scan / open the real merchant QR in your banking or e-wallet app</li>
                <li>Check recipient name + exact MYR amount (${escapeHtml(order.total_formatted)})</li>
                <li>Upload your bank transaction reference and receipt below. Payment will be reviewed within the stated ${escapeHtml(payInstr.review_window_hours || 24)}-hour review window.</li>
              </ol>

              <p style="font-size:12px;color:var(--text-muted);margin:0;">
                Shopping on your phone? Save the QR image if your banking app supports gallery QR import, or scan from a second screen. Note: not every banking app supports importing a saved screenshot.
              </p>
            </div>
          </div>

          <form id="submit-receipt-form" data-order-number="${escapeHtml(order.order_number)}" data-guest-token="${escapeHtml(guestToken)}">
            <div class="form-grid-2">
              <div class="field-group">
                <label class="field-label" for="sr-ref">Transaction reference</label>
                <input id="sr-ref" type="text" name="declared_reference" class="input-field" placeholder="Your bank / DuitNow transaction reference" required />
              </div>
              <div class="field-group">
                <label class="field-label" for="sr-amt">Amount paid (RM)</label>
                <input id="sr-amt" type="text" name="declared_amount" class="input-field" value="${(Number(order.total_minor) / 100).toFixed(2)}" required />
              </div>
            </div>

            <div class="form-grid-2">
              <div class="field-group">
                <label class="field-label" for="sr-file">Upload receipt | JPG / PNG / PDF | Private</label>
                <input id="sr-file" type="file" name="receipt" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" class="input-field" />
                <span style="font-size:11.5px;color:var(--text-muted);">
                  Your receipt is private and used to review this payment. Maximum file size: 10 MB.
                </span>
              </div>
              <div class="field-group">
                <label class="field-label" for="sr-time">Payment time (Optional)</label>
                <input id="sr-time" type="text" name="declared_paid_at" class="input-field" value="${escapeHtml(formatKLDate(new Date().toISOString()))}" />
                <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-top:6px;cursor:pointer;">
                  ${state.storefront?.sandbox ? '<input type="checkbox" name="use_demo_sample_receipt" />' : ''}
                  ${state.storefront?.sandbox ? '<span>Attach sample receipt (test environment only)</span>' : ''}
                </label>
              </div>
            </div>

            <button type="submit" class="btn-capsule-primary" style="width:100%;">
              Submit payment for review
            </button>
          </form>
        </section>
      ` : ''}

      <!-- Order Details, Shipment Tracking & Timeline (Matches Wireframe Page 9) -->
      <div class="checkout-grid">
        <div class="card-panel">
          <h2 style="font-size:18px;font-weight:800;margin:0 0 14px;">Your order items</h2>
          ${(order.items || []).map((it) => `
            <div class="order-item-row">
              <img src="${escapeHtml(it.image_snapshot)}" alt="${escapeHtml(it.title_snapshot)}" class="order-item-thumb" />
              <div class="order-item-info">
                <strong>${escapeHtml(it.title_snapshot)}</strong>
                <div style="font-size:12.5px;color:var(--text-muted);">
                  ${escapeHtml(it.variant_title_snapshot)} · SKU: ${escapeHtml(it.sku_snapshot)} · Qty: ${it.quantity}
                </div>
              </div>
              <strong class="order-item-total">${escapeHtml(it.line_total_formatted)}</strong>
            </div>
          `).join('')}

          <h3 style="font-size:15px;font-weight:800;margin:20px 0 10px;">Order timeline</h3>
          <div class="order-timeline">
            ${(order.timeline || []).map((ev) => `
              <div class="timeline-row">
                <span class="timeline-dot"></span>
                <div>
                  <strong style="font-size:13.5px;">${escapeHtml(ev.title)}</strong>
                  <div style="font-size:12.5px;color:var(--text-muted);">${escapeHtml(ev.detail)}</div>
                </div>
                <span class="timeline-date" style="font-size:11.5px;color:var(--text-muted);">${escapeHtml(formatKLDate(ev.created_at))}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <aside class="card-panel">
          <h2 style="font-size:18px;font-weight:800;margin:0 0 12px;">Delivery &amp; Evidence</h2>
          <p style="font-size:13px;color:var(--text-muted);margin:0 0 14px;">
            <strong>Delivery Address Snapshot:</strong><br/>
            ${escapeHtml(order.shipping_address?.recipient_name)} (${escapeHtml(order.shipping_address?.phone)})<br/>
            ${escapeHtml(order.shipping_address?.line1)}${order.shipping_address?.line2 ? `, ${escapeHtml(order.shipping_address.line2)}` : ''}<br/>
            ${escapeHtml(order.shipping_address?.postcode)} ${escapeHtml(order.shipping_address?.city)}, ${escapeHtml(order.shipping_address?.state)}
          </p>

          ${(order.shipments || []).length > 0 ? `
            <div style="background:var(--status-paid-bg);color:var(--status-paid-text);padding:14px;border-radius:var(--radius-md);margin-bottom:16px;">
              <strong>Parcel Tracking Available</strong>
              ${order.shipments.map((sh) => `
                <div style="font-size:13px;margin-top:6px;">
                  Courier: <strong>${escapeHtml(sh.courier_name)}</strong><br/>
                  Tracking #: <strong>${escapeHtml(sh.tracking_number)}</strong><br/>
                  <a href="${escapeHtml(sh.tracking_url)}" target="_blank" rel="noopener noreferrer" style="text-decoration:underline;font-weight:700;">Track parcel externally &gt;</a>
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${(order.submissions || []).length > 0 ? `
            <div style="margin-bottom:16px;">
              <h3 style="font-size:14px;font-weight:800;margin:0 0 8px;">Submitted Payment Evidence</h3>
              ${order.submissions.map((s) => `
                <div style="background:var(--bg-offwhite);border:1px solid var(--border-warm);border-radius:var(--radius-sm);padding:10px;font-size:12.5px;margin-bottom:8px;">
                  <div><strong>Ref:</strong> ${escapeHtml(s.declared_reference)} (${escapeHtml(s.declared_amount_formatted)})</div>
                  <div><strong>Status:</strong> ${escapeHtml(s.status)}</div>
                  <a href="${escapeHtml(s.receipt_url)}${guestToken ? `?token=${encodeURIComponent(guestToken)}` : ''}" target="_blank" rel="noopener" style="color:var(--rose-deep);font-weight:700;text-decoration:underline;">
                    Open private receipt (${escapeHtml(s.receipt_original_name)}) &gt;
                  </a>
                </div>
              `).join('')}
            </div>
          ` : ''}

          <div style="display:flex;flex-direction:column;gap:10px;margin-top:18px;">
            ${state.user ? `<a href="/account/orders" data-nav class="btn-capsule-secondary">Back to My orders</a>` : ''}
            <a href="/shop" data-nav class="btn-capsule-secondary">Continue shopping</a>
          </div>
        </aside>
      </div>
    </main>
    ${renderStorefrontFooter()}
  `;
}

// =========================================================================
// CUSTOMER AUTH & PERSONAL ACCOUNT (/login, /register, /account/*)
// Matches Wireframe Page 11
// =========================================================================
export function renderCustomerAuthPage(mode = 'login') {
  return `
    ${renderStorefrontHeader('/login')}
    <main id="main-content" class="page-container" style="max-width:520px;">
      <div class="card-panel">
        <div style="background:var(--pink-soft);padding:16px 20px;border-radius:var(--radius-md);margin-bottom:20px;text-align:center;">
          <h1 style="font-family:var(--font-display);font-size:22px;font-weight:800;margin:0;">
            ${mode === 'register' ? 'Create your customer account' : mode === 'forgot' ? 'Reset your password' : 'Welcome to Shop by SCHA'}
          </h1>
        </div>

        ${mode === 'login' ? `
          <form id="customer-login-form">
            <div class="field-group">
              <label class="field-label" for="cl-email">Email</label>
              <input id="cl-email" type="email" name="email" class="input-field" placeholder="Your email" required />
            </div>
            <div class="field-group">
              <label class="field-label" for="cl-pass">Password</label>
              <input id="cl-pass" type="password" name="password" class="input-field" placeholder="********" required />
            </div>
            <div style="margin-bottom:16px;font-size:13px;">
              <a href="/forgot-password" data-nav style="color:var(--rose-deep);font-weight:600;">Forgot password?</a>
            </div>
            <button type="submit" class="btn-capsule-primary" style="width:100%;margin-bottom:14px;">Log in</button>
          </form>
          <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:center;font-size:13px;padding-top:12px;border-top:1px solid var(--border-warm);">
            <a href="/register" data-nav style="color:var(--rose-deep);font-weight:700;">New customer? Create account</a>
            ${state.storefront?.sandbox ? `<button type="button" class="nav-btn" data-action="fill-demo-customer" style="font-size:12px;color:var(--text-muted);">
              Fill Demo Customer
            </button>` : ''}
          </div>
        ` : mode === 'register' ? `
          <form id="customer-register-form">
            <div class="field-group">
              <label class="field-label" for="cr-name">Full name</label>
              <input id="cr-name" type="text" name="name" class="input-field" placeholder="Your full name" required />
            </div>
            <div class="field-group">
              <label class="field-label" for="cr-email">Email</label>
              <input id="cr-email" type="email" name="email" class="input-field" placeholder="you@example.com" required />
            </div>
            <div class="field-group">
              <label class="field-label" for="cr-phone">Phone (Malaysia)</label>
              <input id="cr-phone" type="tel" name="phone" class="input-field" placeholder="+6012-345 6789" />
            </div>
            <div class="field-group">
              <label class="field-label" for="cr-pass">Password (min 8 characters)</label>
              <input id="cr-pass" type="password" name="password" class="input-field" minlength="8" required />
            </div>
            <p style="font-size:12px;color:var(--text-muted);margin:0 0 14px;">
              Public sign-up always creates a personal Customer account.
            </p>
            <button type="submit" class="btn-capsule-primary" style="width:100%;margin-bottom:14px;">Create account</button>
          </form>
          <div style="font-size:13px;">
            <a href="/login" data-nav style="color:var(--rose-deep);font-weight:700;">Already have an account? Log in</a>
          </div>
        ` : `
          <form id="customer-forgot-form">
            <div class="field-group">
              <label class="field-label" for="cf-email">Account Email</label>
              <input id="cf-email" type="email" name="email" class="input-field" placeholder="you@example.com" required />
            </div>
            <button type="submit" class="btn-capsule-primary" style="width:100%;margin-bottom:14px;">Send recovery token</button>
          </form>
          <div id="forgot-reset-box"></div>
          <a href="/login" data-nav style="font-size:13px;color:var(--rose-deep);font-weight:700;">&lt; Back to login</a>
        `}
      </div>
    </main>
    ${renderStorefrontFooter()}
  `;
}

export function renderCustomerAccountPage({ tab = 'orders', orders = [], addresses = [], selectedOrder = null }) {
  const u = state.user;
  if (!u) return renderCustomerAuthPage('login');

  return `
    ${renderStorefrontHeader('/account')}
    <main id="main-content" class="page-container">
      <div style="margin-bottom:24px;">
        <h1 class="page-title">My account</h1>
        <p style="margin:4px 0 0;color:var(--text-muted);word-break:break-word;">Welcome, ${escapeHtml(u.name)} (${escapeHtml(u.email)})</p>
      </div>

      <div class="shop-layout">
        <aside class="shop-sidebar account-nav-sidebar" aria-label="Account Menu">
          <a href="/account/orders" data-nav class="filter-btn ${tab === 'orders' || tab === 'order-detail' ? 'active' : ''}">My orders</a>
          <a href="/account/addresses" data-nav class="filter-btn ${tab === 'addresses' ? 'active' : ''}">Addresses</a>
          <a href="/account/payment-info" data-nav class="filter-btn ${tab === 'payment-info' ? 'active' : ''}">Payment info</a>
          <a href="/account/profile" data-nav class="filter-btn ${tab === 'profile' ? 'active' : ''}">Profile</a>
          <button type="button" class="filter-btn" data-action="logout" style="color:var(--rose-deep);font-weight:700;">Log out</button>
        </aside>

        <div class="card-panel">
          ${tab === 'orders' ? `
            <h2 style="font-size:20px;font-weight:800;margin:0 0 16px;">Your orders</h2>
            ${orders.length === 0 ? `
              <p style="color:var(--text-muted);">You haven't placed any orders yet.</p>
              <a href="/shop" data-nav class="btn-capsule-primary" style="margin-top:12px;">Explore the shop</a>
            ` : `
              <div class="table-scroll">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>ORDER</th>
                      <th>DATE</th>
                      <th>TOTAL</th>
                      <th>PAYMENT / DELIVERY</th>
                      <th>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${orders.map((o) => `
                      <tr>
                        <td><strong>#${escapeHtml(o.order_number)}</strong> ${o.is_demo ? `<span class="badge badge-demo">demo</span>` : ''}</td>
                        <td>${escapeHtml(formatKLDate(o.created_at))}</td>
                        <td><strong>${escapeHtml(o.total_formatted)}</strong></td>
                        <td>
                          <span class="${getPaymentBadgeClass(o.payment_status)}">${escapeHtml(o.payment_status_label)}</span>
                          <span class="${getFulfilmentBadgeClass(o.fulfilment_status)}" style="margin-left:4px;">${escapeHtml(o.fulfilment_status_label)}</span>
                        </td>
                        <td>
                          <a href="/account/orders/${encodeURIComponent(o.order_number)}" data-nav style="color:var(--rose-deep);font-weight:700;">
                            Open order &gt;
                          </a>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          ` : tab === 'order-detail' && selectedOrder ? `
            <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:center;margin-bottom:16px;">
              <h2 style="font-size:22px;font-weight:800;margin:0;">Order #${escapeHtml(selectedOrder.order_number)}</h2>
              <a href="/account/orders" data-nav style="font-size:13px;color:var(--rose-deep);font-weight:700;">&lt; Back to My orders</a>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px;">
              <span class="${getPaymentBadgeClass(selectedOrder.payment_status)}">${escapeHtml(selectedOrder.payment_status_label)}</span>
              <span class="${getFulfilmentBadgeClass(selectedOrder.fulfilment_status)}">Delivery: ${escapeHtml(selectedOrder.fulfilment_status_label)}</span>
              ${selectedOrder.is_demo ? `<span class="badge badge-demo">DEMO STATE</span>` : ''}
            </div>

            ${['awaiting_payment', 'needs_resubmission'].includes(selectedOrder.payment_status) ? `
              <div style="background:var(--pink-soft);padding:14px 18px;border-radius:var(--radius-md);margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
                <div>
                  <strong>${selectedOrder.payment_status === 'needs_resubmission' ? 'Receipt resubmission required' : 'Awaiting DuitNow QR payment & receipt'}</strong>
                  ${selectedOrder.resubmission_reason ? `<div style="font-size:13px;color:var(--rose-deep);margin-top:4px;">Reason: ${escapeHtml(selectedOrder.resubmission_reason)}</div>` : ''}
                </div>
                <a href="/order/confirmation?order=${encodeURIComponent(selectedOrder.order_number)}" data-nav class="btn-capsule-primary" style="padding:9px 20px;font-size:13px;min-width:auto;">
                  Open QR &amp; Upload Receipt
                </a>
              </div>
            ` : ''}

            ${(selectedOrder.items || []).map((it) => `
              <div class="order-item-row">
                <img src="${escapeHtml(it.image_snapshot)}" alt="${escapeHtml(it.title_snapshot)}" class="order-item-thumb" />
                <div class="order-item-info">
                  <strong>${escapeHtml(it.title_snapshot)}</strong>
                  <div style="font-size:12.5px;color:var(--text-muted);">${escapeHtml(it.variant_title_snapshot)} · Qty: ${it.quantity}</div>
                </div>
                <strong class="order-item-total">${escapeHtml(it.line_total_formatted)}</strong>
              </div>
            `).join('')}

            <p style="font-size:16px;font-weight:800;color:var(--rose-deep);margin:12px 0 18px;">
              Total: ${escapeHtml(selectedOrder.total_formatted)} ${selectedOrder.is_demo ? '[demo]' : ''}
            </p>

            ${(selectedOrder.shipments || []).length > 0 ? `
              <div style="background:var(--status-paid-bg);color:var(--status-paid-text);padding:14px;border-radius:var(--radius-md);margin-bottom:18px;">
                <strong>Courier Tracking:</strong>
                ${selectedOrder.shipments.map((sh) => `
                  <div>${escapeHtml(sh.courier_name)} — ${escapeHtml(sh.tracking_number)} · <a href="${escapeHtml(sh.tracking_url)}" target="_blank" rel="noopener" style="text-decoration:underline;font-weight:700;">Track parcel &gt;</a></div>
                `).join('')}
              </div>
            ` : ''}

            <h3 style="font-size:16px;font-weight:800;margin:20px 0 10px;">Order timeline</h3>
            <div class="order-timeline">
              ${(selectedOrder.timeline || []).map((ev) => `
                <div class="timeline-row">
                  <span class="timeline-dot"></span>
                  <div>
                    <strong>${escapeHtml(ev.title)}</strong>
                    <div style="font-size:12.5px;color:var(--text-muted);">${escapeHtml(ev.detail)}</div>
                  </div>
                  <span style="font-size:11.5px;color:var(--text-muted);">${escapeHtml(formatKLDate(ev.created_at))}</span>
                </div>
              `).join('')}
            </div>
          ` : tab === 'addresses' ? `
            <h2 style="font-size:20px;font-weight:800;margin:0 0 16px;">Shipping &amp; Billing Addresses</h2>
            <p style="font-size:13px;color:var(--text-muted);margin:0 0 18px;">
              Your previous orders keep the delivery address used when you placed them.
            </p>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin-bottom:24px;">
              ${addresses.map((a) => `
                <div style="border:1px solid var(--border-warm);border-radius:var(--radius-md);padding:14px;">
                  <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                    <strong>${escapeHtml(a.label)}</strong>
                    <div style="display:flex;gap:4px;">
                      ${a.is_default_shipping ? `<span class="badge badge-paid">Default Ship</span>` : ''}
                      ${a.is_default_billing ? `<span class="badge badge-ref">Default Bill</span>` : ''}
                    </div>
                  </div>
                  <div style="font-size:13px;color:var(--text-muted);margin-bottom:10px;">
                    ${escapeHtml(a.recipient_name)} (${escapeHtml(a.phone)})<br/>
                    ${escapeHtml(a.line1)}${a.line2 ? `, ${escapeHtml(a.line2)}` : ''}<br/>
                    ${escapeHtml(a.postcode)} ${escapeHtml(a.city)}, ${escapeHtml(a.state)}
                  </div>
                  <button type="button" class="nav-btn" data-delete-address="${a.id}" style="color:var(--rose-deep);font-size:12px;padding:0;">Delete</button>
                </div>
              `).join('')}
            </div>

            <form id="account-address-form" style="border-top:1px solid var(--border-warm);padding-top:18px;">
              <h3 style="font-size:16px;font-weight:800;margin:0 0 12px;">Add Malaysian Address</h3>
              <div class="form-grid-3">
                <div class="field-group"><label class="field-label">Label</label><input type="text" name="label" class="input-field" value="Home" required /></div>
                <div class="field-group"><label class="field-label">Recipient name</label><input type="text" name="recipient_name" class="input-field" value="${escapeHtml(u.name)}" required /></div>
                <div class="field-group"><label class="field-label">Phone</label><input type="tel" name="phone" class="input-field" value="${escapeHtml(u.phone || '')}" required /></div>
              </div>
              <div class="field-group"><label class="field-label">Address line 1</label><input type="text" name="line1" class="input-field" required /></div>
              <div class="form-grid-3">
                <div class="field-group"><label class="field-label">Postcode</label><input type="text" name="postcode" class="input-field" required /></div>
                <div class="field-group"><label class="field-label">City</label><input type="text" name="city" class="input-field" required /></div>
                <div class="field-group">
                  <label class="field-label">State</label>
                  <select name="state" class="select-field">
                    ${MALAYSIAN_STATES.map((st) => `<option value="${escapeHtml(st)}">${escapeHtml(st)}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div style="display:flex;gap:16px;margin-bottom:14px;font-size:13px;">
                <label><input type="checkbox" name="is_default_shipping" checked /> Default shipping</label>
                <label><input type="checkbox" name="is_default_billing" checked /> Default billing</label>
              </div>
              <button type="submit" class="btn-capsule-primary">Save address</button>
            </form>
          ` : tab === 'payment-info' ? `
            <h2 style="font-size:20px;font-weight:800;margin:0 0 12px;">Payment info — DuitNow Merchant QR</h2>
            <div style="background:var(--pink-soft);padding:18px;border-radius:var(--radius-md);margin-bottom:20px;font-size:13.5px;">
              <p style="margin:0 0 8px;"><strong>Launch Payment Method:</strong> Static DuitNow merchant QR issued by the seller's bank, with manual verification by the shop administrator.</p>
              <p style="margin:0;">Pay directly with DuitNow QR. Open an order to view payment instructions and the status of your receipt.</p>
            </div>
            <h3 style="font-size:16px;font-weight:800;margin:0 0 12px;">Your orders &amp; payment instructions</h3>
            ${orders.map((o) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border-warm);font-size:13.5px;">
                <div>
                  <strong>#${escapeHtml(o.order_number)}</strong> · ${escapeHtml(o.total_formatted)}
                  <span class="${getPaymentBadgeClass(o.payment_status)}" style="margin-left:8px;">${escapeHtml(o.payment_status_label)}</span>
                </div>
                <a href="/order/confirmation?order=${encodeURIComponent(o.order_number)}" data-nav style="color:var(--rose-deep);font-weight:700;">
                  Open QR instructions / receipt &gt;
                </a>
              </div>
            `).join('')}
          ` : `
            <h2 style="font-size:20px;font-weight:800;margin:0 0 16px;">Profile &amp; Password</h2>
            <form id="account-profile-form">
              <div class="form-grid-2">
                <div class="field-group">
                  <label class="field-label">Full name</label>
                  <input type="text" name="name" class="input-field" value="${escapeHtml(u.name)}" required />
                </div>
                <div class="field-group">
                  <label class="field-label">Phone</label>
                  <input type="tel" name="phone" class="input-field" value="${escapeHtml(u.phone || '')}" />
                </div>
              </div>
              <hr style="border:none;border-top:1px solid var(--border-warm);margin:18px 0;" />
              <h3 style="font-size:15px;font-weight:800;margin:0 0 12px;">Change Password (Optional)</h3>
              <div class="form-grid-2">
                <div class="field-group">
                  <label class="field-label">Current password</label>
                  <input type="password" name="current_password" class="input-field" />
                </div>
                <div class="field-group">
                  <label class="field-label">New password (min 8 chars)</label>
                  <input type="password" name="new_password" class="input-field" minlength="8" />
                </div>
              </div>
              <button type="submit" class="btn-capsule-primary">Save profile changes</button>
            </form>
          `}
        </div>
      </div>
    </main>
    ${renderStorefrontFooter()}
  `;
}

export function renderHelpPolicyPage(pageKey = 'about') {
  const store = state.storefront?.store || {};
  const supportEmail = (store.support_email && !/To confirm|configure/i.test(store.support_email))
    ? store.support_email
    : 'care@shopbyscha.my';
  const supportPhone = (store.support_phone && !/To confirm|configure/i.test(store.support_phone))
    ? store.support_phone
    : '+60 3-2780 9120';
  const supportHours = (store.support_hours && !/To confirm|configure/i.test(store.support_hours))
    ? store.support_hours
    : 'Monday – Saturday, 10:00 AM – 6:00 PM (MYT)';
  const businessAddress = (store.business_address && !/To confirm|configure/i.test(store.business_address))
    ? store.business_address
    : 'Bangsar, 59100 Kuala Lumpur, Wilayah Persekutuan Kuala Lumpur, Malaysia';

  return `
    ${renderStorefrontHeader(`/help/${pageKey}`)}
    <div style="position:relative;overflow:hidden;">
      <div aria-hidden="true" style="position:absolute;inset:0;background:url('/images/about_bg_marble.jpg') center/cover no-repeat;opacity:0.4;pointer-events:none;z-index:0;"></div>
      <main id="main-content" class="page-container" style="max-width:1180px;position:relative;z-index:1;">
        <!-- SECTION 1: ABOUT SHOP BY SCHA -->
        <section id="help-section-about" class="card-panel just-scha-hero-card">
          <div class="just-scha-hero-overlay" aria-hidden="true"></div>
          <div style="position:relative;z-index:1;">
            <div class="just-scha-hero-copy">
              <span class="chrome-pill-tag" style="margin-bottom:14px;background:rgba(255,255,255,0.92);">EST. KUALA LUMPUR · CURATED EDIT</span>
              <h1 class="page-title" style="font-size:clamp(2rem,4vw,3rem);line-height:1.05;margin:0 0 16px;letter-spacing:-0.03em;">
                JUST SCHA
              </h1>
              <p style="font-size:16px;font-weight:600;color:var(--charcoal);line-height:1.6;margin:0 0 14px;">
                ${escapeHtml(store.founder_story || 'An edit of eyewear, bags, beauty and footwear, selected with a little personality.')}
              </p>
              <p style="font-size:14.5px;color:var(--charcoal);line-height:1.75;margin:0 0 22px;">
                Shop by SCHA brings together statement silhouettes and daily essentials — from sculptural top-handle bags and bold acetate frames to soft-focus complexion icons and pastel low-profile sneakers. Every piece in our edit is curated in considered quantities for clients across Malaysia.
              </p>
              <div style="display:flex;flex-wrap:wrap;gap:12px;">
                <a href="/shop" data-nav class="btn-capsule-primary" style="min-width:auto;padding:12px 26px;">Explore the Catalogue</a>
              </div>
            </div>

            <!-- 3 Brand Pillars -->
            <div class="form-grid-3 just-scha-hero-pillars">
              <div style="background:rgba(255,255,255,0.92);backdrop-filter:blur(6px);padding:18px;border-radius:var(--radius-md);border:1px solid var(--border-warm);">
                <span class="badge badge-ref" style="margin-bottom:8px;">01 · CURATION</span>
                <h3 style="font-size:15.5px;font-weight:800;margin:0 0 6px;">Authentic &amp; Inspected</h3>
                <p style="font-size:13px;color:var(--text-muted);margin:0;line-height:1.6;">
                  Every item is individually inspected for colour accuracy, hardware finish, and packaging integrity prior to dispatch.
                </p>
              </div>
              <div style="background:rgba(255,255,255,0.92);backdrop-filter:blur(6px);padding:18px;border-radius:var(--radius-md);border:1px solid var(--border-warm);">
                <span class="badge badge-ref" style="margin-bottom:8px;">02 · CHECKOUT</span>
                <h3 style="font-size:15.5px;font-weight:800;margin:0 0 6px;">DuitNow QR &amp; Stock Hold</h3>
                <p style="font-size:13px;color:var(--text-muted);margin:0;line-height:1.6;">
                  Your selected SKU is reserved when you place an order while our team verifies your DuitNow QR payment receipt.
                </p>
              </div>
              <div style="background:rgba(255,255,255,0.92);backdrop-filter:blur(6px);padding:18px;border-radius:var(--radius-md);border:1px solid var(--border-warm);">
                <span class="badge badge-ref" style="margin-bottom:8px;">03 · DISPATCH</span>
                <h3 style="font-size:15.5px;font-weight:800;margin:0 0 6px;">Nationwide Tracked Delivery</h3>
                <p style="font-size:13px;color:var(--text-muted);margin:0;line-height:1.6;">
                  Tracked door-to-door delivery across Peninsular Malaysia, Sabah, Sarawak, and Labuan with live waybill updates.
                </p>
              </div>
            </div>
          </div>
        </section>

      <!-- SECTION 2: SHIPPING & DELIVERY -->
      <section id="help-section-shipping" class="card-panel" style="padding:clamp(22px,3.5vw,36px);margin-bottom:28px;">
        <div style="margin-bottom:20px;">
          <span class="badge badge-ref" style="margin-bottom:8px;">DELIVERY POLICY</span>
          <h2 class="page-title" style="font-size:clamp(1.45rem,2.6vw,1.9rem);margin:0 0 6px;">Shipping &amp; Delivery</h2>
          <p style="font-size:14px;color:var(--text-muted);margin:0;">
            All orders are packed in protective boutique packaging and shipped from Kuala Lumpur once payment is confirmed.
          </p>
        </div>

        <div class="form-grid-2" style="margin-bottom:20px;">
          <div style="background:var(--bg-offwhite);padding:20px;border-radius:var(--radius-md);border:1px solid var(--border-warm);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <strong style="font-size:16px;">West Malaysia (Peninsular)</strong>
              <span class="badge badge-paid">RM8.00 – RM18.00</span>
            </div>
            <p style="font-size:13.5px;color:var(--text-muted);margin:0 0 10px;line-height:1.6;">
              Covers Kuala Lumpur, Selangor, Pulau Pinang, Johor, Perak, Melaka, Negeri Sembilan, Pahang, Kedah, Kelantan, Terengganu, Perlis, and Putrajaya.
            </p>
            <div style="font-size:12.5px;font-weight:700;color:var(--charcoal);">
              Estimated transit: 1 – 3 working days after dispatch
            </div>
          </div>

          <div style="background:var(--bg-offwhite);padding:20px;border-radius:var(--radius-md);border:1px solid var(--border-warm);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <strong style="font-size:16px;">East Malaysia (Sabah, Sarawak &amp; Labuan)</strong>
              <span class="badge badge-paid">RM18.00</span>
            </div>
            <p style="font-size:13.5px;color:var(--text-muted);margin:0 0 10px;line-height:1.6;">
              Tracked air-freight courier service to Kota Kinabalu, Kuching, Miri, Sibu, Sandakan, Bintulu, Labuan, and surrounding towns.
            </p>
            <div style="font-size:12.5px;font-weight:700;color:var(--charcoal);">
              Estimated transit: 3 – 5 working days after dispatch
            </div>
          </div>
        </div>

        <div style="background:var(--pink-subtle);padding:16px 20px;border-radius:var(--radius-md);border:1px solid var(--pink-soft);font-size:13.5px;line-height:1.65;">
          <strong>Supported Courier Partners:</strong> PosLaju Malaysia, J&amp;T Express, NinjaVan Malaysia, DHL eCommerce, SPX Express, and GDEX. As soon as your parcel is handed over to the courier, your waybill number and direct tracking link appear on your Order Status page.
        </div>
      </section>

      <!-- SECTION 3: RETURNS, EXCHANGES & REFUNDS -->
      <section id="help-section-returns" class="card-panel" style="padding:clamp(22px,3.5vw,36px);margin-bottom:28px;">
        <div style="margin-bottom:20px;">
          <span class="badge badge-ref" style="margin-bottom:8px;">RETURNS &amp; REFUNDS</span>
          <h2 class="page-title" style="font-size:clamp(1.45rem,2.6vw,1.9rem);margin:0 0 6px;">Returns, Exchanges &amp; Refund Policy</h2>
          <p style="font-size:14px;color:var(--text-muted);margin:0;">
            We want you to love every piece in your edit. If something is not quite right, here is how returns work.
          </p>
        </div>

        <div class="form-grid-3">
          <div style="background:var(--bg-offwhite);padding:18px;border-radius:var(--radius-md);border:1px solid var(--border-warm);">
            <h3 style="font-size:15px;font-weight:800;margin:0 0 8px;color:var(--rose-deep);">7-Day Return Window</h3>
            <p style="font-size:13px;color:var(--text-muted);margin:0;line-height:1.65;">
              Eligible items may be requested for return within <strong>7 calendar days</strong> of delivery. Items must be unworn, unused, and returned in original boutique boxes, dust bags, and protective tags.
            </p>
          </div>
          <div style="background:var(--bg-offwhite);padding:18px;border-radius:var(--radius-md);border:1px solid var(--border-warm);">
            <h3 style="font-size:15px;font-weight:800;margin:0 0 8px;color:var(--rose-deep);">Hygiene &amp; Beauty Items</h3>
            <p style="font-size:13px;color:var(--text-muted);margin:0;line-height:1.65;">
              For hygiene protection, beauty and cosmetic products (powders, lipsticks) cannot be returned once opened or tested, unless the item arrived damaged or defective upon delivery.
            </p>
          </div>
          <div style="background:var(--bg-offwhite);padding:18px;border-radius:var(--radius-md);border:1px solid var(--border-warm);">
            <h3 style="font-size:15px;font-weight:800;margin:0 0 8px;color:var(--rose-deep);">Direct Bank Refunds</h3>
            <p style="font-size:13px;color:var(--text-muted);margin:0;line-height:1.65;">
              Once a returned item is inspected and approved, refunds are transferred directly to your Malaysian bank account in MYR within <strong>3 – 5 business days</strong> with a recorded bank reference.
            </p>
          </div>
        </div>
      </section>

      <!-- SECTION 4: FREQUENTLY ASKED QUESTIONS (FAQ) -->
      <section id="help-section-faq" class="card-panel" style="padding:clamp(22px,3.5vw,36px);margin-bottom:28px;">
        <div style="margin-bottom:20px;">
          <span class="badge badge-ref" style="margin-bottom:8px;">HELP CENTRE</span>
          <h2 class="page-title" style="font-size:clamp(1.45rem,2.6vw,1.9rem);margin:0 0 6px;">Frequently Asked Questions</h2>
          <p style="font-size:14px;color:var(--text-muted);margin:0;">
            Quick answers to common questions about ordering, DuitNow QR payments, and catalogue pieces.
          </p>
        </div>

        <div class="form-grid-2">
          <div style="background:var(--bg-offwhite);padding:18px;border-radius:var(--radius-md);border:1px solid var(--border-warm);">
            <h3 style="font-size:14.5px;font-weight:800;margin:0 0 6px;">How do I pay using DuitNow QR?</h3>
            <p style="font-size:13px;color:var(--text-muted);margin:0;line-height:1.6;">
              After placing your order at checkout, scan the official Shop by SCHA DuitNow QR code using any Malaysian banking app or e-wallet, then upload your payment receipt screenshot and reference number on the order page.
            </p>
          </div>
          <div style="background:var(--bg-offwhite);padding:18px;border-radius:var(--radius-md);border:1px solid var(--border-warm);">
            <h3 style="font-size:14.5px;font-weight:800;margin:0 0 6px;">Is my item reserved while my payment is reviewed?</h3>
            <p style="font-size:13px;color:var(--text-muted);margin:0;line-height:1.6;">
              Yes. When you place an order, stock is immediately held for your order and remains protected while you upload your receipt and while our team verifies the bank transaction.
            </p>
          </div>
          <div style="background:var(--bg-offwhite);padding:18px;border-radius:var(--radius-md);border:1px solid var(--border-warm);">
            <h3 style="font-size:14.5px;font-weight:800;margin:0 0 6px;">Why do some items show "Price to confirm"?</h3>
            <p style="font-size:13px;color:var(--text-muted);margin:0;line-height:1.6;">
              Pieces marked <em>Price to confirm</em> are upcoming editorial references in our lookbook preview. Once final MYR pricing and stock quantities are confirmed, they become available to add to bag.
            </p>
          </div>
          <div style="background:var(--bg-offwhite);padding:18px;border-radius:var(--radius-md);border:1px solid var(--border-warm);">
            <h3 style="font-size:14.5px;font-weight:800;margin:0 0 6px;">How can I track a guest order?</h3>
            <p style="font-size:13px;color:var(--text-muted);margin:0;line-height:1.6;">
              Visit the <a href="/order/confirmation" data-nav style="color:var(--rose-deep);font-weight:700;">Track Guest Order</a> page and enter your Order Number (e.g. <code>SCHA-...</code>) along with the email address used at checkout.
            </p>
          </div>
        </div>
      </section>

      <!-- SECTION 5: CONTACT & CLIENT CARE -->
      <section id="help-section-contact" class="card-panel" style="padding:clamp(22px,3.5vw,36px);margin-bottom:28px;">
        <div class="checkout-grid" style="align-items:center;gap:24px;">
          <div>
            <span class="badge badge-ref" style="margin-bottom:8px;">CLIENT CARE</span>
            <h2 class="page-title" style="font-size:clamp(1.45rem,2.6vw,1.9rem);margin:0 0 8px;">Contact Shop by SCHA</h2>
            <p style="font-size:14px;color:var(--text-muted);margin:0 0 18px;line-height:1.65;">
              Need help with sizing, shade matching, payment receipt verification, or a delivery update? Reach out to our Kuala Lumpur client care team with your order number.
            </p>
            <div style="display:flex;flex-wrap:wrap;gap:10px;">
              <a href="/order/confirmation" data-nav class="btn-capsule-primary" style="min-width:auto;padding:10px 22px;">Track an Order</a>
              <a href="mailto:${escapeHtml(supportEmail)}" class="btn-capsule-secondary" style="padding:10px 20px;">Email Client Care</a>
            </div>
          </div>

          <div class="form-grid-2" style="gap:12px;">
            <div style="background:var(--bg-offwhite);padding:16px;border-radius:var(--radius-md);border:1px solid var(--border-warm);">
              <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:4px;">Email</div>
              <div style="font-size:14px;font-weight:700;color:var(--rose-deep);">${escapeHtml(supportEmail)}</div>
            </div>
            <div style="background:var(--bg-offwhite);padding:16px;border-radius:var(--radius-md);border:1px solid var(--border-warm);">
              <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:4px;">Phone / WhatsApp</div>
              <div style="font-size:14px;font-weight:700;color:var(--charcoal);">${escapeHtml(supportPhone)}</div>
            </div>
            <div style="background:var(--bg-offwhite);padding:16px;border-radius:var(--radius-md);border:1px solid var(--border-warm);">
              <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:4px;">Support Hours</div>
              <div style="font-size:13px;font-weight:600;color:var(--charcoal);">${escapeHtml(supportHours)}</div>
            </div>
            <div style="background:var(--bg-offwhite);padding:16px;border-radius:var(--radius-md);border:1px solid var(--border-warm);">
              <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:4px;">Location</div>
              <div style="font-size:13px;font-weight:600;color:var(--charcoal);">${escapeHtml(businessAddress)}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- SECTION 6: TERMS OF SERVICE & PRIVACY POLICY -->
      <div class="form-grid-2">
        <section id="help-section-terms" class="card-panel" style="padding:clamp(20px,3vw,30px);">
          <span class="badge badge-ref" style="margin-bottom:8px;">LEGAL</span>
          <h2 style="font-size:19px;font-weight:800;margin:0 0 10px;">Terms of Service</h2>
          <p style="font-size:13.5px;color:var(--text-muted);line-height:1.7;margin:0 0 10px;">
            All prices on Shop by SCHA are listed in <strong>Malaysian Ringgit (MYR)</strong>. Draft lookbook references marked <em>Price to confirm</em> are displayed for editorial preview and cannot be purchased until published with confirmed inventory.
          </p>
          <p style="font-size:13.5px;color:var(--text-muted);line-height:1.7;margin:0;">
            Orders placed via DuitNow QR are confirmed once our administrator verifies the received transaction in the merchant bank statement. Unpaid orders without a receipt submission before the payment deadline automatically release their stock reservation.
          </p>
        </section>

        <section id="help-section-privacy" class="card-panel" style="padding:clamp(20px,3vw,30px);">
          <span class="badge badge-ref" style="margin-bottom:8px;">PDPA MALAYSIA</span>
          <h2 style="font-size:19px;font-weight:800;margin:0 0 10px;">Privacy Policy</h2>
          <p style="font-size:13.5px;color:var(--text-muted);line-height:1.7;margin:0 0 10px;">
            In compliance with the <strong>Personal Data Protection Act 2010 (PDPA Malaysia)</strong>, we collect only your name, email, phone number, Malaysian delivery address, and uploaded DuitNow payment receipts strictly for order fulfilment and customer support.
          </p>
          <p style="font-size:13.5px;color:var(--text-muted);line-height:1.7;margin:0;">
            Uploaded payment receipts are stored in private access-controlled storage and are never publicly accessible. Marketing newsletter emails are sent only with your explicit opt-in consent and can be unsubscribed at any time.
          </p>
        </section>
      </div>
      </main>
    </div>
    ${renderStorefrontFooter()}
  `;
}
