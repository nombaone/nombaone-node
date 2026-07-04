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

import { Nombaone } from './client.js';
export default Nombaone;
