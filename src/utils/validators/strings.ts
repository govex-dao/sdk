import { SDKValidationError } from './error';

/**
 * Validate a non-empty string
 */
export function validateNonEmptyString(value: string, fieldName = 'value'): void {
    if (typeof value !== 'string') {
        throw new SDKValidationError(`${fieldName} must be a string`, fieldName, value);
    }

    if (value.length === 0) {
        throw new SDKValidationError(`${fieldName} cannot be empty`, fieldName, value);
    }
}

/**
 * Validate string length
 */
export function validateStringLength(value: string, minLength: number, maxLength: number, fieldName = 'value'): void {
    validateNonEmptyString(value, fieldName);

    if (value.length < minLength) {
        throw new SDKValidationError(
            `${fieldName} must be at least ${minLength} characters, got ${value.length}`,
            fieldName,
            value
        );
    }

    if (value.length > maxLength) {
        throw new SDKValidationError(
            `${fieldName} must be at most ${maxLength} characters, got ${value.length}`,
            fieldName,
            value
        );
    }
}


/**
 * Validate vault name
 */
export function validateVaultName(name: string): void {
    validateStringLength(name, 1, 64, 'vaultName');

    // Vault names should be alphanumeric with underscores
    if (!name.match(/^[a-zA-Z][a-zA-Z0-9_]*$/)) {
        throw new SDKValidationError(
            `Vault name must start with a letter and contain only letters, numbers, and underscores: "${name}"`,
            'vaultName',
            name
        );
    }
}

/**
 * Validate package name
 */
export function validatePackageName(name: string): void {
    validateStringLength(name, 1, 128, 'packageName');

    // Package names should be valid Move identifiers
    if (!name.match(/^[a-z][a-z0-9_]*$/)) {
        throw new SDKValidationError(
            `Package name must be a valid Move identifier (lowercase, starts with letter): "${name}"`,
            'packageName',
            name
        );
    }
}

/**
 * Set of primitive Move types
 */
const PRIMITIVE_TYPES = new Set([
    'u8',
    'u16',
    'u32',
    'u64',
    'u128',
    'u256',
    'bool',
    'address',
]);

/**
 * Validate a Move type string
 *
 * Ensures type arguments are properly formatted before passing to tx.moveCall.
 * Prevents cryptic runtime errors from malformed type strings.
 *
 * @param typeStr - Move type string to validate
 * @param fieldName - Optional field name for better error messages
 * @throws {SDKValidationError} If type string is invalid
 *
 * @example Valid types
 * ```typescript
 * validateMoveType('u64');                           // Primitive
 * validateMoveType('bool');                          // Primitive
 * validateMoveType('0x2::coin::Coin');              // Fully qualified
 * validateMoveType('0x2::coin::Coin<0x2::sui::SUI>'); // Generic
 * ```
 */
export function validateMoveType(typeStr: string, fieldName = 'type'): void {
    // Allow primitive types
    if (PRIMITIVE_TYPES.has(typeStr)) {
        return;
    }

    validateNonEmptyString(typeStr, fieldName);

    // Basic Move type format: 0x...::module::Type or 0x...::module::Type<...>
    if (!typeStr.match(/^0x[a-fA-F0-9]+::[a-zA-Z_][a-zA-Z0-9_]*::[a-zA-Z_][a-zA-Z0-9_]*(<.*>)?$/)) {
        throw new SDKValidationError(
            `Invalid Move type format for ${fieldName}: "${typeStr}". Expected format: 0x...::module::Type or primitive (u8, u64, bool, etc.)`,
            fieldName,
            typeStr
        );
    }
}

/**
 * Validate multiple Move type strings
 *
 * Convenience function for validating arrays of type arguments.
 *
 * @param types - Array of Move type strings
 * @param fieldNames - Optional array of field names (must match length)
 * @throws {SDKValidationError} If any type string is invalid
 *
 * @example
 * ```typescript
 * validateMoveTypes(
 *   ['0x2::coin::Coin<0x2::sui::SUI>', 'bool', 'u64'],
 *   ['coinType', 'flag', 'amount']
 * );
 * ```
 */
export function validateMoveTypes(types: string[], fieldNames?: string[]): void {
    if (fieldNames && fieldNames.length !== types.length) {
        throw new SDKValidationError(
            'fieldNames length must match types length',
            'fieldNames',
            { typesLength: types.length, fieldNamesLength: fieldNames.length }
        );
    }

    types.forEach((type, index) => {
        const fieldName = fieldNames?.[index] ?? `type[${index}]`;
        validateMoveType(type, fieldName);
    });
}