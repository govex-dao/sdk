/**
 * Transaction Composer - Fluent API for building complex PTBs
 *
 * Provides a composable, chainable interface for building transactions
 * that involve multiple actions, staging, and execution.
 *
 * @module ptb/transaction-composer
 */

import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { ActionConfig } from '../workflows/types';

/**
 * Package IDs required for transaction composition
 */
export interface TransactionComposerPackages {
  accountActionsPackageId: string;
  futarchyActionsPackageId: string;
  futarchyTypesPackageId: string;
  futarchyFactoryPackageId: string;
  futarchyMarketsCorePackageId: string;
}

/**
 * Shared object references for staging
 */
export interface TransactionComposerSharedObjects {
  packageRegistryId: string;
}

/**
 * Transaction Composer - Fluent builder for PTBs
 *
 * @example
 * ```typescript
 * const composer = new TransactionComposer(packages, sharedObjects);
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
export class TransactionComposer {
  private packages: TransactionComposerPackages;
  private sharedObjects: TransactionComposerSharedObjects;

  constructor(
    packages: TransactionComposerPackages,
    sharedObjects: TransactionComposerSharedObjects
  ) {
    this.packages = packages;
    this.sharedObjects = sharedObjects;
  }

  /**
   * Create a new composable transaction builder
   */
  new(): TransactionBuilder {
    return new TransactionBuilder(this.packages, this.sharedObjects);
  }
}

/**
 * Chainable transaction builder
 */
export class TransactionBuilder {
  private tx: Transaction;
  private builder: ReturnType<Transaction['moveCall']> | null = null;
  private actions: ActionConfig[] = [];
  private packages: TransactionComposerPackages;
  private sharedObjects: TransactionComposerSharedObjects;

  constructor(
    packages: TransactionComposerPackages,
    sharedObjects: TransactionComposerSharedObjects
  ) {
    this.tx = new Transaction();
    this.packages = packages;
    this.sharedObjects = sharedObjects;
  }

  /**
   * Get the underlying Transaction (for advanced use)
   */
  getTransaction(): Transaction {
    return this.tx;
  }

  /**
   * Add a create stream action
   * Note: All vault streams are DAO-controlled (always cancellable, non-transferable).
   * For transferable vestings with beneficiary control, use the standalone vesting module.
   */
  addStream(config: {
    vaultName: string;
    beneficiary: string;
    amountPerIteration: bigint;
    startTime: number;
    iterationsTotal: bigint;
    iterationPeriodMs: bigint;
    cliffTime?: number;
    claimWindowMs?: bigint;
    maxPerWithdrawal: bigint;
  }): this {
    this.actions.push({
      type: 'create_stream',
      ...config,
    });
    return this;
  }

  /**
   * Add a create pool with mint action
   */
  addPoolWithMint(config: {
    vaultName: string;
    assetAmount: bigint;
    stableAmount: bigint;
    feeBps: number;
    lpType: string;
    lpTreasuryCapId: string;
    lpMetadataId: string;
  }): this {
    this.actions.push({
      type: 'create_pool_with_mint',
      ...config,
    });
    return this;
  }

  /**
   * Add a return treasury cap action
   */
  addReturnTreasuryCap(recipient: string): this {
    this.actions.push({
      type: 'return_treasury_cap',
      recipient,
    });
    return this;
  }

  /**
   * Add a return metadata action
   */
  addReturnMetadata(recipient: string): this {
    this.actions.push({
      type: 'return_metadata',
      recipient,
    });
    return this;
  }

  /**
   * Add an update trading params action
   */
  addUpdateTradingParams(config: {
    minAssetAmount?: bigint;
    minStableAmount?: bigint;
    reviewPeriodMs?: bigint;
    tradingPeriodMs?: bigint;
    ammTotalFeeBps?: number;
  }): this {
    this.actions.push({
      type: 'update_trading_params',
      ...config,
    });
    return this;
  }

  /**
   * Add an update TWAP config action
   */
  addUpdateTwapConfig(config: {
    startDelay?: bigint;
    stepMax?: bigint;
    initialObservation?: bigint;
    threshold?: bigint;
  }): this {
    this.actions.push({
      type: 'update_twap_config',
      ...config,
    });
    return this;
  }

  /**
   * Add a mint action
   * The minted coin is stored in executable_resources under resourceName
   * @param amount - Amount to mint
   * @param resourceName - Name to store the minted coin in executable_resources
   */
  addMint(amount: bigint, resourceName: string): this {
    this.actions.push({
      type: 'mint',
      amount,
      resourceName,
    });
    return this;
  }

  /**
   * Add a burn action
   * The coin to burn is taken from executable_resources under resourceName
   * @param amount - Amount to burn
   * @param resourceName - Name of the coin to burn from executable_resources
   */
  addBurn(amount: bigint, resourceName: string): this {
    this.actions.push({
      type: 'burn',
      amount,
      resourceName,
    });
    return this;
  }

  /**
   * Add a deposit action
   * @param resourceName - The name of the resource to take from executable_resources
   */
  addDeposit(vaultName: string, amount: bigint, resourceName: string): this {
    this.actions.push({
      type: 'deposit',
      vaultName,
      amount,
      resourceName,
    });
    return this;
  }

  /**
   * Add a spend action
   * @param resourceName - The name to store the coin in executable_resources
   */
  addSpend(vaultName: string, amount: bigint, spendAll: boolean, resourceName: string): this {
    this.actions.push({
      type: 'spend',
      vaultName,
      amount,
      spendAll,
      resourceName,
    });
    return this;
  }

  /**
   * Add a transfer action
   * @param resourceName - The name of the resource to take from executable_resources
   */
  addTransfer(recipient: string, resourceName: string): this {
    this.actions.push({
      type: 'transfer',
      recipient,
      resourceName,
    });
    return this;
  }

  /**
   * Add a transfer to sender action
   * @param resourceName - The name of the resource to take from executable_resources
   */
  addTransferToSender(resourceName: string): this {
    this.actions.push({
      type: 'transfer_to_sender',
      resourceName,
    });
    return this;
  }

  /**
   * Add a transfer coin action (for coins via provide_coin)
   * Use this when the coin was placed via provide_coin (e.g., from VaultSpend)
   * @param recipient - The address to transfer the coin to
   * @param resourceName - The name of the coin resource in executable_resources
   */
  addTransferCoin(recipient: string, resourceName: string): this {
    this.actions.push({
      type: 'transfer_coin',
      recipient,
      resourceName,
    });
    return this;
  }

  /**
   * Add a transfer coin to sender action (for coins via provide_coin)
   * Use this for crank fees when the coin was placed via provide_coin
   * @param resourceName - The name of the coin resource in executable_resources
   */
  addTransferCoinToSender(resourceName: string): this {
    this.actions.push({
      type: 'transfer_coin_to_sender',
      resourceName,
    });
    return this;
  }

  /**
   * Add a memo action
   */
  addMemo(message: string): this {
    this.actions.push({
      type: 'memo',
      message,
    });
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
      this.addActionToBuilder(action);
    }

    // Stage intent
    const stageTarget =
      outcome === 'success'
        ? `${this.packages.futarchyFactoryPackageId}::launchpad::stage_success_intent`
        : `${this.packages.futarchyFactoryPackageId}::launchpad::stage_failure_intent`;

    this.tx.moveCall({
      target: stageTarget,
      typeArguments: [assetType, stableType],
      arguments: [
        this.tx.object(raiseId),
        this.tx.object(this.sharedObjects.packageRegistryId),
        this.tx.object(creatorCapId),
        this.builder!,
        this.tx.object(clock),
      ],
    });

    return this;
  }

  /**
   * Stage actions to a proposal outcome
   *
   * SECURITY: Action packages are validated against the whitelist at staging time.
   *
   * @param proposalId - Proposal object ID
   * @param assetType - Asset coin type
   * @param stableType - Stable coin type
   * @param outcomeIndex - Outcome index (0 = Reject, 1+ = Accept)
   * @param daoAccountId - DAO account ID for whitelist validation
   * @param registryId - Package registry ID for whitelist validation
   * @param maxActionsPerOutcome - Max actions per outcome (default 10)
   */
  stageToProposal(
    proposalId: string,
    assetType: string,
    stableType: string,
    outcomeIndex: number,
    daoAccountId: string,
    registryId: string,
    maxActionsPerOutcome?: number
  ): this {
    this.ensureBuilder();

    // Add all actions to builder
    for (const action of this.actions) {
      this.addActionToBuilder(action);
    }

    // Convert builder to vector
    const specs = this.tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::action_spec_builder::into_vector`,
      arguments: [this.builder!],
    });

    // Set intent spec for outcome (with whitelist validation)
    this.tx.moveCall({
      target: `${this.packages.futarchyMarketsCorePackageId}::proposal::set_intent_spec_for_outcome`,
      typeArguments: [assetType, stableType],
      arguments: [
        this.tx.object(proposalId),
        this.tx.pure.u64(outcomeIndex),
        specs,
        this.tx.pure.u64(maxActionsPerOutcome || 10),
        this.tx.object(daoAccountId),    // account for whitelist check
        this.tx.object(registryId),       // PackageRegistry
      ],
    });

    // Reset builder for potential reuse
    this.builder = null;

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
  // PRIVATE HELPERS
  // ============================================================================

  private ensureBuilder(): void {
    if (!this.builder) {
      this.builder = this.tx.moveCall({
        target: `${this.packages.accountActionsPackageId}::action_spec_builder::new`,
        arguments: [],
      });
    }
  }

  private addActionToBuilder(action: ActionConfig): void {
    const { accountActionsPackageId, futarchyActionsPackageId, futarchyTypesPackageId } =
      this.packages;

    switch (action.type) {
      case 'create_stream':
        this.tx.moveCall({
          target: `${accountActionsPackageId}::stream_init_actions::add_create_stream_spec`,
          arguments: [
            this.builder!,
            this.tx.pure.string(action.vaultName),
            this.tx.pure(bcs.Address.serialize(action.beneficiary).toBytes()),
            this.tx.pure.u64(action.amountPerIteration),
            this.tx.pure.u64(action.startTime),
            this.tx.pure.u64(action.iterationsTotal),
            this.tx.pure.u64(action.iterationPeriodMs),
            this.tx.pure.option('u64', action.cliffTime ?? null),
            this.tx.pure.option('u64', action.claimWindowMs ? Number(action.claimWindowMs) : null),
            this.tx.pure.u64(action.maxPerWithdrawal),
          ],
        });
        break;

      case 'create_pool_with_mint':
        this.tx.moveCall({
          target: `${futarchyActionsPackageId}::liquidity_init_actions::add_create_pool_with_mint_spec`,
          arguments: [
            this.builder!,
            this.tx.pure.string(action.vaultName),
            this.tx.pure.u64(action.assetAmount),
            this.tx.pure.u64(action.stableAmount),
            this.tx.pure.u64(action.feeBps),
            this.tx.pure.u64(action.launchFeeDurationMs ?? 0n),
          ],
        });
        break;

      case 'return_treasury_cap':
        this.tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_return_treasury_cap_spec`,
          arguments: [this.builder!, this.tx.pure.address(action.recipient)],
        });
        break;

      case 'return_metadata':
        this.tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_return_metadata_spec`,
          arguments: [this.builder!, this.tx.pure.address(action.recipient)],
        });
        break;

      case 'update_trading_params':
        this.tx.moveCall({
          target: `${futarchyActionsPackageId}::futarchy_config_init_actions::add_update_trading_params_spec`,
          arguments: [
            this.builder!,
            this.tx.pure.option('u64', action.minAssetAmount ? Number(action.minAssetAmount) : null),
            this.tx.pure.option('u64', action.minStableAmount ? Number(action.minStableAmount) : null),
            this.tx.pure.option('u64', action.reviewPeriodMs ? Number(action.reviewPeriodMs) : null),
            this.tx.pure.option('u64', action.tradingPeriodMs ? Number(action.tradingPeriodMs) : null),
            this.tx.pure.option('u64', action.ammTotalFeeBps ?? null),
          ],
        });
        break;

      case 'update_twap_config':
        let thresholdOption: ReturnType<Transaction['moveCall']>;
        if (action.threshold !== undefined) {
          const signedThreshold = this.tx.moveCall({
            target: `${futarchyTypesPackageId}::signed::from_u128`,
            arguments: [this.tx.pure.u128(action.threshold)],
          });
          thresholdOption = this.tx.moveCall({
            target: '0x1::option::some',
            typeArguments: [`${futarchyTypesPackageId}::signed::SignedU128`],
            arguments: [signedThreshold],
          });
        } else {
          thresholdOption = this.tx.moveCall({
            target: '0x1::option::none',
            typeArguments: [`${futarchyTypesPackageId}::signed::SignedU128`],
            arguments: [],
          });
        }

        this.tx.moveCall({
          target: `${futarchyActionsPackageId}::futarchy_config_init_actions::add_update_twap_config_spec`,
          arguments: [
            this.builder!,
            this.tx.pure.option('u64', action.startDelay ? Number(action.startDelay) : null),
            this.tx.pure.option('u64', action.stepMax ? Number(action.stepMax) : null),
            this.tx.pure.option('u128', action.initialObservation ?? null),
            thresholdOption,
          ],
        });
        break;

      case 'mint':
        this.tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_mint_spec`,
          arguments: [
            this.builder!,
            this.tx.pure.u64(action.amount),
          ],
        });
        break;

      case 'burn':
        this.tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_burn_spec`,
          arguments: [
            this.builder!,
            this.tx.pure.u64(action.amount),
          ],
        });
        break;

      case 'deposit':
        this.tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_deposit_spec`,
          arguments: [
            this.builder!,
            this.tx.pure.string(action.vaultName),
            this.tx.pure.u64(action.amount),
            this.tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'spend':
        this.tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_spend_spec`,
          arguments: [
            this.builder!,
            this.tx.pure.string(action.vaultName),
            this.tx.pure.u64(action.amount),
            this.tx.pure.bool(action.spendAll),
            this.tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'transfer':
        this.tx.moveCall({
          target: `${accountActionsPackageId}::transfer_init_actions::add_transfer_object_spec`,
          arguments: [
            this.builder!,
            this.tx.pure.address(action.recipient),
            this.tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'transfer_to_sender':
        this.tx.moveCall({
          target: `${accountActionsPackageId}::transfer_init_actions::add_transfer_to_sender_spec`,
          arguments: [
            this.builder!,
            this.tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'transfer_coin':
        // Use this when the coin was placed via provide_coin (e.g., from VaultSpend)
        this.tx.moveCall({
          target: `${accountActionsPackageId}::transfer_init_actions::add_transfer_coin_spec`,
          arguments: [
            this.builder!,
            this.tx.pure.address(action.recipient),
            this.tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'transfer_coin_to_sender':
        // Use this for crank fees when the coin was placed via provide_coin
        this.tx.moveCall({
          target: `${accountActionsPackageId}::transfer_init_actions::add_transfer_coin_to_sender_spec`,
          arguments: [
            this.builder!,
            this.tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'memo':
        this.tx.moveCall({
          target: `${accountActionsPackageId}::memo_init_actions::add_emit_memo_spec`,
          arguments: [this.builder!, this.tx.pure.string(action.message)],
        });
        break;

      default:
        throw new Error(`Unknown action type: ${(action as { type?: string }).type}`);
    }
  }
}
