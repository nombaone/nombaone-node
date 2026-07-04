import { afterEach, describe, expect, it } from 'vitest';

import { Nombaone, NombaoneError } from '../../src/index.js';
import { mockFetch } from '../helpers/mock-fetch.js';

const KEY = 'nbo_sandbox_unit_test_key';

afterEach(() => {
  delete process.env.NOMBAONE_API_KEY;
});

describe('Nombaone client construction', () => {
  it('accepts the key as a positional string', () => {
    const client = new Nombaone(KEY);
    expect(client.mode).toBe('sandbox');
    expect(client.baseUrl).toBe('https://sandbox.api.nombaone.xyz');
  });

  it('accepts the key via options', () => {
    const client = new Nombaone({ apiKey: 'nbo_live_abc' });
    expect(client.mode).toBe('live');
    expect(client.baseUrl).toBe('https://api.nombaone.xyz');
  });

  it('falls back to NOMBAONE_API_KEY', () => {
    process.env.NOMBAONE_API_KEY = KEY;
    const client = new Nombaone();
    expect(client.mode).toBe('sandbox');
  });

  it('throws a helpful error when no key is available', () => {
    expect(() => new Nombaone()).toThrowError(NombaoneError);
    expect(() => new Nombaone()).toThrowError(/NOMBAONE_API_KEY/);
  });

  it('throws on an unrecognized key prefix without a baseUrl', () => {
    expect(() => new Nombaone('sk_test_wrong_provider')).toThrowError(/nbo_sandbox_/);
  });

  it('allows an unrecognized prefix when baseUrl is explicit', () => {
    const client = new Nombaone('internal-key', { baseUrl: 'http://localhost:8000/' });
    expect(client.baseUrl).toBe('http://localhost:8000');
    expect(client.mode).toBe('sandbox');
  });

  it('lets an explicit baseUrl win over the derived host', () => {
    const client = new Nombaone(KEY, { baseUrl: 'http://localhost:8000' });
    expect(client.baseUrl).toBe('http://localhost:8000');
  });
});

describe('request building', () => {
  it('sends auth, accept, and user-agent headers to the /v1 path', async () => {
    const mock = mockFetch();
    const client = new Nombaone(KEY, { fetch: mock.fetch, baseUrl: 'http://api.test' });
    mock.ok({ id: 'nbo000000000001cus' });

    await client.request({ method: 'get', path: '/customers/nbo000000000001cus' });

    const call = mock.calls[0]!;
    expect(call.url).toBe('http://api.test/v1/customers/nbo000000000001cus');
    expect(call.method).toBe('GET');
    expect(call.headers['authorization']).toBe(`Bearer ${KEY}`);
    expect(call.headers['accept']).toBe('application/json');
    expect(call.headers['user-agent']).toMatch(/^nombaone-node\/\d+\.\d+\.\d+/);
    expect(call.headers['idempotency-key']).toBeUndefined();
    expect(call.headers['content-type']).toBeUndefined();
  });

  it('serializes query params and drops undefined values', async () => {
    const mock = mockFetch();
    const client = new Nombaone(KEY, { fetch: mock.fetch, baseUrl: 'http://api.test' });
    mock.page([], { hasMore: false, nextCursor: null });

    await client.requestPage({
      method: 'get',
      path: '/customers',
      query: { limit: 20, email: 'ada@example.com', cursor: undefined },
    });

    expect(mock.calls[0]!.url).toBe(
      'http://api.test/v1/customers?limit=20&email=ada%40example.com'
    );
  });

  it('merges defaultHeaders and per-request headers, null deleting', async () => {
    const mock = mockFetch();
    const client = new Nombaone(KEY, {
      fetch: mock.fetch,
      baseUrl: 'http://api.test',
      defaultHeaders: { 'x-team': 'billing' },
    });
    mock.ok({});

    await client.request({
      method: 'get',
      path: '/health',
      options: { headers: { 'x-one-off': 'yes', 'x-team': null } },
    });

    const headers = mock.calls[0]!.headers;
    expect(headers['x-one-off']).toBe('yes');
    expect(headers['x-team']).toBeUndefined();
  });

  it('resolves to the unwrapped data and exposes withResponse()', async () => {
    const mock = mockFetch();
    const client = new Nombaone(KEY, { fetch: mock.fetch, baseUrl: 'http://api.test' });
    mock.ok({ id: 'nbo000000000001cus' }, { requestId: 'req_abc' });

    const promise = client.request<{ id: string }>({ method: 'get', path: '/customers/x' });
    const { data, requestId, response } = await promise.withResponse();

    expect(data).toEqual({ id: 'nbo000000000001cus' });
    expect(requestId).toBe('req_abc');
    expect(response.status).toBe(200);
  });

  it('treats 201 creates as success', async () => {
    const mock = mockFetch();
    const client = new Nombaone(KEY, { fetch: mock.fetch, baseUrl: 'http://api.test' });
    mock.ok({ id: 'nbo000000000001pln' }, { status: 201 });

    const plan = await client.request<{ id: string }>({
      method: 'post',
      path: '/plans',
      body: { name: 'Pro' },
    });
    expect(plan.id).toBe('nbo000000000001pln');
  });

  it('rejects a 2xx body that is not a NombaOne envelope', async () => {
    const mock = mockFetch();
    const client = new Nombaone(KEY, { fetch: mock.fetch, baseUrl: 'http://api.test' });
    mock.respond(200, { hello: 'world' });

    await expect(client.request({ method: 'get', path: '/customers' })).rejects.toThrowError(
      /not a valid NombaOne envelope/
    );
  });
});
