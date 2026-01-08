/**
 * Services
 *
 * Service classes that provide protocol interactions.
 * For high-level orchestration, use sdk.workflows instead.
 *
 * @module services
 */

// Shared service types
export type { ServiceParams, SwapConfig } from './types';

// Domain services - explicit exports to avoid conflicts
export { DAOService, DAOInfoHelper, VaultService, OracleService } from './dao';
export { MarketService, PoolService } from './market';
export { LaunchpadService } from './launchpad';
export { ProposalService, SponsorshipService, TradeService, TwapService, EscrowService } from './proposal';
export { AdminService, FactoryAdminService, VerificationService, PackageRegistryService, FeeManagerService } from './admin';
export { IntentService, OracleQueryService, VaultQueryService } from './intents';

// Utility services
export {
  BaseTransactionBuilder,
  TransactionUtils,
  QueryHelper,
  CurrencyUtils,
  // Balance wrapper utilities
  buildBalanceWrapperType,
  getBalanceWrappers,
  getConditionalCoinObjects,
  getConditionalCoinBalance,
  sumBalanceWrapperAmount,
} from './utils';
export type {
  CoinBalance,
  OutcomeBalances,
  ProposalBalances,
  BalanceWrapperData,
  BalanceWrapperOutcome,
  OwnedCoinObject,
} from './utils';

// Protocol services
export * from './factory';
export * from './factory-admin';
export * from './factory-validator';
export * from './launchpad-intent-executor';
export * from './governance-ptb-executor';
export * from './proposal-lifecycle';
export * from './proposal-sponsorship';
export * from './fee-manager';
export * from './package-registry-admin';
export * from './oracle-actions';
export * from './coin-registry';
export * from './markets';
