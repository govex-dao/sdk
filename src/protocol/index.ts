/**
 * Protocol Module Wrappers
 *
 * TypeScript wrappers for Move protocol modules.
 * These provide typed access to on-chain state and queries.
 *
 * @module protocol
 */

// Direct exports - use functions directly
export * from './account';
export * from './futarchy';
export * from './markets';

// Import for bundled namespace
import * as Account from './account';
import * as Futarchy from './futarchy';
import * as Markets from './markets';

/**
 * Bundled Protocol namespace
 *
 * Access all protocol wrappers through a single object.
 *
 * @example
 * ```typescript
 * import { Protocol } from '@futarchy/sdk/protocol';
 *
 * // Use via namespace
 * Protocol.Futarchy.DaoConfig.newTradingParams(tx, config);
 * Protocol.Markets.Proposal.createProposal(tx, config);
 * Protocol.Account.Account.authenticate(tx, config);
 * ```
 */
export const Protocol = {
    Account,
    Futarchy,
    Markets,
} as const;
