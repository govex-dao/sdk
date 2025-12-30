/**
 * Launchpad Workflow - High-level orchestrator for token launches
 *
 * Provides simple, user-friendly API for the entire launchpad lifecycle.
 *
 * ATOMIC CREATION FLOW (single PTB):
 * 1. create_raise (returns UnsharedRaise)
 * 2. stage_success_intent (on UnsharedRaise)
 * 3. stage_failure_intent (on UnsharedRaise)
 * 4. lock_and_share_raise (consumes UnsharedRaise)
 *
 * POST-CREATION FLOW:
 * 5. Contribute
 * 6. Complete raise (settle + create DAO + execute init actions)
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
  ActionConfig,
  WorkflowTransaction,
  ObjectIdOrRef,
  isOwnedObjectRef,
  isTxSharedObjectRef,
} from './types';
import type { IntentExecutorPackages } from './intent-executor';

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
  factorySharedVersion: number | string;
  packageRegistryId: string;
  packageRegistrySharedVersion: number | string;
  feeManagerId: string;
  feeManagerSharedVersion: number | string;
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

  /** Unlimited cap constant for contribution tiers */
  static readonly UNLIMITED_CAP = 18446744073709551615n;

  constructor(
    _client: SuiClient, // Reserved for future async operations
    packages: LaunchpadWorkflowPackages,
    sharedObjects: LaunchpadWorkflowSharedObjects
  ) {
    this.packages = packages;
    this.sharedObjects = sharedObjects;
  }

  // ============================================================================
  // STEP 1: CREATE RAISE (ATOMIC - includes action staging and locking)
  // ============================================================================

  /**
   * Create a raise with staged actions in a single atomic transaction.
   *
   * This builds a single PTB that:
   * 1. create_raise → returns UnsharedRaise
   * 2. stage_success_intent → stages success actions on UnsharedRaise
   * 3. stage_failure_intent → stages failure actions on UnsharedRaise
   * 4. lock_and_share_raise → locks intents and shares the Raise
   *
   * All steps happen atomically - if any fails, everything rolls back.
   *
   * @param config - Raise configuration
   * @param successActions - Actions to execute on raise success
   * @param failureActions - Actions to execute on raise failure
   */
  createRaise(
    config: CreateRaiseConfig,
    successActions: ActionConfig[] = [],
    failureActions: ActionConfig[] = []
  ): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const { accountActionsPackageId, futarchyFactoryPackageId } = this.packages;
    const {
      factoryId,
      factorySharedVersion,
      feeManagerId,
      feeManagerSharedVersion,
      packageRegistryId,
      packageRegistrySharedVersion,
    } = this.sharedObjects;

    // Split launchpad fee from gas
    const [launchpadFeeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(config.launchpadFee)]);

    // 1. Create raise (returns UnsharedRaise hot potato)
    const unsharedRaise = tx.moveCall({
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

    // 2. Stage success actions (if any)
    if (successActions.length > 0) {
      // Create action spec builder
      const successBuilder = tx.moveCall({
        target: `${accountActionsPackageId}::action_spec_builder::new`,
        arguments: [],
      });

      // Add each action to the builder
      for (const action of successActions) {
        this.addActionToBuilder(tx, successBuilder, action, {
          assetType: config.assetType,
          stableType: config.stableType,
        } as StageActionsConfig);
      }

      // Stage success intent on UnsharedRaise
      tx.moveCall({
        target: `${futarchyFactoryPackageId}::launchpad::stage_success_intent`,
        typeArguments: [config.assetType, config.stableType],
        arguments: [
          unsharedRaise,
          tx.sharedObjectRef({
            objectId: packageRegistryId,
            initialSharedVersion: packageRegistrySharedVersion,
            mutable: false,
          }),
          successBuilder,
          tx.object(clockId),
        ],
      });
    }

    // 3. Stage failure actions (if any)
    if (failureActions.length > 0) {
      // Create action spec builder
      const failureBuilder = tx.moveCall({
        target: `${accountActionsPackageId}::action_spec_builder::new`,
        arguments: [],
      });

      // Add each action to the builder
      for (const action of failureActions) {
        this.addActionToBuilder(tx, failureBuilder, action, {
          assetType: config.assetType,
          stableType: config.stableType,
        } as StageActionsConfig);
      }

      // Stage failure intent on UnsharedRaise
      tx.moveCall({
        target: `${futarchyFactoryPackageId}::launchpad::stage_failure_intent`,
        typeArguments: [config.assetType, config.stableType],
        arguments: [
          unsharedRaise,
          tx.sharedObjectRef({
            objectId: packageRegistryId,
            initialSharedVersion: packageRegistrySharedVersion,
            mutable: false,
          }),
          failureBuilder,
          tx.object(clockId),
        ],
      });
    }

    // 4. Lock intents and share raise (consumes UnsharedRaise)
    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::lock_and_share_raise`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [unsharedRaise],
    });

    return {
      transaction: tx,
      description: `Create raise with ${successActions.length} success and ${failureActions.length} failure action(s)`,
    };
  }

  // ============================================================================
  // NOTE: Stage actions is now integrated into createRaise (atomic flow)
  // The old separate stageActions method has been removed.
  // ============================================================================

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
  // NOTE: Lock intents is now integrated into createRaise (atomic flow)
  // The old separate lockIntentsAndStart method has been removed.
  // ============================================================================

  // ============================================================================
  // STEP 2: CONTRIBUTE
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
  // STEP 3: COMPLETE RAISE (CREATE DAO)
  // ============================================================================

  /**
   * Complete a raise and create the DAO.
   *
   * NOTE: Init actions must be executed in a separate transaction via
   * executeInitActions() after this transaction completes. This is required
   * because Sui PTBs cannot get &mut Account from UnsharedDao.
   *
   * Returns account ID in RaiseSuccessful or RaiseFailed event.
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

    // 3. Finalize and share DAO
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
      description: `Complete raise and create DAO`,
    };
  }

  // ============================================================================
  // STEP 4: EXECUTE INIT ACTIONS (SEPARATE TRANSACTION)
  // ============================================================================

  /**
   * Execute init actions on the shared account.
   *
   * Must be called after completeRaise() in a separate transaction.
   */
  executeInitActions(config: {
    raiseId: ObjectIdOrRef;
    accountId: string;
    actionTypes: import('./types').LaunchpadActionType[];
    clockId?: string;
  }): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const {
      accountActionsPackageId,
      futarchyCorePackageId,
      futarchyActionsPackageId,
      futarchyFactoryPackageId,
    } = this.packages;
    const { packageRegistryId } = this.sharedObjects;

    // Type context
    const configType = `${futarchyCorePackageId}::futarchy_config::FutarchyConfig`;
    const outcomeType = `${futarchyFactoryPackageId}::dao_init_outcome::DaoInitOutcome`;
    const witnessType = `${futarchyFactoryPackageId}::dao_init_executor::DaoInitIntent`;

    // Begin execution
    const executable = tx.moveCall({
      target: `${futarchyFactoryPackageId}::dao_init_executor::begin_execution_for_launchpad`,
      arguments: [
        tx.pure.id(this.getObjectId(config.raiseId)),
        tx.object(config.accountId),
        tx.object(packageRegistryId),
        tx.object(clockId),
      ],
    });

    const versionWitness = tx.moveCall({
      target: `${accountActionsPackageId}::actions_version::current`,
      arguments: [],
    });

    const intentWitness = tx.moveCall({
      target: `${futarchyFactoryPackageId}::dao_init_executor::dao_init_intent_witness`,
      arguments: [],
    });

    // Execute each action
    for (const actionType of config.actionTypes) {
      this.executeAction(tx, executable, config.accountId, versionWitness, intentWitness, actionType, {
        configType,
        outcomeType,
        witnessType,
        clockId,
        accountActionsPackageId,
        futarchyActionsPackageId,
        packageRegistryId,
      });
    }

    // Finalize
    tx.moveCall({
      target: `${futarchyFactoryPackageId}::dao_init_executor::finalize_execution`,
      arguments: [tx.object(config.accountId), executable, tx.object(clockId)],
    });

    return {
      transaction: tx,
      description: `Execute ${config.actionTypes.length} init action(s)`,
    };
  }

  private getObjectId(input: ObjectIdOrRef): string {
    if (isOwnedObjectRef(input) || isTxSharedObjectRef(input)) {
      return input.objectId;
    }
    return input;
  }

  private executeAction(
    tx: Transaction,
    executable: ReturnType<Transaction['moveCall']>,
    accountId: string,
    versionWitness: ReturnType<Transaction['moveCall']>,
    intentWitness: ReturnType<Transaction['moveCall']>,
    actionType: import('./types').LaunchpadActionType,
    ctx: {
      configType: string;
      outcomeType: string;
      witnessType: string;
      clockId: string;
      accountActionsPackageId: string;
      futarchyActionsPackageId: string;
      packageRegistryId: string;
    }
  ): void {
    const { configType, outcomeType, witnessType, clockId, accountActionsPackageId, futarchyActionsPackageId, packageRegistryId } = ctx;

    switch (actionType.type) {
      case 'create_stream':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault::do_init_create_stream`,
          typeArguments: [configType, outcomeType, actionType.coinType, witnessType],
          arguments: [executable, tx.object(accountId), tx.object(packageRegistryId), tx.object(clockId), versionWitness, intentWitness],
        });
        break;

      case 'create_pool_with_mint':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::liquidity_init_actions::do_init_create_pool_with_mint`,
          typeArguments: [configType, outcomeType, actionType.assetType, actionType.stableType, actionType.lpType, witnessType],
          arguments: [executable, tx.object(accountId), tx.object(packageRegistryId), tx.object(actionType.lpTreasuryCapId), tx.object(actionType.lpMetadataId), tx.object(clockId), versionWitness, intentWitness],
        });
        break;

      case 'update_trading_params':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::config_actions::do_update_trading_params`,
          typeArguments: [outcomeType, witnessType],
          arguments: [executable, tx.object(accountId), tx.object(packageRegistryId), versionWitness, intentWitness, tx.object(clockId)],
        });
        break;

      case 'update_twap_config':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::config_actions::do_update_twap_config`,
          typeArguments: [outcomeType, witnessType],
          arguments: [executable, tx.object(accountId), tx.object(packageRegistryId), versionWitness, intentWitness, tx.object(clockId)],
        });
        break;

      case 'update_governance':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::config_actions::do_update_governance`,
          typeArguments: [outcomeType, witnessType],
          arguments: [executable, tx.object(accountId), tx.object(packageRegistryId), versionWitness, intentWitness, tx.object(clockId)],
        });
        break;

      case 'return_treasury_cap':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency::do_init_remove_treasury_cap`,
          typeArguments: [configType, outcomeType, actionType.coinType, witnessType],
          arguments: [executable, tx.object(accountId), tx.object(packageRegistryId), versionWitness, intentWitness],
        });
        break;

      case 'return_metadata': {
        const keyType = `${accountActionsPackageId}::currency::CoinMetadataKey<${actionType.coinType}>`;
        const metadataKey = tx.moveCall({
          target: `${accountActionsPackageId}::currency::coin_metadata_key`,
          typeArguments: [actionType.coinType],
          arguments: [],
        });
        tx.moveCall({
          target: `${accountActionsPackageId}::currency::do_init_remove_metadata`,
          typeArguments: [configType, outcomeType, keyType, actionType.coinType, witnessType],
          arguments: [executable, tx.object(accountId), tx.object(packageRegistryId), metadataKey, versionWitness, intentWitness],
        });
        break;
      }

      case 'mint':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency::do_init_mint`,
          typeArguments: [outcomeType, actionType.coinType, witnessType],
          arguments: [executable, tx.object(accountId), tx.object(packageRegistryId), versionWitness, intentWitness],
        });
        break;

      case 'transfer_coin':
        tx.moveCall({
          target: `${accountActionsPackageId}::transfer::do_init_transfer_coin`,
          typeArguments: [outcomeType, actionType.coinType, witnessType],
          arguments: [executable, intentWitness],
        });
        break;

      case 'deposit':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault::do_init_deposit`,
          typeArguments: [configType, outcomeType, actionType.coinType, witnessType],
          arguments: [executable, tx.object(accountId), tx.object(packageRegistryId), versionWitness, intentWitness],
        });
        break;

      case 'deposit_from_resources':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault::do_init_deposit_from_resources`,
          typeArguments: [configType, outcomeType, actionType.coinType, witnessType],
          arguments: [executable, tx.object(accountId), tx.object(packageRegistryId), versionWitness, intentWitness],
        });
        break;

      default:
        throw new Error(`Unknown action type: ${(actionType as { type?: string }).type}`);
    }
  }

  // ============================================================================
  // STEP 4: CLAIM TOKENS
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
   * @deprecated Use createRaise(config, successActions, failureActions) directly.
   * This method is kept for backwards compatibility but now just wraps createRaise.
   *
   * BREAKING CHANGE: Previously this returned separate transactions for each step.
   * Now it returns a single atomic transaction that does everything in one PTB.
   */
  createRaiseWithActions(
    raiseConfig: CreateRaiseConfig,
    successActions: ActionConfig[],
    failureActions: ActionConfig[],
    _creatorAddress?: string // Reserved for future use
  ): WorkflowTransaction {
    // Now atomic - everything in one PTB
    return this.createRaise(raiseConfig, successActions, failureActions);
  }
}
