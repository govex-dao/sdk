/**
 * Action Composer - Fluent API for building complex intents
 *
 * Provides a composable, chainable interface for building transactions
 * that involve multiple actions, staging, and execution.
 *
 * @module intents/action-composer
 */

import { Transaction } from '@mysten/sui/transactions';
import { ActionConfig, BurnActionConfig, CreatePoolWithMintActionConfig, CreateStreamActionConfig, DepositActionConfig, MemoActionConfig, MintActionConfig, Packages, ReturnMetadataActionConfig, ReturnTreasuryCapActionConfig, SharedObjects, TransferActionConfig, UpdateTradingParamsActionConfig, UpdateTwapConfigActionConfig, WithdrawActionConfig } from '@/types';
import {
  StreamInitActions,
  CurrencyInitActions,
  VaultInitActions,
  TransferInitActions,
  MemoInitActions,
  LiquidityInitActions,
  ConfigInitActions,
} from '@/protocol/intents/staging';

/**
 * Transaction Composer - Fluent builder for PTBs
 *
 * @example
 * ```typescript
 * const composer = new ActionComposer(packages, sharedObjects);
 *
 * // Build a transaction with multiple actions
 * const tx = composer
 *   .new()
 *   .addStream({
 *     vaultName: 'treasury',
 *     beneficiary: '0xABC',
 *     amountPerIteration: 50_000_000n,
 *     startTime: Date.now() + 300_000,
 *     iterationsTotal: 12n,
 *     iterationPeriodMs: 2_592_000_000n,
 *     maxPerWithdrawal: 50_000_000n,
 *     isTransferable: true,
 *     isCancellable: true,
 *   })
 *   .addPoolWithMint({
 *     vaultName: 'treasury',
 *     assetAmount: 1_000_000_000n,
 *     stableAmount: 1_000_000_000n,
 *     feeBps: 30,
 *   })
 *   .stageToLaunchpad(raiseId, creatorCapId, assetType, stableType, 'success')
 *   .build();
 * ```
 */
export class ActionComposer {
  private packages: Packages;
  private sharedObjects: SharedObjects;

  constructor(
    packages: Packages,
    sharedObjects: SharedObjects
  ) {
    this.packages = packages;
    this.sharedObjects = sharedObjects;
  }

  /**
   * Create a new composable transaction builder
   */
  new(): IntentBuilder {
    return new IntentBuilder(this.packages, this.sharedObjects);
  }
}

/**
 * Package IDs required for adding actions to a builder
 */
export interface ActionBuilderPackages {
  accountActions: string;
  futarchyActions: string;
  futarchyTypes: string;
}

/**
 * Chainable intent builder
 */
export class IntentBuilder {
  private tx: Transaction;
  private builder: ReturnType<Transaction['moveCall']> | null = null;
  private actions: ActionConfig[] = [];
  private packages: Packages;
  private sharedObjects: SharedObjects;

  constructor(
    packages: Packages,
    sharedObjects: SharedObjects
  ) {
    this.tx = new Transaction();
    this.packages = packages;
    this.sharedObjects = sharedObjects;
  }

  /**
   * Static method to add an action to an existing builder
   *
   * Used by LaunchpadService and ProposalService to share action building logic.
   *
   * @param tx - Transaction
   * @param builder - ActionSpec builder from action_spec_builder::new()
   * @param action - Action configuration
   * @param packages - Package IDs for move calls
   */
  addActionToBuilder(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    action: ActionConfig,
    packages: ActionBuilderPackages
  ): void {
    const { accountActions, futarchyActions, futarchyTypes } = packages;

    switch (action.type) {
      case 'create_stream':
        StreamInitActions.addCreateStream(tx, builder, accountActions, {
          vaultName: action.vaultName,
          beneficiary: action.beneficiary,
          amountPerIteration: action.amountPerIteration,
          startTime: action.startTime,
          iterationsTotal: action.iterationsTotal,
          iterationPeriodMs: action.iterationPeriodMs,
          cliffTime: action.cliffTime,
          claimWindowMs: action.claimWindowMs ? Number(action.claimWindowMs) : undefined,
          maxPerWithdrawal: action.maxPerWithdrawal,
          isTransferable: action.isTransferable,
          isCancellable: action.isCancellable,
        });
        break;

      case 'create_pool_with_mint':
        LiquidityInitActions.addCreatePoolWithMint(tx, builder, futarchyActions, {
          vaultName: action.vaultName,
          assetAmountToMint: action.assetAmount,
          stableAmountFromVault: action.stableAmount,
          feeBps: action.feeBps,
        });
        break;

      case 'return_treasury_cap':
        CurrencyInitActions.addReturnTreasuryCap(tx, builder, accountActions, {
          recipient: action.recipient,
        });
        break;

      case 'return_metadata':
        CurrencyInitActions.addReturnMetadata(tx, builder, accountActions, {
          recipient: action.recipient,
        });
        break;

      case 'update_trading_params':
        ConfigInitActions.addUpdateTradingParams(tx, builder, futarchyActions, {
          minAssetAmount: action.minAssetAmount,
          minStableAmount: action.minStableAmount,
          reviewPeriodMs: action.reviewPeriodMs,
          tradingPeriodMs: action.tradingPeriodMs,
          ammTotalFeeBps: action.ammTotalFeeBps,
        });
        break;

      case 'update_twap_config': {
        const thresholdOption = action.threshold !== undefined
          ? ConfigInitActions.createThresholdOption(tx, futarchyTypes, action.threshold)
          : undefined;

        ConfigInitActions.addUpdateTwapConfig(tx, builder, futarchyActions, {
          startDelay: action.startDelay,
          stepMax: action.stepMax,
          initialObservation: action.initialObservation,
          threshold: thresholdOption,
        });
        break;
      }

      case 'mint':
        CurrencyInitActions.addMint(tx, builder, accountActions, action.amount);
        break;

      case 'burn':
        CurrencyInitActions.addBurn(tx, builder, accountActions, action.amount);
        break;

      case 'deposit':
        VaultInitActions.addDeposit(tx, builder, accountActions, {
          vaultName: action.vaultName,
          amount: action.amount,
        });
        break;

      case 'withdraw':
        TransferInitActions.addWithdrawAndTransfer(tx, builder, accountActions, {
          vaultName: action.vaultName,
          amount: action.amount,
          recipient: action.recipient,
          coinType: action.coinType,
        });
        break;

      case 'transfer':
        TransferInitActions.addTransferObject(tx, builder, accountActions, {
          recipient: action.recipient,
          objectType: action.objectType,
        });
        break;

      case 'memo':
        MemoInitActions.addEmitMemo(tx, builder, accountActions, {
          memo: action.message,
        });
        break;

      default:
        throw new Error(`Unknown action type: ${(action as any).type}`);
    }
  }

  /**
   * Get the underlying Transaction (for advanced use)
   */
  getTransaction(): Transaction {
    return this.tx;
  }

  addStream(config: Omit<CreateStreamActionConfig, 'type'>): this {
    return this.addAction({ type: 'create_stream', ...config});
  }

  addPoolWithMint(config: Omit<CreatePoolWithMintActionConfig, 'type'>): this {
    return this.addAction({ type: 'create_pool_with_mint', ...config});
  }

  addReturnTreasuryCap(config: Omit<ReturnTreasuryCapActionConfig, 'type'>): this {
    return this.addAction({ type: 'return_treasury_cap', ...config});
  }

  addReturnMetadata(config: Omit<ReturnMetadataActionConfig, 'type'>): this {
    return this.addAction({ type: 'return_metadata', ...config});
  }

  addUpdateTradingParams(config: Omit<UpdateTradingParamsActionConfig, 'type'>): this {
    return this.addAction({ type: 'update_trading_params', ...config});
  }

  addUpdateTwapConfig(config: Omit<UpdateTwapConfigActionConfig, 'type'>): this {
    return this.addAction({ type: 'update_twap_config', ...config});
  }

  addMint(config: Omit<MintActionConfig, 'type'>): this {
    return this.addAction({ type: 'mint', ...config});
  }

  addBurn(config: Omit<BurnActionConfig, 'type'>): this {
    return this.addAction({ type: 'burn', ...config});
  }

  addDeposit(config: Omit<DepositActionConfig, 'type'>): this {
    return this.addAction({ type: 'deposit', ...config});
  }

  addWithdraw(config: Omit<WithdrawActionConfig, 'type'>): this {
    return this.addAction({ type: 'withdraw', ...config});
  }

  addTransfer(config: Omit<TransferActionConfig, 'type'>): this {
    return this.addAction({ type: 'transfer', ...config });
  }

  addMemo(config: Omit<MemoActionConfig, 'type'>): this {
    return this.addAction({ type: 'memo', ...config});
  }

  addAction(config: ActionConfig): this {
    this.actions.push(config);
    return this;
  }

  /**
   * Stage actions to a launchpad raise (success or failure)
   */
  stageToLaunchpad(
    raiseId: string,
    creatorCapId: string,
    assetType: string,
    stableType: string,
    outcome: 'success' | 'failure',
    clockId?: string
  ): this {
    const clock = clockId || '0x6';
    this.ensureBuilder();

    // Add all actions to builder
    for (const action of this.actions) {
      this.addActionToBuilder(this.tx, this.builder!, action, this.packages);
    }

    // Stage intent
    const stageTarget =
      outcome === 'success'
        ? `${this.packages.futarchyFactory}::launchpad::stage_success_intent`
        : `${this.packages.futarchyFactory}::launchpad::stage_failure_intent`;

    this.tx.moveCall({
      target: stageTarget,
      typeArguments: [assetType, stableType],
      arguments: [
        this.tx.object(raiseId),
        this.tx.object(this.sharedObjects.packageRegistry.id),
        this.tx.object(creatorCapId),
        this.builder!,
        this.tx.object(clock),
      ],
    });

    // Reset builder and actions for potential reuse (staging multiple outcomes)
    this.builder = null;
    this.actions = [];

    return this;
  }

  /**
   * Stage actions to a proposal outcome
   */
  stageToProposal(
    proposalId: string,
    assetType: string,
    stableType: string,
    outcomeIndex: number,
    maxActionsPerOutcome?: number
  ): this {
    this.ensureBuilder();

    // Add all actions to builder
    for (const action of this.actions) {
      this.addActionToBuilder(this.tx, this.builder!, action, this.packages);
    }

    // Convert builder to vector
    const specs = IntentBuilder.intoVector(this.tx, this.builder!, this.packages.accountActions);

    // Set intent spec for outcome
    this.tx.moveCall({
      target: `${this.packages.futarchyMarketsCore}::proposal::set_intent_spec_for_outcome`,
      typeArguments: [assetType, stableType],
      arguments: [
        this.tx.object(proposalId),
        this.tx.pure.u64(outcomeIndex),
        specs,
        this.tx.pure.u64(maxActionsPerOutcome || 10),
      ],
    });

    // Reset builder and actions for potential reuse (staging multiple outcomes)
    this.builder = null;
    this.actions = [];

    return this;
  }

  /**
   * Build the transaction
   */
  build(): Transaction {
    return this.tx;
  }

  /**
   * Get the accumulated actions (for inspection)
   */
  getActions(): ActionConfig[] {
    return [...this.actions];
  }

  /**
   * Clear all actions
   */
  clear(): this {
    this.actions = [];
    this.builder = null;
    this.tx = new Transaction();
    return this;
  }

  // ============================================================================
  // BUILDER UTILITIES
  // ============================================================================

  /**
   * Create a new action spec builder
   *
   * Use this for custom transaction building when you need direct control
   * over the builder lifecycle.
   *
   * @param tx - Transaction to add the builder to
   * @param accountActionsPackageId - Package ID for account_actions
   * @returns The builder result from the move call
   *
   * @example
   * ```typescript
   * const tx = new Transaction();
   * const builder = IntentBuilder.newBuilder(tx, packages.accountActions);
   * // Add actions to builder...
   * const specs = IntentBuilder.intoVector(tx, builder, packages.accountActions);
   * ```
   */
  static newBuilder(
    tx: Transaction,
    accountActionsPackageId: string
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: `${accountActionsPackageId}::action_spec_builder::new`,
      arguments: [],
    });
  }

  /**
   * Convert a builder into a vector of action specs
   *
   * Use this after adding all actions to finalize the builder
   * into a vector that can be passed to staging functions.
   *
   * @param tx - Transaction
   * @param builder - The builder to convert
   * @param accountActionsPackageId - Package ID for account_actions
   * @returns The vector of action specs
   *
   * @example
   * ```typescript
   * const tx = new Transaction();
   * const builder = IntentBuilder.newBuilder(tx, packages.accountActions);
   * // Add actions to builder...
   * const specs = IntentBuilder.intoVector(tx, builder, packages.accountActions);
   * // Use specs in proposal or launchpad staging...
   * ```
   */
  static intoVector(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    accountActionsPackageId: string
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: `${accountActionsPackageId}::action_spec_builder::into_vector`,
      arguments: [builder],
    });
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private ensureBuilder(): void {
    if (!this.builder) {
      this.builder = IntentBuilder.newBuilder(this.tx, this.packages.accountActions);
    }
  }

  // /**
  //  * Add an action to the builder
  //  * Can be called directly for custom transaction building
  //  */
  // addAction(action: ActionConfig): this {
  //   this.ensureBuilder();
  //   this.addActionToBuilder(this.tx, this.builder!, action, this.packages);
  //   this.actions.push(action);
  //   return this;
  // }
}
