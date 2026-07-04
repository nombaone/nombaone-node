/**
 * Quickstart: from a sandbox key to an active subscription.
 *
 * Run:
 *   NOMBAONE_API_KEY=nbo_sandbox_… pnpm exec tsx examples/01-quickstart.ts
 *
 * In your own app, import the published package instead:
 *   import Nombaone from '@nombaone/node';
 */
import Nombaone from '../src/index.js';

const nombaone = new Nombaone(process.env.NOMBAONE_API_KEY, {
  ...(process.env.NOMBAONE_BASE_URL ? { baseUrl: process.env.NOMBAONE_BASE_URL } : {}),
});

// 1. Something to sell: a plan and its price. Money is integer kobo — ₦2,500.00 = 250_000.
const plan = await nombaone.plans.create({ name: `Pro ${Date.now()}` });
const price = await nombaone.plans.prices.create(plan.id, {
  unitAmountInKobo: 250_000,
  interval: 'month',
});

// 2. Someone to bill.
const customer = await nombaone.customers.create({
  email: `ada+${Date.now()}@example.com`,
  name: 'Ada Lovelace',
});

// 3. A way to pay — in the sandbox, mint a deterministic test card.
const paymentMethod = await nombaone.sandbox.createPaymentMethod({
  customerId: customer.id,
  behavior: 'success',
});

// 4. The subscription. The engine takes it from here: cycles, invoices, retries.
const subscription = await nombaone.subscriptions.create({
  customerId: customer.id,
  priceId: price.id,
  paymentMethodId: paymentMethod.id,
});

console.log(`subscription ${subscription.id} is ${subscription.status}`);
console.log(`next period ends ${subscription.currentPeriodEnd}`);
