import { SDKValidationError } from './error';

/**
 * Validate a non-empty array
 */
export function validateNonEmptyArray<T>(arr: T[], fieldName = 'array'): void {
    if (!Array.isArray(arr)) {
      throw new SDKValidationError(`${fieldName} must be an array`, fieldName, arr);
    }
  
    if (arr.length === 0) {
      throw new SDKValidationError(`${fieldName} cannot be empty`, fieldName, arr);
    }
  }
  
  /**
   * Validate array length
   */
  export function validateArrayLength<T>(arr: T[], minLength: number, maxLength: number, fieldName = 'array'): void {
    if (!Array.isArray(arr)) {
      throw new SDKValidationError(`${fieldName} must be an array`, fieldName, arr);
    }
  
    if (arr.length < minLength) {
      throw new SDKValidationError(
        `${fieldName} must have at least ${minLength} elements, got ${arr.length}`,
        fieldName,
        arr
      );
    }
  
    if (arr.length > maxLength) {
      throw new SDKValidationError(
        `${fieldName} must have at most ${maxLength} elements, got ${arr.length}`,
        fieldName,
        arr
      );
    }
  }
  
  /**
   * Validate matching array lengths
   */
  export function validateMatchingArrayLengths<T, U>(arr1: T[], arr2: U[], name1: string, name2: string): void {
    if (arr1.length !== arr2.length) {
      throw new SDKValidationError(
        `${name1} and ${name2} must have the same length. Got ${arr1.length} and ${arr2.length}`,
        `${name1}/${name2}`,
        { [name1]: arr1.length, [name2]: arr2.length }
      );
    }
  }