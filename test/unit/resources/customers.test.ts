import { describe, expect, it } from 'vitest';

import { Nombaone } from '../../../src/index.js';
import { mockFetch } from '../../helpers/mock-fetch.js';

const KEY = 'nbo_sandbox_unit_test_key';

const setup = () => {
  const mock = mockFetch();
  const client = new Nombaone(KEY, { fetch: mock.fetch, baseUrl: 'http://api.test' });
  return { mock, client };
};

describe('customers resource', () => {
  it('create → POST /v1/customers with the body and an idempotency key', async () => {
    const { mock, client } = setup();
    mock.ok({ id: 'nbo000000000001cus' }, { status: 201 });

    await client.customers.create({ email: 'ada@example.com', name: 'Ada Lovelace' });

    const call = mock.calls[0]!;
    expect(call.method).toBe('POST');
    expect(call.url).toBe('http://api.test/v1/customers');
    expect(call.body).toEqual({ email: 'ada@example.com', name: 'Ada Lovelace' });
    expect(call.headers['idempotency-key']).toBeDefined();
  });

  it('retrieve → GET /v1/customers/{id} with the id encoded', async () => {
    const { mock, client } = setup();
    mock.ok({ id: 'weird id' });

    await client.customers.retrieve('weird id');
    expect(mock.calls[0]!.url).toBe('http://api.test/v1/customers/weird%20id');
    expect(mock.calls[0]!.method).toBe('GET');
  });

  it('update → PATCH /v1/customers/{id}', async () => {
    const { mock, client } = setup();
    mock.ok({});

    await client.customers.update('nbo000000000001cus', { phone: null });
    expect(mock.calls[0]!.method).toBe('PATCH');
    expect(mock.calls[0]!.body).toEqual({ phone: null });
  });

  it('list → GET /v1/customers with filters', async () => {
    const { mock, client } = setup();
    mock.page([], { hasMore: false, nextCursor: null });

    await client.customers.list({ email: 'ada@example.com', limit: 5 });
    const url = new URL(mock.calls[0]!.url);
    expect(url.pathname).toBe('/v1/customers');
    expect(url.searchParams.get('email')).toBe('ada@example.com');
    expect(url.searchParams.get('limit')).toBe('5');
  });

  it('discount sub-resource → POST and DELETE /v1/customers/{id}/discount', async () => {
    const { mock, client } = setup();
    mock.ok({ id: 'nbo000000000001dsc' });
    mock.ok({ id: 'nbo000000000001dsc' });

    await client.customers.applyDiscount('nbo000000000001cus', { coupon: 'LAUNCH20' });
    await client.customers.removeDiscount('nbo000000000001cus');

    expect(mock.calls[0]!.method).toBe('POST');
    expect(mock.calls[0]!.url).toBe('http://api.test/v1/customers/nbo000000000001cus/discount');
    expect(mock.calls[0]!.body).toEqual({ coupon: 'LAUNCH20' });
    expect(mock.calls[1]!.method).toBe('DELETE');
    expect(mock.calls[1]!.headers['idempotency-key']).toBeUndefined();
  });

  it('credit sub-resource → grant, balance, void', async () => {
    const { mock, client } = setup();
    mock.ok({ id: 'nbo000000000001crg' });
    mock.ok({ balanceInKobo: 250_000 });
    mock.ok({ id: 'nbo000000000001crg', voidedAt: '2026-07-04T00:00:00.000Z' });

    await client.customers.grantCredit('nbo000000000001cus', { amountInKobo: 250_000 });
    await client.customers.retrieveCreditBalance('nbo000000000001cus');
    await client.customers.voidCredit('nbo000000000001cus', 'nbo000000000001crg');

    expect(mock.calls[0]!.url).toBe('http://api.test/v1/customers/nbo000000000001cus/credit');
    expect(mock.calls[0]!.headers['idempotency-key']).toBeDefined();
    expect(mock.calls[1]!.method).toBe('GET');
    expect(mock.calls[2]!.method).toBe('DELETE');
    expect(mock.calls[2]!.url).toBe(
      'http://api.test/v1/customers/nbo000000000001cus/credit/nbo000000000001crg'
    );
  });
});
