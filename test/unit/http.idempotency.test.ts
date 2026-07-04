import { describe, expect, it } from 'vitest';

import { Nombaone } from '../../src/index.js';
import { mockFetch } from '../helpers/mock-fetch.js';

const KEY = 'nbo_sandbox_unit_test_key';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const client = (mock: ReturnType<typeof mockFetch>) =>
  new Nombaone(KEY, { fetch: mock.fetch, baseUrl: 'http://api.test' });

describe('idempotency keys', () => {
  it('auto-generates a UUID Idempotency-Key on every POST', async () => {
    const mock = mockFetch();
    mock.ok({});

    await client(mock).request({ method: 'post', path: '/customers', body: { name: 'Ada' } });

    expect(mock.calls[0]!.headers['idempotency-key']).toMatch(UUID_RE);
  });

  it('reuses the SAME key across automatic retries — the money-safety invariant', async () => {
    const mock = mockFetch();
    mock.fail(500, { code: 'SYSTEM_INTERNAL_ERROR' });
    mock.fail(503, { code: 'SYSTEM_UPSTREAM_ERROR' });
    mock.ok({});

    await client(mock).request({ method: 'post', path: '/subscriptions', body: {} });

    const keys = mock.calls.map((c) => c.headers['idempotency-key']);
    expect(keys).toHaveLength(3);
    expect(keys[0]).toMatch(UUID_RE);
    expect(new Set(keys).size).toBe(1);
  });

  it('generates a FRESH key for each separate logical call', async () => {
    const mock = mockFetch();
    mock.ok({});
    mock.ok({});

    const c = client(mock);
    await c.request({ method: 'post', path: '/customers', body: {} });
    await c.request({ method: 'post', path: '/customers', body: {} });

    const [first, second] = mock.calls.map((c2) => c2.headers['idempotency-key']);
    expect(first).not.toBe(second);
  });

  it('honors an explicit idempotencyKey', async () => {
    const mock = mockFetch();
    mock.ok({});

    await client(mock).request({
      method: 'post',
      path: '/settlements/payout',
      body: { amountInKobo: 100_000 },
      options: { idempotencyKey: 'payout-2026-07-04-001' },
    });

    expect(mock.calls[0]!.headers['idempotency-key']).toBe('payout-2026-07-04-001');
  });

  it('does not attach a key to GET / PATCH / DELETE', async () => {
    const mock = mockFetch();
    mock.ok({});
    mock.ok({});
    mock.ok({});

    const c = client(mock);
    await c.request({ method: 'get', path: '/customers' });
    await c.request({ method: 'patch', path: '/customers/x', body: {} });
    await c.request({ method: 'delete', path: '/customers/x/discount' });

    for (const call of mock.calls) {
      expect(call.headers['idempotency-key']).toBeUndefined();
    }
  });
});
