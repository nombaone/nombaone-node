import type { Nombaone } from '../client.js';

/** Base class every API resource namespace extends. */
export abstract class APIResource {
  protected _client: Nombaone;

  constructor(client: Nombaone) {
    this._client = client;
  }
}

/** Encode one path segment (ids come from user input — never trust raw). */
export const seg = (value: string): string => encodeURIComponent(value);
