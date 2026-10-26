# Shop by SCHA — Master E-Commerce Storefront & Private Admin Workspace

Version 1.3 | Playful Editorial / Y2K Luxury Direction + Manual DuitNow Merchant QR Verification + Customer Order Tracking

---

## 1. Quick Start & Running the Application

```bash
# 1. Seed the SQLite database (loads all 12 catalogue references + explicit DEMO dataset)
npm run seed

# 2. Start the server (default http://localhost:3000)
npm start

# 3. Run the automated end-to-end acceptance verification suite
npm run test:verify
```

---

## 2. Admin Provisioning & Demo Credentials

Public registration (`/register` and `POST /api/auth/register`) **always** creates a `CUSTOMER` account (`role = 'CUSTOMER'`). There is no public admin sign-up, no role selector on registration, and customer profile updates cannot alter roles.

The initial `ADMIN` account is provisioned outside public sign-up via `server/seed.js` using `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables:

- **Admin Workspace Login (`/admin/login`)**:
  - Email: `admin@shopbyscha.my`
  - Password: `SchaAdmin!2026` (local development default — override via `.env` before live deployment)
- **Demo Customer Login (`/login`)**:
  - Email: `customer@example.com`
  - Password: `Customer!2026`

---

## 3. Supplied Product Catalogue (All 12 References: `REF-01` to `REF-12`)

All 12 original PNG assets from `Shop_by_SCHA_Product_Catalogue.zip` are preserved unmodified under `public/images/` and `data/catalogue/catalogue.json`:

| Ref ID | Brand | Category | Working Title | Image Path | Default State |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `REF-01` | Gentle Monster | Eyewear | Black Optical Frame | `/images/01_gentle_monster_black_optical_frame.png` | Draft (`price: null`, `stock: null`) |
| `REF-02` | Gentle Monster | Eyewear | Black Cat-eye Eyewear | `/images/02_gentle_monster_black_cat_eye_eyewear.png` | Draft (`price: null`, `stock: null`, lifestyle note) |
| `REF-03` | Gentle Monster | Eyewear | Silver Rectangular Frame | `/images/03_gentle_monster_silver_rectangular_frame.png` | Draft (`price: null`, `stock: null`) |
| `REF-04` | Gentle Monster | Eyewear | Silver Sculptural Frame | `/images/04_gentle_monster_silver_sculptural_frame.png` | Draft (`price: null`, `stock: null`) |
| `REF-05` | Jacquemus | Bags | Pink Mini Bag - Lifestyle Reference | `/images/05_jacquemus_pink_mini_bag_lifestyle.png` | Draft + `duplicate_review_required: true` |
| `REF-06` | Jacquemus | Bags | Pink Top-handle Bag - Product Reference | `/images/06_jacquemus_pink_top_handle_bag.png` | Draft + `duplicate_review_required: true` |
| `REF-07` | Jacquemus | Bags | Red Handbag | `/images/07_jacquemus_red_handbag.png` | Draft (`price: null`, `stock: null`) |
| `REF-08` | Jacquemus | Bags | Pink Flap Handbag | `/images/08_jacquemus_pink_flap_handbag.png` | Draft (`price: null`, `stock: null`, Hero `H01`) |
| `REF-09` | Charlotte Tilbury | Beauty | Lipstick | `/images/09_charlotte_tilbury_lipstick.png` | Draft (`price: null`, `stock: null`, multi-shade note) |
| `REF-10` | Charlotte Tilbury | Beauty | Airbrush Flawless Finish Powder | `/images/10_charlotte_tilbury_airbrush_flawless_finish_powder.png` | Draft (`price: null`, `stock: null`) |
| `REF-11` | Charlotte Tilbury | Beauty | Airbrush Flawless Foundation | `/images/11_charlotte_tilbury_airbrush_flawless_foundation.png` | Draft (`price: null`, `stock: null`, single-unit note) |
| `REF-12` | Onitsuka Tiger | Footwear | Pink Sneakers | `/images/12_onitsuka_tiger_pink_sneakers.png` | Draft (`price: null`, `stock: null`) |

- **Incomplete Product Guardrail**: Unconfirmed draft references display `"Price to confirm"` and `"Complete details before sale"` and cannot be added to the bag or purchased until an Admin confirms their SKU, price, and stock in `/admin/products/[id]` and publishes them.
- **Duplicate Review (`REF-05` & `REF-06`)**: In `/admin/products`, Admin can either merge `REF-05` and `REF-06` into a single product with a combined gallery (preserving both original assets) or confirm them as distinct products.
- **Explicit Demo Sandbox Dataset**: To allow immediate testing of the Cart -> Checkout -> DuitNow QR -> Receipt Upload -> Admin Payment Review workflow while keeping `REF-01`..`REF-12` as unconfirmed drafts, the seed includes an explicit `DEMO-01` sandbox item (`Product 01 / Variant A · SKU SCHA-001-A · RM129.00 [DEMO]`) and demo orders (`#SCHA-001` through `#SCHA-005`). All demo records are flagged `is_demo = 1`, visibly badged `DEMO`, and excluded from live analytics reports.

---

## 4. Honest List of Unconnected External Services (Launch Scope)

Per the master prompt specification, the following external integrations are **unconnected** in this launch build and are represented honestly without fake live claims:

1. **Live Bank-Issued Merchant DuitNow QR (`Q01`)**:
   - No real seller bank QR image, merchant ID, or bank account was supplied in the brief.
   - Until the merchant uploads their real bank-issued DuitNow QR image and recipient name in `/admin/settings`, the checkout displays the non-scannable `Q01 / BANK QR — NOT SCANNABLE` setup state (with Demo QR Sandbox mode enabled for testing).
2. **Automatic Bank / Acquirer Webhook Verification**:
   - Launch uses a static bank-issued DuitNow QR with **manual admin verification** (`/admin/payment-reviews`).
   - Uploading a receipt sets `payment_status = 'under_review'` (never `'paid'`). Only an authorised Admin who checks the seller's bank statement and enters the received amount, unique bank reference, and verification checkbox can transition an order to `'paid'`.
3. **External Refund Bank Transfers**:
   - Initiating a refund sets `payment_status = 'refund_pending'`. No button pretends to move bank funds automatically. The seller executes the refund transfer in their bank portal outside the website, then records the external bank transfer reference and timestamp in `/admin/orders/[id]` to complete the refund (`partially_refunded` / `refunded`).
4. **Live Courier API Webhook**:
   - No live courier webhook is connected at launch. Admin records the courier name and tracking number before marking an order `shipped`, and `delivered` requires explicit authorised admin confirmation.
5. **External SMTP Email Delivery Server**:
   - Transactional email jobs (`order_received`, `receipt_submitted`, `payment_confirmed`, `resubmission_requested`, `order_shipped`, `order_delivered`, `refund_completed`) are persisted idempotently in the `notification_jobs` table and can be viewed and retried safely in `/admin/orders/[id]`. Email transport failure does not alter saved order or payment states.
6. **Consent-Based Session Analytics / Conversion Tracking**:
   - Storefront session tracking is unconnected at launch; therefore, conversion rate is intentionally hidden in `/admin/analytics` rather than fabricated from order counts.
7. **Physical Store Locations (`/stores`)**:
   - No physical store addresses were supplied; `/stores` remains hidden from navigation until physical locations are configured in `/admin/settings`.
