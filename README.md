# nombaone (Node.js SDK)

The official Node.js SDK for the [Nomba One](https://nombaone.xyz) subscription-billing API — recurring billing for Nigeria over card, direct debit, bank transfer, and more, with dunning that recovers and a ledger that never loses a kobo.

```bash
npm install nombaone
# or: pnpm add nombaone · yarn add nombaone
```

Requires Node.js 20+. TypeScript-first, zero runtime dependencies, ESM and CJS.

## Quickstart

Grab a sandbox key (`nbo_sandbox_…`) from the [dashboard](https://app.nombaone.xyz), set it as `NOMBAONE_API_KEY`, and you are three objects away from a live subscription:

```ts
import Nombaone from 'nombaone';

const nombaone = new Nombaone(process.env.NOMBAONE_API_KEY);

const plan = await nombaone.plans.create({ name: 'Pro' });
const price = await nombaone.plans.prices.create(plan.id, {
  unitAmountInKobo: 250_000, // ₦2,500.00 per month
  interval: 'month',
});
const customer = await nombaone.customers.create({
  email: 'ada@example.com',
  name: 'Ada Lovelace',
});

// Sandbox: mint a deterministic test card, then subscribe.
const method = await nombaone.sandbox.createPaymentMethod({ customerId: customer.id });
const subscription = await nombaone.subscriptions.create({
  customerId: customer.id,
  priceId: price.id,
  paymentMethodId: method.id,
});

console.log(subscription.status); // "active"
```

The client derives the host from your key prefix — `nbo_sandbox_…` talks to `https://sandbox.api.nombaone.xyz`, `nbo_live_…` to `https://api.nombaone.xyz`. Server-side only; there is no publishable key to leak.

## Sandbox first

The sandbox runs the real billing engine. `nombaone.sandbox.*` gives you the levers to make a month happen in a second:

```ts
// A card that declines like a thin balance does — "not yet", not "no".
await nombaone.sandbox.createPaymentMethod({
  customerId: customer.id,
  behavior: 'decline_insufficient_funds', // or success | requires_otp | decline_expired_card | decline_do_not_honor
});

// The test clock: force the next billing cycle through the real engine.
const cycle = await nombaone.sandbox.advanceCycle(subscription.id);
console.log(cycle.outcome); // "paid" | "past_due" | …

// Fire a real, signed webhook at your registered endpoints.
await nombaone.sandbox.simulateWebhook({ type: 'invoice.payment_failed' });
```

These methods throw locally (before any network call) if used with a live key.

## Money is integer kobo

Every amount in the API is an **integer in kobo**: `₦1.00 = 100`. `250_000` is ₦2,500 — not ₦250,000. No floats, no decimal strings, `currency` is always `"NGN"`. Multiply naira by 100 exactly once, at the edge of your system; every money field is suffixed `InKobo` so a mixup is hard to type.

## Pagination

Every `list()` works three ways:

```ts
// One page.
const page = await nombaone.invoices.list({ status: 'open', limit: 50 });
page.data;
page.pagination.hasMore;
page.pagination.nextCursor;

// Manual paging.
if (page.hasNextPage()) {
  const next = await page.nextPage();
}

// Or let the SDK thread the cursors.
for await (const invoice of nombaone.invoices.list({ status: 'open' })) {
  // every item across every page
}
```

## Errors are a feature

Failures throw typed errors carrying everything the API said — the stable `code` to branch on, a `hint` telling you exactly what to do next, a `docUrl` into the error reference, per-field details on validation failures, and the `requestId` to quote to support:

```ts
import { NotFoundError, RateLimitError, ValidationError } from 'nombaone';

try {
  await nombaone.subscriptions.create({ customerId, priceId });
} catch (err) {
  if (err instanceof ValidationError) console.log(err.fields); // { paymentMethodId: [...] }
  if (err instanceof RateLimitError) console.log(err.retryAfter); // seconds
  if (err instanceof NotFoundError) console.log(err.code); // "CUSTOMER_NOT_FOUND"
}
```

| Status | Class                              | Notes                                   |
| ------ | ---------------------------------- | --------------------------------------- |
| 400    | `BadRequestError`                  | malformed request                       |
| 401    | `AuthenticationError`              | missing/invalid/wrong-environment key   |
| 403    | `PermissionDeniedError`            | missing scope, foreign resource         |
| 404    | `NotFoundError`                    | wrong id or wrong environment           |
| 409    | `ConflictError`                    | state conflicts, idempotency reuse      |
| 422    | `ValidationError`                  | `err.fields` has the per-field messages |
| 429    | `RateLimitError`                   | `retryAfter`, `limit`, `remaining`      |
| 5xx    | `ServerError`                      | safe to retry (the SDK already did)     |
| —      | `ConnectionError` / `TimeoutError` | transport-level                         |

## Idempotency & retries

The SDK auto-generates an `Idempotency-Key` for every POST and **reuses it across its automatic retries** (network failures, timeouts, 408/429/5xx — 2 retries by default, honoring `Retry-After`), so a blip can never double-charge. Pass your own key when the operation must stay idempotent across _process_ restarts:

```ts
await nombaone.settlements.createPayout(
  { amountInKobo: 5_000_000, bankCode: '058', accountNumber: '0123456789' },
  { idempotencyKey: `payout-${myPayout.id}` } // ⚠ doubles as the payout's durable merchantTxRef
);
```

Every method also accepts `{ signal, timeout, maxRetries, headers }` as its final options argument, and `.withResponse()` exposes the raw `Response` and `requestId`.

## Webhooks

Verify before you parse, and dedupe on the event id — delivery is at-least-once, never exactly-once:

```ts
import express from 'express';
import { webhooks } from 'nombaone'; // no API key needed to verify

const app = express();
app.post('/nombaone/webhooks', express.raw({ type: 'application/json' }), (req, res) => {
  const event = webhooks.constructEvent(
    req.body, // the RAW body — never re-serialize
    req.header('x-nombaone-signature') ?? '',
    process.env.NOMBAONE_WEBHOOK_SECRET! // shown once when you created the endpoint
  );

  if (alreadyProcessed(event.event.id)) return res.sendStatus(200); // at-least-once ⇒ dedupe

  switch (event.type) {
    case 'invoice.paid':
      unlock(event.data.reference);
      break;
    case 'invoice.action_required':
      send(event.data.checkoutLink);
      break; // typed!
    case 'invoice.payment_failed':
      note(event.data.reason);
      break;
  }
  res.sendStatus(200); // respond 2xx fast, work async
});
```

`constructEvent` checks the `X-Nombaone-Signature` (`t=<unix>,v1=<hex>`, HMAC-SHA256 over `` `${t}.${body}` ``) in constant time, rejects stale timestamps (300s tolerance, configurable), and returns a fully-typed 30+-member event union. `webhooks.generateTestHeader()` lets you unit-test your handler. Manage endpoints via `nombaone.webhookEndpoints` (create/rotate return the secret **exactly once**).

## The full surface

`customers` (+credit, discount) · `plans` (+nested `prices`) · `prices` · `subscriptions` (pause/resume/cancel/resubscribe/change, `schedule`, `dunning`, upcoming invoice, events) · `invoices` · `coupons` · `paymentMethods` (hosted-checkout cards, virtual accounts) · `mandates` (NIBSS direct debit) · `settlements` (escrow, refunds, payouts) · `webhookEndpoints` (+deliveries, replay) · `events` (+catalog) · `organization` (+billing policy) · `metrics` · `sandbox` — every operation in the [API reference](https://docs.nombaone.xyz), 1:1.

Worth knowing:

- **Mandates are asynchronous.** They start `consent_pending` and activate when the customer's bank confirms — listen for `payment_method.updated`, don't poll, don't charge early.
- **Bank transfer is a push rail.** `paymentMethods.createVirtualAccount` issues a NUBAN; collection completes when the transfer arrives and reconciles.
- **`past_due` is not canceled.** Read `subscriptions.dunning.retrieve()` and honor `graceAccessUntil` before cutting anyone off.

## Configuration

```ts
new Nombaone(apiKey, {
  baseUrl, // override the derived host
  timeout: 30_000, // per-attempt ms
  maxRetries: 2, // automatic retry budget
  fetch, // bring your own fetch (tests, proxies)
  defaultHeaders, // sent on every request
});
```

## Examples & development

Runnable scripts live in [`examples/`](examples) — quickstart, pagination, the subscription lifecycle, a webhook receiver, and a dunning rehearsal with the test clock. To develop the SDK itself: `pnpm install && pnpm test`; `pnpm test:integration` runs the live suite against a local API (`NOMBAONE_INTEGRATION=1`); `pnpm openapi:update` refreshes the spec snapshot the conformance suite guards.

## Requirements & versioning

Node.js ≥ 20 (built on global `fetch`). Semantic versioning; the API itself is versioned at `/v1` and additive changes never break you. MIT licensed.
