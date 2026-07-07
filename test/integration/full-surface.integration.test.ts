import { describe, expect, it } from 'vitest';

import {
  APIError,
  ConnectionError,
  Nombaone,
  ServerError,
  type Coupon,
  type Customer,
  type PaymentMethod,
  type Plan,
  type Price,
  type Subscription,
  type WebhookDelivery,
  type WebhookEndpointWithSecret,
} from '../../src/index.js';

/**
 * The release gate: every public SDK method is exercised against the REAL
 * deployed sandbox, and the result of each call is printed so a human can
 * read exactly what was verified. A typed API error can be an expected
 * outcome (sandbox org limits, upstream outages); a deserialization failure,
 * an envelope mismatch, or an unexpected error code is a DEFECT.
 *
 * Run:
 *   NOMBAONE_INTEGRATION=1 \
 *   NOMBAONE_API_KEY=nbo_sandbox_… \
 *   pnpm vitest run test/integration/full-surface.integration.test.ts
 *
 * Verdict format (what the release report quotes):
 *   NN methods | ok NN | expected-errors N | DEFECTS 0
 */

const enabled = process.env.NOMBAONE_INTEGRATION === '1';
const baseUrl = process.env.NOMBAONE_BASE_URL; // defaults to the key-derived host

/** Every public method that must be exercised (drift alarm for this file). */
const EXPECTED_METHODS = [
  'customers.create',
  'customers.retrieve',
  'customers.update',
  'customers.list',
  'customers.applyDiscount',
  'customers.removeDiscount',
  'customers.grantCredit',
  'customers.retrieveCreditBalance',
  'customers.voidCredit',
  'plans.create',
  'plans.retrieve',
  'plans.update',
  'plans.list',
  'plans.archive',
  'plans.prices.create',
  'plans.prices.list',
  'prices.retrieve',
  'prices.list',
  'prices.deactivate',
  'subscriptions.create',
  'subscriptions.retrieve',
  'subscriptions.update',
  'subscriptions.list',
  'subscriptions.listEvents',
  'subscriptions.pause',
  'subscriptions.resume',
  'subscriptions.cancel',
  'subscriptions.resubscribe',
  'subscriptions.change',
  'subscriptions.updatePaymentMethod',
  'subscriptions.retrieveUpcomingInvoice',
  'subscriptions.applyDiscount',
  'subscriptions.removeDiscount',
  'subscriptions.schedule.create',
  'subscriptions.schedule.retrieve',
  'subscriptions.schedule.release',
  'subscriptions.dunning.retrieve',
  'subscriptions.dunning.listAttempts',
  'invoices.retrieve',
  'invoices.list',
  'invoices.void',
  'coupons.create',
  'coupons.retrieve',
  'coupons.update',
  'coupons.list',
  'paymentMethods.setup',
  'paymentMethods.createVirtualAccount',
  'paymentMethods.retrieve',
  'paymentMethods.list',
  'paymentMethods.setDefault',
  'paymentMethods.remove',
  'mandates.create',
  'mandates.retrieve',
  'settlements.retrieve',
  'settlements.list',
  'settlements.retrieveEscrow',
  'settlements.refund',
  'settlements.createPayout',
  'webhookEndpoints.create',
  'webhookEndpoints.retrieve',
  'webhookEndpoints.update',
  'webhookEndpoints.list',
  'webhookEndpoints.delete',
  'webhookEndpoints.rotateSecret',
  'webhookEndpoints.deliveries.list',
  'webhookEndpoints.deliveries.retrieve',
  'webhookEndpoints.deliveries.replay',
  'events.list',
  'events.retrieve',
  'events.catalog',
  'organization.retrieve',
  'organization.update',
  'organization.billing.retrieve',
  'organization.billing.update',
  'metrics.billing',
  'sandbox.createPaymentMethod',
  'sandbox.advanceCycle',
  'sandbox.simulateWebhook',
] as const;

type Outcome = 'ok' | 'expected-error' | 'DEFECT';

interface CheckResult {
  method: string;
  outcome: Outcome;
  note: string;
}

const results: CheckResult[] = [];

interface CheckOptions {
  /** Assert the returned object's `domain` discriminator. */
  domain?: string;
  /** Typed API error codes that count as an expected outcome here. */
  expectedCodes?: string[];
  /** Known upstream outage (e.g. NIBSS): 5xx/timeout counts as expected. */
  infraFlaky?: boolean;
  /** Extra assertion on a successful value. */
  also?: (value: unknown) => void;
}

const record = (method: string, outcome: Outcome, note: string): void => {
  results.push({ method, outcome, note });
  const tag =
    outcome === 'ok' ? 'ok      ' : outcome === 'expected-error' ? 'expected' : 'DEFECT  ';
  console.log(`  ${tag}  ${method.padEnd(42)} ${note}`);
};

const check = async <T>(
  method: string,
  fn: () => Promise<T>,
  opts: CheckOptions = {}
): Promise<T | undefined> => {
  try {
    const value = await fn();
    const domain = (value as { domain?: unknown } | null)?.domain;
    if (opts.domain !== undefined && domain !== opts.domain) {
      record(method, 'DEFECT', `expected domain "${opts.domain}", got "${String(domain)}"`);
      return value;
    }
    opts.also?.(value);
    const id = (value as { id?: unknown } | null)?.id;
    record(method, 'ok', typeof id === 'string' ? `→ ${id}` : `→ ${opts.domain ?? 'ok'}`);
    return value;
  } catch (error) {
    if (error instanceof APIError) {
      // An envelope the SDK could not parse is always a defect.
      if (error.code === 'SYSTEM_INTERNAL_ERROR' && /envelope/i.test(error.message)) {
        record(method, 'DEFECT', `unparseable envelope: ${error.message}`);
        return undefined;
      }
      if (opts.expectedCodes?.includes(error.code)) {
        record(method, 'expected-error', `${error.statusCode} ${error.code}`);
        return undefined;
      }
      if (opts.infraFlaky && error instanceof ServerError) {
        record(
          method,
          'expected-error',
          `${error.statusCode} ${error.code} (known upstream outage)`
        );
        return undefined;
      }
      record(method, 'DEFECT', `unexpected ${error.statusCode} ${error.code}: ${error.message}`);
      return undefined;
    }
    if (opts.infraFlaky && error instanceof ConnectionError) {
      record(
        method,
        'expected-error',
        `transport failure on known-flaky endpoint (${error.message})`
      );
      return undefined;
    }
    record(method, 'DEFECT', `threw ${(error as Error).name}: ${(error as Error).message}`);
    return undefined;
  }
};

const unique = `fs-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!enabled)('full-surface live verification (release gate)', () => {
  it('exercises every public method against the deployed sandbox with zero defects', async () => {
    const nombaone = new Nombaone(process.env.NOMBAONE_API_KEY, {
      ...(baseUrl ? { baseUrl } : {}),
    });
    console.log(`\nfull-surface verification → ${nombaone.baseUrl} (${nombaone.mode})\n`);

    // ── customers ─────────────────────────────────────────────────────────
    const customer = (await check(
      'customers.create',
      () => nombaone.customers.create({ email: `${unique}@example.com`, name: 'Full Surface' }),
      { domain: 'customer' }
    )) as Customer;
    await check('customers.retrieve', () => nombaone.customers.retrieve(customer.id), {
      domain: 'customer',
    });
    await check(
      'customers.update',
      () => nombaone.customers.update(customer.id, { phone: '+2348000000000' }),
      { domain: 'customer' }
    );
    await check('customers.list', () => nombaone.customers.list({ limit: 2 }), {
      also: (page) => {
        const p = page as { data: unknown[]; pagination: { hasMore: boolean } };
        expect(Array.isArray(p.data)).toBe(true);
        expect(typeof p.pagination.hasMore).toBe('boolean');
      },
    });

    const coupon = (await check(
      'coupons.create',
      () =>
        nombaone.coupons.create({
          code: `FS${Date.now() % 1_000_000}`,
          percentOff: 10,
          duration: 'once',
        }),
      { domain: 'coupon' }
    )) as Coupon;
    await check('coupons.retrieve', () => nombaone.coupons.retrieve(coupon.id), {
      domain: 'coupon',
    });
    await check(
      'coupons.update',
      () => nombaone.coupons.update(coupon.id, { maxRedemptions: 100 }),
      { domain: 'coupon' }
    );
    await check('coupons.list', () => nombaone.coupons.list({ limit: 2 }));

    await check(
      'customers.applyDiscount',
      () => nombaone.customers.applyDiscount(customer.id, { coupon: coupon.id }),
      { domain: 'discount' }
    );
    await check('customers.removeDiscount', () => nombaone.customers.removeDiscount(customer.id), {
      domain: 'discount',
    });
    const grant = await check(
      'customers.grantCredit',
      () => nombaone.customers.grantCredit(customer.id, { amountInKobo: 50_000 }),
      { domain: 'credit_grant' }
    );
    await check(
      'customers.retrieveCreditBalance',
      () => nombaone.customers.retrieveCreditBalance(customer.id),
      { domain: 'credit_balance' }
    );
    await check(
      'customers.voidCredit',
      () => nombaone.customers.voidCredit(customer.id, (grant as { id: string }).id),
      { domain: 'credit_grant' }
    );

    // ── plans + prices ────────────────────────────────────────────────────
    const plan = (await check(
      'plans.create',
      () => nombaone.plans.create({ name: `Full Surface ${unique}` }),
      { domain: 'plan' }
    )) as Plan;
    await check('plans.retrieve', () => nombaone.plans.retrieve(plan.id), { domain: 'plan' });
    await check('plans.update', () => nombaone.plans.update(plan.id, { description: 'fs' }), {
      domain: 'plan',
    });
    await check('plans.list', () => nombaone.plans.list({ limit: 2 }));
    const priceBasic = (await check(
      'plans.prices.create',
      () => nombaone.plans.prices.create(plan.id, { unitAmountInKobo: 100_000, interval: 'month' }),
      { domain: 'price' }
    )) as Price;
    const pricePro = (await nombaone.plans.prices.create(plan.id, {
      unitAmountInKobo: 250_000,
      interval: 'month',
    })) as Price;
    await check('plans.prices.list', () => nombaone.plans.prices.list(plan.id));
    await check('prices.retrieve', () => nombaone.prices.retrieve(priceBasic.id), {
      domain: 'price',
    });
    await check('prices.list', () => nombaone.prices.list({ planRef: plan.id }));

    // Throwaway plan+price so deactivate/archive verify cleanly (no subscribers).
    const scrapPlan = await nombaone.plans.create({ name: `Scrap ${unique}` });
    const scrapPrice = await nombaone.plans.prices.create(scrapPlan.id, {
      unitAmountInKobo: 1_000,
      interval: 'month',
    });
    await check('prices.deactivate', () => nombaone.prices.deactivate(scrapPrice.id), {
      domain: 'price',
    });
    await check('plans.archive', () => nombaone.plans.archive(scrapPlan.id), { domain: 'plan' });

    // ── payment methods (sandbox-minted + real setup surfaces) ───────────
    const card = (await check(
      'sandbox.createPaymentMethod',
      () => nombaone.sandbox.createPaymentMethod({ customerId: customer.id, behavior: 'success' }),
      { domain: 'payment_method' }
    )) as PaymentMethod;
    await check(
      'paymentMethods.setup',
      () =>
        nombaone.paymentMethods.setup({
          customerRef: customer.id,
          amountInKobo: 5_000,
          callbackUrl: 'https://example.com/return',
        }),
      { domain: 'checkout_setup' }
    );
    await check(
      'paymentMethods.createVirtualAccount',
      () => nombaone.paymentMethods.createVirtualAccount({ customerRef: customer.id }),
      { domain: 'virtual_account', infraFlaky: true }
    );
    await check('paymentMethods.retrieve', () => nombaone.paymentMethods.retrieve(card.id), {
      domain: 'payment_method',
    });
    await check(
      'paymentMethods.list',
      () => nombaone.paymentMethods.list({ customerRef: customer.id }),
      {
        also: (page) => {
          const items = (page as { data: Array<{ domain: string }> }).data;
          for (const item of items) expect(item.domain).toBe('payment_method');
        },
      }
    );
    const spareCard = await nombaone.sandbox.createPaymentMethod({
      customerId: customer.id,
      behavior: 'success',
    });
    await check('paymentMethods.setDefault', () => nombaone.paymentMethods.setDefault(card.id), {
      domain: 'payment_method',
    });

    // ── subscriptions (the core loop) ─────────────────────────────────────
    const subscription = (await check(
      'subscriptions.create',
      () =>
        nombaone.subscriptions.create({
          customerId: customer.id,
          priceId: priceBasic.id,
          paymentMethodId: card.id,
        }),
      { domain: 'subscription' }
    )) as Subscription;
    await check('subscriptions.retrieve', () => nombaone.subscriptions.retrieve(subscription.id), {
      domain: 'subscription',
    });
    await check(
      'subscriptions.update',
      () => nombaone.subscriptions.update(subscription.id, { metadata: { fs: 'true' } }),
      { domain: 'subscription' }
    );
    await check('subscriptions.list', () =>
      nombaone.subscriptions.list({ customerId: customer.id })
    );
    await check('subscriptions.listEvents', () =>
      nombaone.subscriptions.listEvents(subscription.id)
    );
    await check('subscriptions.pause', () => nombaone.subscriptions.pause(subscription.id), {
      domain: 'subscription',
    });
    await check('subscriptions.resume', () => nombaone.subscriptions.resume(subscription.id), {
      domain: 'subscription',
    });
    await check(
      'subscriptions.schedule.create',
      () => nombaone.subscriptions.schedule.create(subscription.id, { priceId: pricePro.id }),
      { domain: 'subscription_schedule' }
    );
    await check(
      'subscriptions.schedule.retrieve',
      () => nombaone.subscriptions.schedule.retrieve(subscription.id),
      { domain: 'subscription_schedule' }
    );
    await check(
      'subscriptions.schedule.release',
      () => nombaone.subscriptions.schedule.release(subscription.id),
      { domain: 'subscription_schedule' }
    );
    await check(
      'subscriptions.change',
      () => nombaone.subscriptions.change(subscription.id, { priceId: pricePro.id }),
      { domain: 'subscription' }
    );
    // THE fleet-famous wire check: this endpoint returns the updated
    // PaymentMethod on the wire (not the Subscription the old spec claimed).
    await check(
      'subscriptions.updatePaymentMethod',
      () =>
        nombaone.subscriptions.updatePaymentMethod(subscription.id, {
          paymentMethodReference: spareCard.id,
        }),
      { domain: 'payment_method' }
    );
    await check(
      'subscriptions.retrieveUpcomingInvoice',
      () => nombaone.subscriptions.retrieveUpcomingInvoice(subscription.id),
      { domain: 'upcoming_invoice' }
    );
    await check(
      'subscriptions.applyDiscount',
      () => nombaone.subscriptions.applyDiscount(subscription.id, { coupon: coupon.id }),
      { domain: 'discount' }
    );
    await check(
      'subscriptions.removeDiscount',
      () => nombaone.subscriptions.removeDiscount(subscription.id),
      { domain: 'discount' }
    );
    await check(
      'subscriptions.dunning.retrieve',
      () => nombaone.subscriptions.dunning.retrieve(subscription.id),
      { domain: 'dunning_state' }
    );
    await check('subscriptions.dunning.listAttempts', () =>
      nombaone.subscriptions.dunning.listAttempts(subscription.id)
    );

    // ── the test clock + invoices ─────────────────────────────────────────
    const cycle = await check(
      'sandbox.advanceCycle',
      () => nombaone.sandbox.advanceCycle(subscription.id),
      { domain: 'advance_cycle_result' }
    );
    const invoiceId = (cycle as { invoice?: { id?: string } } | undefined)?.invoice?.id;
    await check(
      'invoices.retrieve',
      () => nombaone.invoices.retrieve(invoiceId ?? 'nbo000000000000inv'),
      { domain: 'invoice', expectedCodes: ['INVOICE_NOT_FOUND'] }
    );
    await check('invoices.list', () => nombaone.invoices.list({ customerId: customer.id }));
    await check('invoices.void', () => nombaone.invoices.void(invoiceId ?? 'nbo000000000000inv'), {
      domain: 'invoice',
      // A paid/settled cycle invoice legitimately refuses voiding — that IS
      // the documented behavior; only open invoices are voidable.
      expectedCodes: ['INVOICE_NOT_VOIDABLE', 'INVOICE_ALREADY_PAID', 'INVOICE_NOT_FOUND'],
    });

    // ── lifecycle end ─────────────────────────────────────────────────────
    await check(
      'subscriptions.cancel',
      () => nombaone.subscriptions.cancel(subscription.id, { mode: 'now' }),
      { domain: 'subscription' }
    );
    const resub = await check(
      'subscriptions.resubscribe',
      () => nombaone.subscriptions.resubscribe(subscription.id),
      { domain: 'subscription' }
    );
    if (resub) await nombaone.subscriptions.cancel((resub as Subscription).id, { mode: 'now' });
    await check('paymentMethods.remove', () => nombaone.paymentMethods.remove(spareCard.id), {
      domain: 'payment_method',
    });

    // ── mandates (NIBSS upstream is a known sandbox outage: 504) ─────────
    await check(
      'mandates.create',
      () =>
        nombaone.mandates.create(
          {
            customerRef: customer.id,
            customerAccountNumber: '0123456789',
            bankCode: '058',
            customerName: 'Full Surface',
            customerAccountName: 'Full Surface',
            customerPhoneNumber: '+2348000000000',
            customerAddress: '1 Marina, Lagos',
            narration: 'FS mandate',
            maxAmountInKobo: 500_000,
          },
          { maxRetries: 0, timeout: 45_000 } // dead upstream: fail fast, don't retry a 504 thrice
        ),
      { domain: 'mandate_setup', infraFlaky: true }
    );
    const mandateKindPm = await nombaone.sandbox.createPaymentMethod({
      customerId: customer.id,
      kind: 'mandate',
    });
    await check('mandates.retrieve', () => nombaone.mandates.retrieve(mandateKindPm.id), {
      domain: 'payment_method', // returns the underlying payment-method row
    });

    // ── settlements (sandbox org has no settlement subaccount) ───────────
    const settlementCodes = [
      'SETTLEMENT_SUBACCOUNT_NOT_FOUND',
      'SETTLEMENT_NOT_FOUND',
      'ESCROW_LOCKED',
      'PAYOUT_EXCEEDS_AVAILABLE',
    ];
    await check('settlements.retrieveEscrow', () => nombaone.settlements.retrieveEscrow(), {
      domain: 'escrow',
      expectedCodes: settlementCodes,
    });
    await check('settlements.list', () => nombaone.settlements.list({ limit: 2 }), {
      expectedCodes: settlementCodes,
    });
    await check('settlements.retrieve', () => nombaone.settlements.retrieve('nbo000000000000stl'), {
      expectedCodes: settlementCodes,
    });
    await check('settlements.refund', () => nombaone.settlements.refund('nbo000000000000stl'), {
      expectedCodes: settlementCodes,
    });
    await check(
      'settlements.createPayout',
      () =>
        nombaone.settlements.createPayout(
          { amountInKobo: 10_000, bankCode: '058', accountNumber: '0123456789' },
          { idempotencyKey: `fs-payout-${unique}` }
        ),
      { domain: 'payout', expectedCodes: settlementCodes }
    );

    // ── webhook endpoints + a real simulated delivery ─────────────────────
    const endpoint = (await check(
      'webhookEndpoints.create',
      () => nombaone.webhookEndpoints.create({ url: 'https://example.com/nombaone-fs' }),
      {
        domain: 'webhook',
        also: (value) =>
          expect((value as WebhookEndpointWithSecret).signingSecret.length).toBeGreaterThan(10),
      }
    )) as WebhookEndpointWithSecret;
    await check(
      'webhookEndpoints.retrieve',
      () => nombaone.webhookEndpoints.retrieve(endpoint.id),
      {
        domain: 'webhook',
      }
    );
    await check('webhookEndpoints.list', () => nombaone.webhookEndpoints.list());
    await check(
      'webhookEndpoints.rotateSecret',
      () => nombaone.webhookEndpoints.rotateSecret(endpoint.id),
      { domain: 'webhook_secret' }
    );
    await check(
      'sandbox.simulateWebhook',
      () => nombaone.sandbox.simulateWebhook({ type: 'invoice.paid' }),
      { domain: 'webhook_simulation' }
    );
    // The delivery row is written by the out-of-band drain — poll briefly.
    let deliveries: WebhookDelivery[] = [];
    for (let attempt = 0; attempt < 20 && deliveries.length === 0; attempt++) {
      await sleep(500);
      deliveries = (await nombaone.webhookEndpoints.deliveries.list(endpoint.id, { limit: 5 }))
        .data;
    }
    await check(
      'webhookEndpoints.deliveries.list',
      () => nombaone.webhookEndpoints.deliveries.list(endpoint.id),
      {
        also: () => expect(deliveries.length).toBeGreaterThan(0),
      }
    );
    const delivery = deliveries[0]!;
    await check(
      'webhookEndpoints.deliveries.retrieve',
      () => nombaone.webhookEndpoints.deliveries.retrieve(endpoint.id, delivery.id),
      { domain: 'webhook_delivery' }
    );
    await check(
      'webhookEndpoints.deliveries.replay',
      () => nombaone.webhookEndpoints.deliveries.replay(endpoint.id, delivery.id),
      { domain: 'webhook_delivery' }
    );
    await check(
      'webhookEndpoints.update',
      () => nombaone.webhookEndpoints.update(endpoint.id, { disabled: true }),
      { domain: 'webhook' }
    );
    await check('webhookEndpoints.delete', () => nombaone.webhookEndpoints.delete(endpoint.id), {
      domain: 'webhook',
    });

    // ── events, organization, metrics ─────────────────────────────────────
    const eventsPage = await check('events.list', () => nombaone.events.list({ limit: 2 }));
    const firstEvent = (eventsPage as { data: Array<{ id: string }> } | undefined)?.data[0];
    await check(
      'events.retrieve',
      () => nombaone.events.retrieve(firstEvent?.id ?? 'nbo000000000000evt'),
      { domain: 'event', expectedCodes: ['WEBHOOK_EVENT_NOT_FOUND', 'CLIENT_RESOURCE_NOT_FOUND'] }
    );
    await check('events.catalog', () => nombaone.events.catalog(), {
      also: (catalog) => expect(Object.keys(catalog as object).length).toBeGreaterThan(20),
    });

    const org = await check('organization.retrieve', () => nombaone.organization.retrieve(), {
      domain: 'organization',
    });
    const settlementMode = (
      org as { billing?: { settlementMode?: 'split_at_collection' | 'collect_then_payout' } }
    )?.billing?.settlementMode;
    await check(
      'organization.update',
      () =>
        nombaone.organization.update({ settlementMode: settlementMode ?? 'split_at_collection' }),
      { domain: 'organization' }
    );
    const billing = await check(
      'organization.billing.retrieve',
      () => nombaone.organization.billing.retrieve(),
      { domain: 'billing_settings' }
    );
    await check(
      'organization.billing.update',
      () =>
        nombaone.organization.billing.update({
          commsEnabled: (billing as { commsEnabled?: boolean })?.commsEnabled ?? true,
        }),
      { domain: 'billing_settings' }
    );
    await check('metrics.billing', () => nombaone.metrics.billing(), {
      domain: 'billing_metrics',
    });

    // ── the verdict ───────────────────────────────────────────────────────
    const ok = results.filter((r) => r.outcome === 'ok').length;
    const expectedErrors = results.filter((r) => r.outcome === 'expected-error').length;
    const defects = results.filter((r) => r.outcome === 'DEFECT');
    const covered = new Set(results.map((r) => r.method));
    const missed = EXPECTED_METHODS.filter((m) => !covered.has(m));

    console.log(
      `\n  ${results.length} methods | ok ${ok} | expected-errors ${expectedErrors} | DEFECTS ${defects.length}`
    );
    if (missed.length > 0) console.log(`  MISSED (not exercised): ${missed.join(', ')}`);
    for (const defect of defects) console.log(`  DEFECT → ${defect.method}: ${defect.note}`);

    expect(missed, 'every public method must be exercised').toEqual([]);
    expect(defects, 'zero wire/parse defects allowed at release').toEqual([]);
  }, 300_000);
});
