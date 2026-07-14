import { NombaoneError } from '../error.js';
import { APIResource, seg } from './resource.js';

import type { APIPromise } from '../api-promise.js';
import type { RequestOptions } from '../core-types.js';
import type { Invoice } from './invoices.js';
import type { PaymentMethod } from './payment-methods.js';

/**
 * The deterministic outcome a sandbox payment method produces when charged.
 * These are the "magic values" of the sandbox — behaviors, not card numbers.
 */
export type SandboxPaymentMethodBehavior =
  | 'success'
  | 'decline_insufficient_funds'
  | 'decline_expired_card'
  | 'decline_do_not_honor'
  | 'requires_otp';

export interface SandboxPaymentMethodParams {
  /** `nbo…cus` */
  customerId: string;
  /** Defaults to `success` server-side. */
  behavior?: SandboxPaymentMethodBehavior;
  /** Defaults to `card` server-side. `mandate` simulates silent direct debit. */
  kind?: 'card' | 'mandate';
}

/** What forcing one billing cycle produced. */
export interface AdvanceCycleResult {
  domain: 'advance_cycle_result';
  subscriptionId: string;
  /**
   * The cycle's billing outcome: `paid` | `past_due` | `pending` | `open` |
   * `canceled` | `awaiting_payment` (a hosted-checkout / action-required cycle
   * that is waiting on the end customer to pay before it can settle).
   */
  outcome: string;
  /**
   * The invoice the cycle produced (or the existing one if already billed). `null`
   * when the outcome is `canceled`: a subscription flagged cancel-at-period-end ends
   * at the boundary instead of renewing, so nothing is billed.
   */
  invoice: Invoice | null;
}

export interface SandboxSimulateWebhookParams {
  /** Any catalog event type, e.g. `invoice.payment_failed`. */
  type: string;
  /** Shapes the delivery's `data` object. */
  payload?: Record<string, unknown>;
}

/** The minted event and how many endpoint deliveries fired. */
export interface WebhookSimulation {
  domain: 'webhook_simulation';
  /** The emitted event's reference (`nbo…evt`). */
  event: string;
  type: string;
  deliveredCount: number;
}

/**
 * **Sandbox only.** Simulation instruments that make billing outcomes happen
 * on demand — no cron waits, no real cards. These endpoints exist only on
 * the sandbox deployment; calling them with a live key throws locally,
 * before any network request.
 */
export class Sandbox extends APIResource {
  #assertSandbox(): void {
    if (this._client.mode === 'live') {
      throw new NombaoneError(
        'nombaone.sandbox.* only works with a sandbox key (nbo_sandbox_…) — the /v1/sandbox endpoints do not exist on the live API. Use your sandbox key to rehearse, then go live without the sandbox calls.'
      );
    }
  }

  /**
   * **Sandbox only.** Mint a ready, chargeable test payment method whose
   * `behavior` decides every future charge outcome deterministically.
   *
   * @example
   * ```ts
   * const method = await nombaone.sandbox.createPaymentMethod({
   *   customerId: customer.id,
   *   behavior: 'decline_insufficient_funds', // rehearse thin-balance dunning
   * });
   * ```
   */
  createPaymentMethod(
    params: SandboxPaymentMethodParams,
    options?: RequestOptions
  ): APIPromise<PaymentMethod> {
    this.#assertSandbox();
    return this._client.request<PaymentMethod>({
      method: 'post',
      path: '/sandbox/payment-methods',
      body: params,
      options,
    });
  }

  /**
   * **Sandbox only.** The test clock: run the subscription's next billing
   * cycle right now, through the real engine — invoice, charge, ledger,
   * webhooks and all.
   *
   * @example
   * ```ts
   * const result = await nombaone.sandbox.advanceCycle(subscription.id);
   * console.log(result.outcome); // "paid"
   * if (result.invoice) {
   *   // null when the outcome is "canceled" — nothing was billed.
   *   console.log(result.invoice.totalInKobo); // the real invoice it produced
   * }
   * ```
   */
  advanceCycle(subscriptionId: string, options?: RequestOptions): APIPromise<AdvanceCycleResult> {
    this.#assertSandbox();
    return this._client.request<AdvanceCycleResult>({
      method: 'post',
      path: `/sandbox/subscriptions/${seg(subscriptionId)}/advance-cycle`,
      body: {},
      options,
    });
  }

  /**
   * **Sandbox only.** Emit a real, signed catalog event to your registered
   * endpoints — the genuine pipeline (real secret, real signature, real
   * retries), not a mock. The sandbox sends no organic webhooks; this is how
   * you rehearse your handler.
   *
   * @example
   * ```ts
   * await nombaone.sandbox.simulateWebhook({
   *   type: 'invoice.payment_failed',
   *   payload: { reference: invoice.id, reason: 'insufficient_funds' },
   * });
   * ```
   */
  simulateWebhook(
    params: SandboxSimulateWebhookParams,
    options?: RequestOptions
  ): APIPromise<WebhookSimulation> {
    this.#assertSandbox();
    return this._client.request<WebhookSimulation>({
      method: 'post',
      path: '/sandbox/webhooks/simulate',
      body: params,
      options,
    });
  }
}
