import { APIResource, seg } from './resource.js';

import type { APIPromise } from '../api-promise.js';
import type { RequestOptions } from '../core-types.js';
import type { PagePromise } from '../pagination.js';

/** A URL you registered to receive signed event deliveries. */
export interface WebhookEndpoint {
  domain: 'webhook';
  /** `nbo…whk` */
  id: string;
  url: string;
  /** Event types fanned out to this endpoint; `['*']` means everything. */
  enabledEvents: string[];
  /** Display prefix of the signing secret (the full secret is shown once). */
  signingSecretPrefix: string;
  disabledAt: string | null;
  createdAt: string;
}

/** Returned by `create` only — the one time the full secret is visible. */
export interface WebhookEndpointWithSecret extends WebhookEndpoint {
  /**
   * The full signing secret. **Shown exactly once** — store it now; it is
   * not recoverable later (only rotatable).
   */
  signingSecret: string;
}

/** Returned by `rotateSecret` — again, the only time this secret is visible. */
export interface RotatedWebhookSecret {
  domain: 'webhook_secret';
  id: string;
  /** The new full signing secret — shown exactly once. */
  signingSecret: string;
  signingSecretPrefix: string;
}

export type WebhookDeliveryStatus = 'pending' | 'succeeded' | 'failed' | 'dead';

/** One attempt-tracked delivery of an event to one endpoint. */
export interface WebhookDelivery {
  domain: 'webhook_delivery';
  /** `nbo…whd` */
  id: string;
  eventType: string;
  endpointId: string;
  /** The domain event this delivery carries (`nbo…evt`) — the dedupe key. */
  eventId: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  nextAttemptAt: string | null;
  lastAttemptAt: string | null;
  responseStatus: number | null;
  replayedAt: string | null;
  replayCount: number;
  createdAt: string;
}

export interface WebhookEndpointCreateParams {
  url: string;
  /** Defaults to `['*']` (all events) server-side. */
  enabledEvents?: string[];
}

/** At least one field must be provided. */
export interface WebhookEndpointUpdateParams {
  url?: string;
  enabledEvents?: string[];
  /** `true` pauses deliveries; `false` re-enables. */
  disabled?: boolean;
}

export interface WebhookDeliveryListParams {
  status?: WebhookDeliveryStatus;
  eventType?: string;
  endpoint?: string;
  /** Page size, 1–100 (API default 20). */
  limit?: number;
  /** Opaque cursor from a previous page's `pagination.nextCursor`. */
  cursor?: string;
}

/** Deliveries under an endpoint: inspect and replay. */
export class WebhookEndpointDeliveries extends APIResource {
  /** List an endpoint's deliveries, newest first. */
  list(
    endpointId: string,
    params?: WebhookDeliveryListParams,
    options?: RequestOptions
  ): PagePromise<WebhookDelivery> {
    return this._client.requestPage<WebhookDelivery>({
      method: 'get',
      path: `/webhooks/${seg(endpointId)}/deliveries`,
      query: { ...params },
      options,
    });
  }

  /** Retrieve one delivery. */
  retrieve(
    endpointId: string,
    deliveryId: string,
    options?: RequestOptions
  ): APIPromise<WebhookDelivery> {
    return this._client.request<WebhookDelivery>({
      method: 'get',
      path: `/webhooks/${seg(endpointId)}/deliveries/${seg(deliveryId)}`,
      options,
    });
  }

  /**
   * Redeliver a past delivery. The **original event id is kept**, so a
   * receiver that dedupes on `event.id` will correctly treat it as
   * already-seen.
   */
  replay(
    endpointId: string,
    deliveryId: string,
    options?: RequestOptions
  ): APIPromise<WebhookDelivery> {
    return this._client.request<WebhookDelivery>({
      method: 'post',
      path: `/webhooks/${seg(endpointId)}/deliveries/${seg(deliveryId)}/replay`,
      body: {},
      options,
    });
  }
}

/**
 * Webhook endpoints — register and manage the URLs that receive signed
 * events. (To *verify* incoming deliveries in your handler, use
 * `nombaone.webhooks.constructEvent` — the crypto helper, not this REST
 * resource.)
 */
export class WebhookEndpoints extends APIResource {
  /** Deliveries under an endpoint. */
  readonly deliveries: WebhookEndpointDeliveries = new WebhookEndpointDeliveries(this._client);

  /**
   * Register an endpoint. The response includes the full `signingSecret`
   * **exactly once** — store it in your secret manager immediately.
   *
   * @example
   * ```ts
   * const endpoint = await nombaone.webhookEndpoints.create({
   *   url: 'https://example.com/nombaone/webhooks',
   *   enabledEvents: ['invoice.paid', 'invoice.payment_failed'],
   * });
   * await secrets.store('NOMBAONE_WEBHOOK_SECRET', endpoint.signingSecret);
   * ```
   */
  create(
    params: WebhookEndpointCreateParams,
    options?: RequestOptions
  ): APIPromise<WebhookEndpointWithSecret> {
    return this._client.request<WebhookEndpointWithSecret>({
      method: 'post',
      path: '/webhooks',
      body: params,
      options,
    });
  }

  /**
   * Retrieve an endpoint by id.
   *
   * @throws {NotFoundError} 404 `WEBHOOK_ENDPOINT_NOT_FOUND`
   */
  retrieve(id: string, options?: RequestOptions): APIPromise<WebhookEndpoint> {
    return this._client.request<WebhookEndpoint>({
      method: 'get',
      path: `/webhooks/${seg(id)}`,
      options,
    });
  }

  /** Update url, event subscription, or enabled state. */
  update(
    id: string,
    params: WebhookEndpointUpdateParams,
    options?: RequestOptions
  ): APIPromise<WebhookEndpoint> {
    return this._client.request<WebhookEndpoint>({
      method: 'patch',
      path: `/webhooks/${seg(id)}`,
      body: params,
      options,
    });
  }

  /** List your endpoints. */
  list(options?: RequestOptions): PagePromise<WebhookEndpoint> {
    return this._client.requestPage<WebhookEndpoint>({
      method: 'get',
      path: '/webhooks',
      options,
    });
  }

  /** Delete an endpoint. Pending deliveries to it are retired. */
  delete(id: string, options?: RequestOptions): APIPromise<WebhookEndpoint> {
    return this._client.request<WebhookEndpoint>({
      method: 'delete',
      path: `/webhooks/${seg(id)}`,
      options,
    });
  }

  /**
   * Rotate the signing secret. The new secret is returned **exactly once**;
   * the old one is briefly honored so you can roll without dropping
   * in-flight deliveries.
   */
  rotateSecret(id: string, options?: RequestOptions): APIPromise<RotatedWebhookSecret> {
    return this._client.request<RotatedWebhookSecret>({
      method: 'post',
      path: `/webhooks/${seg(id)}/rotate-secret`,
      body: {},
      options,
    });
  }
}
