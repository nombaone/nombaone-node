# @nombaone/node

## 0.1.0

Initial release.

- `Nombaone` client with key-derived environments (`nbo_sandbox_` / `nbo_live_`), automatic retries with `Retry-After` support, and auto-generated `Idempotency-Key` headers reused across retries.
- Full `/v1` surface: customers (credit, discounts), plans, prices, subscriptions (lifecycle, schedules, dunning, upcoming invoices), invoices, coupons, payment methods, mandates, settlements (escrow, refunds, payouts), webhook endpoints and deliveries, events, organization settings, metrics, and the sandbox toolkit.
- Typed error hierarchy carrying `code`, `hint`, `docUrl`, `fields`, and `requestId`.
- Cursor pagination with `for await` auto-iteration.
- `webhooks.constructEvent` — signature + timestamp verification and a typed event union.

## 0.1.3

- Fix: `WebhookEvent` is now a closed discriminated union so narrowing on `event.type` actually types `event.data` (the open catch-all member made narrowed payloads collapse to `unknown`). New `UnknownWebhookEvent` type is the explicit escape hatch for event types newer than your SDK.

## 0.1.5

- `Subscription.checkoutLink` (create-response only) + `SubscriptionCreateParams.callbackUrl` — the hosted-checkout entry: create without a `paymentMethodId` and redirect the end user to `checkoutLink`; paying there activates the subscription and captures a reusable card.
- `Invoice.payInstructions` — the NUBAN bank-transfer block (`bankName` / `accountNumber` / `accountName` / exact `amountInKobo` / `reference`) for transfer-collected invoices; `null` otherwise.
- Breaking: `subscriptions.updatePaymentMethod` no longer accepts `checkoutToken` — the API removed the raw-token path (an unverified string must never become a chargeable credential). Pass an already-captured `paymentMethodReference`; new cards are captured through the hosted checkout.
- Docs: `AdvanceCycleResult.outcome` now documents the `awaiting_payment` value, and the `sandbox.advanceCycle` example guards `result.invoice` (nullable since 0.1.4).
