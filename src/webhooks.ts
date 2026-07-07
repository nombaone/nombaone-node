import { createHmac, timingSafeEqual } from 'node:crypto';

import { WebhookVerificationError } from './error.js';

import type { WebhookEvent } from './webhook-events.js';

export interface WebhookVerifyOptions {
  /**
   * Maximum allowed age (seconds) between the delivery's `t` timestamp and
   * now, in either direction. Default `300` (5 minutes). Raise it only if
   * your clock or queueing genuinely lags.
   */
  tolerance?: number;
}

const DEFAULT_TOLERANCE_SECONDS = 300;

const computeSignature = (secret: string, timestamp: string, rawBody: string): string =>
  createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');

const constantTimeEquals = (a: string, b: string): boolean => {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
};

const parseSignatureHeader = (header: string): { timestamp: string; signatures: string[] } => {
  const signatures: string[] = [];
  let timestamp: string | null = null;
  for (const pair of header.split(',')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (key === 't') timestamp = value;
    // Multiple `v1` entries are legal during secret rotation — any match passes.
    if (key === 'v1' && value.length > 0) signatures.push(value);
  }
  if (timestamp === null || signatures.length === 0) {
    throw new WebhookVerificationError(
      'Malformed X-Nombaone-Signature header — expected "t=<unix>,v1=<hex>".'
    );
  }
  return { timestamp, signatures };
};

/**
 * Verify and parse NombaOne webhook deliveries.
 *
 * Available as `nombaone.webhooks` on a client, or standalone via
 * `import { webhooks } from 'nombaone'` — verification needs only the
 * endpoint's signing secret, never an API key.
 *
 * **Feed it the raw request body.** `JSON.parse` + `JSON.stringify` can
 * reorder keys and change bytes, which breaks the signature. Capture the
 * body before any framework parses it (`express.raw()`, `await req.text()`).
 */
export class Webhooks {
  /**
   * Verify a delivery's signature and timestamp, then parse and return the
   * typed event. This is the one call your handler needs.
   *
   * Delivery is **at-least-once** — after verification, dedupe on
   * `event.event.id` before acting.
   *
   * @param payload The exact raw request body (string or Buffer).
   * @param signatureHeader The `X-Nombaone-Signature` header value.
   * @param secret The endpoint's signing secret (shown once at creation).
   * @throws {WebhookVerificationError} On a missing/malformed header, a
   * stale timestamp, an invalid signature, or a non-JSON body.
   *
   * @example
   * ```ts
   * app.post('/nombaone/webhooks', express.raw({ type: 'application/json' }), (req, res) => {
   *   const event = webhooks.constructEvent(
   *     req.body,
   *     req.header('x-nombaone-signature') ?? '',
   *     process.env.NOMBAONE_WEBHOOK_SECRET!
   *   );
   *   if (alreadyProcessed(event.event.id)) return res.sendStatus(200);
   *   if (event.type === 'invoice.paid') unlockAccess(event.data.reference);
   *   res.sendStatus(200); // respond 2xx fast; do heavy work async
   * });
   * ```
   */
  constructEvent(
    payload: string | Buffer,
    signatureHeader: string,
    secret: string,
    options?: WebhookVerifyOptions
  ): WebhookEvent {
    this.verifySignature(payload, signatureHeader, secret, options);

    const rawBody = typeof payload === 'string' ? payload : payload.toString('utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new WebhookVerificationError('Webhook payload was not valid JSON.');
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new WebhookVerificationError('Webhook payload was not a JSON object.');
    }

    const body = parsed as Record<string, unknown> & {
      event?: { id?: unknown; type?: unknown; createdAt?: unknown };
    };
    // Defensive: guarantee a dedupe-able `event.id` even if a delivery body
    // arrives flat (older shape) — fall back to top-level fields.
    if (typeof body.event !== 'object' || body.event === null) {
      body.event = {
        id: typeof body.id === 'string' ? body.id : '',
        type: typeof body.type === 'string' ? body.type : '',
        createdAt: typeof body.createdAt === 'string' ? body.createdAt : '',
      };
    }
    return body as unknown as WebhookEvent;
  }

  /**
   * Verify only (no parse). Throws {@link WebhookVerificationError} with a
   * distinct message per failure mode; returns nothing on success.
   */
  verifySignature(
    payload: string | Buffer,
    signatureHeader: string,
    secret: string,
    options?: WebhookVerifyOptions
  ): void {
    if (!signatureHeader) {
      throw new WebhookVerificationError(
        'Missing X-Nombaone-Signature header — is this request really from NombaOne?'
      );
    }
    if (!secret) {
      throw new WebhookVerificationError(
        'Missing signing secret — pass the secret shown when the endpoint was created.'
      );
    }

    const { timestamp, signatures } = parseSignatureHeader(signatureHeader);

    const timestampSeconds = Number(timestamp);
    if (!Number.isFinite(timestampSeconds)) {
      throw new WebhookVerificationError(
        'Malformed X-Nombaone-Signature header — `t` is not a unix timestamp.'
      );
    }
    const tolerance = options?.tolerance ?? DEFAULT_TOLERANCE_SECONDS;
    const age = Math.abs(Date.now() / 1000 - timestampSeconds);
    if (age > tolerance) {
      throw new WebhookVerificationError(
        `Webhook timestamp is outside the allowed tolerance (${Math.round(age)}s old, limit ${tolerance}s) — possible replay, or severe clock skew.`
      );
    }

    const rawBody = typeof payload === 'string' ? payload : payload.toString('utf8');
    const expected = computeSignature(secret, timestamp, rawBody);
    const matched = signatures.some((candidate) => constantTimeEquals(candidate, expected));
    if (!matched) {
      throw new WebhookVerificationError(
        "Webhook signature verification failed — check you are using this endpoint's current signing secret and the exact raw request body (no re-serialization)."
      );
    }
  }

  /**
   * Build a valid `X-Nombaone-Signature` header for a payload — for testing
   * your own handler without waiting on a real delivery.
   *
   * @example
   * ```ts
   * const payload = JSON.stringify({ id: 'nbo…whd', type: 'invoice.paid', event: { id: 'nbo…evt', type: 'invoice.paid', createdAt: new Date().toISOString() }, data: { reference: 'nbo…inv' } });
   * const header = webhooks.generateTestHeader({ payload, secret: 'whsec_test' });
   * const event = webhooks.constructEvent(payload, header, 'whsec_test');
   * ```
   */
  generateTestHeader(opts: { payload: string; secret: string; timestamp?: number }): string {
    const timestamp = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
    return `t=${timestamp},v1=${computeSignature(opts.secret, timestamp, opts.payload)}`;
  }
}

/** Standalone helper — verify deliveries without constructing a client. */
export const webhooks: Webhooks = new Webhooks();
