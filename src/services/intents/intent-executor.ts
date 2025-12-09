/**
 * Intent Executor - Executes staged actions via PTB pattern
 *
 * Implements the 3-layer action execution pattern:
 * 1. begin_execution → creates Executable hot potato a ,  
 * 2. N × do_init_* calls → execute each action in order
 * 3. finalize_execution → confirms all actions executed
 *
 * This hides all the complexity of witnesses, type arguments, and PTB construction.
 *
 * @module workflows/intent-executor
 */

import { Transaction } from '@mysten/sui/transactions';
import { IntentExecutionConfig, IntentActionConfig, Packages, SharedObjects, SDKConfigWithObjects } from '@/types';
import { TransactionUtils } from '../utils';

// Import protocol execution classes for intent execution
import {
  // account
  Vault,
  Currency,
  Transfer,
  PackageUpgrade,
  // dao
  DAOConfigActions,
  DAOQuotaActions
} from '@/protocol/intents/execution';

/**
 * Helper to construct metadata key types for different contexts
 */
export const MetadataKeyTypes = {
  /**
   * Construct a launchpad factory metadata key type
   * @param factoryPackageId - The factory package ID
   * @param coinType - The coin type
   */
  launchpad: (factoryPackageId: string, coinType: string): string =>
    `${factoryPackageId}::factory::CoinMetadataKey<${coinType}>`,

  /**
   * Construct a currency module metadata key type
   * @param accountActionsPackageId - The account actions package ID
   * @param coinType - The coin type
   */
  governance: (accountActionsPackageId: string, coinType: string): string =>
    `${accountActionsPackageId}::currency::CoinMetadataKey<${coinType}>`,
};

/**
 * Intent Executor - Builds PTBs for executing staged actions
 *
 * Supports all 60+ action types from the Futarchy protocol.
 *
 * @example
 * ```typescript
 * const executor = new IntentExecutor(client, packages);
 *
 * // Execute launchpad init actions
 * const tx = executor.execute({
 *   intentType: 'launchpad',
 *   accountId: '0x...',
 *   raiseId: '0x...',
 *   assetType: '0x123::coin::COIN',
 *   stableType: '0x2::sui::SUI',
 *   actions: [
 *     { action: 'create_stream', coinType: stableType },
 *     { action: 'create_pool_with_mint', assetType, stableType },
 *   ],
 * });
 *
 * // For return_metadata, use the helper to construct the keyType:
 * const keyType = MetadataKeyTypes.launchpad(packages.futarchyFactoryPackageId, assetType);
 * // ...actions: [{ action: 'return_metadata', coinType: assetType, keyType }]
 * ```
 */
export class IntentExecutor {
  private packages: Packages;
  private sharedObjects: SharedObjects;

  constructor({packages, sharedObjects}: SDKConfigWithObjects) {
    this.packages = packages;
    this.sharedObjects = sharedObjects;
  }

  /**
   * Execute a set of staged actions
   */
  execute(config: IntentExecutionConfig): Transaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    // Execute any prepended calls first (e.g., finalize proposal before executing actions)
    if (config.prependCalls) {
      config.prependCalls(tx);
    }

    if (config.intentType === 'launchpad') {
      return this.executeLaunchpadIntent(tx, config, clockId);
    } else {
      return this.executeProposalIntent(tx, config, clockId);
    }
  }

  /**
   * Execute launchpad init actions
   */
  private executeLaunchpadIntent(
    tx: Transaction,
    config: IntentExecutionConfig,
    clockId: string
  ): Transaction {
    if (!config.raiseId) {
      throw new Error('raiseId is required for launchpad intent execution');
    }

    const { accountActions, futarchyCore, futarchyFactory } = this.packages;
    const { packageRegistry } = this.sharedObjects;

    // 1. Begin execution - creates Executable hot potato
    const executable = tx.moveCall({
      target: `${futarchyFactory}::dao_init_executor::begin_execution_for_launchpad`,
      arguments: [
        tx.pure.id(config.raiseId),
        tx.object(config.accountId),
        tx.object(packageRegistry.id),
        tx.object(clockId),
      ],
    });

    // Create witnesses
    const versionWitness = tx.moveCall({
      target: `${accountActions}::version::current`,
      arguments: [],
    });

    const intentWitness = tx.moveCall({
      target: `${futarchyFactory}::dao_init_executor::dao_init_intent_witness`,
      arguments: [],
    });

    // 2. Execute each action in order
    console.log(`\n📋 Building PTB with ${config.actions.length} actions:`);
    for (let i = 0; i < config.actions.length; i++) {
      const action = config.actions[i];
      console.log(`   [${i + 1}] ${action.action}`);
      this.executeAction(tx, executable, versionWitness, intentWitness, config, action, {
        configType: `${futarchyCore}::futarchy_config::FutarchyConfig`,
        outcomeType: `${futarchyFactory}::dao_init_outcome::DaoInitOutcome`,
        witnessType: `${futarchyFactory}::dao_init_executor::DaoInitIntent`,
        clockId,
      });
    }

    // 3. Finalize execution
    tx.moveCall({
      target: `${futarchyFactory}::dao_init_executor::finalize_execution`,
      arguments: [
        tx.object(config.accountId),
        executable,
        tx.object(clockId),
      ],
    });

    return tx;
  }

  /**
   * Execute proposal actions
   */
  private executeProposalIntent(
    tx: Transaction,
    config: IntentExecutionConfig,
    clockId: string
  ): Transaction {
    if (!config.proposalId || !config.escrowId) {
      throw new Error('proposalId and escrowId are required for proposal intent execution');
    }
    const { accountActions, futarchyCore, futarchyGovernance } = this.packages;
    const { packageRegistry } = this.sharedObjects;

    // 1. Begin execution with escrow
    const executable = tx.moveCall({
      target: `${futarchyGovernance}::ptb_executor::begin_execution_with_escrow`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.accountId),
        tx.object(packageRegistry.id),
        tx.object(config.proposalId),
        tx.object(config.escrowId),
        tx.object(clockId),
      ],
    });

    // Create witnesses
    const versionWitness = tx.moveCall({
      target: `${accountActions}::version::current`,
      arguments: [],
    });

    const governanceWitness = tx.moveCall({
      target: `${futarchyCore}::futarchy_config::witness`,
      arguments: [],
    });

    // 2. Execute each action in order
    for (const action of config.actions) {
      this.executeAction(tx, executable, versionWitness, governanceWitness, config, action, {
        configType: `${futarchyCore}::futarchy_config::FutarchyConfig`,
        outcomeType: `${futarchyCore}::futarchy_config::FutarchyOutcome`,
        witnessType: `${futarchyCore}::futarchy_config::ConfigWitness`,
        clockId,
      });
    }

    // 3. Finalize execution
    tx.moveCall({
      target: `${futarchyGovernance}::ptb_executor::finalize_execution`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.accountId),
        tx.object(packageRegistry.id),
        tx.object(config.proposalId),
        executable,
        tx.object(clockId),
      ],
    });

    return tx;
  }

  /**
   * Execute a single action within the intent
   */
  private executeAction(
    tx: Transaction,
    executable: ReturnType<Transaction['moveCall']>,
    versionWitness: ReturnType<Transaction['moveCall']>,
    intentWitness: ReturnType<Transaction['moveCall']>,
    config: IntentExecutionConfig,
    action: IntentActionConfig,
    typeContext: {
      configType: string;
      outcomeType: string;
      witnessType: string;
      clockId: string;
    }
  ): void {
    const {
      accountActions,
      futarchyActions,
      futarchyGovernanceActions,
      futarchyOracleActions,
    } = this.packages;

    const { packageRegistry } = this.sharedObjects;

    const { configType, outcomeType, witnessType, clockId } = typeContext;

    switch (action.action) {
      // =========================================================================
      // ACCOUNT ACTIONS - STREAM
      // =========================================================================
      case 'create_stream':
        Vault.doInitCreateStream(
          tx,
          {
            accountActionsPackageId: accountActions,
            configType,
            outcomeType,
            coinType: action.coinType,
            intentWitnessType: witnessType,
          },
          executable,
          config.accountId,
          packageRegistry.id,
          clockId,
          versionWitness,
          intentWitness
        );
        break;

      case 'cancel_stream':
        // do_cancel_stream requires: executable, account, registry, clock, version, witness, ctx
        // vault_name is now read from ActionSpec (not passed as parameter)
        // Returns: (Coin<CoinType>, u64)
        // Note: doCancelStream in protocol layer takes vaultName param, but this execution
        // context reads from ActionSpec, so we use inline call
        tx.moveCall({
          target: `${accountActions}::vault::do_cancel_stream`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            tx.object(clockId),
            versionWitness,
            intentWitness,
          ],
        });
        break;

      // =========================================================================
      // ACCOUNT ACTIONS - VAULT
      // =========================================================================
      case 'deposit':
        // do_init_deposit takes coin from executable_resources (deterministic!)
        Vault.doInitDeposit(
          tx,
          {
            accountActionsPackageId: accountActions,
            configType,
            outcomeType,
            coinType: action.coinType,
            intentWitnessType: witnessType,
          },
          executable,
          config.accountId,
          packageRegistry.id,
          versionWitness,
          intentWitness
        );
        break;

      case 'spend':
        Vault.doSpend(
          tx,
          {
            accountActionsPackageId: accountActions,
            configType,
            outcomeType,
            coinType: action.coinType,
            intentWitnessType: witnessType,
          },
          executable,
          config.accountId,
          packageRegistry.id,
          versionWitness,
          intentWitness
        );
        break;

      case 'withdraw':
        // For init contexts (launchpad/proposal), use do_init_withdraw_and_transfer
        // which withdraws from vault AND transfers to recipient in one action
        Vault.doInitWithdrawAndTransfer(
          tx,
          {
            accountActionsPackageId: accountActions,
            configType,
            outcomeType,
            coinType: action.coinType,
            intentWitnessType: witnessType,
          },
          executable,
          config.accountId,
          packageRegistry.id,
          versionWitness,
          intentWitness
        );
        break;

      case 'approve_coin_type':
        Vault.doApproveCoinType(
          tx,
          {
            accountActionsPackageId: accountActions,
            configType,
            outcomeType,
            coinType: action.coinType,
            intentWitnessType: witnessType,
          },
          executable,
          config.accountId,
          packageRegistry.id,
          versionWitness,
          intentWitness
        );
        break;

      case 'remove_approved_coin_type':
        Vault.doRemoveApprovedCoinType(
          tx,
          {
            accountActionsPackageId: accountActions,
            configType,
            outcomeType,
            coinType: action.coinType,
            intentWitnessType: witnessType,
          },
          executable,
          config.accountId,
          packageRegistry.id,
          versionWitness,
          intentWitness
        );
        break;

      // =========================================================================
      // ACCOUNT ACTIONS - CURRENCY
      // =========================================================================
      case 'mint':
        Currency.doMint(
          tx,
          {
            accountActionsPackageId: accountActions,
            outcomeType,
            coinType: action.coinType,
            intentWitnessType: witnessType,
          },
          executable,
          config.accountId,
          packageRegistry.id,
          versionWitness,
          intentWitness
        );
        break;

      case 'burn':
        // do_init_burn takes coin from executable_resources (deterministic!)
        Currency.doInitBurn(
          tx,
          {
            accountActionsPackageId: accountActions,
            outcomeType,
            coinType: action.coinType,
            intentWitnessType: witnessType,
          },
          executable,
          config.accountId,
          packageRegistry.id,
          versionWitness,
          intentWitness
        );
        break;

      case 'disable_currency':
        Currency.doDisable(
          tx,
          {
            accountActionsPackageId: accountActions,
            outcomeType,
            coinType: action.coinType,
            intentWitnessType: witnessType,
          },
          executable,
          config.accountId,
          packageRegistry.id,
          versionWitness,
          intentWitness
        );
        break;

      case 'update_currency':
        // Note: Protocol layer's doUpdate requires a metadata param, but this
        // execution context doesn't have access to it - keeps inline call
        tx.moveCall({
          target: `${accountActions}::currency::do_update`,
          typeArguments: [outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
          ],
        });
        break;

      case 'return_treasury_cap':
        Currency.doInitRemoveTreasuryCap(
          tx,
          {
            accountActionsPackageId: accountActions,
            configType,
            outcomeType,
            coinType: action.coinType,
            intentWitnessType: witnessType,
          },
          executable,
          config.accountId,
          packageRegistry.id,
          versionWitness,
          intentWitness
        );
        break;

      case 'return_metadata': {
        // Determine the key type based on context
        // Launchpad uses factory::CoinMetadataKey, governance uses currency::CoinMetadataKey
        const keyType = action.keyType;

        // Create metadata key witness using the appropriate module
        const keyModule = keyType.includes('::factory::')
          ? this.packages.futarchyFactory
          : accountActions;

        const metadataKey = tx.moveCall({
          target: `${keyModule}::${keyType.includes('::factory::') ? 'factory' : 'currency'}::coin_metadata_key`,
          typeArguments: [action.coinType],
          arguments: [],
        });

        Currency.doInitRemoveMetadata(
          tx,
          {
            accountActionsPackageId: accountActions,
            configType,
            outcomeType,
            keyType,
            coinType: action.coinType,
            intentWitnessType: witnessType,
          },
          executable,
          config.accountId,
          packageRegistry.id,
          metadataKey,
          versionWitness,
          intentWitness
        );
        break;
      }

      // =========================================================================
      // ACCOUNT ACTIONS - TRANSFER
      // =========================================================================
      case 'transfer':
        // do_init_transfer takes object from executable_resources (deterministic!)
        Transfer.doInitTransfer(
          tx,
          {
            accountActionsPackageId: accountActions,
            outcomeType,
            objectType: action.objectType,
            intentWitnessType: witnessType,
          },
          executable,
          intentWitness
        );
        break;

      case 'transfer_to_sender':
        // do_init_transfer_to_sender takes object from executable_resources (deterministic!)
        Transfer.doInitTransferToSender(
          tx,
          {
            accountActionsPackageId: accountActions,
            outcomeType,
            objectType: action.objectType,
            intentWitnessType: witnessType,
          },
          executable,
          intentWitness
        );
        break;

      // =========================================================================
      // ACCOUNT ACTIONS - PACKAGE UPGRADE
      // =========================================================================
      case 'upgrade_package':
        PackageUpgrade.doUpgrade(
          tx,
          {
            accountActionsPackageId: accountActions,
            outcomeType,
            intentWitnessType: witnessType,
          },
          executable,
          config.accountId,
          packageRegistry.id,
          clockId,
          versionWitness,
          intentWitness
        );
        break;

      case 'restrict_upgrade':
        PackageUpgrade.doRestrict(
          tx,
          {
            accountActionsPackageId: accountActions,
            outcomeType,
            intentWitnessType: witnessType,
          },
          executable,
          config.accountId,
          packageRegistry.id,
          versionWitness,
          intentWitness
        );
        break;

      case 'create_commit_cap':
        PackageUpgrade.doCreateCommitCap(
          tx,
          {
            accountActionsPackageId: accountActions,
            outcomeType,
            intentWitnessType: witnessType,
          },
          executable,
          config.accountId,
          packageRegistry.id,
          versionWitness,
          intentWitness
        );
        break;

      // =========================================================================
      // ACCOUNT ACTIONS - ACCESS CONTROL
      // =========================================================================
      case 'borrow_access':
        tx.moveCall({
          target: `${accountActions}::access_control::do_borrow`,
          typeArguments: [configType, outcomeType, action.capType, witnessType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
          ],
        });
        break;

      case 'return_access':
        tx.moveCall({
          target: `${accountActions}::access_control::do_return`,
          typeArguments: [configType, outcomeType, action.capType, witnessType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
          ],
        });
        break;

      // =========================================================================
      // ACCOUNT ACTIONS - MEMO
      // =========================================================================
      case 'memo':
        // do_emit_memo signature: (executable, account, intent_witness, clock, ctx)
        tx.moveCall({
          target: `${accountActions}::memo::do_emit_memo`,
          typeArguments: [configType, outcomeType, witnessType],
          arguments: [
            executable,
            tx.object(config.accountId),
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      // =========================================================================
      // FUTARCHY CONFIG ACTIONS
      // =========================================================================
      case 'set_proposals_enabled':
        DAOConfigActions.doSetProposalsEnabled(
          tx,
          {
            futarchyActionsPackageId: futarchyActions,
            daoId: config.accountId,
            registryId: packageRegistry.id,
            outcomeType,
            intentWitnessType: witnessType,
            clock: clockId,
          },
          executable,
          versionWitness,
          intentWitness
        );
        break;

      case 'terminate_dao':
        DAOConfigActions.doTerminateDao(
          tx,
          {
            futarchyActionsPackageId: futarchyActions,
            daoId: config.accountId,
            registryId: packageRegistry.id,
            outcomeType,
            intentWitnessType: witnessType,
            clock: clockId,
          },
          executable,
          versionWitness,
          intentWitness
        );
        break;

      case 'update_dao_name':
        DAOConfigActions.doUpdateName(
          tx,
          {
            futarchyActionsPackageId: futarchyActions,
            daoId: config.accountId,
            registryId: packageRegistry.id,
            outcomeType,
            intentWitnessType: witnessType,
            clock: clockId,
          },
          executable,
          versionWitness,
          intentWitness
        );
        break;

      case 'update_trading_params':
        DAOConfigActions.doUpdateTradingParams(
          tx,
          {
            futarchyActionsPackageId: futarchyActions,
            daoId: config.accountId,
            registryId: packageRegistry.id,
            outcomeType,
            intentWitnessType: witnessType,
            clock: clockId,
          },
          executable,
          versionWitness,
          intentWitness
        );
        break;

      case 'update_dao_metadata':
        DAOConfigActions.doUpdateMetadata(
          tx,
          {
            futarchyActionsPackageId: futarchyActions,
            daoId: config.accountId,
            registryId: packageRegistry.id,
            outcomeType,
            intentWitnessType: witnessType,
            clock: clockId,
          },
          executable,
          versionWitness,
          intentWitness
        );
        break;

      case 'update_twap_config':
        DAOConfigActions.doUpdateTwapConfig(
          tx,
          {
            futarchyActionsPackageId: futarchyActions,
            daoId: config.accountId,
            registryId: packageRegistry.id,
            outcomeType,
            intentWitnessType: witnessType,
            clock: clockId,
          },
          executable,
          versionWitness,
          intentWitness
        );
        break;

      case 'update_governance':
        DAOConfigActions.doUpdateGovernance(
          tx,
          {
            futarchyActionsPackageId: futarchyActions,
            daoId: config.accountId,
            registryId: packageRegistry.id,
            outcomeType,
            intentWitnessType: witnessType,
            clock: clockId,
          },
          executable,
          versionWitness,
          intentWitness
        );
        break;

      case 'update_metadata_table':
        tx.moveCall({
          target: `${futarchyActions}::config_actions::do_update_metadata_table`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_conditional_metadata':
        tx.moveCall({
          target: `${futarchyActions}::config_actions::do_update_conditional_metadata`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_sponsorship_config':
        DAOConfigActions.doUpdateSponsorshipConfig(
          tx,
          {
            futarchyActionsPackageId: futarchyActions,
            daoId: config.accountId,
            registryId: packageRegistry.id,
            outcomeType,
            intentWitnessType: witnessType,
            clock: clockId,
          },
          executable,
          versionWitness,
          intentWitness
        );
        break;

      // =========================================================================
      // FUTARCHY QUOTA ACTIONS
      // =========================================================================
      case 'set_quotas':
        DAOQuotaActions.doSetQuotas(
          tx,
          {
            futarchyActionsPackageId: futarchyActions,
            daoId: config.accountId,
            registryId: packageRegistry.id,
            outcomeType,
            intentWitnessType: witnessType,
            clock: clockId,
          },
          executable,
          versionWitness,
          intentWitness
        );
        break;

      // =========================================================================
      // FUTARCHY LIQUIDITY ACTIONS
      // =========================================================================
      case 'create_pool_with_mint':
        tx.moveCall({
          target: `${futarchyActions}::liquidity_init_actions::do_init_create_pool_with_mint`,
          typeArguments: [
            configType,
            outcomeType,
            action.assetType,
            action.stableType,
            action.lpType,
            witnessType,
          ],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            tx.object(action.lpTreasuryCapId),
            tx.object(action.lpMetadataId),
            tx.object(clockId),
            versionWitness,
            intentWitness,
          ],
        });
        break;

      // NOTE: The following actions use ResourceRequest pattern and are NOT supported
      // in launchpad/proposal execution. They require separate PTB flows with fulfill_*:
      // - add_liquidity
      // - remove_liquidity
      // - swap

      // =========================================================================
      // FUTARCHY DISSOLUTION ACTIONS
      // =========================================================================
      case 'create_dissolution_capability':
        tx.moveCall({
          target: `${futarchyActions}::dissolution_actions::do_create_dissolution_capability`,
          typeArguments: [action.assetType, outcomeType, witnessType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      // =========================================================================
      // GOVERNANCE ACTIONS - PACKAGE REGISTRY
      // =========================================================================
      case 'add_package':
        tx.moveCall({
          target: `${futarchyGovernanceActions}::package_registry_actions::do_add_package`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'remove_package':
        tx.moveCall({
          target: `${futarchyGovernanceActions}::package_registry_actions::do_remove_package`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_package_version':
        tx.moveCall({
          target: `${futarchyGovernanceActions}::package_registry_actions::do_update_package_version`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_package_metadata':
        tx.moveCall({
          target: `${futarchyGovernanceActions}::package_registry_actions::do_update_package_metadata`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'pause_account_creation':
        tx.moveCall({
          target: `${futarchyGovernanceActions}::package_registry_actions::do_pause_account_creation`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'unpause_account_creation':
        tx.moveCall({
          target: `${futarchyGovernanceActions}::package_registry_actions::do_unpause_account_creation`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      // =========================================================================
      // GOVERNANCE ACTIONS - PROTOCOL ADMIN
      // =========================================================================
      case 'set_factory_paused':
        tx.moveCall({
          target: `${futarchyGovernanceActions}::protocol_admin_actions::do_set_factory_paused`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'disable_factory_permanently':
        tx.moveCall({
          target: `${futarchyGovernanceActions}::protocol_admin_actions::do_disable_factory_permanently`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'add_stable_type':
        tx.moveCall({
          target: `${futarchyGovernanceActions}::protocol_admin_actions::do_add_stable_type`,
          typeArguments: [outcomeType, witnessType, action.stableType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'remove_stable_type':
        tx.moveCall({
          target: `${futarchyGovernanceActions}::protocol_admin_actions::do_remove_stable_type`,
          typeArguments: [outcomeType, witnessType, action.stableType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_dao_creation_fee':
        tx.moveCall({
          target: `${futarchyGovernanceActions}::protocol_admin_actions::do_update_dao_creation_fee`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_proposal_fee':
        tx.moveCall({
          target: `${futarchyGovernanceActions}::protocol_admin_actions::do_update_proposal_fee`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_verification_fee':
        tx.moveCall({
          target: `${futarchyGovernanceActions}::protocol_admin_actions::do_update_verification_fee`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'add_verification_level':
        tx.moveCall({
          target: `${futarchyGovernanceActions}::protocol_admin_actions::do_add_verification_level`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'remove_verification_level':
        tx.moveCall({
          target: `${futarchyGovernanceActions}::protocol_admin_actions::do_remove_verification_level`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'withdraw_fees_to_treasury':
        tx.moveCall({
          target: `${futarchyGovernanceActions}::protocol_admin_actions::do_withdraw_fees_to_treasury`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'add_coin_fee_config':
        tx.moveCall({
          target: `${futarchyGovernanceActions}::protocol_admin_actions::do_add_coin_fee_config`,
          typeArguments: [outcomeType, witnessType, action.coinType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_coin_creation_fee':
        tx.moveCall({
          target: `${futarchyGovernanceActions}::protocol_admin_actions::do_update_coin_creation_fee`,
          typeArguments: [outcomeType, witnessType, action.coinType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_coin_proposal_fee':
        tx.moveCall({
          target: `${futarchyGovernanceActions}::protocol_admin_actions::do_update_coin_proposal_fee`,
          typeArguments: [outcomeType, witnessType, action.coinType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'apply_pending_coin_fees':
        tx.moveCall({
          target: `${futarchyGovernanceActions}::protocol_admin_actions::do_apply_pending_coin_fees`,
          typeArguments: [outcomeType, witnessType, action.coinType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      // =========================================================================
      // ORACLE ACTIONS
      // =========================================================================
      case 'create_oracle_grant':
        tx.moveCall({
          target: `${futarchyOracleActions}::oracle_actions::do_create_oracle_grant`,
          typeArguments: [action.assetType, action.stableType, outcomeType, witnessType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'cancel_oracle_grant':
        tx.moveCall({
          target: `${futarchyOracleActions}::oracle_actions::do_cancel_grant`,
          typeArguments: [action.assetType, action.stableType, outcomeType, witnessType],
          arguments: [
            executable,
            tx.object(config.accountId),
            tx.object(packageRegistry.id),
            versionWitness,
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      default:
        throw new Error(`Unknown action type: ${(action as { action: string }).action}`);
    }
  }

  // ===========================================================================
  // LOW-LEVEL PTB COMPOSITION API
  // ===========================================================================
  // Use these static methods when you need fine-grained control over PTB
  // composition, e.g., to inject custom logic between begin and finalize.

  /**
   * Configuration for beginning proposal execution
   */
  static BeginProposalExecutionConfig: {
    governancePackageId: string;
    daoId: string;
    proposalId: string;
    marketStateId: string;
    registryId: string;
    assetType: string;
    stableType: string;
    clock?: string;
  };

  /**
   * Begin execution of proposal actions (Step 1 of 3)
   *
   * Creates an Executable hot potato that must be consumed by finalizeProposalExecution.
   * Between begin and finalize, you can call do_init_* actions.
   *
   * Requirements:
   * - Proposal must be finalized
   * - Outcome 1 (Accept/Yes) must have won (Outcome 0 = Reject/No)
   *
   * @param tx - Transaction to add the call to
   * @param config - Execution configuration
   * @returns TransactionArgument tuple [Executable, intent_key: String]
   *
   * @example
   * ```typescript
   * const tx = new Transaction();
   *
   * const [executable, intentKey] = IntentExecutor.beginProposalExecution(tx, {
   *   governancePackageId,
   *   daoId,
   *   proposalId,
   *   marketStateId,
   *   registryId,
   *   assetType,
   *   stableType,
   *   clock: '0x6',
   * });
   *
   * // Add custom logic / do_init_* calls here
   *
   * IntentExecutor.finalizeProposalExecution(tx, config, executable);
   * ```
   */
  static beginProposalExecution(
    tx: Transaction,
    config: {
      governancePackageId: string;
      daoId: string;
      proposalId: string;
      marketStateId: string;
      registryId: string;
      assetType: string;
      stableType: string;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.governancePackageId,
        'ptb_executor',
        'begin_execution'
      ),
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.daoId), // account
        tx.object(config.registryId), // registry
        tx.object(config.proposalId), // proposal
        tx.object(config.marketStateId), // market
        tx.object(config.clock || '0x6'), // clock
      ],
    });
  }

  /**
   * Begin execution using escrow reference (alternative to beginProposalExecution)
   *
   * This variant extracts MarketState from the TokenEscrow internally,
   * avoiding object reference conflicts in complex PTBs where you already
   * have the escrow reference.
   *
   * @param tx - Transaction to add the call to
   * @param config - Execution configuration with escrowId instead of marketStateId
   * @returns TransactionArgument for Executable hot potato
   *
   * @example
   * ```typescript
   * const tx = new Transaction();
   *
   * // Use when you have escrow reference and want to avoid PTB reference issues
   * const executable = IntentExecutor.beginProposalExecutionWithEscrow(tx, {
   *   governancePackageId,
   *   daoId,
   *   proposalId,
   *   escrowId,
   *   registryId,
   *   assetType,
   *   stableType,
   *   clock: '0x6',
   * });
   * ```
   */
  static beginProposalExecutionWithEscrow(
    tx: Transaction,
    config: {
      governancePackageId: string;
      daoId: string;
      proposalId: string;
      escrowId: string;
      registryId: string;
      assetType: string;
      stableType: string;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.governancePackageId,
        'ptb_executor',
        'begin_execution_with_escrow'
      ),
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.daoId), // account
        tx.object(config.registryId), // registry
        tx.object(config.proposalId), // proposal
        tx.object(config.escrowId), // escrow
        tx.object(config.clock || '0x6'), // clock
      ],
    });
  }

  /**
   * Finalize execution of proposal actions (Step 3 of 3)
   *
   * Consumes the Executable hot potato and confirms all actions were executed.
   * Emits ProposalIntentExecuted event.
   *
   * @param tx - Transaction to add the call to
   * @param config - Execution configuration
   * @param executable - The Executable hot potato from beginProposalExecution
   *
   * @example
   * ```typescript
   * const tx = new Transaction();
   *
   * // After beginProposalExecution and do_init_* calls
   * IntentExecutor.finalizeProposalExecution(tx, {
   *   governancePackageId,
   *   daoId,
   *   proposalId,
   *   registryId,
   *   assetType,
   *   stableType,
   *   clock: '0x6',
   * }, executable);
   * ```
   */
  static finalizeProposalExecution(
    tx: Transaction,
    config: {
      governancePackageId: string;
      daoId: string;
      proposalId: string;
      registryId: string;
      assetType: string;
      stableType: string;
      clock?: string;
    },
    executable: ReturnType<Transaction['moveCall']>
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.governancePackageId,
        'ptb_executor',
        'finalize_execution'
      ),
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.daoId), // account
        tx.object(config.registryId), // registry
        tx.object(config.proposalId), // proposal
        executable, // executable
        tx.object(config.clock || '0x6'), // clock
      ],
    });
  }
}
