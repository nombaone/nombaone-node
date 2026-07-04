/**
 * A scripted fetch double. Every call is recorded (URL, method, headers,
 * parsed body) and answered from a FIFO queue of scripted responses, so tests
 * assert on exactly what the SDK put on the wire.
 */

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Scripted = { kind: 'response'; make: () => Response } | { kind: 'error'; error: unknown };

export interface MockFetch {
  fetch: typeof globalThis.fetch;
  calls: RecordedCall[];
  /** Queue a raw Response. */
  respond(status: number, body: unknown, headers?: Record<string, string>): void;
  /** Queue a NombaOne success envelope wrapping `data`. */
  ok(data: unknown, opts?: { status?: number; requestId?: string }): void;
  /** Queue a paginated success envelope. */
  page(
    data: unknown[],
    pagination: { limit?: number; hasMore: boolean; nextCursor: string | null },
    opts?: { requestId?: string }
  ): void;
  /** Queue a NombaOne error envelope. */
  fail(
    status: number,
    error: { code: string; message?: string; hint?: string; docUrl?: string; fields?: Record<string, string[]> },
    headers?: Record<string, string>
  ): void;
  /** Queue a transport-level failure (network error, abort). */
  networkError(error?: unknown): void;
}

export const mockFetch = (): MockFetch => {
  const calls: RecordedCall[] = [];
  const queue: Scripted[] = [];

  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, name) => {
      headers[name.toLowerCase()] = value;
    });
    const rawBody = init?.body;
    const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : undefined;
    calls.push({ url, method: init?.method ?? 'GET', headers, body });

    if (init?.signal?.aborted) {
      throw Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
    }
    const next = queue.shift();
    if (!next) throw new Error(`mockFetch: no scripted response for ${init?.method} ${url}`);
    if (next.kind === 'error') throw next.error;
    return next.make();
  }) as typeof globalThis.fetch;

  const json = (status: number, body: unknown, headers?: Record<string, string>): Scripted => ({
    kind: 'response',
    make: () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', ...headers },
      }),
  });

  return {
    fetch,
    calls,
    respond(status, body, headers) {
      queue.push(json(status, body, headers));
    },
    ok(data, opts) {
      const status = opts?.status ?? 200;
      queue.push(
        json(status, {
          success: true,
          statusCode: status,
          data,
          meta: { requestId: opts?.requestId ?? 'req_test' },
        })
      );
    },
    page(data, pagination, opts) {
      queue.push(
        json(200, {
          success: true,
          statusCode: 200,
          data,
          pagination: { limit: pagination.limit ?? data.length, ...pagination },
          meta: { requestId: opts?.requestId ?? 'req_test' },
        })
      );
    },
    fail(status, error, headers) {
      queue.push(
        json(
          status,
          {
            success: false,
            statusCode: status,
            error: {
              code: error.code,
              message: error.message ?? 'Something went wrong',
              hint: error.hint ?? 'Try again.',
              docUrl: error.docUrl ?? `https://docs.nombaone.xyz/errors#${error.code}`,
              ...(error.fields ? { fields: error.fields } : {}),
            },
            meta: { requestId: 'req_test' },
          },
          headers
        )
      );
    },
    networkError(error) {
      queue.push({
        kind: 'error',
        error: error ?? Object.assign(new TypeError('fetch failed'), { name: 'TypeError' }),
      });
    },
  };
};
