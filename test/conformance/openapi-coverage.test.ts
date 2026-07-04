import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { Nombaone } from '../../src/index.js';

/**
 * The drift alarm. Every SDK method is exercised against a recording fetch;
 * each emitted `METHOD /v1/path` must exist in the committed OpenAPI
 * snapshot (spec/openapi.json — refresh with `pnpm openapi:update`), and
 * every spec operation (minus the explicit exclusions) must be emitted by
 * some SDK method. Either direction failing names the route.
 */

interface SpecOp {
  method: string;
  segments: string[];
  key: string;
}

const spec = JSON.parse(
  readFileSync(new URL('../../spec/openapi.json', import.meta.url), 'utf8')
) as { paths: Record<string, Record<string, unknown>> };

const HTTP_METHODS = new Set(['get', 'post', 'patch', 'put', 'delete']);

const specOps: SpecOp[] = [];
for (const [path, item] of Object.entries(spec.paths)) {
  for (const method of Object.keys(item)) {
    if (!HTTP_METHODS.has(method)) continue;
    specOps.push({ method, segments: path.split('/').filter(Boolean), key: `${method} ${path}` });
  }
}

/** Routes intentionally NOT in the SDK surface. */
const EXCLUDED = new Set([
  'get /v1/health', // infra liveness, not a billing call
  'get /v1/openapi.json', // the spec itself
  'post /v1/examples', // deletable reference scaffold
  'get /v1/examples',
  'get /v1/examples/{id}',
]);

/** Most-specific structural match: `{param}` matches any segment; literals win ties. */
const matchSpecOp = (method: string, urlPath: string): SpecOp | null => {
  const segments = urlPath.split('/').filter(Boolean);
  let best: SpecOp | null = null;
  let bestLiterals = -1;
  for (const op of specOps) {
    if (op.method !== method || op.segments.length !== segments.length) continue;
    let literals = 0;
    let ok = true;
    for (let i = 0; i < segments.length; i++) {
      const specSeg = op.segments[i]!;
      if (specSeg.startsWith('{')) continue;
      if (specSeg !== segments[i]) {
        ok = false;
        break;
      }
      literals++;
    }
    if (ok && literals > bestLiterals) {
      best = op;
      bestLiterals = literals;
    }
  }
  return best;
};

const ID = 'nbo000000000001xxx';
const GRANT = 'nbo000000000002crg';
const DELIVERY = 'nbo000000000003whd';

type Exercise = (client: Nombaone) => Promise<unknown>;

/** One entry per SDK method — the complete public surface. */
const EXERCISES: Exercise[] = [
  // customers
  (c) => c.customers.create({ email: 'a@b.co', name: 'A' }),
  (c) => c.customers.retrieve(ID),
  (c) => c.customers.update(ID, { name: 'B' }),
  (c) => c.customers.list(),
  (c) => c.customers.applyDiscount(ID, { coupon: 'X' }),
  (c) => c.customers.removeDiscount(ID),
  (c) => c.customers.grantCredit(ID, { amountInKobo: 100 }),
  (c) => c.customers.retrieveCreditBalance(ID),
  (c) => c.customers.voidCredit(ID, GRANT),
  // plans (+ nested prices)
  (c) => c.plans.create({ name: 'Pro' }),
  (c) => c.plans.retrieve(ID),
  (c) => c.plans.update(ID, { name: 'Pro2' }),
  (c) => c.plans.list(),
  (c) => c.plans.archive(ID),
  (c) => c.plans.prices.create(ID, { unitAmountInKobo: 100, interval: 'month' }),
  (c) => c.plans.prices.list(ID),
  // prices
  (c) => c.prices.retrieve(ID),
  (c) => c.prices.list(),
  (c) => c.prices.deactivate(ID),
  // subscriptions
  (c) => c.subscriptions.create({ customerId: ID, priceId: ID, paymentMethodId: ID }),
  (c) => c.subscriptions.retrieve(ID),
  (c) => c.subscriptions.update(ID, { metadata: {} }),
  (c) => c.subscriptions.list(),
  (c) => c.subscriptions.listEvents(ID),
  (c) => c.subscriptions.pause(ID),
  (c) => c.subscriptions.resume(ID),
  (c) => c.subscriptions.cancel(ID),
  (c) => c.subscriptions.resubscribe(ID),
  (c) => c.subscriptions.change(ID, { priceId: ID }),
  (c) => c.subscriptions.updatePaymentMethod(ID, { checkoutToken: 't' }),
  (c) => c.subscriptions.retrieveUpcomingInvoice(ID),
  (c) => c.subscriptions.applyDiscount(ID, { coupon: 'X' }),
  (c) => c.subscriptions.removeDiscount(ID),
  (c) => c.subscriptions.schedule.create(ID, { priceId: ID }),
  (c) => c.subscriptions.schedule.retrieve(ID),
  (c) => c.subscriptions.schedule.release(ID),
  (c) => c.subscriptions.dunning.retrieve(ID),
  (c) => c.subscriptions.dunning.listAttempts(ID),
  // invoices
  (c) => c.invoices.retrieve(ID),
  (c) => c.invoices.list(),
  (c) => c.invoices.void(ID),
  // coupons
  (c) => c.coupons.create({ code: 'X', percentOff: 10, duration: 'once' }),
  (c) => c.coupons.retrieve(ID),
  (c) => c.coupons.update(ID, { maxRedemptions: 5 }),
  (c) => c.coupons.list(),
  // payment methods
  (c) =>
    c.paymentMethods.setup({ customerRef: ID, amountInKobo: 100, callbackUrl: 'https://x.co' }),
  (c) => c.paymentMethods.createVirtualAccount({ customerRef: ID }),
  (c) => c.paymentMethods.retrieve(ID),
  (c) => c.paymentMethods.list(),
  (c) => c.paymentMethods.setDefault(ID),
  (c) => c.paymentMethods.remove(ID),
  // mandates
  (c) =>
    c.mandates.create({
      customerRef: ID,
      customerAccountNumber: '0123456789',
      bankCode: '058',
      customerName: 'A',
      customerAccountName: 'A',
      customerPhoneNumber: '+234',
      customerAddress: 'Lagos',
      narration: 'sub',
      maxAmountInKobo: 100,
    }),
  (c) => c.mandates.retrieve(ID),
  // settlements
  (c) => c.settlements.retrieve(ID),
  (c) => c.settlements.list(),
  (c) => c.settlements.retrieveEscrow(),
  (c) => c.settlements.refund(ID),
  (c) => c.settlements.createPayout({ amountInKobo: 100, bankCode: '058', accountNumber: '01' }),
  // webhook endpoints (+ deliveries)
  (c) => c.webhookEndpoints.create({ url: 'https://x.co/h' }),
  (c) => c.webhookEndpoints.retrieve(ID),
  (c) => c.webhookEndpoints.update(ID, { disabled: true }),
  (c) => c.webhookEndpoints.list(),
  (c) => c.webhookEndpoints.delete(ID),
  (c) => c.webhookEndpoints.rotateSecret(ID),
  (c) => c.webhookEndpoints.deliveries.list(ID),
  (c) => c.webhookEndpoints.deliveries.retrieve(ID, DELIVERY),
  (c) => c.webhookEndpoints.deliveries.replay(ID, DELIVERY),
  // events
  (c) => c.events.list(),
  (c) => c.events.retrieve(ID),
  (c) => c.events.catalog(),
  // organization
  (c) => c.organization.retrieve(),
  (c) => c.organization.update({ settlementMode: 'split_at_collection' }),
  (c) => c.organization.billing.retrieve(),
  (c) => c.organization.billing.update({ commsEnabled: true }),
  // metrics
  (c) => c.metrics.billing(),
  // sandbox
  (c) => c.sandbox.createPaymentMethod({ customerId: ID }),
  (c) => c.sandbox.advanceCycle(ID),
  (c) => c.sandbox.simulateWebhook({ type: 'invoice.paid' }),
];

describe('OpenAPI conformance', () => {
  it('every SDK call matches a spec operation, and every spec operation is covered', async () => {
    const recorded: Array<{ method: string; path: string }> = [];
    const universalFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      recorded.push({ method: (init?.method ?? 'GET').toLowerCase(), path: url.pathname });
      return new Response(
        JSON.stringify({
          success: true,
          statusCode: 200,
          data: [],
          pagination: { limit: 20, hasMore: false, nextCursor: null },
          meta: { requestId: 'req_conformance' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof globalThis.fetch;

    const client = new Nombaone('nbo_sandbox_conformance', {
      fetch: universalFetch,
      baseUrl: 'http://api.test',
      maxRetries: 0,
    });

    for (const exercise of EXERCISES) await exercise(client);

    const covered = new Set<string>();
    const unmatched: string[] = [];
    for (const call of recorded) {
      const match = matchSpecOp(call.method, call.path);
      if (!match) unmatched.push(`${call.method} ${call.path}`);
      else covered.add(match.key);
    }

    expect(unmatched, `SDK emitted routes that do not exist in the spec`).toEqual([]);

    const missing = specOps
      .map((op) => op.key)
      .filter((key) => !EXCLUDED.has(key) && !covered.has(key))
      .sort();
    expect(missing, `spec operations with no SDK method exercising them`).toEqual([]);

    // Belt-and-braces: the exclusion list only names ops that really exist,
    // so a renamed route can't silently hide behind it.
    for (const excluded of EXCLUDED) {
      expect(
        specOps.some((op) => op.key === excluded),
        `EXCLUDED entry no longer exists in spec: ${excluded}`
      ).toBe(true);
    }
  });
});
