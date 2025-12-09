/**
 * Miscellaneous Validators
 *
 * Various validation functions that don't fit other categories.
 *
 * @module utils/validators/misc
 */

import { SDKValidationError } from './error';

/**
 * Validate boolean
 */
export function validateBoolean(value: unknown, fieldName = 'value'): void {
  if (typeof value !== 'boolean') {
    throw new SDKValidationError(`${fieldName} must be a boolean`, fieldName, value);
  }
}

/**
 * Validate a package digest (32 bytes as hex or Uint8Array)
 */
export function validateDigest(digest: string | Uint8Array, fieldName = 'digest'): void {
  if (typeof digest === 'string') {
    // Hex string: 64 characters (32 bytes)
    if (!digest.match(/^[a-fA-F0-9]{64}$/)) {
      throw new SDKValidationError(
        `${fieldName} must be 32 bytes (64 hex characters), got "${digest}"`,
        fieldName,
        digest
      );
    }
  } else if (digest instanceof Uint8Array) {
    if (digest.length !== 32) {
      throw new SDKValidationError(
        `${fieldName} must be 32 bytes, got ${digest.length} bytes`,
        fieldName,
        digest
      );
    }
  } else {
    throw new SDKValidationError(`${fieldName} must be a hex string or Uint8Array`, fieldName, digest);
  }
}

/**
 * Validate basis points (0-10000)
 */
export function validateBasisPoints(bps: number, fieldName = 'basisPoints'): void {
  if (typeof bps !== 'number' || !Number.isInteger(bps)) {
    throw new SDKValidationError(`${fieldName} must be an integer`, fieldName, bps);
  }

  if (bps < 0 || bps > 10000) {
    throw new SDKValidationError(
      `${fieldName} must be between 0 and 10000 (0% to 100%), got ${bps}`,
      fieldName,
      bps
    );
  }
}
