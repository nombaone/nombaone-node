import { APIResource, seg } from './resource.js';

import type { APIPromise } from '../api-promise.js';
import type { Kobo, Metadata, Mode, RequestOptions } from '../core-types.js';
import type { PagePromise } from '../pagination.js';

/**
 * A reusable discount rule. Applying a coupon to a customer or subscription
 * creates a `Discount` — the coupon is the rule, the discount is one
 * application of it.
 */
export interface Coupon {
  domain: 'coupon';
  /** `nbo…cpn` */
  id: string;
  /** The tenant-facing redemption code, e.g. `LAUNCH20`. */
  code: string;
  duration: 'once' | 'repeating' | 'forever';
  /** Exactly one of `amountOffInKobo` / `percentOff` is non-null. */
  amountOffInKobo: Kobo | null;
  percentOff: number | null;
  durationInCycles: number | null;
  redeemBy: string | null;
  maxRedemptions: number | null;
  timesRedeemed: number;
  mode: Mode;
  createdAt: string;
}

/** Exactly one of `amountOffInKobo` or `percentOff` must be set. */
export interface CouponCreateParams {
  code: string;
  duration: 'once' | 'repeating' | 'forever';
  /** Fixed discount, integer kobo (₦1.00 = 100). */
  amountOffInKobo?: Kobo;
  /** Percentage discount, 1–100. */
  percentOff?: number;
  /** Required when `duration` is `repeating`. */
  durationInCycles?: number;
  /** ISO-8601 date-time after which the coupon can no longer be applied. */
  redeemBy?: string;
  maxRedemptions?: number;
  metadata?: Metadata;
}

/** At least one field must be provided. */
export interface CouponUpdateParams {
  redeemBy?: string;
  maxRedemptions?: number;
  metadata?: Metadata;
}

export interface CouponListParams {
  /** Page size, 1–100 (API default 20). */
  limit?: number;
  /** Opaque cursor from a previous page's `pagination.nextCursor`. */
  cursor?: string;
}

/**
 * Coupons — discount rules you apply via
 * `customers.applyDiscount` / `subscriptions.applyDiscount`.
 *
 * @example
 * ```ts
 * const coupon = await nombaone.coupons.create({
 *   code: 'LAUNCH20',
 *   percentOff: 20,
 *   duration: 'repeating',
 *   durationInCycles: 3,
 * });
 * ```
 */
export class Coupons extends APIResource {
  /**
   * Create a coupon.
   *
   * @throws {ValidationError} 422 `COUPON_INVALID_DEFINITION` — set exactly
   * one of `amountOffInKobo` / `percentOff`.
   */
  create(params: CouponCreateParams, options?: RequestOptions): APIPromise<Coupon> {
    return this._client.request<Coupon>({
      method: 'post',
      path: '/coupons',
      body: params,
      options,
    });
  }

  /**
   * Retrieve a coupon by id.
   *
   * @throws {NotFoundError} 404 `COUPON_NOT_FOUND`
   */
  retrieve(id: string, options?: RequestOptions): APIPromise<Coupon> {
    return this._client.request<Coupon>({ method: 'get', path: `/coupons/${seg(id)}`, options });
  }

  /** Update a coupon's redeem-by, max redemptions, or metadata. */
  update(id: string, params: CouponUpdateParams, options?: RequestOptions): APIPromise<Coupon> {
    return this._client.request<Coupon>({
      method: 'patch',
      path: `/coupons/${seg(id)}`,
      body: params,
      options,
    });
  }

  /** List coupons, newest first. */
  list(params?: CouponListParams, options?: RequestOptions): PagePromise<Coupon> {
    return this._client.requestPage<Coupon>({
      method: 'get',
      path: '/coupons',
      query: { ...params },
      options,
    });
  }
}
