/**
 * Execution - PTB wrappers for Move do_* functions
 *
 * @module execution
 */

export * from './account';
export * from './dao';
export * from './governance';
export * from './oracle';

// Import all execution classes for ExecutionActions
import { Vault } from './account/vault';
import { Currency } from './account/currency';
import { Transfer } from './account/transfer';
import { Memo } from './account/memo';
import { AccessControl } from './account/access-control';
import { PackageUpgrade } from './account/package-upgrade';
import { PackageUpgradeAuditable } from './account/package-upgrade-auditable';
import { DAOConfigActions } from './dao/dao-config-actions';
import { DAODissolutionActions, DAODissolutionOperations } from './dao/dao-dissolution-actions';
import { DAOQuotaActions } from './dao/dao-quota-actions';
import { GovernanceIntents } from './governance/governance-intents';
import { IntentJanitorOperations } from './governance/intent-janitor';
import { PackageRegistryActions } from './governance/package-registry-actions';
import { ProtocolAdminActions } from './governance/protocol-admin-actions';
import { OracleActions } from './oracle/oracle';

/**
 * Execution Actions Namespace
 *
 * Organizes all execution action classes under a single interface.
 * Provides direct access to all static execution classes.
 *
 * @example
 * ```typescript
 * // Use via SDK:
 * sdk.execution.vault  // Vault
 * sdk.execution.currency  // Currency
 * sdk.execution.daoConfig  // DAOConfigActions
 * ```
 */
export class ExecutionActions {
  // Account Actions
  public readonly vault = Vault;
  public readonly currency = Currency;
  public readonly transfer = Transfer;
  public readonly memo = Memo;
  public readonly accessControl = AccessControl;
  public readonly packageUpgrade = PackageUpgrade;
  public readonly packageUpgradeAuditable = PackageUpgradeAuditable;

  // DAO Actions
  public readonly daoConfig = DAOConfigActions;
  public readonly daoDissolution = DAODissolutionActions;
  public readonly daoDissolutionOps = DAODissolutionOperations;
  public readonly daoQuota = DAOQuotaActions;

  // Governance Actions
  public readonly governanceIntents = GovernanceIntents;
  public readonly intentJanitor = IntentJanitorOperations;
  public readonly packageRegistry = PackageRegistryActions;
  public readonly protocolAdmin = ProtocolAdminActions;

  // Oracle Actions
  public readonly oracle = OracleActions;
}
