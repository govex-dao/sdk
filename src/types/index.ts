/**
 * SDK Types - Central export point for all type definitions
 *
 * This module provides organized, reusable types for the Futarchy SDK.
 * Structure mirrors the main src/ folder organization:
 * - protocol/ - Types for protocol operations and intent staging/execution
 * - services/ - Types for service configurations and results
 *
 * @module types
 *
 * @example
 * ```typescript
 * import {
 *   // Common types
 *   WorkflowBaseConfig,
 *   SignedU128,
 *
 *   // Service types
 *   DAOInfo,
 *   DAOConfigInfo,
 *   SwapQuote,
 *   PoolReserves,
 *   CreateRaiseConfig,
 *   CreateProposalConfig,
 *
 *   // Protocol/Action types
 *   ActionConfig,
 *   CreateStreamActionConfig,
 * } from '@govex/futarchy-sdk/types';
 * ```
 */

// Re-export common types at root level for convenience
export * from './common';

// Protocol types (actions, execution, oracle)
export * from './protocol';

// Service types (config, results, workflows)
export * from './services';
