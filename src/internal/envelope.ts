import type { ApiPagination } from '../core-types.js';

/**
 * Minimal structural checks on the response envelope. The transport trusts
 * the API's contract (`{success, data, meta.requestId}`), but a proxy or
 * middlebox can hand back arbitrary JSON — these guards turn that into a
 * clean error instead of an `undefined` deep-read.
 */

export interface ParsedSuccess {
  data: unknown;
  pagination: ApiPagination | undefined;
  requestId: string;
}

export const parseSuccessEnvelope = (body: unknown, headers: Headers): ParsedSuccess | null => {
  if (typeof body !== 'object' || body === null) return null;
  const envelope = body as {
    success?: unknown;
    data?: unknown;
    pagination?: unknown;
    meta?: { requestId?: unknown };
  };
  if (envelope.success !== true || !('data' in envelope)) return null;

  const requestId =
    typeof envelope.meta?.requestId === 'string'
      ? envelope.meta.requestId
      : (headers.get('x-request-id') ?? '');

  let pagination: ApiPagination | undefined;
  const rawPagination = envelope.pagination as
    { limit?: unknown; hasMore?: unknown; nextCursor?: unknown } | undefined;
  if (
    typeof rawPagination === 'object' &&
    rawPagination !== null &&
    typeof rawPagination.hasMore === 'boolean'
  ) {
    pagination = {
      limit: typeof rawPagination.limit === 'number' ? rawPagination.limit : 0,
      hasMore: rawPagination.hasMore,
      nextCursor: typeof rawPagination.nextCursor === 'string' ? rawPagination.nextCursor : null,
    };
  }

  return { data: envelope.data, pagination, requestId };
};
