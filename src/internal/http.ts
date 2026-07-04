import { APIError, ConnectionError, TimeoutError } from '../error.js';
import { VERSION } from '../version.js';
import { parseSuccessEnvelope } from './envelope.js';
import { buildQuery } from './query.js';
import { backoffMs, generateIdempotencyKey, mergeHeaders, retryAfterMs, sleep } from './util.js';

import type { RequestSpec, TransportResult } from '../core-types.js';

export interface TransportConfig {
  apiKey: string;
  /** Origin only (e.g. `https://sandbox.api.nombaone.xyz`) — no `/v1`. */
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  fetch: typeof globalThis.fetch;
  defaultHeaders?: Record<string, string> | undefined;
}

/** The version prefix is applied here, at exactly one place — never in paths. */
const API_PREFIX = '/v1';

/** Statuses retried unconditionally (plus 409 IDEMPOTENCY_IN_PROGRESS). */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Execute one logical API call: build the request, run the retry loop, parse
 * the envelope, and either return the unwrapped result or throw a typed
 * error.
 *
 * Money-safety invariants, enforced here and nowhere else:
 * - The `Idempotency-Key` for a POST is computed **once, before the retry
 *   loop**, so every automatic retry replays the same logical operation
 *   instead of creating a new one.
 * - A user-initiated abort is never retried; only network failures,
 *   timeouts, 408/429/5xx, and our own in-flight idempotency conflict are.
 */
export async function performRequest<T>(
  config: TransportConfig,
  spec: RequestSpec
): Promise<TransportResult<T>> {
  const options = spec.options ?? {};
  const timeout = options.timeout ?? config.timeout;
  const maxRetries = Math.max(0, options.maxRetries ?? config.maxRetries);

  const url = `${config.baseUrl}${API_PREFIX}${spec.path}${buildQuery(spec.query)}`;

  const computedHeaders: Record<string, string | null> = {
    authorization: `Bearer ${config.apiKey}`,
    accept: 'application/json',
    'user-agent': `nombaone-node/${VERSION}`,
  };
  if (spec.body !== undefined) computedHeaders['content-type'] = 'application/json';
  if (spec.method === 'post') {
    computedHeaders['idempotency-key'] = options.idempotencyKey ?? generateIdempotencyKey();
  }
  const headers = mergeHeaders(computedHeaders, config.defaultHeaders, options.headers);
  const body = spec.body !== undefined ? JSON.stringify(spec.body) : undefined;

  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await config.fetch(url, {
        method: spec.method.toUpperCase(),
        headers,
        ...(body !== undefined ? { body } : {}),
        signal: combineSignals(options.signal, timeout),
      });
    } catch (cause) {
      const failure = classifyFetchFailure(cause, options.signal);
      // A user abort is a decision, not a fault — never retried.
      if (failure.userAborted || attempt >= maxRetries) throw failure.error;
      await sleep(backoffMs(attempt));
      continue;
    }

    // Read the body once; non-JSON (proxy error pages) becomes null.
    const parsedBody: unknown = await response.json().catch(() => null);

    if (response.ok) {
      const success = parseSuccessEnvelope(parsedBody, response.headers);
      if (success === null) {
        throw new APIError('Response was not a valid NombaOne envelope', {
          statusCode: response.status,
          code: 'SYSTEM_INTERNAL_ERROR',
          requestId: response.headers.get('x-request-id') ?? undefined,
        });
      }
      return {
        data: success.data as T,
        ...(success.pagination !== undefined ? { pagination: success.pagination } : {}),
        requestId: success.requestId,
        response,
      };
    }

    const error = APIError.fromResponse(response.status, parsedBody, response.headers);
    if (attempt < maxRetries && isRetryableFailure(response.status, error)) {
      await sleep(retryAfterMs(response.headers) ?? backoffMs(attempt));
      continue;
    }
    throw error;
  }
}

const isRetryableFailure = (status: number, error: APIError): boolean =>
  RETRYABLE_STATUSES.has(status) ||
  // Our own earlier attempt still holds the idempotency claim; replaying the
  // same key shortly resolves to that attempt's result.
  (status === 409 && error.code === 'IDEMPOTENCY_IN_PROGRESS');

const combineSignals = (userSignal: AbortSignal | undefined, timeout: number): AbortSignal => {
  const timeoutSignal = AbortSignal.timeout(timeout);
  return userSignal ? AbortSignal.any([userSignal, timeoutSignal]) : timeoutSignal;
};

const classifyFetchFailure = (
  cause: unknown,
  userSignal: AbortSignal | undefined
): { error: ConnectionError; userAborted: boolean } => {
  if (userSignal?.aborted) {
    return {
      error: new ConnectionError('Request was aborted', { cause }),
      userAborted: true,
    };
  }
  const name = (cause as { name?: unknown } | null)?.name;
  if (name === 'TimeoutError' || name === 'AbortError') {
    // The only non-user abort source is our own AbortSignal.timeout.
    return { error: new TimeoutError('Request timed out', { cause }), userAborted: false };
  }
  return {
    error: new ConnectionError('Request failed to reach the NombaOne API', { cause }),
    userAborted: false,
  };
};
