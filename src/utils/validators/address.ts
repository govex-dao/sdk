import { SDKValidationError } from './error';

/**
 * Validate a Sui address
 * @param address - Address to validate
 * @param fieldName - Field name for error messages
 */
export function validateSuiAddress(address: string, fieldName = 'address'): void {
    if (typeof address !== 'string') {
        throw new SDKValidationError(`${fieldName} must be a string`, fieldName, address);
    }

    // Sui addresses are 32 bytes = 64 hex chars, prefixed with 0x
    if (!address.match(/^0x[a-fA-F0-9]{64}$/)) {
        throw new SDKValidationError(
            `Invalid Sui address for ${fieldName}: expected 0x followed by 64 hex characters, got "${address}"`,
            fieldName,
            address
        );
    }
}

/**
 * Validate an optional Sui address
 */
export function validateOptionalSuiAddress(address: string | undefined | null, fieldName = 'address'): void {
    if (address !== undefined && address !== null) {
        validateSuiAddress(address, fieldName);
    }
}


/**
 * Validate a Sui object ID
 * @param id - Object ID to validate
 * @param fieldName - Field name for error messages
 */
export function validateObjectId(id: string, fieldName = 'objectId'): void {
    // Object IDs have the same format as addresses
    validateSuiAddress(id, fieldName);
}