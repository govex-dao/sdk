/**
 * Govex Futarchy SDK
 *
 * A comprehensive TypeScript SDK for interacting with the Futarchy Protocol on Sui.
 *
 * ## Architecture
 *
 * ```
 * src/
 * ├── FutarchySDK.ts  # Main SDK entry point
 * ├── config/         # Network & deployment configuration
 * ├── types/          # TypeScript type definitions
 * ├── workflows/      # High-level orchestration (launchpad, proposal)
 * ├── protocol/       # Move module wrappers (queries)
 * ├── services/       # High-level service classes
 * ├── ptb/            # PTB helpers
 * └── utils/          # Shared utilities
 * ```
 *
 * ## Quick Start
 *
 * ```typescript
 * import { FutarchySDK } from '@govex/futarchy-sdk';
 *
 * const sdk = new FutarchySDK({
 *   network: 'testnet',
 *   deployments
 * });
 *
 * // Use high-level services
 * const info = await sdk.dao.getInfo(daoId);
 * const tx = sdk.launchpad.createRaise({...});
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// MAIN SDK
// ============================================================================

export { FutarchySDK } from './FutarchySDK';

// ============================================================================
// CONFIGURATION
// ============================================================================

export * from './config';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export * from './types';

// ============================================================================
// WORKFLOWS (High-level orchestration)
// ============================================================================

export * from './workflows';

// ============================================================================
// PROTOCOL (Move module wrappers)
// ============================================================================

export * from './protocol';

// ============================================================================
// SERVICES (High-level service classes)
// ============================================================================

export * from './services';

// ============================================================================
// UTILITIES
// ============================================================================

export * from './utils';

// ============================================================================
// PTB HELPERS
// ============================================================================

export * from './ptb';

// ============================================================================
// SHARED (Action Registry - single source of truth)
// ============================================================================

export * from './shared/action-registry';

// ============================================================================
// SUI TYPE RE-EXPORTS
// ============================================================================

export type { SuiClient, SuiObjectResponse, SuiObjectData } from '@mysten/sui/client';
export type { Transaction, TransactionResult } from '@mysten/sui/transactions';
