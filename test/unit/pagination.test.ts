import { describe, expect, it } from 'vitest';

import { Nombaone } from '../../src/index.js';
import { mockFetch } from '../helpers/mock-fetch.js';

const KEY = 'nbo_sandbox_unit_test_key';

interface Item {
  id: string;
}

const threePageClient = () => {
  const mock = mockFetch();
  mock.page([{ id: 'a' }, { id: 'b' }], { hasMore: true, nextCursor: 'cur_2' });
  mock.page([{ id: 'c' }, { id: 'd' }], { hasMore: true, nextCursor: 'cur_3' });
  mock.page([{ id: 'e' }], { hasMore: false, nextCursor: null });
  const client = new Nombaone(KEY, { fetch: mock.fetch, baseUrl: 'http://api.test' });
  return { mock, client };
};

describe('pagination', () => {
  it('awaiting list() yields a single page', async () => {
    const { mock, client } = threePageClient();
    const page = await client.requestPage<Item>({
      method: 'get',
      path: '/customers',
      query: { limit: 2 },
    });

    expect(page.data.map((i) => i.id)).toEqual(['a', 'b']);
    expect(page.pagination).toEqual({ limit: 2, hasMore: true, nextCursor: 'cur_2' });
    expect(page.requestId).toBe('req_test');
    expect(mock.calls).toHaveLength(1);
  });

  it('nextPage() threads the cursor and keeps other filters', async () => {
    const { mock, client } = threePageClient();
    const first = await client.requestPage<Item>({
      method: 'get',
      path: '/customers',
      query: { limit: 2, email: 'ada@example.com' },
    });
    expect(first.hasNextPage()).toBe(true);

    const second = await first.nextPage();
    expect(second.data.map((i) => i.id)).toEqual(['c', 'd']);

    const url = new URL(mock.calls[1]!.url);
    expect(url.searchParams.get('cursor')).toBe('cur_2');
    expect(url.searchParams.get('email')).toBe('ada@example.com');
    expect(url.searchParams.get('limit')).toBe('2');
  });

  it('for await over the PagePromise auto-paginates every item', async () => {
    const { mock, client } = threePageClient();
    const seen: string[] = [];
    for await (const item of client.requestPage<Item>({ method: 'get', path: '/customers' })) {
      seen.push(item.id);
    }
    expect(seen).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(mock.calls).toHaveLength(3);
  });

  it('iterPages() walks page objects', async () => {
    const { client } = threePageClient();
    const page = await client.requestPage<Item>({ method: 'get', path: '/customers' });
    const sizes: number[] = [];
    for await (const p of page.iterPages()) sizes.push(p.data.length);
    expect(sizes).toEqual([2, 2, 1]);
  });

  it('nextPage() on the last page throws a clear error', async () => {
    const mock = mockFetch();
    mock.page([], { hasMore: false, nextCursor: null });
    const client = new Nombaone(KEY, { fetch: mock.fetch, baseUrl: 'http://api.test' });

    const page = await client.requestPage<Item>({ method: 'get', path: '/customers' });
    expect(page.hasNextPage()).toBe(false);
    await expect(page.nextPage()).rejects.toThrowError(/hasNextPage/);
  });
});
