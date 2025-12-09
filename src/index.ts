export * from './FutarchySDK';
export * from './config';
export * from './services';
export * from './protocol';
export * from './services/admin';
export * from './utils';
export * from './types';

// SDK instance type alias for convenience
import { FutarchySDK } from './FutarchySDK';
export type SDK = InstanceType<typeof FutarchySDK>;

// Intents - explicit exports to avoid conflicts with services
export * from './protocol/intents/execution';

// Query - explicit to avoid StreamInfo conflict with services
export { OracleQueries } from './services/intents/query/oracle';
export { VaultQueries } from './services/intents/query/vault';

// ============================================================================
// SUI TYPE RE-EXPORTS
// ============================================================================

export type { SuiClient, SuiObjectResponse, SuiObjectData } from '@mysten/sui/client';
export type { Transaction, TransactionResult } from '@mysten/sui/transactions';
