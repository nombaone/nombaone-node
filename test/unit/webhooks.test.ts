import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { WebhookVerificationError, webhooks } from '../../src/index.js';

const SECRET = 'nbo_whsec_0123456789abcdef0123456789abcdef';

const eventBody = (over?: Record<string, unknown>) =>
  JSON.stringify({
    id: 'nbo000000000001whd',
    type: 'invoice.payment_failed',
    event: {
      id: 'nbo000000000001evt',
      type: 'invoice.payment_failed',
      createdAt: '2026-07-04T10:00:00.000Z',
    },
    data: { reference: 'nbo000000000001inv', reason: 'insufficient_funds' },
    ...over,
  });

const sign = (payload: string, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) =>
  `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')}`;

describe('webhooks.verifySignature', () => {
  it('accepts a correctly signed payload (string and Buffer)', () => {
    const payload = eventBody();
    const header = sign(payload);
    expect(() => webhooks.verifySignature(payload, header, SECRET)).not.toThrow();
    expect(() => webhooks.verifySignature(Buffer.from(payload), header, SECRET)).not.toThrow();
  });

  it('matches the documented algorithm exactly: HMAC-SHA256(secret, `${t}.${body}`) hex', () => {
    const payload = '{"a":1}';
    const t = 1_751_600_000;
    const expected = createHmac('sha256', SECRET).update(`${t}.${payload}`).digest('hex');
    expect(() =>
      webhooks.verifySignature(payload, `t=${t},v1=${expected}`, SECRET, {
        tolerance: Number.MAX_SAFE_INTEGER,
      })
    ).not.toThrow();
  });

  it('rejects a tampered payload', () => {
    const payload = eventBody();
    const header = sign(payload);
    const tampered = payload.replace('insufficient_funds', 'do_not_honor');
    expect(() => webhooks.verifySignature(tampered, header, SECRET)).toThrowError(
      /signature verification failed/
    );
  });

  it('rejects the wrong secret', () => {
    const payload = eventBody();
    expect(() => webhooks.verifySignature(payload, sign(payload), 'nbo_whsec_wrong')).toThrowError(
      WebhookVerificationError
    );
  });

  it('rejects a stale timestamp beyond the 300s default tolerance', () => {
    const payload = eventBody();
    const stale = Math.floor(Date.now() / 1000) - 301;
    expect(() => webhooks.verifySignature(payload, sign(payload, SECRET, stale), SECRET)).toThrowError(
      /tolerance/
    );
  });

  it('accepts a timestamp just inside tolerance, and honors a custom tolerance', () => {
    const payload = eventBody();
    const fresh = Math.floor(Date.now() / 1000) - 290;
    expect(() =>
      webhooks.verifySignature(payload, sign(payload, SECRET, fresh), SECRET)
    ).not.toThrow();

    const old = Math.floor(Date.now() / 1000) - 400;
    expect(() =>
      webhooks.verifySignature(payload, sign(payload, SECRET, old), SECRET, { tolerance: 600 })
    ).not.toThrow();
  });

  it('rejects future-dated timestamps beyond tolerance (clock-skew symmetric)', () => {
    const payload = eventBody();
    const future = Math.floor(Date.now() / 1000) + 400;
    expect(() =>
      webhooks.verifySignature(payload, sign(payload, SECRET, future), SECRET)
    ).toThrowError(/tolerance/);
  });

  it('accepts any matching v1 among several (secret rotation)', () => {
    const payload = eventBody();
    const t = Math.floor(Date.now() / 1000);
    const good = createHmac('sha256', SECRET).update(`${t}.${payload}`).digest('hex');
    const stale = createHmac('sha256', 'nbo_whsec_old').update(`${t}.${payload}`).digest('hex');
    const header = `t=${t},v1=${stale},v1=${good}`;
    expect(() => webhooks.verifySignature(payload, header, SECRET)).not.toThrow();
  });

  it('throws distinct errors for missing header, malformed header, and missing secret', () => {
    const payload = eventBody();
    expect(() => webhooks.verifySignature(payload, '', SECRET)).toThrowError(/Missing X-Nombaone/);
    expect(() => webhooks.verifySignature(payload, 'garbage', SECRET)).toThrowError(/Malformed/);
    expect(() => webhooks.verifySignature(payload, 'ate=1,vx=2', SECRET)).toThrowError(/Malformed/);
    expect(() => webhooks.verifySignature(payload, sign(payload), '')).toThrowError(
      /Missing signing secret/
    );
  });
});

describe('webhooks.constructEvent', () => {
  it('verifies then returns the typed event; narrowing works', () => {
    const payload = eventBody();
    const event = webhooks.constructEvent(payload, sign(payload), SECRET);

    expect(event.event.id).toBe('nbo000000000001evt');
    if (event.type === 'invoice.payment_failed') {
      expect(event.data.reason).toBe('insufficient_funds');
      expect(event.data.reference).toBe('nbo000000000001inv');
    } else {
      throw new Error('expected invoice.payment_failed');
    }
  });

  it('synthesizes event.id from a flat legacy body so dedupe still works', () => {
    const flat = JSON.stringify({
      id: 'evt_flat_1',
      type: 'invoice.paid',
      createdAt: '2026-07-04T10:00:00.000Z',
      data: { reference: 'nbo000000000001inv' },
    });
    const event = webhooks.constructEvent(flat, sign(flat), SECRET);
    expect(event.event.id).toBe('evt_flat_1');
    expect(event.event.type).toBe('invoice.paid');
  });

  it('rejects non-JSON payloads after signature check', () => {
    const payload = 'not json';
    expect(() => webhooks.constructEvent(payload, sign(payload), SECRET)).toThrowError(
      /not valid JSON/
    );
  });

  it('round-trips with generateTestHeader', () => {
    const payload = eventBody({ type: 'invoice.paid' });
    const header = webhooks.generateTestHeader({ payload, secret: SECRET });
    const event = webhooks.constructEvent(payload, header, SECRET);
    expect(event.type).toBe('invoice.paid');
  });

  it('generateTestHeader with an explicit old timestamp fails tolerance (proves t is signed)', () => {
    const payload = eventBody();
    const header = webhooks.generateTestHeader({
      payload,
      secret: SECRET,
      timestamp: Math.floor(Date.now() / 1000) - 3_600,
    });
    expect(() => webhooks.constructEvent(payload, header, SECRET)).toThrowError(/tolerance/);
  });
});
