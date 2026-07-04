/**
 * A webhook receiver with verification, dedupe, and typed narrowing — on
 * plain node:http so it runs with zero extra dependencies. The same three
 * rules apply in Express/Fastify/Next.js: raw body in, verify before parse,
 * dedupe on event.event.id.
 *
 * Run:
 *   NOMBAONE_WEBHOOK_SECRET=… pnpm exec tsx examples/04-webhooks-server.ts
 * Then register http://<your-tunnel>/hooks as an endpoint, or fire
 * nombaone.sandbox.simulateWebhook from another script.
 */
import { createServer } from 'node:http';

import { webhooks, WebhookVerificationError } from '../src/index.js';

const secret = process.env.NOMBAONE_WEBHOOK_SECRET ?? '';
const seen = new Set<string>(); // use a persistent store in production

const server = createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/hooks') {
    res.writeHead(404).end();
    return;
  }

  // Rule 1: capture the RAW body — verify the exact bytes, never re-serialize.
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    const rawBody = Buffer.concat(chunks);
    try {
      // Rule 2: verify before you trust anything in the payload.
      const event = webhooks.constructEvent(
        rawBody,
        req.headers['x-nombaone-signature'] as string,
        secret
      );

      // Rule 3: delivery is at-least-once — dedupe on the event id.
      if (seen.has(event.event.id)) {
        res.writeHead(200).end('duplicate');
        return;
      }
      seen.add(event.event.id);

      // Respond 2xx fast; do heavy work async. Narrowing is fully typed:
      switch (event.type) {
        case 'invoice.paid':
          console.log(`unlock access for ${event.data.reference}`);
          break;
        case 'invoice.payment_failed':
          console.log(`payment failed (${event.data.reason}) — dunning is on it`);
          break;
        case 'invoice.action_required':
          console.log(`send customer to ${event.data.checkoutLink}`);
          break;
        default:
          console.log(`received ${event.type}`);
      }
      res.writeHead(200).end('ok');
    } catch (error) {
      if (error instanceof WebhookVerificationError) {
        console.warn(`rejected delivery: ${error.message}`);
        res.writeHead(400).end('bad signature');
        return;
      }
      throw error;
    }
  });
});

server.listen(4242, () => console.log('listening on http://localhost:4242/hooks'));
