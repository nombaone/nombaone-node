import { APIResource, seg } from './resource.js';

import type { APIPromise } from '../api-promise.js';
import type { Kobo, Mode, RequestOptions } from '../core-types.js';
import type { PagePromise } from '../pagination.js';
import type { InvoiceLineItem } from './shared.js';

export type InvoiceStatus = 'draft' | 'open' | 'partially_paid' | 'paid' | 'void' | 'uncollectible';

/**
 * Bank-transfer (NUBAN) instructions for collecting an invoice over the push
 * rail — show these to the payer verbatim. Present when the engine issued a
 * virtual account for the invoice; `null` otherwise.
 */
export interface InvoicePayInstructions {
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  /** The EXACT amount to transfer — it is matched automatically. Integer kobo. */
  amountInKobo: number;
  reference: string | null;
}

/**
 * What a billing cycle produced. You never create invoices — subscription
 * cycles do; amounts are locked at finalization. All amounts integer kobo.
 */
export interface Invoice {
  domain: 'invoice';
  /** `nbo…inv` */
  id: string;
  customerId: string;
  subscriptionId: string | null;
  status: InvoiceStatus;
  billingReason: 'subscription_create' | 'subscription_cycle' | 'subscription_update' | 'manual';
  subtotalInKobo: Kobo;
  discountTotalInKobo: Kobo;
  creditTotalInKobo: Kobo;
  totalInKobo: Kobo;
  amountDueInKobo: Kobo;
  amountPaidInKobo: Kobo;
  amountRemainingInKobo: Kobo;
  currency: 'NGN';
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string | null;
  /**
   * Bank-transfer instructions when the invoice is collected by transfer
   * (`send_invoice` / virtual account); `null` for card-collected invoices.
   */
  payInstructions: InvoicePayInstructions | null;
  lineItems: InvoiceLineItem[];
  finalizedAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  mode: Mode;
  createdAt: string;
}

export interface InvoiceListParams {
  customerId?: string;
  subscriptionId?: string;
  /** Note: the list filter accepts these values only (no `partially_paid`). */
  status?: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  /** Page size, 1–100 (API default 20). */
  limit?: number;
  /** Opaque cursor from a previous page's `pagination.nextCursor`. */
  cursor?: string;
}

export interface InvoiceVoidParams {
  comment?: string;
}

/**
 * Invoices — read what the billing engine produced; void what should never
 * be collected.
 */
export class Invoices extends APIResource {
  /**
   * Retrieve an invoice by id.
   *
   * @throws {NotFoundError} 404 `INVOICE_NOT_FOUND`
   */
  retrieve(id: string, options?: RequestOptions): APIPromise<Invoice> {
    return this._client.request<Invoice>({ method: 'get', path: `/invoices/${seg(id)}`, options });
  }

  /**
   * List invoices, newest first.
   *
   * @example
   * ```ts
   * for await (const invoice of nombaone.invoices.list({ status: 'open' })) {
   *   console.log(invoice.id, invoice.amountDueInKobo);
   * }
   * ```
   */
  list(params?: InvoiceListParams, options?: RequestOptions): PagePromise<Invoice> {
    return this._client.requestPage<Invoice>({
      method: 'get',
      path: '/invoices',
      query: { ...params },
      options,
    });
  }

  /**
   * Void an open, unpaid invoice. Paid invoices can't be voided — refund the
   * settlement instead.
   *
   * @throws {ConflictError} 409 `INVOICE_NOT_VOIDABLE`
   * @throws {ConflictError} 409 `INVOICE_ALREADY_PAID`
   */
  void(id: string, params?: InvoiceVoidParams, options?: RequestOptions): APIPromise<Invoice> {
    return this._client.request<Invoice>({
      method: 'post',
      path: `/invoices/${seg(id)}/void`,
      body: params ?? {},
      options,
    });
  }
}
