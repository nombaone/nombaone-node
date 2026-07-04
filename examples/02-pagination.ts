/**
 * Pagination three ways: one page, manual cursors, and auto-iteration.
 *
 * Run:
 *   NOMBAONE_API_KEY=nbo_sandbox_… pnpm exec tsx examples/02-pagination.ts
 */
import Nombaone from '../src/index.js';

const nombaone = new Nombaone(process.env.NOMBAONE_API_KEY, {
  ...(process.env.NOMBAONE_BASE_URL ? { baseUrl: process.env.NOMBAONE_BASE_URL } : {}),
});

// One page at a time.
const page = await nombaone.customers.list({ limit: 5 });
console.log(`page of ${page.data.length}, hasMore=${page.pagination.hasMore}`);

// Manual cursor threading.
if (page.hasNextPage()) {
  const next = await page.nextPage();
  console.log(`next page has ${next.data.length}`);
}

// Or let the SDK walk every page for you.
let total = 0;
for await (const customer of nombaone.customers.list({ limit: 5 })) {
  total += 1;
  if (total >= 25) break; // stop early — pages stop being fetched too
  void customer;
}
console.log(`iterated ${total} customers across pages`);
