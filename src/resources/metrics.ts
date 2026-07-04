import { APIResource } from './resource.js';

import type { APIPromise } from '../api-promise.js';
import type { Kobo, RequestOptions } from '../core-types.js';

/** Recovery funnel counts inside a metrics window. */
export interface DunningFunnel {
  scheduled: number;
  attempting: number;
  cardUpdateRequired: number;
  rescheduled: number;
  succeeded: number;
  exhausted: number;
}

/** Billing KPIs, computed from the ledger on read — never stored, never stale. */
export interface BillingMetrics {
  domain: 'billing_metrics';
  /** Monthly recurring revenue, integer kobo. */
  mrrInKobo: Kobo;
  activeCount: number;
  voluntaryChurn: number;
  involuntaryChurn: number;
  failedChargeRate: number;
  dunningRecoveryRate: number;
  dunningFunnel: DunningFunnel;
  windowFrom: string;
  windowTo: string;
}

export interface BillingMetricsParams {
  /** ISO-8601 date-time, start of the window. */
  from?: string;
  /** ISO-8601 date-time, end of the window. */
  to?: string;
}

/** Metrics — MRR, churn, and the dunning funnel. */
export class Metrics extends APIResource {
  /**
   * Billing KPIs over a window (defaults to a recent window server-side).
   *
   * @example
   * ```ts
   * const metrics = await nombaone.metrics.billing();
   * console.log(`MRR ₦${metrics.mrrInKobo / 100}`);
   * ```
   */
  billing(params?: BillingMetricsParams, options?: RequestOptions): APIPromise<BillingMetrics> {
    return this._client.request<BillingMetrics>({
      method: 'get',
      path: '/metrics/billing',
      query: { ...params },
      options,
    });
  }
}
