import type { Mode } from '../core-types.js';

/**
 * Objects that appear across several resource namespaces. Everything here
 * mirrors the API's response DTOs field-for-field.
 */

/** A coupon applied to a customer or subscription (the *application*, not the coupon). */
export interface Discount {
  domain: 'discount';
  /** `nbo…dsc` */
  id: string;
  couponId: string;
  customerId: string | null;
  subscriptionId: string | null;
  status: 'active' | 'ended';
  /** Cycles left for `repeating` coupons; `null` for `once`/`forever`. */
  cyclesRemaining: number | null;
  startAt: string;
  endAt: string | null;
  mode: Mode;
  createdAt: string;
}

/**
 * An entry in the append-only domain-event log — the audit trail behind
 * every webhook. `payload` carries the same `data` your endpoints receive.
 */
export interface DomainEvent {
  domain: 'event';
  /** `nbo…evt` — the id webhook receivers dedupe on. */
  id: string;
  /** Catalog event type, e.g. `invoice.paid`. */
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

/** One line on an invoice. Amounts are integer kobo; discounts/credits are negative. */
export interface InvoiceLineItem {
  id: string;
  kind: 'subscription' | 'proration' | 'discount' | 'credit' | 'adjustment';
  description: string;
  /** Integer kobo (₦1.00 = 100). Negative for discount/credit lines. */
  amountInKobo: number;
  quantity: number;
}
