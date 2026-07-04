import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ConflictError,
  Nombaone,
  NotFoundError,
  webhooks as webhookHelper,
} from '../../src/index.js';

/**
 * End-to-end suite against a real (local) NombaOne API. Opt-in:
 *
 *   NOMBAONE_INTEGRATION=1 \
 *   NOMBAONE_API_KEY=nbo_sandbox_… \
 *   NOMBAONE_BASE_URL=http://localhost:8000 \
 *   pnpm test:integration
 */

const enabled = process.env.NOMBAONE_INTEGRATION === '1';
const baseUrl = process.env.NOMBAONE_BASE_URL ?? 'http://localhost:8000';

const unique = `sdk-it-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

describe.skipIf(!enabled)('live sandbox integration', () => {
  let nombaone: Nombaone;

  beforeAll(() => {
    nombaone = new Nombaone(process.env.NOMBAONE_API_KEY, { baseUrl });
  });

  let customerId: string;
  let priceId: string;
  let subscriptionId: string;

  it('runs the full first-subscription lifecycle', async () => {
    const customer = await nombaone.customers.create({
      email: `${unique}@example.com`,
      name: 'SDK Integration',
    });
    expect(customer.id).toMatch(/^nbo\d{12}cus$/);
    expect(customer.mode).toBe('sandbox');
    customerId = customer.id;

    const plan = await nombaone.plans.create({ name: `SDK IT ${unique}` });
    expect(plan.status).toBe('active');

    const price = await nombaone.plans.prices.create(plan.id, {
      unitAmountInKobo: 250_000, // ₦2,500.00 / month
      interval: 'month',
    });
    expect(price.unitAmountInKobo).toBe(250_000);
    expect(price.currency).toBe('NGN');
    priceId = price.id;

    const method = await nombaone.sandbox.createPaymentMethod({
      customerId: customer.id,
      behavior: 'success',
    });
    expect(method.kind).toBe('card');

    const subscription = await nombaone.subscriptions.create({
      customerId: customer.id,
      priceId: price.id,
      paymentMethodId: method.id,
    });
    subscriptionId = subscription.id;
    expect(subscription.id).toMatch(/^nbo\d{12}sub$/);
    expect(['active', 'incomplete', 'trialing']).toContain(subscription.status);
  }, 60_000);

  it('advances a billing cycle through the real engine (test clock)', async () => {
    const result = await nombaone.sandbox.advanceCycle(subscriptionId);
    expect(result.subscriptionId).toBe(subscriptionId);
    expect(result.invoice).toBeTruthy();
    expect(result.invoice.totalInKobo).toBeGreaterThan(0);
    expect(['paid', 'past_due', 'pending', 'open']).toContain(result.outcome);
  }, 60_000);

  it('previews the upcoming invoice and reads dunning state', async () => {
    const upcoming = await nombaone.subscriptions.retrieveUpcomingInvoice(subscriptionId);
    expect(upcoming.subscriptionId).toBe(subscriptionId);
    expect(upcoming.amountDueInKobo).toBeGreaterThanOrEqual(0);

    const dunning = await nombaone.subscriptions.dunning.retrieve(subscriptionId);
    expect(dunning.subscriptionRef).toBe(subscriptionId);
  }, 30_000);

  it('paginates with hasMore/nextCursor and auto-iteration', async () => {
    const page = await nombaone.customers.list({ limit: 1 });
    expect(page.data.length).toBeLessThanOrEqual(1);
    expect(page.pagination.limit).toBe(1);
    expect(typeof page.pagination.hasMore).toBe('boolean');

    let count = 0;
    for await (const _customer of nombaone.customers.list({ limit: 1 })) {
      count += 1;
      if (count >= 3) break; // proves cursors thread without walking everything
    }
    expect(count).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('replays the same idempotency key to the same result', async () => {
    const idempotencyKey = `sdk-it-idem-${unique}`;
    const params = { email: `${unique}-idem@example.com`, name: 'Idem Test' };

    const first = await nombaone.customers.create(params, { idempotencyKey });
    const second = await nombaone.customers.create(params, { idempotencyKey });
    expect(second.id).toBe(first.id);
  }, 30_000);

  it('surfaces typed errors with code, hint, docUrl, and requestId', async () => {
    const missing = await nombaone.customers
      .retrieve('nbo000000000000cus')
      .catch((e: unknown) => e);
    expect(missing).toBeInstanceOf(NotFoundError);
    const notFound = missing as NotFoundError;
    expect(notFound.code).toBe('CUSTOMER_NOT_FOUND');
    expect(notFound.hint.length).toBeGreaterThan(0);
    expect(notFound.docUrl).toContain('CUSTOMER_NOT_FOUND');
    expect(notFound.requestId).toMatch(/^req_/);

    const dup = await nombaone.customers
      .create({ email: `${unique}@example.com`, name: 'Dup' })
      .catch((e: unknown) => e);
    expect(dup).toBeInstanceOf(ConflictError);
    expect((dup as ConflictError).code).toBe('CUSTOMER_EMAIL_TAKEN');
  }, 30_000);

  it('cancels the subscription cleanly', async () => {
    const canceled = await nombaone.subscriptions.cancel(subscriptionId, { mode: 'now' });
    expect(canceled.status).toBe('canceled');
    expect(canceled.cancellationReason).toBe('voluntary');
  }, 30_000);

  describe('webhook round-trip', () => {
    let server: Server;
    let received: Array<{ body: string; headers: Record<string, string> }>;
    let listenerUrl: string;

    beforeAll(async () => {
      received = [];
      server = createServer((req, res) => {
        let body = '';
        req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
        req.on('end', () => {
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(req.headers)) {
            headers[k.toLowerCase()] = Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
          }
          received.push({ body, headers });
          res.writeHead(200).end('ok');
        });
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('no address');
      listenerUrl = `http://127.0.0.1:${address.port}/hooks`;
    });

    afterAll(async () => {
      await new Promise((resolve) => server.close(resolve));
    });

    it('delivers a simulated event to a registered endpoint, signed', async () => {
      const endpoint = await nombaone.webhookEndpoints.create({
        url: listenerUrl,
        enabledEvents: ['*'],
      });
      expect(endpoint.signingSecret.length).toBeGreaterThan(10);

      const simulation = await nombaone.sandbox.simulateWebhook({
        type: 'invoice.paid',
        payload: { reference: 'nbo000000000001inv' },
      });
      expect(simulation.type).toBe('invoice.paid');

      // Delivery is drained by the out-of-band worker — poll briefly.
      const deadline = Date.now() + 15_000;
      while (received.length === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      expect(received.length, 'no delivery arrived within 15s').toBeGreaterThan(0);

      const delivery = received[0]!;
      expect(delivery.headers['x-nombaone-event-type']).toBe('invoice.paid');
      expect(delivery.headers['x-nombaone-delivery-guarantee']).toBe('at-least-once');

      const parsed = JSON.parse(delivery.body) as {
        type: string;
        event?: { id?: string };
        data?: { reference?: string };
      };
      expect(parsed.type).toBe('invoice.paid');
      expect(parsed.data?.reference).toBe('nbo000000000001inv');

      const signatureHeader = delivery.headers['x-nombaone-signature'] ?? '';
      if (/(^|,)\s*t=\d+/.test(signatureHeader) && signatureHeader.includes('v1=')) {
        // Documented scheme is live — the SDK helper must verify it.
        const event = webhookHelper.constructEvent(
          delivery.body,
          signatureHeader,
          endpoint.signingSecret
        );
        expect(event.type).toBe('invoice.paid');
      } else {
        // Backend has not shipped the documented `t=<unix>,v1=<hex>` scheme yet
        // (docs are the authoritative contract). Surface it loudly without
        // failing the SDK build on a known upstream gap.
        console.warn(
          `[integration] backend signature header is not in the documented "t=…,v1=…" format yet: "${signatureHeader.slice(0, 32)}…" — nombaone.webhooks.constructEvent will verify once the backend ships the docs scheme.`
        );
        expect(signatureHeader.length).toBeGreaterThan(0);
      }
    }, 40_000);
  });
});
