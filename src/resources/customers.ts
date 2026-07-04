import { APIResource, seg } from './resource.js';

import type { APIPromise } from '../api-promise.js';
import type { Kobo, Metadata, Mode, RequestOptions } from '../core-types.js';
import type { PagePromise } from '../pagination.js';
import type { Discount } from './shared.js';

/** A subscriber — the person or business you bill. */
export interface Customer {
  domain: 'customer';
  /** `nbo…cus` */
  id: string;
  /** Unique within your organization and environment. */
  email: string;
  name: string;
  phone: string | null;
  metadata: Metadata;
  mode: Mode;
  createdAt: string;
  updatedAt: string;
}

/** A grant of credit that future invoices draw down before charging any rail. */
export interface CreditGrant {
  domain: 'credit_grant';
  /** `nbo…crg` */
  id: string;
  customerId: string;
  /** Original granted amount, integer kobo (₦1.00 = 100). */
  amountInKobo: Kobo;
  /** What is left to consume, integer kobo. */
  remainingInKobo: Kobo;
  source: 'downgrade_proration' | 'manual' | 'goodwill' | 'coupon';
  sourceReference: string | null;
  mode: Mode;
  voidedAt: string | null;
  createdAt: string;
}

/** A customer's live credit position: total balance plus the grants behind it. */
export interface CreditBalance {
  domain: 'credit_balance';
  customerId: string;
  /** Sum of remaining credit across active grants, integer kobo. */
  balanceInKobo: Kobo;
  grants: CreditGrant[];
}

export interface CustomerCreateParams {
  /** Unique per organization + environment (`CUSTOMER_EMAIL_TAKEN` on reuse). */
  email: string;
  name: string;
  phone?: string;
  metadata?: Metadata;
}

/** At least one field must be provided. */
export interface CustomerUpdateParams {
  name?: string;
  /** Pass `null` to clear the phone number. */
  phone?: string | null;
  metadata?: Metadata;
}

export interface CustomerListParams {
  /** Exact-match filter on email. */
  email?: string;
  /** Page size, 1–100 (API default 20). */
  limit?: number;
  /** Opaque cursor from a previous page's `pagination.nextCursor`. */
  cursor?: string;
}

export interface CustomerGrantCreditParams {
  /**
   * Amount to grant, integer kobo (₦1.00 = 100). `250_000` is ₦2,500 — not
   * ₦250,000. Multiply naira by 100 exactly once, at the edge of your system.
   */
  amountInKobo: Kobo;
  /** Defaults to `manual` server-side. */
  source?: 'manual' | 'goodwill';
  /** Your own reference for this grant (support ticket, promo id, …). */
  sourceReference?: string;
  metadata?: Metadata;
}

export interface CustomerApplyDiscountParams {
  /** A coupon id (`nbo…cpn`) or its code (e.g. `LAUNCH20`). */
  coupon: string;
}

/**
 * Customers — the people and businesses you bill.
 *
 * @example
 * ```ts
 * const customer = await nombaone.customers.create({
 *   email: 'ada@example.com',
 *   name: 'Ada Lovelace',
 * });
 * ```
 */
export class Customers extends APIResource {
  /**
   * Create a customer.
   *
   * @throws {ValidationError} 422 `CLIENT_VALIDATION_FAILED` — see `error.fields`.
   * @throws {ConflictError} 409 `CUSTOMER_EMAIL_TAKEN` — reuse the existing customer instead.
   *
   * @example
   * ```ts
   * const customer = await nombaone.customers.create({
   *   email: 'ada@example.com',
   *   name: 'Ada Lovelace',
   *   metadata: { crmId: 'crm_812' },
   * });
   * console.log(customer.id); // "nbo…cus"
   * ```
   */
  create(params: CustomerCreateParams, options?: RequestOptions): APIPromise<Customer> {
    return this._client.request<Customer>({
      method: 'post',
      path: '/customers',
      body: params,
      options,
    });
  }

  /**
   * Retrieve a customer by id.
   *
   * @throws {NotFoundError} 404 `CUSTOMER_NOT_FOUND` — check the id and that
   * your key matches the environment the customer was created in.
   */
  retrieve(id: string, options?: RequestOptions): APIPromise<Customer> {
    return this._client.request<Customer>({
      method: 'get',
      path: `/customers/${seg(id)}`,
      options,
    });
  }

  /**
   * Update a customer's mutable fields. At least one field is required.
   *
   * @example
   * ```ts
   * await nombaone.customers.update(customer.id, { phone: '+2348012345678' });
   * ```
   */
  update(id: string, params: CustomerUpdateParams, options?: RequestOptions): APIPromise<Customer> {
    return this._client.request<Customer>({
      method: 'patch',
      path: `/customers/${seg(id)}`,
      body: params,
      options,
    });
  }

  /**
   * List customers, newest first.
   *
   * @example
   * ```ts
   * for await (const customer of nombaone.customers.list()) {
   *   console.log(customer.email); // pages are fetched for you
   * }
   * ```
   */
  list(params?: CustomerListParams, options?: RequestOptions): PagePromise<Customer> {
    return this._client.requestPage<Customer>({
      method: 'get',
      path: '/customers',
      query: { ...params },
      options,
    });
  }

  /**
   * Apply a coupon to a customer. The resulting discount shapes every future
   * invoice for the customer until it ends or is removed.
   *
   * @throws {NotFoundError} 404 `COUPON_NOT_FOUND`
   * @throws {ConflictError} 409 `COUPON_ALREADY_APPLIED`
   *
   * @example
   * ```ts
   * const discount = await nombaone.customers.applyDiscount(customer.id, {
   *   coupon: 'LAUNCH20',
   * });
   * ```
   */
  applyDiscount(
    id: string,
    params: CustomerApplyDiscountParams,
    options?: RequestOptions
  ): APIPromise<Discount> {
    return this._client.request<Discount>({
      method: 'post',
      path: `/customers/${seg(id)}/discount`,
      body: params,
      options,
    });
  }

  /** Remove the customer's active discount. Returns the ended discount. */
  removeDiscount(id: string, options?: RequestOptions): APIPromise<Discount> {
    return this._client.request<Discount>({
      method: 'delete',
      path: `/customers/${seg(id)}/discount`,
      options,
    });
  }

  /**
   * Grant credit to a customer. Credit is drawn down oldest-grant-first by
   * future invoices **before** any payment rail is charged.
   *
   * This endpoint moves money-shaped state, so the API requires an
   * `Idempotency-Key`; the SDK sends one automatically (pass
   * `options.idempotencyKey` to control it across process restarts).
   *
   * @example
   * ```ts
   * await nombaone.customers.grantCredit(customer.id, {
   *   amountInKobo: 250_000, // ₦2,500.00
   *   source: 'goodwill',
   * });
   * ```
   */
  grantCredit(
    id: string,
    params: CustomerGrantCreditParams,
    options?: RequestOptions
  ): APIPromise<CreditGrant> {
    return this._client.request<CreditGrant>({
      method: 'post',
      path: `/customers/${seg(id)}/credit`,
      body: params,
      options,
    });
  }

  /** Retrieve the customer's credit balance and the grants behind it. */
  retrieveCreditBalance(id: string, options?: RequestOptions): APIPromise<CreditBalance> {
    return this._client.request<CreditBalance>({
      method: 'get',
      path: `/customers/${seg(id)}/credit`,
      options,
    });
  }

  /**
   * Void a credit grant — its remaining balance becomes unusable. Consumed
   * credit is untouched.
   *
   * @throws {ConflictError} 409 `CREDIT_GRANT_ALREADY_VOIDED`
   */
  voidCredit(id: string, grantId: string, options?: RequestOptions): APIPromise<CreditGrant> {
    return this._client.request<CreditGrant>({
      method: 'delete',
      path: `/customers/${seg(id)}/credit/${seg(grantId)}`,
      options,
    });
  }
}
