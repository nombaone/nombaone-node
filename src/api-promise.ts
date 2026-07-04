import type { TransportResult } from './core-types.js';

/** The full result of a call, for when you need more than the resource. */
export interface WithResponse<T> {
  /** The unwrapped resource — what awaiting the call directly resolves to. */
  data: T;
  /** The request id (`meta.requestId`) — quote it to support. */
  requestId: string;
  /** The raw fetch Response (headers, status, rate-limit info). */
  response: Response;
}

/**
 * What every non-list SDK method returns. Awaiting it resolves straight to
 * the resource; call {@link withResponse} instead when you also need the
 * request id or raw response headers.
 *
 * @example
 * ```ts
 * const customer = await nombaone.customers.retrieve(id);
 * const { data, requestId } = await nombaone.customers.retrieve(id).withResponse();
 * ```
 */
export class APIPromise<T> extends Promise<T> {
  #full: Promise<TransportResult<T>>;

  constructor(full: Promise<TransportResult<T>>) {
    super((resolve, reject) => {
      full.then((result) => resolve(result.data), reject);
    });
    this.#full = full;
  }

  // `.then()` and friends should produce plain Promises, not re-enter this
  // constructor (whose signature differs from the executor Promise expects).
  static override get [Symbol.species](): PromiseConstructor {
    return Promise;
  }

  async withResponse(): Promise<WithResponse<T>> {
    const result = await this.#full;
    return { data: result.data, requestId: result.requestId, response: result.response };
  }
}
