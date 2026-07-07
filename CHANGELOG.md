# @nombaone/node

## 0.1.0

Initial release.

- `Nombaone` client with key-derived environments (`nbo_sandbox_` / `nbo_live_`), automatic retries with `Retry-After` support, and auto-generated `Idempotency-Key` headers reused across retries.
- Full `/v1` surface: customers (credit, discounts), plans, prices, subscriptions (lifecycle, schedules, dunning, upcoming invoices), invoices, coupons, payment methods, mandates, settlements (escrow, refunds, payouts), webhook endpoints and deliveries, events, organization settings, metrics, and the sandbox toolkit.
- Typed error hierarchy carrying `code`, `hint`, `docUrl`, `fields`, and `requestId`.
- Cursor pagination with `for await` auto-iteration.
- `webhooks.constructEvent` — signature + timestamp verification and a typed event union.
