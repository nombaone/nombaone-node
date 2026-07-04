import { describe, expect, it } from 'vitest';

import {
  ConnectionError,
  Nombaone,
  RateLimitError,
  ServerError,
  ValidationError,
} from '../../src/index.js';
import { mockFetch } from '../helpers/mock-fetch.js';

const KEY = 'nbo_sandbox_unit_test_key';

const client = (mock: ReturnType<typeof mockFetch>, maxRetries = 2) =>
  new Nombaone(KEY, { fetch: mock.fetch, baseUrl: 'http://api.test', maxRetries });

describe('retry semantics', () => {
  it('retries a 500 and succeeds on the next attempt', async () => {
    const mock = mockFetch();
    mock.fail(500, { code: 'SYSTEM_INTERNAL_ERROR' });
    mock.ok({ recovered: true });

    const result = await client(mock).request<{ recovered: boolean }>({
      method: 'get',
      path: '/customers',
    });
    expect(result.recovered).toBe(true);
    expect(mock.calls).toHaveLength(2);
  });

  it('honors Retry-After on 429 and retries', async () => {
    const mock = mockFetch();
    mock.fail(429, { code: 'RATE_LIMIT_EXCEEDED' }, { 'retry-after': '0' });
    mock.ok({ fine: true });

    await client(mock).request({ method: 'get', path: '/customers' });
    expect(mock.calls).toHaveLength(2);
  });

  it('gives up after maxRetries and throws the typed error', async () => {
    const mock = mockFetch();
    mock.fail(500, { code: 'SYSTEM_INTERNAL_ERROR' });
    mock.fail(500, { code: 'SYSTEM_INTERNAL_ERROR' });

    await expect(
      client(mock, 1).request({ method: 'get', path: '/customers' })
    ).rejects.toBeInstanceOf(ServerError);
    expect(mock.calls).toHaveLength(2);
  });

  it('exposes rate-limit details when 429 retries are exhausted', async () => {
    const mock = mockFetch();
    mock.fail(
      429,
      { code: 'RATE_LIMIT_EXCEEDED' },
      { 'retry-after': '17', 'x-ratelimit-limit': '120', 'x-ratelimit-remaining': '0' }
    );

    const error = await client(mock, 0)
      .request({ method: 'get', path: '/customers' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    const rateLimited = error as RateLimitError;
    expect(rateLimited.retryAfter).toBe(17);
    expect(rateLimited.limit).toBe(120);
    expect(rateLimited.remaining).toBe(0);
  });

  it('does not retry a 4xx like 422', async () => {
    const mock = mockFetch();
    mock.fail(422, {
      code: 'CLIENT_VALIDATION_FAILED',
      fields: { email: ['Invalid email'] },
    });

    const error = await client(mock)
      .request({ method: 'post', path: '/customers', body: {} })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(mock.calls).toHaveLength(1);
  });

  it('retries a 409 IDEMPOTENCY_IN_PROGRESS (our own in-flight attempt)', async () => {
    const mock = mockFetch();
    mock.fail(409, { code: 'IDEMPOTENCY_IN_PROGRESS' });
    mock.ok({ settled: true });

    await client(mock).request({ method: 'post', path: '/subscriptions', body: {} });
    expect(mock.calls).toHaveLength(2);
  });

  it('does not retry other 409 conflicts', async () => {
    const mock = mockFetch();
    mock.fail(409, { code: 'CLIENT_CONFLICT' });

    await expect(
      client(mock).request({ method: 'post', path: '/subscriptions', body: {} })
    ).rejects.toMatchObject({ code: 'CLIENT_CONFLICT' });
    expect(mock.calls).toHaveLength(1);
  });

  it('retries network errors', async () => {
    const mock = mockFetch();
    mock.networkError();
    mock.ok({ back: true });

    await client(mock).request({ method: 'get', path: '/customers' });
    expect(mock.calls).toHaveLength(2);
  });

  it('throws ConnectionError when the network never recovers', async () => {
    const mock = mockFetch();
    mock.networkError();
    mock.networkError();

    await expect(
      client(mock, 1).request({ method: 'get', path: '/customers' })
    ).rejects.toBeInstanceOf(ConnectionError);
    expect(mock.calls).toHaveLength(2);
  });

  it('never retries a user abort', async () => {
    const mock = mockFetch();
    const controller = new AbortController();
    controller.abort();

    await expect(
      client(mock).request({
        method: 'get',
        path: '/customers',
        options: { signal: controller.signal },
      })
    ).rejects.toThrowError(/aborted/);
    expect(mock.calls).toHaveLength(1);
  });
});
