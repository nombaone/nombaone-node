/**
 * The lifecycle beyond create: upgrade with proration, preview the next
 * invoice, pause/resume, and cancel at period end.
 *
 * Run:
 *   NOMBAONE_API_KEY=nbo_sandbox_… pnpm exec tsx examples/03-subscription-lifecycle.ts
 */
import Nombaone from '../src/index.js';

const nombaone = new Nombaone(process.env.NOMBAONE_API_KEY, {
  ...(process.env.NOMBAONE_BASE_URL ? { baseUrl: process.env.NOMBAONE_BASE_URL } : {}),
});

// Setup: plan with two tiers, a customer, a working test card, a subscription.
const plan = await nombaone.plans.create({ name: `Lifecycle ${Date.now()}` });
const basic = await nombaone.plans.prices.create(plan.id, {
  unitAmountInKobo: 100_000, // ₦1,000
  interval: 'month',
});
const pro = await nombaone.plans.prices.create(plan.id, {
  unitAmountInKobo: 250_000, // ₦2,500
  interval: 'month',
});
const customer = await nombaone.customers.create({
  email: `lifecycle+${Date.now()}@example.com`,
  name: 'Lifecycle Demo',
});
const method = await nombaone.sandbox.createPaymentMethod({ customerId: customer.id });
let subscription = await nombaone.subscriptions.create({
  customerId: customer.id,
  priceId: basic.id,
  paymentMethodId: method.id,
});
console.log(`created ${subscription.id} on basic (${subscription.status})`);

// Upgrade mid-cycle — prorations land on the next invoice by default.
subscription = await nombaone.subscriptions.change(subscription.id, { priceId: pro.id });
console.log('upgraded to pro with prorations');

// Preview what the next cycle will charge — nothing is stored or moved.
const upcoming = await nombaone.subscriptions.retrieveUpcomingInvoice(subscription.id);
console.log(`upcoming invoice: ₦${(upcoming.amountDueInKobo / 100).toFixed(2)}`);
for (const line of upcoming.lineItems) {
  console.log(`  ${line.kind}: ${line.description} — ${line.amountInKobo} kobo`);
}

// Pause and resume.
subscription = await nombaone.subscriptions.pause(subscription.id, { maxDays: 30 });
console.log(`paused (${subscription.status})`);
subscription = await nombaone.subscriptions.resume(subscription.id);
console.log(`resumed (${subscription.status})`);

// Cancel at period end — access continues until the cycle closes.
subscription = await nombaone.subscriptions.cancel(subscription.id, { mode: 'at_period_end' });
console.log(`cancelAtPeriodEnd=${subscription.cancelAtPeriodEnd}, status=${subscription.status}`);
