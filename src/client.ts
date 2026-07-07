import { NombaoneError } from './error.js';
import { APIPromise } from './api-promise.js';
import { Page, PagePromise } from './pagination.js';
import { performRequest, type TransportConfig } from './internal/http.js';
import { Coupons } from './resources/coupons.js';
import { Customers } from './resources/customers.js';
import { Events } from './resources/events.js';
import { Invoices } from './resources/invoices.js';
import { Mandates } from './resources/mandates.js';
import { Metrics } from './resources/metrics.js';
import { Organization } from './resources/organization.js';
import { PaymentMethods } from './resources/payment-methods.js';
import { Plans } from './resources/plans.js';
import { Prices } from './resources/prices.js';
import { Sandbox } from './resources/sandbox.js';
import { Settlements } from './resources/settlements.js';
import { Subscriptions } from './resources/subscriptions.js';
import { WebhookEndpoints } from './resources/webhook-endpoints.js';
import { Webhooks } from './webhooks.js';

import type { Mode, RequestSpec, TransportResult } from './core-types.js';

/** Default host for each environment. Overridable via `baseUrl`. */
export const BASE_URLS: Record<Mode, string> = {
  sandbox: 'https://sandbox.api.nombaone.xyz',
  live: 'https://api.nombaone.xyz',
};

export interface NombaoneOptions {
  /**
   * Your secret API key (`nbo_sandbox_…` or `nbo_live_…`). Defaults to
   * `process.env.NOMBAONE_API_KEY`. Server-side only — never ship it to a
   * browser.
   */
  apiKey?: string;
  /**
   * Override the API origin (no `/v1`). Defaults to the host matching your
   * key's environment. Required if the key prefix is unrecognized.
   */
  baseUrl?: string;
  /** Per-attempt timeout in milliseconds. Default `30_000`. */
  timeout?: number;
  /**
   * Automatic retries for network failures, timeouts, 408/429/5xx, and
   * in-flight idempotency conflicts. Default `2` (3 attempts total).
   * Retries of a POST always reuse the same `Idempotency-Key`.
   */
  maxRetries?: number;
  /** Fetch implementation override (tests, proxies). Default `globalThis.fetch`. */
  fetch?: typeof globalThis.fetch;
  /** Extra headers sent on every request. */
  defaultHeaders?: Record<string, string>;
}

const deriveMode = (apiKey: string): Mode | null => {
  if (apiKey.startsWith('nbo_sandbox_')) return 'sandbox';
  if (apiKey.startsWith('nbo_live_')) return 'live';
  return null;
};

/**
 * The NombaOne API client.
 *
 * @example
 * ```ts
 * import Nombaone from 'nombaone';
 *
 * const nombaone = new Nombaone(process.env.NOMBAONE_API_KEY);
 *
 * const subscription = await nombaone.subscriptions.create({
 *   customerId: 'nbo123456789012cus',
 *   priceId: 'nbo123456789012prc',
 * });
 * ```
 */
export class Nombaone {
  /** The environment this client talks to, derived from the key prefix. */
  readonly mode: Mode;
  /** The API origin in use (no `/v1`). */
  readonly baseUrl: string;

  readonly #config: TransportConfig;

  /** Customers — the people and businesses you bill. */
  readonly customers: Customers = new Customers(this);
  /** Plans — your catalog (prices nest under `plans.prices`). */
  readonly plans: Plans = new Plans(this);
  /** Prices — immutable amounts and cadences. */
  readonly prices: Prices = new Prices(this);
  /** Subscriptions — the core billing object. */
  readonly subscriptions: Subscriptions = new Subscriptions(this);
  /** Invoices — what billing cycles produced (read + void). */
  readonly invoices: Invoices = new Invoices(this);
  /** Coupons — reusable discount rules. */
  readonly coupons: Coupons = new Coupons(this);
  /** Payment methods — cards, mandates, virtual accounts. */
  readonly paymentMethods: PaymentMethods = new PaymentMethods(this);
  /** Direct-debit mandates (async NIBSS consent). */
  readonly mandates: Mandates = new Mandates(this);
  /** Settlements, refunds, payouts, escrow. */
  readonly settlements: Settlements = new Settlements(this);
  /** Webhook endpoint management (REST). To verify deliveries, see `webhooks`. */
  readonly webhookEndpoints: WebhookEndpoints = new WebhookEndpoints(this);
  /** The domain-event log — your reconciliation backstop. */
  readonly events: Events = new Events(this);
  /** Organization settings + billing/dunning policy. */
  readonly organization: Organization = new Organization(this);
  /** Billing KPIs computed from the ledger. */
  readonly metrics: Metrics = new Metrics(this);
  /** Sandbox-only simulation instruments (test clock, test methods, webhook simulate). */
  readonly sandbox: Sandbox = new Sandbox(this);
  /** Verify + parse incoming webhook deliveries (crypto helper, no API calls). */
  readonly webhooks: Webhooks = new Webhooks();

  constructor(apiKey?: string | NombaoneOptions, options: NombaoneOptions = {}) {
    const opts: NombaoneOptions =
      typeof apiKey === 'string' ? { ...options, apiKey } : (apiKey ?? options);

    const resolvedKey = opts.apiKey ?? process.env.NOMBAONE_API_KEY;
    if (!resolvedKey) {
      throw new NombaoneError(
        'Missing API key — set the NOMBAONE_API_KEY environment variable, or pass one: new Nombaone("nbo_sandbox_…"). Create keys in the dashboard under API keys.'
      );
    }

    const mode = deriveMode(resolvedKey);
    if (mode === null && !opts.baseUrl) {
      throw new NombaoneError(
        'Unrecognized API key format — expected a key starting with "nbo_sandbox_" or "nbo_live_". Copy the key exactly as shown in the dashboard, or pass an explicit baseUrl if you are targeting a custom host.'
      );
    }
    this.mode = mode ?? 'sandbox';
    this.baseUrl = (opts.baseUrl ?? BASE_URLS[this.mode]).replace(/\/+$/, '');

    this.#config = {
      apiKey: resolvedKey,
      baseUrl: this.baseUrl,
      timeout: opts.timeout ?? 30_000,
      maxRetries: opts.maxRetries ?? 2,
      fetch: opts.fetch ?? globalThis.fetch,
      defaultHeaders: opts.defaultHeaders,
    };
  }

  /** Internal — used by resource classes. */
  request<T>(spec: RequestSpec): APIPromise<T> {
    return new APIPromise(performRequest<T>(this.#config, spec));
  }

  /** Internal — used by resource `list()` methods. */
  requestPage<Item>(spec: RequestSpec): PagePromise<Item> {
    const fetcher = <I>(s: RequestSpec): Promise<TransportResult<I[]>> =>
      performRequest<I[]>(this.#config, s);
    return new PagePromise(
      fetcher<Item>(spec).then((result) => new Page<Item>(fetcher, spec, result))
    );
  }
}
