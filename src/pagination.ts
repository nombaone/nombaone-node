import type { ApiPagination, RequestSpec, TransportResult } from './core-types.js';

/** Internal: how a Page re-issues its originating request for the next cursor. */
export type PageFetcher = <Item>(spec: RequestSpec) => Promise<TransportResult<Item[]>>;

/**
 * One page of a list, plus everything needed to keep going. Iterating a Page
 * with `for await` walks **all** items across **all** subsequent pages —
 * cursors are threaded for you.
 */
export class Page<Item> implements AsyncIterable<Item> {
  /** The items on this page. */
  readonly data: Item[];
  /** Cursor block: `{ limit, hasMore, nextCursor }`. */
  readonly pagination: ApiPagination;
  /** The request id for this page's fetch. */
  readonly requestId: string;

  readonly #fetcher: PageFetcher;
  readonly #spec: RequestSpec;

  constructor(fetcher: PageFetcher, spec: RequestSpec, result: TransportResult<Item[]>) {
    this.#fetcher = fetcher;
    this.#spec = spec;
    this.data = result.data;
    this.pagination = result.pagination ?? {
      limit: result.data.length,
      hasMore: false,
      nextCursor: null,
    };
    this.requestId = result.requestId;
  }

  hasNextPage(): boolean {
    return this.pagination.hasMore && this.pagination.nextCursor !== null;
  }

  /** Fetch the next page (same filters, next cursor). */
  async nextPage(): Promise<Page<Item>> {
    const cursor = this.pagination.nextCursor;
    if (cursor === null) {
      throw new Error('No next page available — check hasNextPage() before calling nextPage().');
    }
    const spec: RequestSpec = { ...this.#spec, query: { ...this.#spec.query, cursor } };
    const result = await this.#fetcher<Item>(spec);
    return new Page(this.#fetcher, spec, result);
  }

  /** Iterate page-by-page (this page first). */
  async *iterPages(): AsyncGenerator<Page<Item>> {
    let page: Page<Item> = this;
    yield page;
    while (page.hasNextPage()) {
      page = await page.nextPage();
      yield page;
    }
  }

  /** Iterate every item across this and all following pages. */
  async *[Symbol.asyncIterator](): AsyncGenerator<Item> {
    for await (const page of this.iterPages()) {
      yield* page.data;
    }
  }
}

/**
 * What every `list()` method returns: await it for one {@link Page}, or
 * `for await` it directly to auto-paginate items without touching cursors.
 *
 * @example
 * ```ts
 * // One page:
 * const page = await nombaone.customers.list({ limit: 50 });
 *
 * // Every item, cursors handled for you:
 * for await (const customer of nombaone.customers.list()) {
 *   console.log(customer.email);
 * }
 * ```
 */
export class PagePromise<Item> extends Promise<Page<Item>> implements AsyncIterable<Item> {
  constructor(page: Promise<Page<Item>>) {
    super((resolve, reject) => {
      page.then(resolve, reject);
    });
  }

  static override get [Symbol.species](): PromiseConstructor {
    return Promise;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Item> {
    const page = await this;
    yield* page;
  }
}
