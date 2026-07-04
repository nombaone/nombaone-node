import { APIResource, seg } from './resource.js';

import type { APIPromise } from '../api-promise.js';
import type { Kobo, Metadata, Mode, RequestOptions } from '../core-types.js';
import type { PagePromise } from '../pagination.js';
import type { Discount, DomainEvent, InvoiceLineItem } from './shared.js';

export type SubscriptionStatus =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'paused'
  | 'canceled';

export interface SubscriptionItem {
  id: string;
  priceId: string;
  quantity: number;
}

/**
 * One customer's recurring relationship with one price. The engine bills it
 * every cycle, retries failures through dunning, and reports every
 * transition as a webhook event.
 *
 * Involuntary churn is `status: 'canceled'` with
 * `cancellationReason: 'involuntary'` — there is no separate `churned` status.
 */
export interface Subscription {
  domain: 'subscription';
  /** `nbo…sub` */
  id: string;
  customerId: string;
  priceId: string;
  status: SubscriptionStatus;
  collectionMethod: 'charge_automatically' | 'send_invoice';
  currentPeriodIndex: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialStart: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  endedAt: string | null;
  cancellationReason: 'voluntary' | 'involuntary' | null;
  defaultPaymentMethodId: string | null;
  items: SubscriptionItem[];
  latestInvoiceId: string | null;
  currency: 'NGN';
  mode: Mode;
  createdAt: string;
}

/** A preview of the next cycle's invoice — nothing is charged or stored. */
export interface UpcomingInvoice {
  domain: 'upcoming_invoice';
  subscriptionId: string;
  periodIndex: number;
  periodStart: string;
  periodEnd: string;
  billingReason: 'subscription_create' | 'subscription_cycle' | 'subscription_update' | 'manual';
  /** Integer kobo (₦1.00 = 100). */
  subtotalInKobo: Kobo;
  totalInKobo: Kobo;
  amountDueInKobo: Kobo;
  currency: 'NGN';
  lineItems: InvoiceLineItem[];
  mode: Mode;
}

export interface SchedulePhase {
  startIndex: number;
  priceId: string;
  quantity?: number;
  consumedAt: string | null;
}

/** A queued change that applies at a period boundary instead of mid-cycle. */
export interface SubscriptionScheduleObject {
  domain: 'subscription_schedule';
  /** `nbo…sch` */
  id: string;
  subscriptionId: string;
  status: 'active' | 'released' | 'canceled';
  phases: SchedulePhase[];
  mode: Mode;
  createdAt: string;
  updatedAt: string;
}

export type DunningAttemptStatus =
  | 'scheduled'
  | 'attempting'
  | 'succeeded'
  | 'rescheduled'
  | 'card_update_required'
  | 'exhausted';

/** One retry in a recovery run. */
export interface DunningAttempt {
  domain: 'dunning_attempt';
  /** `nbo…dun` */
  id: string;
  attemptNumber: number;
  status: DunningAttemptStatus;
  branch: 'reschedule' | 'card_update_required' | 'short_path';
  railKey: string | null;
  failureReason: string | null;
  gatewayMessage: string | null;
  outcome: string | null;
  scheduledAt: string;
  executedAt: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
}

/**
 * Where a subscription stands in recovery. `past_due` is not canceled —
 * read `graceAccessUntil` before cutting a subscriber off.
 */
export interface DunningState {
  domain: 'dunning_state';
  subscriptionRef: string;
  invoiceRef: string | null;
  status: DunningAttemptStatus | 'none';
  attemptsUsed: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  graceAccessUntil: string | null;
  attempts: DunningAttempt[];
}

export interface SubscriptionCreateParams {
  /** `nbo…cus` */
  customerId: string;
  /** `nbo…prc` — subscriptions reference a price, not a plan. */
  priceId: string;
  /**
   * Required for `charge_automatically` unless `trialDays > 0` (the first
   * charge is deferred to trial end).
   */
  paymentMethodId?: string;
  /** Defaults to `charge_automatically` server-side. */
  collectionMethod?: 'charge_automatically' | 'send_invoice';
  trialDays?: number;
  /** Defaults to `1` server-side. */
  quantity?: number;
  metadata?: Metadata;
}

/**
 * Metadata / default-payment-method edits only. For a price, quantity, or
 * interval change (which prorates), use {@link Subscriptions.change}.
 * At least one field must be provided.
 */
export interface SubscriptionUpdateParams {
  defaultPaymentMethodId?: string;
  metadata?: Metadata;
}

export interface SubscriptionListParams {
  customerId?: string;
  status?: SubscriptionStatus;
  /** Page size, 1–100 (API default 20). */
  limit?: number;
  /** Opaque cursor from a previous page's `pagination.nextCursor`. */
  cursor?: string;
}

export interface SubscriptionCancelParams {
  /** Defaults to `now` server-side. `at_period_end` keeps access until the cycle closes. */
  mode?: 'now' | 'at_period_end';
  comment?: string;
}

export interface SubscriptionPauseParams {
  /** Auto-resume after this many days. */
  maxDays?: number;
}

export interface SubscriptionResubscribeParams {
  /** Defaults to the previous price. */
  priceId?: string;
  /** Defaults to the previous payment method. */
  paymentMethodId?: string;
}

/** At least one of `priceId`, `quantity`, or `intervalSwitch` is required. */
export interface SubscriptionChangeParams {
  priceId?: string;
  quantity?: number;
  intervalSwitch?: boolean;
  /** Defaults to `create_prorations` server-side; `none` skips proration. */
  prorationBehavior?: 'create_prorations' | 'none';
}

/** Exactly one of `paymentMethodReference` or `checkoutToken`. */
export interface SubscriptionUpdatePaymentMethodParams {
  /** An already-captured payment method (`nbo…pmt`). */
  paymentMethodReference?: string;
  /** A fresh hosted-checkout token — attaches and swaps atomically. */
  checkoutToken?: string;
}

export interface SubscriptionScheduleCreateParams {
  /** The price to switch to at the boundary. */
  priceId: string;
  quantity?: number;
  /** Defaults to `next_cycle` server-side (the only mode today). */
  effectiveAt?: 'next_cycle';
}

export interface SubscriptionApplyDiscountParams {
  /** A coupon id (`nbo…cpn`) or its code. */
  coupon: string;
}

export interface SubscriptionListEventsParams {
  /** Page size, 1–100 (API default 20). */
  limit?: number;
  /** Opaque cursor from a previous page's `pagination.nextCursor`. */
  cursor?: string;
}

/** Scheduled changes queued against a subscription (`…/schedule`). */
export class SubscriptionSchedules extends APIResource {
  /**
   * Queue a change for the next cycle boundary — the safe way to switch
   * billing intervals (mid-cycle interval proration is unsupported).
   *
   * @throws {ConflictError} 409 `SUBSCRIPTION_SCHEDULE_CONFLICT`
   */
  create(
    subscriptionId: string,
    params: SubscriptionScheduleCreateParams,
    options?: RequestOptions
  ): APIPromise<SubscriptionScheduleObject> {
    return this._client.request<SubscriptionScheduleObject>({
      method: 'post',
      path: `/subscriptions/${seg(subscriptionId)}/schedule`,
      body: params,
      options,
    });
  }

  /**
   * Retrieve the subscription's schedule.
   *
   * @throws {NotFoundError} 404 `SUBSCRIPTION_SCHEDULE_NOT_FOUND`
   */
  retrieve(subscriptionId: string, options?: RequestOptions): APIPromise<SubscriptionScheduleObject> {
    return this._client.request<SubscriptionScheduleObject>({
      method: 'get',
      path: `/subscriptions/${seg(subscriptionId)}/schedule`,
      options,
    });
  }

  /** Cancel the pending schedule before it applies. */
  release(
    subscriptionId: string,
    options?: RequestOptions
  ): APIPromise<SubscriptionScheduleObject> {
    return this._client.request<SubscriptionScheduleObject>({
      method: 'delete',
      path: `/subscriptions/${seg(subscriptionId)}/schedule`,
      options,
    });
  }
}

/** Read-only view into a subscription's recovery state (`…/dunning`). */
export class SubscriptionDunning extends APIResource {
  /**
   * Where the subscription stands in dunning. Check `graceAccessUntil`
   * before cutting access — `past_due` usually means "not yet", not "no".
   */
  retrieve(subscriptionId: string, options?: RequestOptions): APIPromise<DunningState> {
    return this._client.request<DunningState>({
      method: 'get',
      path: `/subscriptions/${seg(subscriptionId)}/dunning`,
      options,
    });
  }

  /** List every recovery attempt, newest first. */
  listAttempts(
    subscriptionId: string,
    params?: { limit?: number; cursor?: string },
    options?: RequestOptions
  ): PagePromise<DunningAttempt> {
    return this._client.requestPage<DunningAttempt>({
      method: 'get',
      path: `/subscriptions/${seg(subscriptionId)}/dunning/attempts`,
      query: { ...params },
      options,
    });
  }
}

/**
 * Subscriptions — the core object. Create one against a customer and a
 * price; the engine handles cycles, invoices, retries, and recovery.
 *
 * @example
 * ```ts
 * const subscription = await nombaone.subscriptions.create({
 *   customerId: customer.id,
 *   priceId: price.id,
 *   paymentMethodId: paymentMethod.id,
 * });
 * console.log(subscription.status); // "active"
 * ```
 */
export class Subscriptions extends APIResource {
  /** Scheduled (next-cycle) changes. */
  readonly schedule: SubscriptionSchedules = new SubscriptionSchedules(this._client);
  /** Recovery/dunning state (read-only). */
  readonly dunning: SubscriptionDunning = new SubscriptionDunning(this._client);

  /**
   * Create a subscription. This can move money (the first charge), so the
   * API requires an `Idempotency-Key`; the SDK sends one automatically and
   * reuses it across its own retries.
   *
   * @throws {ValidationError} 422 — e.g. a missing payment method without a trial.
   * @throws {ConflictError} 409 `SUBSCRIPTION_PAYMENT_METHOD_REQUIRED`
   */
  create(params: SubscriptionCreateParams, options?: RequestOptions): APIPromise<Subscription> {
    return this._client.request<Subscription>({
      method: 'post',
      path: '/subscriptions',
      body: params,
      options,
    });
  }

  /**
   * Retrieve a subscription by id.
   *
   * @throws {NotFoundError} 404 `SUBSCRIPTION_NOT_FOUND`
   */
  retrieve(id: string, options?: RequestOptions): APIPromise<Subscription> {
    return this._client.request<Subscription>({
      method: 'get',
      path: `/subscriptions/${seg(id)}`,
      options,
    });
  }

  /**
   * Edit metadata or the default payment method. For price/quantity/interval
   * changes use {@link change} — those prorate.
   */
  update(
    id: string,
    params: SubscriptionUpdateParams,
    options?: RequestOptions
  ): APIPromise<Subscription> {
    return this._client.request<Subscription>({
      method: 'patch',
      path: `/subscriptions/${seg(id)}`,
      body: params,
      options,
    });
  }

  /** List subscriptions, newest first. */
  list(params?: SubscriptionListParams, options?: RequestOptions): PagePromise<Subscription> {
    return this._client.requestPage<Subscription>({
      method: 'get',
      path: '/subscriptions',
      query: { ...params },
      options,
    });
  }

  /** The subscription's audit trail of domain events, newest first. */
  listEvents(
    id: string,
    params?: SubscriptionListEventsParams,
    options?: RequestOptions
  ): PagePromise<DomainEvent> {
    return this._client.requestPage<DomainEvent>({
      method: 'get',
      path: `/subscriptions/${seg(id)}/events`,
      query: { ...params },
      options,
    });
  }

  /**
   * Pause billing. The subscription keeps its place in the cycle and resumes
   * cleanly.
   *
   * @throws {ConflictError} 409 `SUBSCRIPTION_ILLEGAL_TRANSITION`
   */
  pause(
    id: string,
    params?: SubscriptionPauseParams,
    options?: RequestOptions
  ): APIPromise<Subscription> {
    return this._client.request<Subscription>({
      method: 'post',
      path: `/subscriptions/${seg(id)}/pause`,
      body: params ?? {},
      options,
    });
  }

  /** Resume a paused subscription. */
  resume(id: string, options?: RequestOptions): APIPromise<Subscription> {
    return this._client.request<Subscription>({
      method: 'post',
      path: `/subscriptions/${seg(id)}/resume`,
      body: {},
      options,
    });
  }

  /**
   * Cancel a subscription — immediately (default) or at period end.
   *
   * @example
   * ```ts
   * await nombaone.subscriptions.cancel(subscription.id, { mode: 'at_period_end' });
   * ```
   */
  cancel(
    id: string,
    params?: SubscriptionCancelParams,
    options?: RequestOptions
  ): APIPromise<Subscription> {
    return this._client.request<Subscription>({
      method: 'post',
      path: `/subscriptions/${seg(id)}/cancel`,
      body: params ?? {},
      options,
    });
  }

  /**
   * Start a fresh subscription for a canceled one's customer, reusing the
   * old price/payment method unless overridden. The subscription must be in
   * a terminal state.
   *
   * @throws {ConflictError} 409 `SUBSCRIPTION_NOT_TERMINAL`
   */
  resubscribe(
    id: string,
    params?: SubscriptionResubscribeParams,
    options?: RequestOptions
  ): APIPromise<Subscription> {
    return this._client.request<Subscription>({
      method: 'post',
      path: `/subscriptions/${seg(id)}/resubscribe`,
      body: params ?? {},
      options,
    });
  }

  /**
   * Change price or quantity mid-cycle, prorating by default. Switching the
   * billing interval mid-cycle is unsupported
   * (`PRORATION_INTERVAL_SWITCH_UNSUPPORTED`) — queue it with
   * {@link SubscriptionSchedules.create} instead.
   *
   * @example
   * ```ts
   * await nombaone.subscriptions.change(subscription.id, {
   *   priceId: biggerPrice.id, // upgrade, prorated on the next invoice
   * });
   * ```
   */
  change(
    id: string,
    params: SubscriptionChangeParams,
    options?: RequestOptions
  ): APIPromise<Subscription> {
    return this._client.request<Subscription>({
      method: 'post',
      path: `/subscriptions/${seg(id)}/change`,
      body: params,
      options,
    });
  }

  /**
   * Swap the payment method that bills this subscription — the card-update
   * path during dunning. Exactly one of `paymentMethodReference` or
   * `checkoutToken`.
   */
  updatePaymentMethod(
    id: string,
    params: SubscriptionUpdatePaymentMethodParams,
    options?: RequestOptions
  ): APIPromise<Subscription> {
    return this._client.request<Subscription>({
      method: 'post',
      path: `/subscriptions/${seg(id)}/payment-method`,
      body: params,
      options,
    });
  }

  /** Preview the next invoice without charging or storing anything. */
  retrieveUpcomingInvoice(id: string, options?: RequestOptions): APIPromise<UpcomingInvoice> {
    return this._client.request<UpcomingInvoice>({
      method: 'get',
      path: `/subscriptions/${seg(id)}/upcoming-invoice`,
      options,
    });
  }

  /** Apply a coupon to this subscription only. */
  applyDiscount(
    id: string,
    params: SubscriptionApplyDiscountParams,
    options?: RequestOptions
  ): APIPromise<Discount> {
    return this._client.request<Discount>({
      method: 'post',
      path: `/subscriptions/${seg(id)}/discount`,
      body: params,
      options,
    });
  }

  /** Remove the subscription's active discount. Returns the ended discount. */
  removeDiscount(id: string, options?: RequestOptions): APIPromise<Discount> {
    return this._client.request<Discount>({
      method: 'delete',
      path: `/subscriptions/${seg(id)}/discount`,
      options,
    });
  }
}
