import { SDKValidationError } from './error';

/**
 * Validate a number is within u64 range
 *
 * JavaScript numbers can exceed u64 max (2^64 - 1), which causes
 * runtime errors when passed to Move functions expecting u64.
 *
 * @param value - Number to validate
 * @param fieldName - Optional field name for better error messages
 * @throws {SDKValidationError} If value is out of u64 range
 *
 * @example
 * ```typescript
 * validateU64(1000);                    // OK
 * validateU64(Number.MAX_SAFE_INTEGER); // OK
 * validateU64(-1);                      // Error: negative
 * validateU64(1.5);                     // Error: not integer
 * ```
 */
export function validateU64(value: number | bigint, fieldName = 'value'): void {
  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw new SDKValidationError(`${fieldName} must be >= 0, got ${value}`, fieldName, value);
    }
    if (value > 18446744073709551615n) {
      throw new SDKValidationError(`${fieldName} must be <= 2^64 - 1, got ${value}`, fieldName, value);
    }
    return;
  }

  if (typeof value !== 'number') {
    throw new SDKValidationError(`${fieldName} must be a number or bigint, got ${typeof value}`, fieldName, value);
  }

  if (!Number.isInteger(value)) {
    throw new SDKValidationError(`${fieldName} must be an integer, got ${value}`, fieldName, value);
  }

  if (value < 0) {
    throw new SDKValidationError(`${fieldName} must be >= 0, got ${value}`, fieldName, value);
  }

  if (value > Number.MAX_SAFE_INTEGER) {
    throw new SDKValidationError(
      `${fieldName} exceeds MAX_SAFE_INTEGER (${Number.MAX_SAFE_INTEGER}). Use bigint for larger values.`,
      fieldName,
      value
    );
  }
}

/**
 * Validate a positive amount (bigint)
 */
export function validatePositiveAmount(amount: bigint, fieldName = 'amount'): void {
    if (typeof amount !== 'bigint') {
      throw new SDKValidationError(`${fieldName} must be a bigint`, fieldName, amount);
    }
  
    if (amount <= 0n) {
      throw new SDKValidationError(`${fieldName} must be positive, got ${amount}`, fieldName, amount);
    }
  }
  
  /**
   * Validate a non-negative amount (bigint)
   */
  export function validateNonNegativeAmount(amount: bigint, fieldName = 'amount'): void {
    if (typeof amount !== 'bigint') {
      throw new SDKValidationError(`${fieldName} must be a bigint`, fieldName, amount);
    }
  
    if (amount < 0n) {
      throw new SDKValidationError(`${fieldName} must be non-negative, got ${amount}`, fieldName, amount);
    }
  }
  
  /**
   * Validate an amount is within range
   */
  export function validateAmountInRange(amount: bigint, min: bigint, max: bigint, fieldName = 'amount'): void {
    validateNonNegativeAmount(amount, fieldName);
  
    if (amount < min) {
      throw new SDKValidationError(`${fieldName} must be at least ${min}, got ${amount}`, fieldName, amount);
    }
  
    if (amount > max) {
      throw new SDKValidationError(`${fieldName} must be at most ${max}, got ${amount}`, fieldName, amount);
    }
  }