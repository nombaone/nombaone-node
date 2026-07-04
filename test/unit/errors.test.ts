import { describe, expect, it } from 'vitest';

import {
  APIError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  NombaoneError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  ServerError,
  ValidationError,
} from '../../src/index.js';

const envelope = (code: string, extra?: Record<string, unknown>) => ({
  success: false,
  statusCode: 0,
  error: {
    code,
    message: 'It broke',
    hint: 'Do the fix.',
    docUrl: `https://docs.nombaone.xyz/errors#${code}`,
    ...extra,
  },
  meta: { requestId: 'req_err' },
});

describe('APIError.fromResponse mapping', () => {
  const table: Array<[number, string, new (...args: never[]) => APIError]> = [
    [400, 'CLIENT_INVALID_REQUEST', BadRequestError],
    [401, 'API_KEY_INVALID', AuthenticationError],
    [403, 'API_KEY_SCOPE_FORBIDDEN', PermissionDeniedError],
    [404, 'CUSTOMER_NOT_FOUND', NotFoundError],
    [409, 'CLIENT_CONFLICT', ConflictError],
    [422, 'CLIENT_VALIDATION_FAILED', ValidationError],
    [429, 'RATE_LIMIT_EXCEEDED', RateLimitError],
    [500, 'SYSTEM_INTERNAL_ERROR', ServerError],
    [503, 'PLATFORM_MAINTENANCE', ServerError],
  ];

  for (const [status, code, cls] of table) {
    it(`maps ${status} ${code} → ${cls.name}`, () => {
      const error = APIError.fromResponse(status, envelope(code), new Headers());
      expect(error).toBeInstanceOf(cls);
      expect(error).toBeInstanceOf(APIError);
      expect(error).toBeInstanceOf(NombaoneError);
      expect(error.code).toBe(code);
      expect(error.statusCode).toBe(status);
      expect(error.requestId).toBe('req_err');
      expect(error.docUrl).toContain(code);
    });
  }

  it('surfaces the hint inside the thrown message', () => {
    const error = APIError.fromResponse(422, envelope('CLIENT_VALIDATION_FAILED'), new Headers());
    expect(error.message).toBe('It broke — Do the fix.');
    expect(error.hint).toBe('Do the fix.');
  });

  it('carries per-field validation errors on 422', () => {
    const error = APIError.fromResponse(
      422,
      envelope('CLIENT_VALIDATION_FAILED', { fields: { email: ['Invalid email'] } }),
      new Headers()
    );
    expect(error.fields).toEqual({ email: ['Invalid email'] });
  });

  it('survives a non-envelope body (proxy error page)', () => {
    const error = APIError.fromResponse(502, null, new Headers({ 'x-request-id': 'req_hdr' }));
    expect(error).toBeInstanceOf(ServerError);
    expect(error.code).toBe('SYSTEM_UPSTREAM_ERROR');
    expect(error.requestId).toBe('req_hdr');
    expect(error.message).toContain('502');
  });

  it('falls back to sane default codes per status', () => {
    expect(APIError.fromResponse(401, null, new Headers()).code).toBe('API_KEY_INVALID');
    expect(APIError.fromResponse(404, null, new Headers()).code).toBe('CLIENT_RESOURCE_NOT_FOUND');
    expect(APIError.fromResponse(429, null, new Headers()).code).toBe('RATE_LIMIT_EXCEEDED');
    expect(APIError.fromResponse(500, null, new Headers()).code).toBe('SYSTEM_INTERNAL_ERROR');
  });

  it('keeps instanceof working through the whole chain', () => {
    const error = APIError.fromResponse(429, envelope('RATE_LIMIT_EXCEEDED'), new Headers());
    expect(error instanceof RateLimitError).toBe(true);
    expect(error instanceof Error).toBe(true);
    expect(error.name).toBe('RateLimitError');
  });
});
