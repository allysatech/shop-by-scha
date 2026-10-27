# Shop by SCHA — v1.4.0

The existing Node HTTP server, vanilla JavaScript frontend, pink cursive logo and boutique direction are retained.

## Local preview

Use Node 24 (minimum Node 22.5 with node:sqlite).

```sh
npm ci
SCHA_ENV=preview SESSION_SECRET=use-a-unique-local-test-session-secret DB_PATH=./data/preview.sqlite npm start
```

This explicitly isolated preview seeds sample accounts/products/orders and a non-scannable QR. It must not share a production database. A banner identifies sample data. Provision unique merchant credentials for production.

## Checks

```sh
npm run build
npm test
npm run test:postgres
```

Build validates server/browser-module syntax without writing to databases. Tests use disposable data. PostgreSQL tests run the same commerce and acceptance flows on PGlite, a PostgreSQL engine. This verifies SQL/transactions but not the merchant's Neon connectivity or independent deployed-instance concurrency.

## Production setup

Use the placeholders in .env.example. Keep secrets server-only.

- DATABASE_URL: Neon pooled PostgreSQL. This is authoritative for users, sessions, carts, products, inventory, orders, reviews and audit data. The partial SQLite-to-Neon mirror is disabled.
- SESSION_SECRET: unique signing secret.
- S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and optional S3_ENDPOINT: private durable object storage. Product media is served through /uploads; receipts through ownership-checked /api/receipts/:id.
- APP_URL, RESEND_API_KEY and RESEND_FROM_EMAIL: real transactional email. Queued records are not delivered messages. Provider acceptance stores its message ID; inbox delivery requires separate confirmation.
- JOB_SECRET: authenticate scheduled /api/jobs requests. Configure a real scheduler for email retries and reservation expiry; none is provisioned by the code alone.

Vercel cannot fall back to ephemeral SQLite. Persistent local SQLite remains supported for development/single-server hosting. Missing durable database or file storage must be resolved before live checkout.

## Migration and provisioning

Do not deploy over the current store without reconciling its business records. The previous version used per-instance SQLite and mirrored only subsets of products/orders/shipments into scha_* tables. Those tables cannot reconstruct missing carts, users, item/address snapshots, receipts or history.

1. Export and back up existing authoritative records and files. Reconcile IDs, totals, holds and receipt ownership.
2. Run `npm run migrate` on a staging Neon branch using a migration credential. Migrations are additive. A bank-reference uniqueness conflict requires review, not deletion.
3. Import reconciled records through a reviewed migration. No historical data is invented or silently overwritten by this change.
4. Verify staging with actual storage/email/scheduler credentials and two independent app instances.
5. Only for a genuinely empty database, configure ADMIN_EMAIL and a unique ADMIN_PASSWORD (at least 12 characters), then `npm run seed`. Production provisioning removes only its newly seeded test fixtures and refuses pre-existing business records without provisioned users.
6. Complete merchant QR, contact, shipping and policies, then publish confirmed products.

Production PostgreSQL startup does not run migrations automatically. Use separate migration and runtime credentials with appropriate grants.

## Catalogue and admin

All 12 original images are unchanged. References 05/06 remain flagged until the merchant confirms whether they share the same exact model/size. The existing explicit merge/distinct workflow remains.

Publishing requires commercial fields including exact model, description, MYR price, SKU, stock, availability type, lead time and images. The editor includes confirmed variant JSON (prices in sen), image management, draft preview and archive. Preserve existing variant IDs/history; stock cannot drop below reserved units. Production public APIs exclude drafts/demo products. Gallery placeholders are removed.

Phone admin cards link to full product/order/customer/inventory/payment-review records. Tables remain contained where needed; every important action remains in the detail workspace.

## Cart and payment

Only /api/cart initializes the cookie; auth/me no longer creates a competing cart. Login merges carts with ownership checks. Added confirmations follow successful writes. Checkout uses a scoped idempotency key, server totals, immutable snapshots and atomic stock reservations. PostgreSQL transactions use an advisory lock for the existing multi-row inventory logic; monitor contention before scaling beyond boutique traffic.

Receipt upload sets under_review, never paid. Admin must match the actual received bank transaction. Payment and delivery states remain separate. Refund actions record an external transfer; they do not move funds.

## Visual review export

```sh
node server/export-review.js /absolute/path/to/review-output
```

Shop_by_SCHA_Visual_Preview.html contains actual view-function output with isolated API fixtures and page/width selectors. It is a static visual review, not a hosted transactional preview. Images use the original public store asset URLs. Run the project to test live UI/API interactions.

## Outstanding verification

Local automated checks pass on SQLite and the PostgreSQL test engine. Actual Neon/S3/Resend connections, inbox delivery, Vercel preview and browser breakpoint/screenshot QA remain unverified until the correct project accounts and a reachable preview are available. Responsive CSS and static render tests do not replace browser verification.
