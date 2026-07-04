/**
 * The typed outbound event catalog — one union member per event type the
 * platform emits, mirrored from the API's frozen catalog. Narrow on `type`
 * and `data` narrows with it.
 */

/** Common shape of every signed delivery body. */
export interface WebhookEventBase<TType extends string, TData> {
  /** The delivery reference (`nbo…whd`) — unique per delivery attempt-target. */
  id: string;
  type: TType;
  /**
   * The underlying domain event. **Dedupe on `event.id`** (`nbo…evt`) —
   * delivery is at-least-once, and replays keep this id stable.
   */
  event: { id: string; type: string; createdAt: string };
  data: TData;
}

interface RefData {
  /** The affected resource's public id (`nbo…`). */
  reference: string;
  [key: string]: unknown;
}

export type CustomerCreatedEvent = WebhookEventBase<'customer.created', RefData>;
export type CustomerUpdatedEvent = WebhookEventBase<'customer.updated', RefData>;

export type CouponCreatedEvent = WebhookEventBase<'coupon.created', RefData & { code: string }>;

export type DiscountCreatedEvent = WebhookEventBase<'discount.created', RefData>;
export type DiscountRemovedEvent = WebhookEventBase<'discount.removed', RefData>;

export type PlanCreatedEvent = WebhookEventBase<'plan.created', RefData>;
export type PlanUpdatedEvent = WebhookEventBase<'plan.updated', RefData>;
export type PlanArchivedEvent = WebhookEventBase<'plan.archived', RefData>;

export type PriceCreatedEvent = WebhookEventBase<'price.created', RefData>;
export type PriceDeactivatedEvent = WebhookEventBase<'price.deactivated', RefData>;

export type SubscriptionCreatedEvent = WebhookEventBase<
  'subscription.created',
  RefData & { status: string }
>;
export type SubscriptionUpdatedEvent = WebhookEventBase<'subscription.updated', RefData>;
export type SubscriptionTrialWillEndEvent = WebhookEventBase<
  'subscription.trial_will_end',
  RefData
>;
export type SubscriptionActivatedEvent = WebhookEventBase<'subscription.activated', RefData>;
export type SubscriptionPausedEvent = WebhookEventBase<'subscription.paused', RefData>;
export type SubscriptionResumedEvent = WebhookEventBase<'subscription.resumed', RefData>;
/** Voluntary cancellation. */
export type SubscriptionCanceledEvent = WebhookEventBase<'subscription.canceled', RefData>;
/** Involuntary cancellation — dunning exhausted. */
export type SubscriptionChurnedEvent = WebhookEventBase<'subscription.churned', RefData>;

export type InvoiceCreatedEvent = WebhookEventBase<'invoice.created', RefData>;
export type InvoiceFinalizedEvent = WebhookEventBase<'invoice.finalized', RefData>;
export type InvoicePaidEvent = WebhookEventBase<'invoice.paid', RefData>;
export type InvoicePaymentFailedEvent = WebhookEventBase<
  'invoice.payment_failed',
  RefData & { reason: string }
>;
export type InvoicePaymentPartiallyCollectedEvent = WebhookEventBase<
  'invoice.payment_partially_collected',
  RefData & { amountPaid: number; amountRemaining: number }
>;
export type InvoicePaymentRecoveredEvent = WebhookEventBase<'invoice.payment_recovered', RefData>;
/** A card charge needs customer authentication; send them to `checkoutLink`. */
export type InvoiceActionRequiredEvent = WebhookEventBase<
  'invoice.action_required',
  RefData & { reason: string; checkoutLink: string }
>;
export type InvoiceVoidedEvent = WebhookEventBase<'invoice.voided', RefData>;

export type PaymentMethodAttachedEvent = WebhookEventBase<
  'payment_method.attached',
  RefData & { kind: string; status: string }
>;
export type PaymentMethodUpdatedEvent = WebhookEventBase<
  'payment_method.updated',
  RefData & { subscription: string }
>;
export type PaymentMethodExpiringEvent = WebhookEventBase<
  'payment_method.expiring',
  RefData & { reason: string }
>;

export type SettlementCreatedEvent = WebhookEventBase<'settlement.created', RefData>;
export type SettlementRefundedEvent = WebhookEventBase<'settlement.refunded', RefData>;
export type SettlementPayoutCreatedEvent = WebhookEventBase<'settlement.payout_created', RefData>;

/** @deprecated Reference-scaffold event; not part of the billing product. */
export type ExampleCreatedEvent = WebhookEventBase<'example.created', RefData>;
/** @deprecated Reference-scaffold event; not part of the billing product. */
export type ExampleSettledEvent = WebhookEventBase<'example.settled', RefData>;

/**
 * Every event the platform can deliver, discriminated on `type`.
 *
 * @example
 * ```ts
 * const event = nombaone.webhooks.constructEvent(rawBody, header, secret);
 * switch (event.type) {
 *   case 'invoice.payment_failed':
 *     console.log(event.data.reason); // typed
 *     break;
 *   case 'invoice.action_required':
 *     await email(customer, event.data.checkoutLink); // typed
 *     break;
 * }
 * ```
 */
export type WebhookEvent =
  | CustomerCreatedEvent
  | CustomerUpdatedEvent
  | CouponCreatedEvent
  | DiscountCreatedEvent
  | DiscountRemovedEvent
  | PlanCreatedEvent
  | PlanUpdatedEvent
  | PlanArchivedEvent
  | PriceCreatedEvent
  | PriceDeactivatedEvent
  | SubscriptionCreatedEvent
  | SubscriptionUpdatedEvent
  | SubscriptionTrialWillEndEvent
  | SubscriptionActivatedEvent
  | SubscriptionPausedEvent
  | SubscriptionResumedEvent
  | SubscriptionCanceledEvent
  | SubscriptionChurnedEvent
  | InvoiceCreatedEvent
  | InvoiceFinalizedEvent
  | InvoicePaidEvent
  | InvoicePaymentFailedEvent
  | InvoicePaymentPartiallyCollectedEvent
  | InvoicePaymentRecoveredEvent
  | InvoiceActionRequiredEvent
  | InvoiceVoidedEvent
  | PaymentMethodAttachedEvent
  | PaymentMethodUpdatedEvent
  | PaymentMethodExpiringEvent
  | SettlementCreatedEvent
  | SettlementRefundedEvent
  | SettlementPayoutCreatedEvent
  | ExampleCreatedEvent
  | ExampleSettledEvent
  // Open catalog: an event type added by the API tomorrow still parses today.
  | WebhookEventBase<string & {}, Record<string, unknown>>;

export type WebhookEventType = WebhookEvent['type'];
