import { APIResource, seg } from './resource.js';

import type { APIPromise } from '../api-promise.js';
import type { Kobo, Mode, RequestOptions } from '../core-types.js';
import type { PagePromise } from '../pagination.js';

export type PaymentMethodKind = 'card' | 'mandate' | 'virtual_account';
export type PaymentMethodStatus =
  'setup_pending' | 'consent_pending' | 'active' | 'removed' | 'expired';

/**
 * How a customer pays. Card and mandate are **pull** rails (the engine
 * initiates the debit); a virtual account is the **push** rail (the customer
 * sends a transfer and the engine matches it). Never contains a PAN or token.
 */
export interface PaymentMethod {
  domain: 'payment_method';
  /** `nbo…pmt` */
  id: string;
  customerId: string;
  kind: PaymentMethodKind;
  status: PaymentMethodStatus;
  isDefault: boolean;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  mode: Mode;
  createdAt: string;
  updatedAt: string;
}

/** A hosted-checkout handoff: send the customer to `checkoutLink`. */
export interface CheckoutSetup {
  domain: 'checkout_setup';
  reference: string;
  /** The PCI-scoped hosted page where the customer enters their card. */
  checkoutLink: string;
}

/** A dedicated NUBAN the customer pushes transfers to. */
export interface VirtualAccount {
  domain: 'virtual_account';
  reference: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  accountRef: string;
}

export interface PaymentMethodSetupParams {
  /** The customer this card will belong to (`nbo…cus`). */
  customerRef: string;
  /** The validation charge, integer kobo (₦1.00 = 100). */
  amountInKobo: Kobo;
  /** Where the hosted checkout returns the customer afterwards. */
  callbackUrl: string;
}

export interface PaymentMethodVirtualAccountParams {
  /** The customer to issue the account for (`nbo…cus`). */
  customerRef: string;
  /** Optional expected amount hint, integer kobo. */
  expectedAmount?: Kobo;
  /** Optional ISO date the account should expire. */
  expiryDate?: string;
}

export interface PaymentMethodListParams {
  /** Filter to one customer (`nbo…cus`). Note the wire name is `customerRef`. */
  customerRef?: string;
  /** Page size, 1–100 (API default 20). */
  limit?: number;
  /** Opaque cursor from a previous page's `pagination.nextCursor`. */
  cursor?: string;
}

/**
 * Payment methods — cards (via hosted checkout), direct-debit mandates (see
 * `nombaone.mandates`), and virtual accounts for the transfer rail.
 */
export class PaymentMethods extends APIResource {
  /**
   * Start a hosted-checkout card capture. Card entry happens on the PCI
   * hosted page — no card data ever touches your servers. The method appears
   * as `setup_pending` until the customer completes checkout.
   *
   * @example
   * ```ts
   * const setup = await nombaone.paymentMethods.setup({
   *   customerRef: customer.id,
   *   amountInKobo: 5_000, // ₦50 validation charge
   *   callbackUrl: 'https://example.com/billing/return',
   * });
   * // redirect the customer to setup.checkoutLink
   * ```
   */
  setup(params: PaymentMethodSetupParams, options?: RequestOptions): APIPromise<CheckoutSetup> {
    return this._client.request<CheckoutSetup>({
      method: 'post',
      path: '/payment-methods/setup',
      body: params,
      options,
    });
  }

  /**
   * Issue a dedicated virtual account (NUBAN) so the customer can pay by
   * bank transfer. The engine matches inbound transfers to invoices by
   * reference and exact integer-kobo amount.
   */
  createVirtualAccount(
    params: PaymentMethodVirtualAccountParams,
    options?: RequestOptions
  ): APIPromise<VirtualAccount> {
    return this._client.request<VirtualAccount>({
      method: 'post',
      path: '/payment-methods/virtual-account',
      body: params,
      options,
    });
  }

  /**
   * Retrieve a payment method by id.
   *
   * @throws {NotFoundError} 404 `PAYMENT_METHOD_NOT_FOUND`
   */
  retrieve(id: string, options?: RequestOptions): APIPromise<PaymentMethod> {
    return this._client.request<PaymentMethod>({
      method: 'get',
      path: `/payment-methods/${seg(id)}`,
      options,
    });
  }

  /** List payment methods, newest first. */
  list(params?: PaymentMethodListParams, options?: RequestOptions): PagePromise<PaymentMethod> {
    return this._client.requestPage<PaymentMethod>({
      method: 'get',
      path: '/payment-methods',
      query: { ...params },
      options,
    });
  }

  /** Make this the customer's default payment method. */
  setDefault(id: string, options?: RequestOptions): APIPromise<PaymentMethod> {
    return this._client.request<PaymentMethod>({
      method: 'post',
      path: `/payment-methods/${seg(id)}/default`,
      body: {},
      options,
    });
  }

  /**
   * Detach a payment method. Subscriptions still billing against it will
   * need a replacement (`SUBSCRIPTION_PAYMENT_METHOD_REQUIRED` at next
   * charge otherwise).
   */
  remove(id: string, options?: RequestOptions): APIPromise<PaymentMethod> {
    return this._client.request<PaymentMethod>({
      method: 'delete',
      path: `/payment-methods/${seg(id)}`,
      options,
    });
  }
}
