import { APIResource, seg } from './resource.js';

import type { APIPromise } from '../api-promise.js';
import type { Kobo, Metadata, Mode, RequestOptions } from '../core-types.js';
import type { PagePromise } from '../pagination.js';

/**
 * A billing cadence UNIT. Multiply it with `intervalCount` to get the cadence:
 * `month` × 3 is quarterly, `minute` × 10 is every ten minutes. There is no
 * `quarterly` or `ten_minutely` unit — the count covers every multiple.
 *
 * `day`/`week`/`month`/`year` are calendar cadences (a boundary lands on a calendar
 * date at 02:00 Africa/Lagos; month and year snap end-of-month against the anchor
 * day). `minute` is a wall-clock cadence: it bills at an exact offset from the
 * instant the subscription activated.
 */
export type PriceInterval = 'day' | 'week' | 'month' | 'year' | 'minute';

/**
 * How much a plan costs per billing interval. Prices are **immutable** once
 * created — to change pricing, create a new price and deactivate the old one.
 * Existing subscriptions keep the price they were sold at.
 */
export interface Price {
  domain: 'price';
  /** `nbo…prc` */
  id: string;
  planId: string;
  /** Amount per unit per interval, integer kobo (₦1.00 = 100). */
  unitAmountInKobo: Kobo;
  currency: 'NGN';
  interval: PriceInterval;
  intervalCount: number;
  usageType: 'licensed' | 'metered';
  billingScheme: 'per_unit' | 'tiered';
  trialPeriodDays: number;
  active: boolean;
  metadata: Metadata;
  mode: Mode;
  createdAt: string;
}

export interface PriceCreateParams {
  /**
   * Amount per unit per interval, integer kobo. `250_000` is ₦2,500.00 — not
   * ₦250,000. Multiply naira by 100 exactly once.
   */
  unitAmountInKobo: Kobo;
  interval: PriceInterval;
  /** Bill every N intervals. Defaults to `1` server-side. */
  intervalCount?: number;
  /** Defaults to `licensed` server-side. */
  usageType?: 'licensed' | 'metered';
  /** Defaults to `per_unit` server-side (tiered is not yet chargeable). */
  billingScheme?: 'per_unit' | 'tiered';
  /** Free-trial days granted at subscribe time. Defaults to `0` server-side. */
  trialPeriodDays?: number;
  metadata?: Metadata;
}

export interface PriceListParams {
  /** Filter to one plan's prices (`nbo…pln`). */
  planRef?: string;
  /** Filter by active flag. */
  active?: boolean;
  /** Page size, 1–100 (API default 20). */
  limit?: number;
  /** Opaque cursor from a previous page's `pagination.nextCursor`. */
  cursor?: string;
}

/**
 * Prices — the amounts and cadences plans are sold at. Create and list them
 * under a plan via `nombaone.plans.prices`; this namespace reads and
 * deactivates them directly.
 */
export class Prices extends APIResource {
  /**
   * Retrieve a price by id.
   *
   * @throws {NotFoundError} 404 `PRICE_NOT_FOUND`
   */
  retrieve(id: string, options?: RequestOptions): APIPromise<Price> {
    return this._client.request<Price>({ method: 'get', path: `/prices/${seg(id)}`, options });
  }

  /**
   * List prices across all plans, newest first.
   *
   * @example
   * ```ts
   * const page = await nombaone.prices.list({ planRef: plan.id, active: true });
   * ```
   */
  list(params?: PriceListParams, options?: RequestOptions): PagePromise<Price> {
    return this._client.requestPage<Price>({
      method: 'get',
      path: '/prices',
      query: { ...params },
      options,
    });
  }

  /**
   * Deactivate a price so no new subscriptions can be created against it.
   * Existing subscriptions are unaffected — prices are immutable history.
   *
   * @throws {ConflictError} 409 `PRICE_ALREADY_INACTIVE`
   */
  deactivate(id: string, options?: RequestOptions): APIPromise<Price> {
    return this._client.request<Price>({
      method: 'post',
      path: `/prices/${seg(id)}/deactivate`,
      body: {},
      options,
    });
  }
}
