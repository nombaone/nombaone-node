/**
 * Errors are a feature. Every failed API call throws a typed error carrying
 * the machine-readable `code`, the human `message`, an actionable `hint`
 * telling you exactly what to do next, and a `docUrl` deep-linking into the
 * error reference — straight off the wire, so the fix arrives with the
 * failure.
 *
 * Branch on `error.code` (stable) or `instanceof` (by HTTP class), never on
 * `message` (may be reworded).
 */

/**
 * Every error code the public API can emit, vendored from the platform's
 * `PUBLIC_ERROR_CODES`. The union is open (`string & {}`) so a code added by
 * the API tomorrow never breaks your compile today.
 */
export type NombaoneErrorCode =
  // ---- Generic request errors ----
  | 'CLIENT_INVALID_REQUEST'
  | 'CLIENT_VALIDATION_FAILED'
  | 'CLIENT_FORBIDDEN'
  | 'CLIENT_ROUTE_NOT_FOUND'
  | 'CLIENT_RESOURCE_NOT_FOUND'
  | 'CLIENT_CONFLICT'
  | 'INVALID_CURSOR'
  // ---- API-key auth ----
  | 'API_KEY_MISSING'
  | 'API_KEY_INVALID'
  | 'API_KEY_SCOPE_FORBIDDEN'
  | 'API_KEY_ENVIRONMENT_MISMATCH'
  // ---- Idempotency ----
  | 'IDEMPOTENCY_KEY_MISSING'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'IDEMPOTENCY_IN_PROGRESS'
  // ---- Rate limiting / platform ----
  | 'RATE_LIMIT_EXCEEDED'
  | 'QUOTA_EXCEEDED'
  | 'PLATFORM_MAINTENANCE'
  // ---- Webhooks ----
  | 'WEBHOOK_SIGNATURE_INVALID'
  // ---- Customers ----
  | 'CUSTOMER_NOT_FOUND'
  | 'CUSTOMER_EMAIL_TAKEN'
  // ---- Plans & prices ----
  | 'PLAN_NOT_FOUND'
  | 'PLAN_NAME_TAKEN'
  | 'PLAN_ALREADY_ARCHIVED'
  | 'PLAN_HAS_ACTIVE_SUBSCRIBERS'
  | 'PRICE_NOT_FOUND'
  | 'PRICE_PLAN_MISMATCH'
  | 'PRICE_ALREADY_INACTIVE'
  | 'PRICE_TIERED_NOT_SUPPORTED'
  // ---- Payment methods & mandates ----
  | 'PAYMENT_METHOD_NOT_FOUND'
  | 'PAYMENT_METHOD_NOT_ACTIVE'
  | 'PAYMENT_METHOD_KIND_MISMATCH'
  | 'MANDATE_NOT_ACTIVE'
  | 'MANDATE_MAX_AMOUNT_EXCEEDED'
  | 'MANDATE_CONSENT_PENDING'
  // ---- Subscriptions & invoices ----
  | 'SUBSCRIPTION_NOT_FOUND'
  | 'SUBSCRIPTION_ILLEGAL_TRANSITION'
  | 'SUBSCRIPTION_VERSION_CONFLICT'
  | 'SUBSCRIPTION_NOT_TERMINAL'
  | 'SUBSCRIPTION_PAYMENT_METHOD_REQUIRED'
  | 'INVOICE_NOT_FOUND'
  | 'INVOICE_ALREADY_FINALIZED'
  | 'INVOICE_ALREADY_PAID'
  | 'INVOICE_NOT_VOIDABLE'
  // ---- Schedules & proration ----
  | 'SUBSCRIPTION_SCHEDULE_NOT_FOUND'
  | 'SUBSCRIPTION_SCHEDULE_CONFLICT'
  | 'SUBSCRIPTION_SCHEDULE_INVALID_EFFECTIVE_AT'
  | 'PRORATION_NOT_APPLICABLE'
  | 'PRORATION_INTERVAL_SWITCH_UNSUPPORTED'
  // ---- Coupons, discounts & credits ----
  | 'COUPON_NOT_FOUND'
  | 'COUPON_EXPIRED'
  | 'COUPON_MAX_REDEMPTIONS_REACHED'
  | 'COUPON_INVALID_DEFINITION'
  | 'COUPON_ALREADY_APPLIED'
  | 'DISCOUNT_NOT_FOUND'
  | 'CREDIT_GRANT_NOT_FOUND'
  | 'CREDIT_GRANT_ALREADY_VOIDED'
  | 'CREDIT_INSUFFICIENT_BALANCE'
  | 'CREDIT_INVALID_AMOUNT'
  // ---- Dunning ----
  | 'DUNNING_NO_OPEN_INVOICE'
  | 'DUNNING_ATTEMPT_NOT_FOUND'
  | 'DUNNING_CARD_UPDATE_REQUIRED'
  | 'DUNNING_ALREADY_TERMINAL'
  // ---- Settlement, refunds & payouts ----
  | 'SETTLEMENT_NOT_FOUND'
  | 'SETTLEMENT_SUBACCOUNT_NOT_FOUND'
  | 'REFUND_ALREADY_REFUNDED'
  | 'REFUND_AMOUNT_EXCEEDS_NET'
  | 'ESCROW_LOCKED'
  | 'PAYOUT_EXCEEDS_AVAILABLE'
  // ---- Example scaffold ----
  | 'EXAMPLE_NOT_FOUND'
  // ---- System fallbacks ----
  | 'SYSTEM_INTERNAL_ERROR'
  | 'SYSTEM_UPSTREAM_ERROR'
  // Open union: tolerate codes this SDK version does not know yet.
  | (string & {});

/**
 * Base class for everything this SDK throws — API failures, connection
 * problems, webhook verification failures, and client misconfiguration.
 *
 * @example
 * ```ts
 * try {
 *   await nombaone.subscriptions.create({ customerId, priceId });
 * } catch (err) {
 *   if (err instanceof NombaoneError) console.error(err.message);
 * }
 * ```
 */
export class NombaoneError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const errorBodyOf = (
  body: unknown
): Partial<ApiErrorShape> & { messageText?: string; requestId?: string } => {
  if (typeof body !== 'object' || body === null) return {};
  const envelope = body as {
    error?: {
      code?: unknown;
      message?: unknown;
      hint?: unknown;
      docUrl?: unknown;
      fields?: unknown;
    };
    meta?: { requestId?: unknown };
  };
  const error = envelope.error;
  const out: Partial<ApiErrorShape> & { messageText?: string; requestId?: string } = {};
  if (error) {
    if (typeof error.code === 'string') out.code = error.code;
    if (typeof error.message === 'string') out.messageText = error.message;
    if (typeof error.hint === 'string') out.hint = error.hint;
    if (typeof error.docUrl === 'string') out.docUrl = error.docUrl;
    if (typeof error.fields === 'object' && error.fields !== null) {
      out.fields = error.fields as Record<string, string[]>;
    }
  }
  if (typeof envelope.meta?.requestId === 'string') out.requestId = envelope.meta.requestId;
  return out;
};

interface ApiErrorShape {
  code: NombaoneErrorCode;
  hint: string;
  docUrl: string;
  fields?: Record<string, string[]>;
  requestId?: string;
}

/**
 * A non-2xx response from the API. Carries everything the error envelope
 * said: the stable {@link code} to branch on, the {@link hint} telling you
 * how to fix it, the {@link docUrl} into the error reference, per-field
 * validation errors on 422s, and the {@link requestId} to quote to support.
 *
 * Subclasses are keyed by HTTP status so `instanceof` reads naturally:
 * {@link AuthenticationError}, {@link RateLimitError}, {@link ValidationError}, …
 */
export class APIError extends NombaoneError {
  /** HTTP status of the response. */
  readonly statusCode: number;
  /** Stable machine-readable error code — branch on this. */
  readonly code: NombaoneErrorCode;
  /** Actionable guidance from the API on exactly what to do next. */
  readonly hint: string;
  /** Deep link to this code's entry in the public error reference. */
  readonly docUrl: string;
  /** Per-field validation errors (field path → messages), present on 422s. */
  readonly fields?: Record<string, string[]>;
  /** The request id — include it when contacting support. */
  readonly requestId: string | undefined;

  constructor(
    message: string,
    details: {
      statusCode: number;
      code: NombaoneErrorCode;
      hint?: string;
      docUrl?: string;
      fields?: Record<string, string[]>;
      requestId?: string | undefined;
    }
  ) {
    // Surface the hint in the thrown message itself — the fix should arrive
    // with the failure, without a docs tab.
    super(details.hint ? `${message} — ${details.hint}` : message);
    this.statusCode = details.statusCode;
    this.code = details.code;
    this.hint = details.hint ?? '';
    this.docUrl = details.docUrl ?? '';
    if (details.fields !== undefined) this.fields = details.fields;
    this.requestId = details.requestId;
  }

  /** Build the right APIError subclass from a raw response + parsed body. */
  static fromResponse(status: number, body: unknown, headers: Headers): APIError {
    const parsed = errorBodyOf(body);
    const code = parsed.code ?? defaultCodeForStatus(status);
    const message = parsed.messageText ?? `Request failed with status ${status}`;
    const details = {
      statusCode: status,
      code,
      hint: parsed.hint ?? '',
      docUrl: parsed.docUrl ?? '',
      requestId: parsed.requestId ?? headers.get('x-request-id') ?? undefined,
      ...(parsed.fields !== undefined ? { fields: parsed.fields } : {}),
    };

    if (status === 400) return new BadRequestError(message, details);
    if (status === 401) return new AuthenticationError(message, details);
    if (status === 403) return new PermissionDeniedError(message, details);
    if (status === 404) return new NotFoundError(message, details);
    if (status === 409) return new ConflictError(message, details);
    if (status === 422) return new ValidationError(message, details);
    if (status === 429) {
      const retryAfterRaw = headers.get('retry-after');
      const limitRaw = headers.get('x-ratelimit-limit');
      const remainingRaw = headers.get('x-ratelimit-remaining');
      return new RateLimitError(message, {
        ...details,
        ...(retryAfterRaw !== null && Number.isFinite(Number(retryAfterRaw))
          ? { retryAfter: Number(retryAfterRaw) }
          : {}),
        ...(limitRaw !== null && Number.isFinite(Number(limitRaw))
          ? { limit: Number(limitRaw) }
          : {}),
        ...(remainingRaw !== null && Number.isFinite(Number(remainingRaw))
          ? { remaining: Number(remainingRaw) }
          : {}),
      });
    }
    if (status >= 500) return new ServerError(message, details);
    return new APIError(message, details);
  }
}

const defaultCodeForStatus = (status: number): NombaoneErrorCode => {
  switch (status) {
    case 400:
      return 'CLIENT_INVALID_REQUEST';
    case 401:
      return 'API_KEY_INVALID';
    case 403:
      return 'CLIENT_FORBIDDEN';
    case 404:
      return 'CLIENT_RESOURCE_NOT_FOUND';
    case 409:
      return 'CLIENT_CONFLICT';
    case 422:
      return 'CLIENT_VALIDATION_FAILED';
    case 429:
      return 'RATE_LIMIT_EXCEEDED';
    case 502:
    case 503:
    case 504:
      return 'SYSTEM_UPSTREAM_ERROR';
    default:
      return 'SYSTEM_INTERNAL_ERROR';
  }
};

/** 400 — the request could not be understood. */
export class BadRequestError extends APIError {}
/** 401 — missing, invalid, revoked, or wrong-environment API key. */
export class AuthenticationError extends APIError {}
/** 403 — valid key, but not allowed (missing scope, foreign resource). */
export class PermissionDeniedError extends APIError {}
/** 404 — no resource at that id in this environment. */
export class NotFoundError extends APIError {}
/** 409 — conflicts with current state (including idempotency in-progress/reuse). */
export class ConflictError extends APIError {}
/** 422 — one or more fields invalid; see {@link APIError.fields}. */
export class ValidationError extends APIError {}

/** 429 — slow down; retry after {@link retryAfter} seconds. */
export class RateLimitError extends APIError {
  /** Seconds until the current rate-limit window rolls over. */
  readonly retryAfter?: number;
  /** Your per-minute request cap (`X-RateLimit-Limit`). */
  readonly limit?: number;
  /** Requests remaining in the current window (`X-RateLimit-Remaining`). */
  readonly remaining?: number;

  constructor(
    message: string,
    details: ConstructorParameters<typeof APIError>[1] & {
      retryAfter?: number;
      limit?: number;
      remaining?: number;
    }
  ) {
    super(message, details);
    if (details.retryAfter !== undefined) this.retryAfter = details.retryAfter;
    if (details.limit !== undefined) this.limit = details.limit;
    if (details.remaining !== undefined) this.remaining = details.remaining;
  }
}

/** 5xx — something failed on NombaOne's side; safe to retry. */
export class ServerError extends APIError {}

/** The request never completed — DNS, connection reset, or aborted transport. */
export class ConnectionError extends NombaoneError {}

/** A single attempt exceeded its timeout budget. Retried automatically. */
export class TimeoutError extends ConnectionError {}

/** Webhook signature/timestamp verification failed. Reject the delivery. */
export class WebhookVerificationError extends NombaoneError {}
