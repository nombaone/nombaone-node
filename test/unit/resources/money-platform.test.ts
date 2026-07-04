import { describe, expect, it } from 'vitest';

import { Nombaone, NombaoneError } from '../../../src/index.js';
import { mockFetch } from '../../helpers/mock-fetch.js';

const KEY = 'nbo_sandbox_unit_test_key';

const setup = () => {
  const mock = mockFetch();
  const client = new Nombaone(KEY, { fetch: mock.fetch, baseUrl: 'http://api.test' });
  return { mock, client };
};

const last = (mock: ReturnType<typeof mockFetch>) => mock.calls[mock.calls.length - 1]!;

describe('payment methods', () => {
  it('setup, virtual account, retrieve, list, default, remove', async () => {
    const { mock, client } = setup();
    for (let i = 0; i < 5; i++) mock.ok({});
    mock.page([], { hasMore: false, nextCursor: null });

    await client.paymentMethods.setup({
      customerRef: 'nbo000000000001cus',
      amountInKobo: 5_000,
      callbackUrl: 'https://example.com/return',
    });
    expect(last(mock).url).toBe('http://api.test/v1/payment-methods/setup');
    expect(last(mock).headers['idempotency-key']).toBeDefined();

    await client.paymentMethods.createVirtualAccount({ customerRef: 'nbo000000000001cus' });
    expect(last(mock).url).toBe('http://api.test/v1/payment-methods/virtual-account');

    await client.paymentMethods.retrieve('nbo000000000001pmt');
    expect(last(mock).method).toBe('GET');

    await client.paymentMethods.setDefault('nbo000000000001pmt');
    expect(last(mock).url).toBe('http://api.test/v1/payment-methods/nbo000000000001pmt/default');

    await client.paymentMethods.remove('nbo000000000001pmt');
    expect(last(mock).method).toBe('DELETE');

    await client.paymentMethods.list({ customerRef: 'nbo000000000001cus' });
    expect(new URL(last(mock).url).searchParams.get('customerRef')).toBe('nbo000000000001cus');
  });
});

describe('mandates', () => {
  it('create carries the full NIBSS body; retrieve is a GET', async () => {
    const { mock, client } = setup();
    mock.ok({});
    mock.ok({});

    await client.mandates.create({
      customerRef: 'nbo000000000001cus',
      customerAccountNumber: '0123456789',
      bankCode: '058',
      customerName: 'Ada Lovelace',
      customerAccountName: 'Ada Lovelace',
      customerPhoneNumber: '+2348012345678',
      customerAddress: '1 Marina, Lagos',
      narration: 'Acme Pro',
      maxAmountInKobo: 500_000,
    });
    expect(last(mock).url).toBe('http://api.test/v1/mandates');
    expect(last(mock).headers['idempotency-key']).toBeDefined();
    expect((last(mock).body as { bankCode: string }).bankCode).toBe('058');

    await client.mandates.retrieve('nbo000000000001pmt');
    expect(last(mock).url).toBe('http://api.test/v1/mandates/nbo000000000001pmt');
  });
});

describe('settlements', () => {
  it('escrow/list/retrieve/refund/payout hit the right paths', async () => {
    const { mock, client } = setup();
    mock.ok({});
    mock.page([], { hasMore: false, nextCursor: null });
    mock.ok({});
    mock.ok({});
    mock.ok({});

    await client.settlements.retrieveEscrow();
    expect(last(mock).url).toBe('http://api.test/v1/settlements/escrow');

    await client.settlements.list({ status: 'settled' });
    expect(new URL(last(mock).url).searchParams.get('status')).toBe('settled');

    await client.settlements.retrieve('nbo000000000001stl');
    expect(last(mock).url).toBe('http://api.test/v1/settlements/nbo000000000001stl');

    await client.settlements.refund('nbo000000000001stl', { amountInKobo: 100_000 });
    expect(last(mock).url).toBe('http://api.test/v1/settlements/nbo000000000001stl/refund');
    expect(last(mock).headers['idempotency-key']).toBeDefined();

    await client.settlements.createPayout(
      { amountInKobo: 1_000_000, bankCode: '058', accountNumber: '0123456789' },
      { idempotencyKey: 'payout-42' }
    );
    expect(last(mock).url).toBe('http://api.test/v1/settlements/payout');
    expect(last(mock).headers['idempotency-key']).toBe('payout-42');
  });
});

describe('webhook endpoints', () => {
  it('CRUD + rotate + deliveries sub-resource', async () => {
    const { mock, client } = setup();
    mock.ok({ signingSecret: 'nbo_whsec_x' }, { status: 201 });
    mock.ok({});
    mock.ok({});
    mock.page([], { hasMore: false, nextCursor: null });
    mock.ok({});
    mock.ok({});
    mock.page([], { hasMore: false, nextCursor: null });
    mock.ok({});
    mock.ok({});

    const created = await client.webhookEndpoints.create({ url: 'https://example.com/hooks' });
    expect(created.signingSecret).toBe('nbo_whsec_x');
    expect(last(mock).url).toBe('http://api.test/v1/webhooks');

    await client.webhookEndpoints.retrieve('nbo000000000001whk');
    await client.webhookEndpoints.update('nbo000000000001whk', { disabled: true });
    expect(last(mock).method).toBe('PATCH');

    await client.webhookEndpoints.list();
    await client.webhookEndpoints.rotateSecret('nbo000000000001whk');
    expect(last(mock).url).toBe('http://api.test/v1/webhooks/nbo000000000001whk/rotate-secret');

    await client.webhookEndpoints.delete('nbo000000000001whk');
    expect(last(mock).method).toBe('DELETE');

    await client.webhookEndpoints.deliveries.list('nbo000000000001whk', { status: 'dead' });
    expect(last(mock).url).toBe(
      'http://api.test/v1/webhooks/nbo000000000001whk/deliveries?status=dead'
    );

    await client.webhookEndpoints.deliveries.retrieve('nbo000000000001whk', 'nbo000000000001whd');
    expect(last(mock).url).toBe(
      'http://api.test/v1/webhooks/nbo000000000001whk/deliveries/nbo000000000001whd'
    );

    await client.webhookEndpoints.deliveries.replay('nbo000000000001whk', 'nbo000000000001whd');
    expect(last(mock).url).toBe(
      'http://api.test/v1/webhooks/nbo000000000001whk/deliveries/nbo000000000001whd/replay'
    );
  });
});

describe('events, organization, metrics', () => {
  it('events list/retrieve/catalog', async () => {
    const { mock, client } = setup();
    mock.page([], { hasMore: false, nextCursor: null });
    mock.ok({});
    mock.ok({ 'invoice.paid': { when: 'x', payload: ['reference'] } });

    await client.events.list({ type: 'invoice.paid' });
    expect(new URL(last(mock).url).searchParams.get('type')).toBe('invoice.paid');

    await client.events.retrieve('nbo000000000001evt');
    expect(last(mock).url).toBe('http://api.test/v1/events/nbo000000000001evt');

    const catalog = await client.events.catalog();
    expect(last(mock).url).toBe('http://api.test/v1/events/catalog');
    expect(catalog['invoice.paid']!.payload).toEqual(['reference']);
  });

  it('organization + billing settings use GET/PUT', async () => {
    const { mock, client } = setup();
    for (let i = 0; i < 4; i++) mock.ok({});

    await client.organization.retrieve();
    expect(last(mock).url).toBe('http://api.test/v1/organization');

    await client.organization.update({ settlementMode: 'split_at_collection' });
    expect(last(mock).method).toBe('PUT');

    await client.organization.billing.retrieve();
    expect(last(mock).url).toBe('http://api.test/v1/organization/billing');

    await client.organization.billing.update({ paydayBiasEnabled: true });
    expect(last(mock).method).toBe('PUT');
    expect(last(mock).body).toEqual({ paydayBiasEnabled: true });
  });

  it('metrics.billing with window', async () => {
    const { mock, client } = setup();
    mock.ok({});

    await client.metrics.billing({ from: '2026-06-01T00:00:00.000Z' });
    const url = new URL(last(mock).url);
    expect(url.pathname).toBe('/v1/metrics/billing');
    expect(url.searchParams.get('from')).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('sandbox toolkit', () => {
  it('hits /v1/sandbox/* paths with a sandbox key', async () => {
    const { mock, client } = setup();
    mock.ok({});
    mock.ok({});
    mock.ok({});

    await client.sandbox.createPaymentMethod({
      customerId: 'nbo000000000001cus',
      behavior: 'requires_otp',
    });
    expect(last(mock).url).toBe('http://api.test/v1/sandbox/payment-methods');

    await client.sandbox.advanceCycle('nbo000000000001sub');
    expect(last(mock).url).toBe(
      'http://api.test/v1/sandbox/subscriptions/nbo000000000001sub/advance-cycle'
    );

    await client.sandbox.simulateWebhook({ type: 'invoice.paid' });
    expect(last(mock).url).toBe('http://api.test/v1/sandbox/webhooks/simulate');
  });

  it('throws locally (no network) when used with a live key', async () => {
    const mock = mockFetch();
    const live = new Nombaone('nbo_live_prod_key', { fetch: mock.fetch });

    expect(() => live.sandbox.advanceCycle('nbo000000000001sub')).toThrowError(NombaoneError);
    expect(() => live.sandbox.advanceCycle('nbo000000000001sub')).toThrowError(/nbo_sandbox_/);
    expect(mock.calls).toHaveLength(0);
  });
});
