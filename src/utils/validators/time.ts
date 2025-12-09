import { SDKValidationError } from './error';

/**
 * Validate a timestamp in milliseconds
 */
export function validateTimestampMs(timestamp: number, fieldName = 'timestamp'): void {
    if (typeof timestamp !== 'number' || !Number.isInteger(timestamp)) {
      throw new SDKValidationError(`${fieldName} must be an integer`, fieldName, timestamp);
    }
  
    if (timestamp < 0) {
      throw new SDKValidationError(`${fieldName} must be non-negative`, fieldName, timestamp);
    }
  
    // Reasonable range check (year 2000 to year 2100 in ms)
    const minMs = 946684800000; // 2000-01-01
    const maxMs = 4102444800000; // 2100-01-01
  
    if (timestamp !== 0 && (timestamp < minMs || timestamp > maxMs)) {
      throw new SDKValidationError(
        `${fieldName} appears to be invalid (${timestamp}). Expected milliseconds between 2000 and 2100.`,
        fieldName,
        timestamp
      );
    }
  }
  
  /**
   * Validate a future timestamp
   */
  export function validateFutureTimestamp(timestamp: number, fieldName = 'timestamp'): void {
    validateTimestampMs(timestamp, fieldName);
  
    const now = Date.now();
    if (timestamp <= now) {
      throw new SDKValidationError(
        `${fieldName} must be in the future. Got ${new Date(timestamp).toISOString()}, current time is ${new Date(now).toISOString()}`,
        fieldName,
        timestamp
      );
    }
  }

  /**
 * Validate a duration in milliseconds
 */
export function validateDurationMs(duration: number | bigint, fieldName = 'duration'): void {
    const durationNum = typeof duration === 'bigint' ? Number(duration) : duration;
  
    if (durationNum <= 0) {
      throw new SDKValidationError(`${fieldName} must be positive`, fieldName, duration);
    }
  
    // Max duration: 10 years in ms
    const maxDuration = 10 * 365 * 24 * 60 * 60 * 1000;
    if (durationNum > maxDuration) {
      throw new SDKValidationError(
        `${fieldName} exceeds maximum of 10 years (${maxDuration}ms)`,
        fieldName,
        duration
      );
    }
  }