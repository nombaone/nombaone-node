export { Nombaone, BASE_URLS, type NombaoneOptions } from './client.js';
export { APIPromise, type WithResponse } from './api-promise.js';
export { Page, PagePromise } from './pagination.js';
export {
  NombaoneError,
  APIError,
  BadRequestError,
  AuthenticationError,
  PermissionDeniedError,
  NotFoundError,
  ConflictError,
  ValidationError,
  RateLimitError,
  ServerError,
  ConnectionError,
  TimeoutError,
  WebhookVerificationError,
  type NombaoneErrorCode,
} from './error.js';
export type {
  ApiErrorEnvelope,
  ApiMeta,
  ApiPagination,
  ApiPaginatedEnvelope,
  ApiSuccessEnvelope,
  Kobo,
  Metadata,
  Mode,
  RequestOptions,
} from './core-types.js';
export { VERSION } from './version.js';

// Resources
export { Customers } from './resources/customers.js';
export type {
  Customer,
  CreditBalance,
  CreditGrant,
  CustomerApplyDiscountParams,
  CustomerCreateParams,
  CustomerGrantCreditParams,
  CustomerListParams,
  CustomerUpdateParams,
} from './resources/customers.js';
export type { Discount, DomainEvent, InvoiceLineItem } from './resources/shared.js';
export { Plans, PlanPrices } from './resources/plans.js';
export type {
  Plan,
  PlanCreateParams,
  PlanListParams,
  PlanPriceListParams,
  PlanUpdateParams,
} from './resources/plans.js';
export { Prices } from './resources/prices.js';
export type { Price, PriceCreateParams, PriceListParams } from './resources/prices.js';
export {
  Subscriptions,
  SubscriptionSchedules,
  SubscriptionDunning,
} from './resources/subscriptions.js';
export type {
  DunningAttempt,
  DunningAttemptStatus,
  DunningState,
  SchedulePhase,
  Subscription,
  SubscriptionApplyDiscountParams,
  SubscriptionCancelParams,
  SubscriptionChangeParams,
  SubscriptionCreateParams,
  SubscriptionItem,
  SubscriptionListEventsParams,
  SubscriptionListParams,
  SubscriptionPauseParams,
  SubscriptionResubscribeParams,
  SubscriptionScheduleCreateParams,
  SubscriptionScheduleObject,
  SubscriptionStatus,
  SubscriptionUpdateParams,
  SubscriptionUpdatePaymentMethodParams,
  UpcomingInvoice,
} from './resources/subscriptions.js';
export { Invoices } from './resources/invoices.js';
export type {
  Invoice,
  InvoiceListParams,
  InvoiceStatus,
  InvoiceVoidParams,
} from './resources/invoices.js';
export { Coupons } from './resources/coupons.js';
export type {
  Coupon,
  CouponCreateParams,
  CouponListParams,
  CouponUpdateParams,
} from './resources/coupons.js';

import { Nombaone } from './client.js';
export default Nombaone;
