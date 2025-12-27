/**
 * Launchpad Workflow - High-level orchestrator for token launches
 *
 * Provides simple, user-friendly API for the entire launchpad lifecycle:
 * 1. Create raise
 * 2. Stage success/failure actions
 * 3. Lock intents
 * 4. Contribute
 * 5. Complete raise
 * 6. Execute init actions
 * 7. Claim tokens
 *
 * @module workflows/launchpad-workflow
 */

import { Transaction, Inputs } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { SuiClient } from '@mysten/sui/client';
import {
  CreateRaiseConfig,
  StageActionsConfig,
  ContributeConfig,
  CompleteRaiseConfig,
  ExecuteLaunchpadActionsConfig,
  ActionConfig,
  WorkflowTransaction,
  ObjectIdOrRef,
  isOwnedObjectRef,
  isTxSharedObjectRef,
} from './types';
import { IntentExecutor, IntentExecutorPackages } from './intent-executor';

/**
 * Helper to convert ObjectIdOrRef to transaction object argument.
 * Uses Inputs.ObjectRef for owned objects and sharedObjectRef for shared objects
 * to avoid RPC lookups (important for localnet where indexing may lag).
 */
function txObject(tx: Transaction, input: ObjectIdOrRef) {
  if (isTxSharedObjectRef(input)) {
    const sharedVersion =
      typeof input.initialSharedVersion === 'string'
        ? input.initialSharedVersion
        : String(input.initialSharedVersion);
    return tx.object(
      Inputs.SharedObjectRef({
        objectId: input.objectId,
        initialSharedVersion: sharedVersion,
        mutable: input.mutable,
      })
    );
  }
  if (isOwnedObjectRef(input)) {
    return tx.object(
      Inputs.ObjectRef({
        objectId: input.objectId,
        version: typeof input.version === 'string' ? input.version : String(input.version),
        digest: input.digest,
      })
    );
  }
  return tx.object(input);
}

/**
 * Package IDs required for launchpad workflow
 */
export interface LaunchpadWorkflowPackages extends IntentExecutorPackages {
  futarchyTypesPackageId: string;
  oneShotUtilsPackageId?: string;
}

/**
 * Shared object references
 */
export interface LaunchpadWorkflowSharedObjects {
  factoryId: string;
  factorySharedVersion: number;
  packageRegistryId: string;
  packageRegistrySharedVersion: number;
  feeManagerId: string;
  feeManagerSharedVersion: number;
}

/**
 * Launchpad Workflow - Complete token launch orchestration
 *
 * @example
 * ```typescript
 * const workflow = new LaunchpadWorkflow(client, packages, sharedObjects);
 *
 * // Create a raise
 * const createTx = workflow.createRaise({
 *   assetType: '0x123::coin::COIN',
 *   stableType: '0x2::sui::SUI',
 *   treasuryCap: '0xCAP',
 *   coinMetadata: '0xMETA',
 *   tokensForSale: 1_000_000n,
 *   minRaiseAmount: 100_000_000n,
 *   allowedCaps: [1_000_000n, 10_000_000n],
 *   allowEarlyCompletion: true,
 *   description: 'My token launch',
 *   launchpadFee: 100n,
 * });
 *
 * // Stage success actions
 * const stageTx = workflow.stageActions({
 *   raiseId: '0x...',
 *   creatorCapId: '0x...',
 *   assetType: '0x123::coin::COIN',
 *   stableType: '0x2::sui::SUI',
 *   outcome: 'success',
 *   actions: [
 *     {
 *       type: 'create_stream',
 *       vaultName: 'treasury',
 *       beneficiary: '0xABC',
 *       amountPerIteration: 50_000_000n,
 *       startTime: Date.now() + 300_000,
 *       iterationsTotal: 12n,
 *       iterationPeriodMs: 2_592_000_000n,
 *       maxPerWithdrawal: 50_000_000n,
 *       // Note: All streams are always cancellable by DAO governance
 *     },
 *     {
 *       type: 'create_pool_with_mint',
 *       vaultName: 'treasury',
 *       assetAmount: 1_000_000_000n,
 *       stableAmount: 1_000_000_000n,
 *       feeBps: 30,
 *     },
 *   ],
 * });
 * ```
 */
export class LaunchpadWorkflow {
  private packages: LaunchpadWorkflowPackages;
  private sharedObjects: LaunchpadWorkflowSharedObjects;
  private intentExecutor: IntentExecutor;

  /** Unlimited cap constant for contribution tiers */
  static readonly UNLIMITED_CAP = 18446744073709551615n;

  constructor(
    client: SuiClient,
    packages: LaunchpadWorkflowPackages,
    sharedObjects: LaunchpadWorkflowSharedObjects
  ) {
    this.packages = packages;
    this.sharedObjects = sharedObjects;
    this.intentExecutor = new IntentExecutor(client, packages);
  }

  // ============================================================================
  // STEP 1: CREATE RAISE
  // ============================================================================

  /**
   * Create a new token raise
   */
  createRaise(config: CreateRaiseConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const { futarchyFactoryPackageId } = this.packages;
    const { factoryId, factorySharedVersion, feeManagerId, feeManagerSharedVersion } =
      this.sharedObjects;

    // Split launchpad fee from gas
    const [launchpadFeeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(config.launchpadFee)]);

    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::create_raise`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        // 1. factory (immutable)
        tx.sharedObjectRef({
          objectId: factoryId,
          initialSharedVersion: factorySharedVersion,
          mutable: false,
        }),
        // 2. fee_manager (mutable)
        tx.sharedObjectRef({
          objectId: feeManagerId,
          initialSharedVersion: feeManagerSharedVersion,
          mutable: true,
        }),
        // 3. treasury_cap
        tx.object(config.treasuryCap),
        // 4. coin_metadata
        tx.object(config.coinMetadata),
        // 5. affiliate_id
        tx.pure.string(config.affiliateId || ''),
        // 6. tokens_for_sale
        tx.pure.u64(config.tokensForSale),
        // 7. min_raise_amount
        tx.pure.u64(config.minRaiseAmount),
        // 8. allowed_caps (vector)
        tx.pure.vector('u64', config.allowedCaps.map(c => c)),
        // 9. start_delay_ms (Option)
        tx.pure.option('u64', config.startDelayMs ?? null),
        // 10. allow_early_completion
        tx.pure.bool(config.allowEarlyCompletion),
        // 11. description
        tx.pure.string(config.description),
        // 12. metadata_keys (vector)
        tx.pure.vector('string', config.metadataKeys || []),
        // 13. metadata_values (vector)
        tx.pure.vector('string', config.metadataValues || []),
        // 14. launchpad_fee (Coin<SUI>)
        launchpadFeeCoin,
        // 15. clock
        tx.object(clockId),
      ],
    });

    return {
      transaction: tx,
      description: 'Create token raise',
    };
  }

  // ============================================================================
  // STEP 2: STAGE ACTIONS
  // ============================================================================

  /**
   * Stage success or failure actions for a raise
   */
  stageActions(config: StageActionsConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const { accountActionsPackageId, futarchyFactoryPackageId } = this.packages;
    const { packageRegistryId } = this.sharedObjects;

    // Create action spec builder
    const builder = tx.moveCall({
      target: `${accountActionsPackageId}::action_spec_builder::new`,
      arguments: [],
    });

    // Add each action to the builder
    for (const action of config.actions) {
      this.addActionToBuilder(tx, builder, action, config);
    }

    // Stage as success or failure intent
    const stageTarget =
      config.outcome === 'success'
        ? `${futarchyFactoryPackageId}::launchpad::stage_success_intent`
        : `${futarchyFactoryPackageId}::launchpad::stage_failure_intent`;

    tx.moveCall({
      target: stageTarget,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        txObject(tx, config.raiseId),
        tx.object(packageRegistryId),
        txObject(tx, config.creatorCapId),
        builder,
        tx.object(clockId),
      ],
    });

    return {
      transaction: tx,
      description: `Stage ${config.actions.length} ${config.outcome} action(s)`,
    };
  }

  /**
   * Add an action configuration to the builder
   * Type arguments are now required for type-safe staging
   */
  private addActionToBuilder(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    action: ActionConfig,
    config: StageActionsConfig
  ): void {
    const { accountActionsPackageId, futarchyActionsPackageId, futarchyTypesPackageId } =
      this.packages;

    // Helper to get coin type - uses action's coinType if specified, otherwise falls back to config
    const getCoinType = (actionCoinType?: string, defaultType?: string): string => {
      const coinType = actionCoinType || defaultType;
      if (!coinType) {
        throw new Error('coinType is required for type-safe staging');
      }
      return coinType;
    };

    switch (action.type) {
      case 'create_stream':
        // Note: All streams are always cancellable by DAO governance
        // coinType determines which coin the stream will pay out
        tx.moveCall({
          target: `${accountActionsPackageId}::stream_init_actions::add_create_stream_spec`,
          typeArguments: [getCoinType(action.coinType, config.stableType)],
          arguments: [
            builder,
            tx.pure.string(action.vaultName),
            tx.pure(bcs.Address.serialize(action.beneficiary).toBytes()),
            tx.pure.u64(action.amountPerIteration),
            tx.pure.u64(action.startTime),
            tx.pure.u64(action.iterationsTotal),
            tx.pure.u64(action.iterationPeriodMs),
            tx.pure.option('u64', action.cliffTime ?? null),
            tx.pure.option('u64', action.claimWindowMs ? Number(action.claimWindowMs) : null),
            tx.pure.u64(action.maxPerWithdrawal),
          ],
        });
        break;

      case 'create_pool_with_mint':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::liquidity_init_actions::add_create_pool_with_mint_spec`,
          typeArguments: [
            action.assetType || config.assetType,
            action.stableType || config.stableType,
            action.lpType,
          ],
          arguments: [
            builder,
            tx.pure.string(action.vaultName),
            tx.pure.u64(action.assetAmount),
            tx.pure.u64(action.stableAmount),
            tx.pure.u64(action.feeBps),
            tx.pure.u64(action.launchFeeDurationMs ?? 0n),
          ],
        });
        break;

      case 'return_treasury_cap':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_return_treasury_cap_spec`,
          typeArguments: [getCoinType(action.coinType, config.assetType)],
          arguments: [builder, tx.pure.address(action.recipient)],
        });
        break;

      case 'return_metadata':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_return_metadata_spec`,
          typeArguments: [getCoinType(action.coinType, config.assetType)],
          arguments: [builder, tx.pure.address(action.recipient)],
        });
        break;

      case 'update_trading_params':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::futarchy_config_init_actions::add_update_trading_params_spec`,
          arguments: [
            builder,
            tx.pure.option('u64', action.minAssetAmount ? Number(action.minAssetAmount) : null),
            tx.pure.option('u64', action.minStableAmount ? Number(action.minStableAmount) : null),
            tx.pure.option('u64', action.reviewPeriodMs ? Number(action.reviewPeriodMs) : null),
            tx.pure.option('u64', action.tradingPeriodMs ? Number(action.tradingPeriodMs) : null),
            tx.pure.option('u64', action.ammTotalFeeBps ?? null),
          ],
        });
        break;

      case 'update_twap_config':
        // Create SignedU128 for threshold if provided
        let thresholdOption: ReturnType<Transaction['moveCall']>;
        if (action.threshold !== undefined) {
          const signedThreshold = tx.moveCall({
            target: `${futarchyTypesPackageId}::signed::from_u128`,
            arguments: [tx.pure.u128(action.threshold)],
          });
          thresholdOption = tx.moveCall({
            target: '0x1::option::some',
            typeArguments: [`${futarchyTypesPackageId}::signed::SignedU128`],
            arguments: [signedThreshold],
          });
        } else {
          thresholdOption = tx.moveCall({
            target: '0x1::option::none',
            typeArguments: [`${futarchyTypesPackageId}::signed::SignedU128`],
            arguments: [],
          });
        }

        tx.moveCall({
          target: `${futarchyActionsPackageId}::futarchy_config_init_actions::add_update_twap_config_spec`,
          arguments: [
            builder,
            tx.pure.option('u64', action.startDelay ? Number(action.startDelay) : null),
            tx.pure.option('u64', action.stepMax ? Number(action.stepMax) : null),
            tx.pure.option('u128', action.initialObservation ?? null),
            thresholdOption,
          ],
        });
        break;

      case 'update_governance':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::futarchy_config_init_actions::add_update_governance_spec`,
          arguments: [
            builder,
            tx.pure.option('u64', action.maxOutcomes ? Number(action.maxOutcomes) : null),
            tx.pure.option('u64', action.maxActionsPerOutcome ? Number(action.maxActionsPerOutcome) : null),
            tx.pure.option('u64', action.requiredBondAmount ? Number(action.requiredBondAmount) : null),
            tx.pure.option('u64', action.maxIntentsPerOutcome ? Number(action.maxIntentsPerOutcome) : null),
            tx.pure.option('u64', action.proposalIntentExpiryMs ? Number(action.proposalIntentExpiryMs) : null),
            tx.pure.option('u64', action.optimisticChallengeFee ? Number(action.optimisticChallengeFee) : null),
            tx.pure.option('u64', action.optimisticChallengePeriodMs ? Number(action.optimisticChallengePeriodMs) : null),
            tx.pure.option('u64', action.proposalCreationFee ? Number(action.proposalCreationFee) : null),
            tx.pure.option('u64', action.proposalFeePerOutcome ? Number(action.proposalFeePerOutcome) : null),
            tx.pure.option('bool', action.feeInAssetToken ?? null),
            tx.pure.option('bool', action.acceptNewProposals ?? null),
            tx.pure.option('bool', action.enablePremarketReservationLock ?? null),
            tx.pure.option('bool', action.showProposalDetails ?? null),
          ],
        });
        break;

      case 'mint':
        // Mint tokens and store in executable_resources for subsequent actions
        tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_mint_spec`,
          typeArguments: [getCoinType(action.coinType, config.assetType)],
          arguments: [
            builder,
            tx.pure.u64(action.amount),
            tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'burn':
        // Burn tokens from executable_resources
        tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_burn_spec`,
          typeArguments: [getCoinType(action.coinType, config.assetType)],
          arguments: [
            builder,
            tx.pure.u64(action.amount),
            tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'deposit':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_deposit_spec`,
          typeArguments: [getCoinType(action.coinType, config.assetType)],
          arguments: [
            builder,
            tx.pure.string(action.vaultName),
            tx.pure.u64(action.amount),
            tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'spend':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_spend_spec`,
          typeArguments: [getCoinType(action.coinType, config.assetType)],
          arguments: [
            builder,
            tx.pure.string(action.vaultName),
            tx.pure.u64(action.amount),
            tx.pure.bool(action.spendAll),
            tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'transfer':
        tx.moveCall({
          target: `${accountActionsPackageId}::transfer_init_actions::add_transfer_object_spec`,
          arguments: [
            builder,
            tx.pure.address(action.recipient),
            tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'transfer_to_sender':
        tx.moveCall({
          target: `${accountActionsPackageId}::transfer_init_actions::add_transfer_to_sender_spec`,
          arguments: [builder, tx.pure.string(action.resourceName)],
        });
        break;

      case 'transfer_coin':
        // Use this when the coin was placed via provide_coin (e.g., from VaultSpend)
        tx.moveCall({
          target: `${accountActionsPackageId}::transfer_init_actions::add_transfer_coin_spec`,
          typeArguments: [getCoinType(action.coinType, config.assetType)],
          arguments: [
            builder,
            tx.pure.address(action.recipient),
            tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'transfer_coin_to_sender':
        // Use this for crank fees when the coin was placed via provide_coin
        tx.moveCall({
          target: `${accountActionsPackageId}::transfer_init_actions::add_transfer_coin_to_sender_spec`,
          typeArguments: [getCoinType(action.coinType, config.assetType)],
          arguments: [builder, tx.pure.string(action.resourceName)],
        });
        break;

      case 'memo':
        tx.moveCall({
          target: `${accountActionsPackageId}::memo_init_actions::add_emit_memo_spec`,
          arguments: [builder, tx.pure.string(action.message)],
        });
        break;

      case 'cancel_stream':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_cancel_stream_spec`,
          typeArguments: [getCoinType(action.coinType, config.stableType)],
          arguments: [
            builder,
            tx.pure.string(action.vaultName),
            tx.pure.address(action.streamId),
          ],
        });
        break;

      case 'approve_coin_type':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_approve_coin_type_spec`,
          typeArguments: [getCoinType(action.coinType, config.stableType)],
          arguments: [builder, tx.pure.string(action.vaultName)],
        });
        break;

      case 'remove_approved_coin_type':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_remove_approved_coin_type_spec`,
          typeArguments: [getCoinType(action.coinType, config.stableType)],
          arguments: [builder, tx.pure.string(action.vaultName)],
        });
        break;

      case 'deposit_from_resources':
        // Deposit coins from executable_resources into specified vault
        tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_deposit_from_resources_spec`,
          typeArguments: [getCoinType(action.coinType, config.assetType)],
          arguments: [builder, tx.pure.string(action.vaultName), tx.pure.string(action.resourceName)],
        });
        break;

      case 'disable_currency':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_disable_spec`,
          typeArguments: [getCoinType(action.coinType, config.assetType)],
          arguments: [
            builder,
            tx.pure.bool(action.mint),
            tx.pure.bool(action.burn),
            tx.pure.bool(action.updateSymbol),
            tx.pure.bool(action.updateName),
            tx.pure.bool(action.updateDescription),
            tx.pure.bool(action.updateIcon),
          ],
        });
        break;

      case 'update_currency':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_update_spec`,
          typeArguments: [getCoinType(action.coinType, config.assetType)],
          arguments: [
            builder,
            tx.pure.option('string', action.symbol ?? null),
            tx.pure.option('string', action.name ?? null),
            tx.pure.option('string', action.description ?? null),
            tx.pure.option('string', action.iconUrl ?? null),
          ],
        });
        break;

      case 'create_dissolution_capability':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::dissolution_init_actions::add_create_dissolution_capability_spec`,
          typeArguments: [action.assetType || config.assetType],
          arguments: [builder],
        });
        break;

      default:
        throw new Error(`Unknown action type: ${(action as { type?: string }).type}`);
    }
  }

  // ============================================================================
  // STEP 3: LOCK INTENTS
  // ============================================================================

  /**
   * Lock intents and start the raise (prevents further modifications)
   */
  lockIntentsAndStart(
    raiseId: ObjectIdOrRef,
    creatorCapId: ObjectIdOrRef,
    assetType: string,
    stableType: string
  ): WorkflowTransaction {
    const tx = new Transaction();

    const { futarchyFactoryPackageId } = this.packages;

    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::lock_intents_and_start_raise`,
      typeArguments: [assetType, stableType],
      arguments: [txObject(tx, raiseId), txObject(tx, creatorCapId)],
    });

    return {
      transaction: tx,
      description: 'Lock intents and start raise',
    };
  }

  // ============================================================================
  // STEP 4: CONTRIBUTE
  // ============================================================================

  /**
   * Contribute to a raise
   */
  contribute(config: ContributeConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const { futarchyFactoryPackageId } = this.packages;
    const { factoryId, factorySharedVersion } = this.sharedObjects;

    // Merge coins if multiple provided
    const coinObjects = config.stableCoins.map((id) => tx.object(id));
    const [firstCoin, ...restCoins] = coinObjects;

    if (restCoins.length > 0) {
      tx.mergeCoins(firstCoin, restCoins);
    }

    // Split payment and crank fee
    const [paymentCoin] = tx.splitCoins(firstCoin, [tx.pure.u64(config.amount)]);
    const [crankFeeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(config.crankFee)]);

    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::contribute`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        txObject(tx, config.raiseId),
        tx.sharedObjectRef({
          objectId: factoryId,
          initialSharedVersion: factorySharedVersion,
          mutable: false,
        }),
        paymentCoin,
        tx.pure.u64(config.capTier),
        crankFeeCoin,
        tx.object(clockId),
      ],
    });

    // Note: Caller should handle returning leftover coins to sender
    // using tx.transferObjects([firstCoin], tx.pure.address(senderAddress))

    return {
      transaction: tx,
      description: `Contribute ${config.amount} to raise`,
    };
  }

  // ============================================================================
  // STEP 5: COMPLETE RAISE
  // ============================================================================

  /**
   * Complete a raise (settle, create DAO, finalize)
   */
  completeRaise(config: CompleteRaiseConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const { futarchyFactoryPackageId } = this.packages;
    const { factoryId, packageRegistryId } = this.sharedObjects;

    // 1. Settle raise
    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::settle_raise`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [txObject(tx, config.raiseId), tx.object(clockId)],
    });

    // 2. Begin DAO creation
    const unsharedDao = tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::begin_dao_creation`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        txObject(tx, config.raiseId),
        tx.object(factoryId),
        tx.object(packageRegistryId),
        tx.object(clockId),
      ],
    });

    // 3. Finalize and share DAO (JIT conversion happens inside)
    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::finalize_and_share_dao`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        txObject(tx, config.raiseId),
        unsharedDao,
        tx.object(packageRegistryId),
        tx.object(clockId),
      ],
    });

    return {
      transaction: tx,
      description: 'Complete raise and create DAO',
    };
  }

  // ============================================================================
  // STEP 6: EXECUTE INIT ACTIONS
  // ============================================================================

  /**
   * Execute launchpad init actions
   */
  executeActions(config: ExecuteLaunchpadActionsConfig): WorkflowTransaction {
    return this.intentExecutor.execute({
      intentType: 'launchpad',
      accountId: config.accountId,
      raiseId: config.raiseId,
      assetType: config.assetType,
      stableType: config.stableType,
      clockId: config.clockId,
      actions: config.actionTypes.map((at) => {
        switch (at.type) {
          case 'create_stream':
            return { action: 'create_stream' as const, coinType: at.coinType };
          case 'create_pool_with_mint':
            return {
              action: 'create_pool_with_mint' as const,
              assetType: at.assetType,
              stableType: at.stableType,
              lpType: at.lpType,
              lpTreasuryCapId: at.lpTreasuryCapId,
              lpMetadataId: at.lpMetadataId,
            };
          case 'update_trading_params':
            return { action: 'update_trading_params' as const };
          case 'update_twap_config':
            return { action: 'update_twap_config' as const };
          case 'update_governance':
            return { action: 'update_governance' as const };
          case 'return_treasury_cap':
            return { action: 'return_treasury_cap' as const, coinType: at.coinType };
          case 'return_metadata':
            return {
              action: 'return_metadata' as const,
              coinType: at.coinType,
              keyType: `${this.packages.accountActionsPackageId}::currency::CoinMetadataKey<${at.coinType}>`,
            };
          case 'mint':
            return { action: 'mint' as const, coinType: at.coinType };
          case 'transfer_coin':
            return { action: 'transfer_coin' as const, coinType: at.coinType };
          case 'deposit':
            return { action: 'deposit' as const, coinType: at.coinType };
          case 'deposit_from_resources':
            return { action: 'deposit_from_resources' as const, coinType: at.coinType };
          default:
            throw new Error(`Unknown action type: ${(at as { type?: string }).type}`);
        }
      }),
    });
  }

  // ============================================================================
  // STEP 7: CLAIM TOKENS
  // ============================================================================

  /**
   * Claim tokens from a completed raise
   */
  claimTokens(
    raiseId: ObjectIdOrRef,
    assetType: string,
    stableType: string,
    clockId?: string
  ): WorkflowTransaction {
    const tx = new Transaction();
    const clock = clockId || '0x6';

    const { futarchyFactoryPackageId } = this.packages;

    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::claim_tokens`,
      typeArguments: [assetType, stableType],
      arguments: [txObject(tx, raiseId), tx.object(clock)],
    });

    return {
      transaction: tx,
      description: 'Claim tokens from raise',
    };
  }

  // ============================================================================
  // CONVENIENCE: FULL FLOW HELPERS
  // ============================================================================

  /**
   * Create a raise with pre-staged success and failure actions
   *
   * This combines createRaise + stageActions (success) + stageActions (failure)
   * into a single transaction when possible, or returns multiple transactions
   * if they must be sequential.
   *
   * @param raiseConfig - Configuration for the raise
   * @param successActions - Actions to execute on raise success
   * @param failureActions - Actions to execute on raise failure
   * @returns Object with transaction builders that accept ObjectIdOrRef (string or full ObjectRef)
   */
  createRaiseWithActions(
    raiseConfig: CreateRaiseConfig,
    successActions: ActionConfig[],
    failureActions: ActionConfig[],
    _creatorAddress?: string // Reserved for future use
  ): {
    createTx: WorkflowTransaction;
    stageSuccessTx: (raiseId: ObjectIdOrRef, creatorCapId: ObjectIdOrRef) => WorkflowTransaction;
    stageFailureTx: (raiseId: ObjectIdOrRef, creatorCapId: ObjectIdOrRef) => WorkflowTransaction;
    lockTx: (raiseId: ObjectIdOrRef, creatorCapId: ObjectIdOrRef) => WorkflowTransaction;
  } {
    const createTx = this.createRaise(raiseConfig);

    const stageSuccessTx = (raiseId: ObjectIdOrRef, creatorCapId: ObjectIdOrRef) =>
      this.stageActions({
        raiseId,
        creatorCapId,
        assetType: raiseConfig.assetType,
        stableType: raiseConfig.stableType,
        outcome: 'success',
        actions: successActions,
      });

    const stageFailureTx = (raiseId: ObjectIdOrRef, creatorCapId: ObjectIdOrRef) =>
      this.stageActions({
        raiseId,
        creatorCapId,
        assetType: raiseConfig.assetType,
        stableType: raiseConfig.stableType,
        outcome: 'failure',
        actions: failureActions,
      });

    const lockTx = (raiseId: ObjectIdOrRef, creatorCapId: ObjectIdOrRef) =>
      this.lockIntentsAndStart(
        raiseId,
        creatorCapId,
        raiseConfig.assetType,
        raiseConfig.stableType
      );

    return { createTx, stageSuccessTx, stageFailureTx, lockTx };
  }
}
