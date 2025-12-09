/**
 * SDK Validation Error
 *
 * Custom error class for SDK validation errors with field context.
 *
 * @module utils/validators/error
 */

/**
 * Custom error class for SDK validation errors
 */
export class SDKValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown
  ) {
    super(message);
    this.name = 'SDKValidationError';
  }
}
