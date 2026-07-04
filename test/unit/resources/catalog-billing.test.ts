import { describe, expect, it } from 'vitest';

import { Nombaone } from '../../../src/index.js';
import { mockFetch } from '../../helpers/mock-fetch.js';

const KEY = 'nbo_sandbox_unit_test_key';
const SUB = 'nbo000000000001sub';

const setup = () => {
  const mock = mockFetch();
  const client = new Nombaone(KEY, { fetch: mock.fetch, baseUrl: 'http://api.test' });
  return { mock, client };
};

const last = (mock: ReturnType<typeof mockFetch>) => mock.calls[mock.calls.length - 1]!;

describe('plans + nested prices', () => {
  it('covers create/retrieve/update/list/archive and nested prices', async () => {
    const { mock, client } = setup();
    for (let i = 0; i < 7; i++) i < 4 || i === 6 ? mock.ok({}) : mock.page([], { hasMore: false, nextCursor: null });

    await client.plans.create({ name: 'Pro' });
    expect(last(mock).method).toBe('POST');
    expect(last(mock).url).toBe('http://api.test/v1/plans');

    await client.plans.retrieve('nbo000000000001pln');
    expect(last(mock).url).toBe('http://api.test/v1/plans/nbo000000000001pln');

    await client.plans.update('nbo000000000001pln', { description: null });
    expect(last(mock).method).toBe('PATCH');

    await client.plans.archive('nbo000000000001pln');
    expect(last(mock).url).toBe('http://api.test/v1/plans/nbo000000000001pln/archive');

    await client.plans.list({ status: 'active' });
    expect(new URL(last(mock).url).searchParams.get('status')).toBe('active');

    await client.plans.prices.list('nbo000000000001pln');
    expect(last(mock).url).toBe('http://api.test/v1/plans/nbo000000000001pln/prices');

    await client.plans.prices.create('nbo000000000001pln', {
      unitAmountInKobo: 250_000,
      interval: 'month',
    });
    expect(last(mock).method).toBe('POST');
    expect(last(mock).body).toEqual({ unitAmountInKobo: 250_000, interval: 'month' });
  });
});

describe('prices', () => {
  it('covers retrieve/list/deactivate', async () => {
    const { mock, client } = setup();
    mock.ok({});
    mock.page([], { hasMore: false, nextCursor: null });
    mock.ok({});

    await client.prices.retrieve('nbo000000000001prc');
    expect(last(mock).url).toBe('http://api.test/v1/prices/nbo000000000001prc');

    await client.prices.list({ planRef: 'nbo000000000001pln', active: true });
    const url = new URL(last(mock).url);
    expect(url.searchParams.get('planRef')).toBe('nbo000000000001pln');
    expect(url.searchParams.get('active')).toBe('true');

    await client.prices.deactivate('nbo000000000001prc');
    expect(last(mock).url).toBe('http://api.test/v1/prices/nbo000000000001prc/deactivate');
  });
});

describe('subscriptions', () => {
  it('lifecycle actions hit the right paths with idempotency on POSTs', async () => {
    const { mock, client } = setup();
    for (let i = 0; i < 9; i++) mock.ok({});

    await client.subscriptions.create({ customerId: 'c', priceId: 'p', paymentMethodId: 'pm' });
    expect(last(mock).url).toBe('http://api.test/v1/subscriptions');
    expect(last(mock).headers['idempotency-key']).toBeDefined();

    await client.subscriptions.pause(SUB, { maxDays: 30 });
    expect(last(mock).url).toBe(`http://api.test/v1/subscriptions/${SUB}/pause`);
    expect(last(mock).body).toEqual({ maxDays: 30 });

    await client.subscriptions.resume(SUB);
    expect(last(mock).url).toBe(`http://api.test/v1/subscriptions/${SUB}/resume`);

    await client.subscriptions.cancel(SUB, { mode: 'at_period_end' });
    expect(last(mock).body).toEqual({ mode: 'at_period_end' });

    await client.subscriptions.resubscribe(SUB);
    expect(last(mock).url).toBe(`http://api.test/v1/subscriptions/${SUB}/resubscribe`);

    await client.subscriptions.change(SUB, { priceId: 'p2', prorationBehavior: 'none' });
    expect(last(mock).body).toEqual({ priceId: 'p2', prorationBehavior: 'none' });

    await client.subscriptions.updatePaymentMethod(SUB, { checkoutToken: 'tok_1' });
    expect(last(mock).url).toBe(`http://api.test/v1/subscriptions/${SUB}/payment-method`);

    await client.subscriptions.retrieveUpcomingInvoice(SUB);
    expect(last(mock).url).toBe(`http://api.test/v1/subscriptions/${SUB}/upcoming-invoice`);
    expect(last(mock).method).toBe('GET');

    await client.subscriptions.update(SUB, { metadata: { seat: '4' } });
    expect(last(mock).method).toBe('PATCH');
  });

  it('schedule sub-resource: create/retrieve/release', async () => {
    const { mock, client } = setup();
    mock.ok({});
    mock.ok({});
    mock.ok({});

    await client.subscriptions.schedule.create(SUB, { priceId: 'p2' });
    expect(last(mock).method).toBe('POST');
    expect(last(mock).url).toBe(`http://api.test/v1/subscriptions/${SUB}/schedule`);

    await client.subscriptions.schedule.retrieve(SUB);
    expect(last(mock).method).toBe('GET');

    await client.subscriptions.schedule.release(SUB);
    expect(last(mock).method).toBe('DELETE');
  });

  it('dunning sub-resource: retrieve state and list attempts', async () => {
    const { mock, client } = setup();
    mock.ok({ status: 'none' });
    mock.page([], { hasMore: false, nextCursor: null });

    await client.subscriptions.dunning.retrieve(SUB);
    expect(last(mock).url).toBe(`http://api.test/v1/subscriptions/${SUB}/dunning`);

    await client.subscriptions.dunning.listAttempts(SUB, { limit: 10 });
    expect(last(mock).url).toBe(
      `http://api.test/v1/subscriptions/${SUB}/dunning/attempts?limit=10`
    );
  });

  it('discount + events sub-paths', async () => {
    const { mock, client } = setup();
    mock.ok({});
    mock.ok({});
    mock.page([], { hasMore: false, nextCursor: null });

    await client.subscriptions.applyDiscount(SUB, { coupon: 'LAUNCH20' });
    expect(last(mock).url).toBe(`http://api.test/v1/subscriptions/${SUB}/discount`);

    await client.subscriptions.removeDiscount(SUB);
    expect(last(mock).method).toBe('DELETE');

    await client.subscriptions.listEvents(SUB);
    expect(last(mock).url).toBe(`http://api.test/v1/subscriptions/${SUB}/events`);
  });
});

describe('invoices', () => {
  it('covers retrieve/list/void', async () => {
    const { mock, client } = setup();
    mock.ok({});
    mock.page([], { hasMore: false, nextCursor: null });
    mock.ok({});

    await client.invoices.retrieve('nbo000000000001inv');
    expect(last(mock).url).toBe('http://api.test/v1/invoices/nbo000000000001inv');

    await client.invoices.list({ status: 'open', customerId: 'nbo000000000001cus' });
    const url = new URL(last(mock).url);
    expect(url.searchParams.get('status')).toBe('open');
    expect(url.searchParams.get('customerId')).toBe('nbo000000000001cus');

    await client.invoices.void('nbo000000000001inv', { comment: 'duplicate' });
    expect(last(mock).url).toBe('http://api.test/v1/invoices/nbo000000000001inv/void');
    expect(last(mock).body).toEqual({ comment: 'duplicate' });
  });
});

describe('coupons', () => {
  it('covers create/retrieve/update/list', async () => {
    const { mock, client } = setup();
    mock.ok({});
    mock.ok({});
    mock.ok({});
    mock.page([], { hasMore: false, nextCursor: null });

    await client.coupons.create({ code: 'LAUNCH20', percentOff: 20, duration: 'once' });
    expect(last(mock).url).toBe('http://api.test/v1/coupons');

    await client.coupons.retrieve('nbo000000000001cpn');
    expect(last(mock).method).toBe('GET');

    await client.coupons.update('nbo000000000001cpn', { maxRedemptions: 100 });
    expect(last(mock).method).toBe('PATCH');

    await client.coupons.list();
    expect(last(mock).url).toBe('http://api.test/v1/coupons');
  });
});
