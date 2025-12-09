/**
 * Staging Functions
 *
 * All action staging functions organized by Move package.
 * These add action specs to intent builders (add_*_spec pattern).
 *
 * @module staging
 */

// Account Actions (account_actions package)
export * from './account/vault-init-actions';
export * from './account/stream-actions';
export * from './account/transfer-init-actions';
export * from './account/access-control-init-actions';
export * from './account/currency-actions';
export * from './account/memo-init-actions';
export * from './account/package-upgrade-init-actions';

// Futarchy Actions (futarchy_actions package)
export * from './futarchy/config-init-actions';
export * from './futarchy/quota-init-actions';
export * from './futarchy/liquidity-init-actions';
export * from './futarchy/liquidity-actions';
export * from './futarchy/dissolution-init-actions';

// Governance Actions (futarchy_governance_actions package)
export * from './governance/package-registry-init-actions';
export * from './governance/protocol-admin-init-actions';

// Oracle Actions (futarchy_oracle_actions package)
export * from './oracle/oracle-init-actions';

// Import all static classes for StagingActions
import { StreamInitActions } from './account/stream-actions';
import { CurrencyInitActions } from './account/currency-actions';
import { VaultInitActions } from './account/vault-init-actions';
import { TransferInitActions } from './account/transfer-init-actions';
import { MemoInitActions } from './account/memo-init-actions';
import { AccessControlInitActions } from './account/access-control-init-actions';
import { PackageUpgradeInitActions } from './account/package-upgrade-init-actions';
import { ConfigInitActions } from './futarchy/config-init-actions';
import { QuotaInitActions } from './futarchy/quota-init-actions';
import { LiquidityInitActions } from './futarchy/liquidity-init-actions';
import {
  LiquidityActionMarkers,
  LiquidityActionConstructors,
  LiquidityActionExecutors,
  LiquidityActionGetters,
} from './futarchy/liquidity-actions';
import { DissolutionInitActions } from './futarchy/dissolution-init-actions';
import { PackageRegistryInitActions } from './governance/package-registry-init-actions';
import { ProtocolAdminInitActions } from './governance/protocol-admin-init-actions';
import { OracleInitActions } from './oracle/oracle-init-actions';

/**
 * Staging Actions Namespace
 *
 * Organizes all action classes under a single interface.
 * Provides direct access to all static *InitActions and *Actions classes.
 *
 * @example
 * ```typescript
 * // Use via SDK:
 * sdk.actions.stream  // StreamInitActions
 * sdk.actions.currency  // CurrencyInitActions
 * sdk.actions.liquidityMarkers  // LiquidityActionMarkers
 * ```
 */
export class StagingActions {
  // Account Actions
  public readonly stream = StreamInitActions;
  public readonly currency = CurrencyInitActions;
  public readonly vault = VaultInitActions;
  public readonly transfer = TransferInitActions;
  public readonly memo = MemoInitActions;
  public readonly accessControl = AccessControlInitActions;
  public readonly packageUpgrade = PackageUpgradeInitActions;

  // Futarchy Actions
  public readonly config = ConfigInitActions;
  public readonly quota = QuotaInitActions;
  public readonly liquidityInit = LiquidityInitActions;
  public readonly liquidityMarkers = LiquidityActionMarkers;
  public readonly liquidityConstructors = LiquidityActionConstructors;
  public readonly liquidityExecutors = LiquidityActionExecutors;
  public readonly liquidityGetters = LiquidityActionGetters;
  public readonly dissolution = DissolutionInitActions;

  // Governance Actions
  public readonly packageRegistry = PackageRegistryInitActions;
  public readonly protocolAdmin = ProtocolAdminInitActions;

  // Oracle Actions
  public readonly oracle = OracleInitActions;
}
