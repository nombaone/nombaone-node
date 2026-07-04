import { APIResource, seg } from './resource.js';

import type { APIPromise } from '../api-promise.js';
import type { Metadata, Mode, RequestOptions } from '../core-types.js';
import type { PagePromise } from '../pagination.js';
import type { Price, PriceCreateParams } from './prices.js';

/**
 * What you sell — "Pro", "Starter". A plan holds the name and description;
 * its prices (amount + cadence) live underneath it.
 */
export interface Plan {
  domain: 'plan';
  /** `nbo…pln` */
  id: string;
  /** Unique within your organization (`PLAN_NAME_TAKEN` on reuse). */
  name: string;
  description: string | null;
  status: 'active' | 'archived';
  metadata: Metadata;
  mode: Mode;
  createdAt: string;
  updatedAt: string;
}

export interface PlanCreateParams {
  name: string;
  description?: string;
  metadata?: Metadata;
}

/** At least one field must be provided. */
export interface PlanUpdateParams {
  name?: string;
  /** Pass `null` to clear the description. */
  description?: string | null;
  metadata?: Metadata;
}

export interface PlanListParams {
  status?: 'active' | 'archived';
  /** Page size, 1–100 (API default 20). */
  limit?: number;
  /** Opaque cursor from a previous page's `pagination.nextCursor`. */
  cursor?: string;
}

export interface PlanPriceListParams {
  /** Page size, 1–100 (API default 20). */
  limit?: number;
  /** Opaque cursor from a previous page's `pagination.nextCursor`. */
  cursor?: string;
}

/** Prices nested under a plan (create/list); see `nombaone.prices` for reads. */
export class PlanPrices extends APIResource {
  /**
   * Create a price under a plan. Prices are immutable once created.
   *
   * @example
   * ```ts
   * const price = await nombaone.plans.prices.create(plan.id, {
   *   unitAmountInKobo: 250_000, // ₦2,500.00 per month
   *   interval: 'month',
   * });
   * ```
   */
  create(planId: string, params: PriceCreateParams, options?: RequestOptions): APIPromise<Price> {
    return this._client.request<Price>({
      method: 'post',
      path: `/plans/${seg(planId)}/prices`,
      body: params,
      options,
    });
  }

  /** List a plan's prices, newest first. */
  list(planId: string, params?: PlanPriceListParams, options?: RequestOptions): PagePromise<Price> {
    return this._client.requestPage<Price>({
      method: 'get',
      path: `/plans/${seg(planId)}/prices`,
      query: { ...params },
      options,
    });
  }
}

/**
 * Plans — your catalog.
 *
 * @example
 * ```ts
 * const plan = await nombaone.plans.create({ name: 'Pro' });
 * const price = await nombaone.plans.prices.create(plan.id, {
 *   unitAmountInKobo: 250_000,
 *   interval: 'month',
 * });
 * ```
 */
export class Plans extends APIResource {
  /** Prices nested under a plan. */
  readonly prices: PlanPrices = new PlanPrices(this._client);

  /**
   * Create a plan.
   *
   * @throws {ConflictError} 409 `PLAN_NAME_TAKEN`
   */
  create(params: PlanCreateParams, options?: RequestOptions): APIPromise<Plan> {
    return this._client.request<Plan>({ method: 'post', path: '/plans', body: params, options });
  }

  /**
   * Retrieve a plan by id.
   *
   * @throws {NotFoundError} 404 `PLAN_NOT_FOUND`
   */
  retrieve(id: string, options?: RequestOptions): APIPromise<Plan> {
    return this._client.request<Plan>({ method: 'get', path: `/plans/${seg(id)}`, options });
  }

  /** Update a plan's mutable fields. At least one field is required. */
  update(id: string, params: PlanUpdateParams, options?: RequestOptions): APIPromise<Plan> {
    return this._client.request<Plan>({
      method: 'patch',
      path: `/plans/${seg(id)}`,
      body: params,
      options,
    });
  }

  /** List plans, newest first. */
  list(params?: PlanListParams, options?: RequestOptions): PagePromise<Plan> {
    return this._client.requestPage<Plan>({
      method: 'get',
      path: '/plans',
      query: { ...params },
      options,
    });
  }

  /**
   * Archive a plan — it stops being subscribable but its history stays.
   *
   * @throws {ConflictError} 409 `PLAN_ALREADY_ARCHIVED`
   * @throws {ConflictError} 409 `PLAN_HAS_ACTIVE_SUBSCRIBERS` — migrate or
   * cancel those subscriptions first.
   */
  archive(id: string, options?: RequestOptions): APIPromise<Plan> {
    return this._client.request<Plan>({
      method: 'post',
      path: `/plans/${seg(id)}/archive`,
      body: {},
      options,
    });
  }
}
