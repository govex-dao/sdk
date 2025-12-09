
// ============================================================================
// ERROR TRANSLATION
// ============================================================================

import { MOVE_ERROR_CODES } from '../config/error-mapping';

/**
 * Parsed Move abort error with full details
 */
export interface ParsedMoveAbort {
    /** Package address (hex string with 0x prefix) */
    packageAddress: string;
    /** Module name */
    moduleName: string;
    /** Function name (if available) */
    functionName?: string;
    /** Function index */
    functionIndex?: number;
    /** Instruction index */
    instructionIndex?: number;
    /** Abort code */
    abortCode: number;
    /** Human-readable hint (if available from error mapping) */
    hint?: string;
}

/**
 * SDKError with additional context
 */
export class SDKMoveError extends Error {
    constructor(
        message: string,
        public readonly module: string,
        public readonly errorCode: number,
        public readonly originalError?: Error,
        public readonly parsed?: ParsedMoveAbort
    ) {
        super(message);
        this.name = 'SDKMoveError';
    }

    /**
     * Get a formatted error summary for logging
     */
    toFormattedString(): string {
        const lines: string[] = [];
        lines.push(`❌ Move Error: ${this.message}`);

        if (this.parsed) {
            lines.push('');
            lines.push('📍 Error Location:');
            lines.push(`   Package:  ${this.parsed.packageAddress}`);
            lines.push(`   Module:   ${this.parsed.moduleName}`);
            if (this.parsed.functionName) {
                lines.push(`   Function: ${this.parsed.functionName}`);
            }
            lines.push(`   Abort Code: ${this.parsed.abortCode}`);

            if (this.parsed.hint) {
                lines.push('');
                lines.push(`💡 Hint: ${this.parsed.hint}`);
            }
        }

        return lines.join('\n');
    }
}

/**
 * Parse a Move abort message to extract full error details
 *
 * Handles the standard MoveAbort format:
 * "MoveAbort(MoveLocation { module: ModuleId { address: 0x..., name: Identifier("module") }, function: N, instruction: M, function_name: Some("fn") }, CODE)"
 *
 * Also handles VM errors like VMVerificationOrDeserializationError and TypeArgumentError
 */
export function parseMoveAbort(errorMessage: string): ParsedMoveAbort | null {
    // Check for TypeArgumentError (type doesn't exist on-chain)
    const typeArgErrorPattern = /TypeArgumentError\s*\{\s*argument_idx:\s*(\d+),\s*kind:\s*(\w+)\s*\}(?: in command (\d+))?/;
    const typeArgErrorMatch = errorMessage.match(typeArgErrorPattern);

    if (typeArgErrorMatch) {
        const argumentIndex = parseInt(typeArgErrorMatch[1], 10);
        const errorKind = typeArgErrorMatch[2];
        const commandIndex = typeArgErrorMatch[3] ? parseInt(typeArgErrorMatch[3], 10) : undefined;
        return {
            packageAddress: 'unknown',
            moduleName: 'type_argument',
            functionIndex: commandIndex,
            abortCode: argumentIndex,
            hint: `TypeArgumentError - Type argument ${argumentIndex} ${errorKind === 'TypeNotFound' ? 'does not exist on-chain' : `error: ${errorKind}`}. ` +
                  'This usually means a Move type (like a coin type) was deleted when devnet was reset. ' +
                  'Run: npm run deploy-conditional-coins && npx tsx scripts/launchpad-e2e.ts && npx tsx scripts/proposal-e2e-with-swaps.ts',
        };
    }

    // Check for VMVerificationOrDeserializationError
    const vmErrorPattern = /VMVerificationOrDeserializationError(?: in command (\d+))?/;
    const vmErrorMatch = errorMessage.match(vmErrorPattern);

    if (vmErrorMatch) {
        const commandIndex = vmErrorMatch[1] ? parseInt(vmErrorMatch[1], 10) : undefined;
        return {
            packageAddress: 'unknown',
            moduleName: 'vm_verification',
            functionIndex: commandIndex,
            abortCode: -1,
            hint: 'VMVerificationOrDeserializationError - Type mismatch in Move call. This usually means the type arguments or number of arguments passed to a Move function do not match the function signature. Check that all type parameters and arguments are correct.',
        };
    }

    // Full MoveAbort pattern with all details
    const fullPattern = /MoveAbort\(MoveLocation \{ module: ModuleId \{ address: ([a-f0-9]+), name: Identifier\("([^"]+)"\) \}, function: (\d+), instruction: (\d+), function_name: Some\("([^"]+)"\) \}, (\d+)\)/;
    const fullMatch = errorMessage.match(fullPattern);

    if (fullMatch) {
        const [, pkgAddr, moduleName, funcIdx, instrIdx, funcName, abortCode] = fullMatch;
        const code = parseInt(abortCode, 10);
        const hint = getErrorHint(moduleName, code);

        return {
            packageAddress: `0x${pkgAddr}`,
            moduleName,
            functionName: funcName,
            functionIndex: parseInt(funcIdx, 10),
            instructionIndex: parseInt(instrIdx, 10),
            abortCode: code,
            hint,
        };
    }

    // Simpler pattern without function name
    const simplePattern = /module.*?address:\s*([a-f0-9]+).*?name:\s*(?:Identifier\(")?([\w_]+)(?:"\))?.*?},\s*(\d+)/;
    const simpleMatch = errorMessage.match(simplePattern);

    if (simpleMatch) {
        const [, pkgAddr, moduleName, abortCode] = simpleMatch;
        const code = parseInt(abortCode, 10);
        const hint = getErrorHint(moduleName, code);

        return {
            packageAddress: pkgAddr.startsWith('0x') ? pkgAddr : `0x${pkgAddr}`,
            moduleName,
            abortCode: code,
            hint,
        };
    }

    // Fallback: just extract module and code
    const fallbackPattern = /module.*?name:\s*(?:Identifier\(")?([\w_]+)(?:"\))?.*?},\s*(\d+)/;
    const fallbackMatch = errorMessage.match(fallbackPattern);

    if (fallbackMatch) {
        const [, moduleName, abortCode] = fallbackMatch;
        const code = parseInt(abortCode, 10);
        const hint = getErrorHint(moduleName, code);

        return {
            packageAddress: 'unknown',
            moduleName,
            abortCode: code,
            hint,
        };
    }

    return null;
}

/**
 * Get error hint from the error mapping
 */
export function getErrorHint(moduleName: string, code: number): string | undefined {
    // Try exact module match first
    for (const [moduleKey, codes] of Object.entries(MOVE_ERROR_CODES)) {
        // Check if moduleKey matches (either exact or partial match)
        if (
            moduleKey === moduleName ||
            moduleKey.endsWith(`::${moduleName}`) ||
            moduleName.includes(moduleKey.split('::').pop()!)
        ) {
            const hint = codes[code];
            if (hint) {
                return hint;
            }
        }
    }
    return undefined;
}

/**
 * Translate a Move error to a human-readable message
 */
export function translateMoveError(error: Error | string): SDKMoveError {
    const errorMessage = typeof error === 'string' ? error : error.message;

    const parsed = parseMoveAbort(errorMessage);

    if (!parsed) {
        // Could not parse, return generic error
        return new SDKMoveError(
            `Move execution failed: ${errorMessage}`,
            'unknown',
            -1,
            error instanceof Error ? error : undefined
        );
    }

    const { moduleName, abortCode, hint } = parsed;

    // Build human-readable message
    const message = hint
        ? `${hint} (${moduleName} error code ${abortCode})`
        : `Move execution failed in module "${moduleName}" with error code ${abortCode}`;

    return new SDKMoveError(
        message,
        moduleName,
        abortCode,
        error instanceof Error ? error : undefined,
        parsed
    );
}

/**
 * Parse transaction error from Sui client response
 *
 * Use this to extract Move abort details from transaction execution errors.
 *
 * @example
 * ```typescript
 * try {
 *     const result = await client.signAndExecuteTransaction(...);
 * } catch (error) {
 *     const parsed = parseTransactionError(error);
 *     if (parsed) {
 *         console.log(parsed.toFormattedString());
 *     }
 * }
 * ```
 */
export function parseTransactionError(error: unknown): SDKMoveError | null {
    // Handle various error shapes from Sui client
    const err = error as Record<string, unknown>;
    const cause = err?.cause as Record<string, unknown> | undefined;

    // Try to get error string from various locations
    let errorStr: string | undefined;

    if (cause?.effects) {
        const effects = cause.effects as Record<string, unknown>;
        const status = effects.status as Record<string, unknown> | undefined;
        errorStr = status?.error as string | undefined;
    } else if (err?.message) {
        errorStr = err.message as string;
    } else if (typeof error === 'string') {
        errorStr = error;
    }

    if (!errorStr) {
        return null;
    }

    return translateMoveError(errorStr);
}

/**
 * Wrap an async function to translate Move errors
 */
export function withErrorTranslation<T extends (...args: unknown[]) => Promise<unknown>>(
    fn: T
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
    return async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
        try {
            return (await fn(...args)) as Awaited<ReturnType<T>>;
        } catch (error) {
            if (error instanceof Error && error.message.includes('Move')) {
                throw translateMoveError(error);
            }
            throw error;
        }
    };
}


/**
 * Check if an error is a specific Move error
 */
export function isMoveError(error: unknown, module: string, code: number): boolean {
    if (error instanceof SDKMoveError) {
        return error.module.includes(module) && error.errorCode === code;
    }
    return false;
}

/**
 * Check if error is an insufficient balance error
 */
export function isInsufficientBalanceError(error: unknown): boolean {
    return isMoveError(error, 'vault', 1);
}

/**
 * Check if error is a DAO terminated error
 */
export function isDaoTerminatedError(error: unknown): boolean {
    return isMoveError(error, 'futarchy_config', 0) || isMoveError(error, 'config_actions', 0);
}

/**
 * Check if error is a proposals disabled error
 */
export function isProposalsDisabledError(error: unknown): boolean {
    return isMoveError(error, 'futarchy_config', 1);
}

/**
 * Check if error is a slippage error
 */
export function isSlippageError(error: unknown): boolean {
    return isMoveError(error, 'unified_spot_pool', 3) || isMoveError(error, 'liquidity_actions', 2);
}