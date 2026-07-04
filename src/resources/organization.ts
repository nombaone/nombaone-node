import { APIResource } from './resource.js';

import type { APIPromise } from '../api-promise.js';
import type { Kobo, RequestOptions } from '../core-types.js';

/**
 * Your org-wide billing + dunning policy — how hard and when the engine
 * retries, payday bias, grace windows, and collection defaults.
 */
export interface BillingSettings {
  domain: 'billing_settings';
  partialCollectionEnabled: boolean;
  prorationCreditPolicy: 'credit_next_cycle' | 'none';
  dunningMaxAttempts: number;
  dunningIntervalsHours: number[];
  dunningMaxWindowHours: number;
  gracePeriodHours: number;
  /** Days of month treated as paydays (retries bias toward them). */
  paydayDays: number[];
  paydayPullForwardDays: number;
  paydayBiasEnabled: boolean;
  defaultCollectionMethod: 'charge_automatically' | 'send_invoice';
  commsEnabled: boolean;
}

/** Org-level configuration: limits, settlement mode, branding, webhook + Nomba account status. */
export interface TenantSettings {
  domain: 'organization';
  billing: {
    rateLimitPerMinute: number | null;
    monthlyRequestQuota: number | null;
    settlementMode: 'split_at_collection' | 'collect_then_payout';
    platformFee: {
      bps: number | null;
      minInKobo: Kobo | null;
      maxInKobo: Kobo | null;
    };
    grace: { gracePeriodHours: number; dunningMaxAttempts: number };
    branding: {
      displayName?: string;
      supportEmail?: string;
      logoUrl?: string;
      primaryColorHex?: string;
    };
  };
  webhook: { url: string | null; signingSecretPrefix: string | null; configured: boolean };
  nombaAccount: { accountRef: string | null; status: string | null };
}

/** At least one field must be provided. Rate limits are operator-set (not here). */
export interface TenantSettingsUpdateParams {
  monthlyRequestQuota?: number;
  settlementMode?: 'split_at_collection' | 'collect_then_payout';
  branding?: {
    displayName?: string;
    supportEmail?: string;
    logoUrl?: string;
    primaryColorHex?: string;
  };
}

/** PUT patches only the supplied keys; every field optional. */
export interface BillingSettingsUpdateParams {
  partialCollectionEnabled?: boolean;
  prorationCreditPolicy?: 'credit_next_cycle' | 'none';
  /** 1–10. */
  dunningMaxAttempts?: number;
  dunningIntervalsHours?: number[];
  /** Must be ≥ the largest configured dunning interval. */
  dunningMaxWindowHours?: number;
  gracePeriodHours?: number;
  /** Days of month, 1–31. */
  paydayDays?: number[];
  /** 0–28. */
  paydayPullForwardDays?: number;
  paydayBiasEnabled?: boolean;
  defaultCollectionMethod?: 'charge_automatically' | 'send_invoice';
  commsEnabled?: boolean;
}

/** Billing + dunning policy under `/organization/billing`. */
export class OrganizationBilling extends APIResource {
  /** Read the org's billing + dunning policy. */
  retrieve(options?: RequestOptions): APIPromise<BillingSettings> {
    return this._client.request<BillingSettings>({
      method: 'get',
      path: '/organization/billing',
      options,
    });
  }

  /**
   * Update the billing policy. PUT semantics, but only supplied keys change.
   *
   * @example
   * ```ts
   * await nombaone.organization.billing.update({
   *   paydayBiasEnabled: true,
   *   paydayDays: [25, 28, 30],
   * });
   * ```
   */
  update(params: BillingSettingsUpdateParams, options?: RequestOptions): APIPromise<BillingSettings> {
    return this._client.request<BillingSettings>({
      method: 'put',
      path: '/organization/billing',
      body: params,
      options,
    });
  }
}

/** Organization settings — configuration, not a billing object. */
export class Organization extends APIResource {
  /** Billing + dunning policy. */
  readonly billing: OrganizationBilling = new OrganizationBilling(this._client);

  /** Read org-level settings (limits, settlement mode, branding, statuses). */
  retrieve(options?: RequestOptions): APIPromise<TenantSettings> {
    return this._client.request<TenantSettings>({ method: 'get', path: '/organization', options });
  }

  /** Update tenant-editable settings. At least one field is required. */
  update(params: TenantSettingsUpdateParams, options?: RequestOptions): APIPromise<TenantSettings> {
    return this._client.request<TenantSettings>({
      method: 'put',
      path: '/organization',
      body: params,
      options,
    });
  }
}
