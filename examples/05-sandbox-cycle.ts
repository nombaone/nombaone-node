/**
 * Watch the core loop happen — bill, fail, recover — without waiting a
 * month: mint a thin-balance card, subscribe, and force cycles with the
 * sandbox test clock.
 *
 * Run:
 *   NOMBAONE_API_KEY=nbo_sandbox_… pnpm exec tsx examples/05-sandbox-cycle.ts
 */
import Nombaone from '../src/index.js';

const nombaone = new Nombaone(process.env.NOMBAONE_API_KEY, {
  ...(process.env.NOMBAONE_BASE_URL ? { baseUrl: process.env.NOMBAONE_BASE_URL } : {}),
});

const plan = await nombaone.plans.create({ name: `Sandbox ${Date.now()}` });
const price = await nombaone.plans.prices.create(plan.id, {
  unitAmountInKobo: 500_000, // ₦5,000
  interval: 'month',
});
const customer = await nombaone.customers.create({
  email: `sandbox+${Date.now()}@example.com`,
  name: 'Sandbox Demo',
});

// A card that will decline like a thin balance does: "not yet", not "no".
const method = await nombaone.sandbox.createPaymentMethod({
  customerId: customer.id,
  behavior: 'decline_insufficient_funds',
});

// Start on a short trial so creation itself charges nothing — the decline
// happens where it does in real life: at the first billing cycle.
const subscription = await nombaone.subscriptions.create({
  customerId: customer.id,
  priceId: price.id,
  paymentMethodId: method.id,
  trialDays: 7,
});
console.log(`subscribed: ${subscription.status}`);

// Force the next billing cycle through the REAL engine — invoice, charge
// attempt, ledger, dunning, webhooks.
const cycle = await nombaone.sandbox.advanceCycle(subscription.id);
console.log(`cycle outcome: ${cycle.outcome}`);
// No invoice when the outcome is `canceled` — a subscription flagged
// cancel-at-period-end ends at the boundary rather than renewing.
if (cycle.invoice) {
  const { id, totalInKobo, status } = cycle.invoice;
  console.log(`invoice ${id}: ₦${(totalInKobo / 100).toFixed(2)} → ${status}`);
} else {
  console.log('no invoice — the subscription ended at this boundary');
}

// See what recovery is doing about it.
const dunning = await nombaone.subscriptions.dunning.retrieve(subscription.id);
console.log(`dunning: ${dunning.status}, attempts ${dunning.attemptsUsed}/${dunning.maxAttempts}`);
if (dunning.nextAttemptAt) console.log(`next retry at ${dunning.nextAttemptAt}`);
