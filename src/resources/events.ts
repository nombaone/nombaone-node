import { APIResource, seg } from './resource.js';

import type { APIPromise } from '../api-promise.js';
import type { RequestOptions } from '../core-types.js';
import type { PagePromise } from '../pagination.js';
import type { DomainEvent } from './shared.js';

export interface EventListParams {
  /** Filter to one catalog type, e.g. `invoice.paid`. */
  type?: string;
  /** Page size, 1–100 (API default 20). */
  limit?: number;
  /** Opaque cursor from a previous page's `pagination.nextCursor`. */
  cursor?: string;
}

/** One catalog entry: when the event fires and which `data` keys it carries. */
export interface EventCatalogEntry {
  when: string;
  payload: string[];
}

/**
 * Events — the append-only log behind every webhook. Webhook delivery is
 * at-least-once; this log is your reconciliation backstop when a delivery
 * was missed or you need to backfill.
 */
export class Events extends APIResource {
  /**
   * List events, newest first.
   *
   * @example
   * ```ts
   * for await (const event of nombaone.events.list({ type: 'invoice.paid' })) {
   *   console.log(event.id, event.payload);
   * }
   * ```
   */
  list(params?: EventListParams, options?: RequestOptions): PagePromise<DomainEvent> {
    return this._client.requestPage<DomainEvent>({
      method: 'get',
      path: '/events',
      query: { ...params },
      options,
    });
  }

  /**
   * Retrieve one event by id (`nbo…evt`).
   *
   * @throws {NotFoundError} 404 `WEBHOOK_EVENT_NOT_FOUND`
   */
  retrieve(id: string, options?: RequestOptions): APIPromise<DomainEvent> {
    return this._client.request<DomainEvent>({
      method: 'get',
      path: `/events/${seg(id)}`,
      options,
    });
  }

  /**
   * The machine-readable event catalog — every event type the platform can
   * emit, with a description and its `data` keys. Public (no auth needed
   * server-side); useful for building subscription pickers or codegen.
   */
  catalog(options?: RequestOptions): APIPromise<Record<string, EventCatalogEntry>> {
    return this._client.request<Record<string, EventCatalogEntry>>({
      method: 'get',
      path: '/events/catalog',
      options,
    });
  }
}
