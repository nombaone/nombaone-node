import { APIResource, seg } from './resource.js';

import type { APIPromise } from '../api-promise.js';
import type { Kobo, RequestOptions } from '../core-types.js';
import type { PagePromise } from '../pagination.js';

export type SettlementStatus = 'pending' | 'settled' | 'reconciled' | 'failed' | 'refunded';

/** The integer-kobo split of one collection into fee + tenant share. */
export interface Settlement {
  domain: 'settlement';
  /** `nbo…stl` */
  id: string;
  invoiceReference: string | null;
  subAccountRef: string;
  splitReference: string | null;
  merchantTxRef: string;
  grossInKobo: Kobo;
  /** Non-refundable. */
  platformFeeInKobo: Kobo;
  netToTenantInKobo: Kobo;
  status: SettlementStatus;
  createdAt: string;
}

/** A refund of a settlement's tenant share (the platform fee stays). */
export interface Refund {
  domain: 'refund';
  /** `nbo…ref` */
  id: string;
  settlementReference: string;
  subAccountRef: string;
  amountInKobo: Kobo;
  status: 'pending' | 'ledger_only' | 'succeeded' | 'failed';
  providerReference: string | null;
  createdAt: string;
}

/** A withdrawal of settled funds to your bank account. */
export interface Payout {
  domain: 'payout';
  /** `nbo…pay` */
  id: string;
  subAccountRef: string;
  amountInKobo: Kobo;
  bankCode: string;
  accountNumber: string;
  resolvedAccountName: string | null;
  status: 'pending' | 'ledger_posted' | 'succeeded' | 'failed';
  providerReference: string | null;
  failureReason: string | null;
  createdAt: string;
}

/** Your escrow lock and what is actually withdrawable right now. */
export interface Escrow {
  domain: 'escrow';
  lockedInKobo: Kobo;
  since: string;
  balanceInKobo: Kobo;
  minWithdrawableInKobo: Kobo;
  availableInKobo: Kobo;
}

export interface SettlementListParams {
  status?: SettlementStatus;
  /** Page size, 1–100 (API default 20). */
  limit?: number;
  /** Opaque cursor from a previous page's `pagination.nextCursor`. */
  cursor?: string;
}

export interface SettlementRefundParams {
  /** Integer kobo. Defaults server-side to the full remaining refundable amount. */
  amountInKobo?: Kobo;
}

export interface PayoutCreateParams {
  /** Integer kobo (₦1.00 = 100). */
  amountInKobo: Kobo;
  /** CBN 3-digit bank code. */
  bankCode: string;
  accountNumber: string;
}

/**
 * Settlements — where collected money lands, and how it leaves (refunds,
 * payouts) under the escrow lock.
 */
export class Settlements extends APIResource {
  /**
   * Retrieve a settlement by id.
   *
   * @throws {NotFoundError} 404 `SETTLEMENT_NOT_FOUND`
   */
  retrieve(id: string, options?: RequestOptions): APIPromise<Settlement> {
    return this._client.request<Settlement>({
      method: 'get',
      path: `/settlements/${seg(id)}`,
      options,
    });
  }

  /** List settlements, newest first. */
  list(params?: SettlementListParams, options?: RequestOptions): PagePromise<Settlement> {
    return this._client.requestPage<Settlement>({
      method: 'get',
      path: '/settlements',
      query: { ...params },
      options,
    });
  }

  /** Your escrow lock and available-to-withdraw balance. */
  retrieveEscrow(options?: RequestOptions): APIPromise<Escrow> {
    return this._client.request<Escrow>({
      method: 'get',
      path: '/settlements/escrow',
      options,
    });
  }

  /**
   * Refund a settlement's tenant share. The platform fee is never refunded.
   *
   * **Money moves here.** The API requires an `Idempotency-Key`; the SDK
   * sends one automatically, but pass your own stable
   * `options.idempotencyKey` so a retry from a *new process* cannot refund
   * twice.
   *
   * @throws {ConflictError} 409 `REFUND_ALREADY_REFUNDED`
   * @throws {ValidationError} 422 `REFUND_AMOUNT_EXCEEDS_NET`
   */
  refund(
    id: string,
    params?: SettlementRefundParams,
    options?: RequestOptions
  ): APIPromise<Refund> {
    return this._client.request<Refund>({
      method: 'post',
      path: `/settlements/${seg(id)}/refund`,
      body: params ?? {},
      options,
    });
  }

  /**
   * Withdraw settled funds to your bank account.
   *
   * **Money moves here, and the `Idempotency-Key` doubles as the payout's
   * durable `merchantTxRef`.** Always pass an explicit, stable
   * `options.idempotencyKey` (e.g. your own payout id) — an auto-generated
   * key protects SDK-level retries, but a brand-new process retrying with a
   * fresh key would create a second payout.
   *
   * @throws {ConflictError} 409 `ESCROW_LOCKED`
   * @throws {ValidationError} 422 `PAYOUT_EXCEEDS_AVAILABLE`
   *
   * @example
   * ```ts
   * const payout = await nombaone.settlements.createPayout(
   *   { amountInKobo: 5_000_000, bankCode: '058', accountNumber: '0123456789' },
   *   { idempotencyKey: `payout-${myPayoutRow.id}` }
   * );
   * ```
   */
  createPayout(params: PayoutCreateParams, options?: RequestOptions): APIPromise<Payout> {
    return this._client.request<Payout>({
      method: 'post',
      path: '/settlements/payout',
      body: params,
      options,
    });
  }
}
