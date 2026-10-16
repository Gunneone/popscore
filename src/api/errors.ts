import type { LookupError } from '../types';

export class ApiError extends Error {
  constructor(
    readonly code: LookupError,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function toLookupError(err: unknown): LookupError {
  return err instanceof ApiError ? err.code : 'unknown';
}
