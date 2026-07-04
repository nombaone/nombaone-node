/**
 * Shared primitives every resource builds on. These mirror the NombaOne wire
 * contract exactly — the API's response envelope, cursor pagination, and the
 * two environments — so the SDK never invents shapes of its own.
 */

/**
 * The environment a key (and everything created with it) lives in. Encoded in
 * the API key prefix: `nbo_sandbox_…` or `nbo_live_…`. Sandbox and live are
 * fully isolated — a resource created in one does not exist in the other.
 */
export type Mode = 'sandbox' | 'live';

/**
 * An amount of money in **kobo**, the integer minor unit of the naira.
 * `₦1.00 = 100`. Every money field in the API is an integer number of kobo —
 * never a float, never a decimal string. Multiply naira by 100 exactly once,
 * at the edge of your system.
 */
export type Kobo = number;

/** Free-form annotations you can attach to most resources. */
export type Metadata = Record<string, unknown>;

/** Cursor-pagination block returned at the top level of every list response. */
export interface ApiPagination {
  /** The page size that was applied (1–100; the API default is 20). */
  limit: number;
  /** Whether more items exist beyond this page. */
  hasMore: boolean;
  /** Opaque cursor for the next page, or `null` when `hasMore` is false. */
  nextCursor: string | null;
}

/** The `meta` block present on every response, success or error. */
export interface ApiMeta {
  /** Unique id for this request — quote it when contacting support. */
  requestId: string;
}

/** Success envelope for single-resource responses. */
export interface ApiSuccessEnvelope<T> {
  success: true;
  statusCode: number;
  data: T;
  meta: ApiMeta;
}

/** Success envelope for list responses (adds top-level `pagination`). */
export interface ApiPaginatedEnvelope<T> {
  success: true;
  statusCode: number;
  data: T[];
  pagination: ApiPagination;
  meta: ApiMeta;
}

/** Error envelope. See {@link NombaoneError} for the thrown representation. */
export interface ApiErrorEnvelope {
  success: false;
  statusCode: number;
  error: {
    code: string;
    message: string;
    /** Actionable, plain-English guidance on exactly what to do next. */
    hint: string;
    /** Deep link to this code's entry in the public error reference. */
    docUrl: string;
    /** Per-field validation errors, present on 422 validation failures. */
    fields?: Record<string, string[]>;
  };
  meta: ApiMeta;
}

export type HttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete';

/**
 * Per-call options accepted by every SDK method as its last argument.
 */
export interface RequestOptions {
  /**
   * Overrides the auto-generated `Idempotency-Key` header (POST requests
   * only). The SDK generates a fresh UUID per call and **reuses it across
   * automatic retries**, so a network blip can never double-charge. Pass your
   * own stable key when the operation must stay idempotent across process
   * restarts (for example a payout keyed by your own transaction reference).
   */
  idempotencyKey?: string;
  /**
   * Extra headers for this request. Merged over the SDK defaults; a `null`
   * value removes a default header.
   */
  headers?: Record<string, string | null>;
  /** Abort the request (never retried after a user abort). */
  signal?: AbortSignal;
  /** Per-attempt timeout in milliseconds for this call. */
  timeout?: number;
  /** Retry budget for this call (overrides the client default). */
  maxRetries?: number;
}

/** Internal description of one HTTP call. Resource methods produce these. */
export interface RequestSpec {
  method: HttpMethod;
  /** Path below `/v1`, with already-encoded segments (e.g. `/customers/nbo…cus`). */
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  options?: RequestOptions | undefined;
}

/** Internal: what the transport hands back to the promise/page wrappers. */
export interface TransportResult<T> {
  data: T;
  pagination?: ApiPagination;
  requestId: string;
  response: Response;
}
