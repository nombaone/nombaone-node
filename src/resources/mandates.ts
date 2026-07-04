import { APIResource, seg } from './resource.js';

import type { APIPromise } from '../api-promise.js';
import type { Kobo, RequestOptions } from '../core-types.js';
import type { PaymentMethod } from './payment-methods.js';

/** What mandate creation hands back — consent is still pending at this point. */
export interface MandateSetup {
  domain: 'mandate_setup';
  /** The payment-method reference this mandate will live under (`nbo…pmt`). */
  reference: string;
  /** The provider-side mandate reference. */
  mandateRef: string;
  /** `consent_pending` until the customer's bank confirms. */
  status: string;
  /** Human instructions to relay to the customer to authorize the debit. */
  consentInstruction: string;
}

export type MandateFrequency =
  | 'variable'
  | 'weekly'
  | 'every_two_weeks'
  | 'monthly'
  | 'every_two_months'
  | 'every_three_months'
  | 'every_four_months'
  | 'every_six_months'
  | 'every_twelve_months';

export interface MandateCreateParams {
  /** The customer this mandate belongs to (`nbo…cus`). */
  customerRef: string;
  customerAccountNumber: string;
  /** CBN 3-digit bank code (058 GTB · 044 Access · 033 UBA · …). */
  bankCode: string;
  customerName: string;
  customerAccountName: string;
  customerPhoneNumber: string;
  customerAddress: string;
  /** Shown on the customer's statement. */
  narration: string;
  /**
   * Hard per-debit ceiling, integer kobo (₦1.00 = 100). Charges above it
   * fail with `MANDATE_MAX_AMOUNT_EXCEEDED`.
   */
  maxAmountInKobo: Kobo;
  /** Defaults to `monthly` server-side. */
  frequency?: MandateFrequency;
  /** Local date-time (no zone). Defaults to tomorrow server-side. */
  startDate?: string;
  /** Local date-time (no zone). Defaults to one year out server-side. */
  endDate?: string;
}

/**
 * Direct-debit mandates (NIBSS). Creation is **asynchronous**: the mandate
 * starts `consent_pending` and activates only after the customer authorizes
 * it with their bank — the engine sweeps for activation and fires
 * `payment_method.attached`/`payment_method.updated`. Don't poll; listen for
 * the webhook, and don't charge before it's active
 * (`MANDATE_NOT_ACTIVE` / `MANDATE_CONSENT_PENDING`).
 */
export class Mandates extends APIResource {
  /**
   * Create a mandate. Requires an `Idempotency-Key` (sent automatically).
   *
   * @example
   * ```ts
   * const mandate = await nombaone.mandates.create({
   *   customerRef: customer.id,
   *   customerAccountNumber: '0123456789',
   *   bankCode: '058',
   *   customerName: 'Ada Lovelace',
   *   customerAccountName: 'Ada Lovelace',
   *   customerPhoneNumber: '+2348012345678',
   *   customerAddress: '1 Marina, Lagos',
   *   narration: 'Acme Pro subscription',
   *   maxAmountInKobo: 500_000, // ₦5,000 ceiling per debit
   * });
   * // relay mandate.consentInstruction to the customer, then wait for the webhook
   * ```
   */
  create(params: MandateCreateParams, options?: RequestOptions): APIPromise<MandateSetup> {
    return this._client.request<MandateSetup>({
      method: 'post',
      path: '/mandates',
      body: params,
      options,
    });
  }

  /**
   * Check a mandate's current standing. Returns the underlying
   * payment-method row (its `status` moves `consent_pending` → `active`).
   */
  retrieve(id: string, options?: RequestOptions): APIPromise<PaymentMethod> {
    return this._client.request<PaymentMethod>({
      method: 'get',
      path: `/mandates/${seg(id)}`,
      options,
    });
  }
}
