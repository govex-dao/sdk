/**
 * Proposal Workflow - High-level orchestrator for governance proposals
 *
 * Provides simple, user-friendly API for the entire proposal lifecycle:
 * 1. Create proposal
 * 2. Add actions to outcomes
 * 3. Advance through states (PREMARKET → REVIEW → TRADING)
 * 4. Perform swaps during trading
 * 5. Finalize proposal
 * 6. Execute winning outcome actions
 * 7. Redeem conditional tokens
 *
 * @module workflows/proposal-workflow
 */

import { Transaction, Inputs } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { SuiClient } from '@mysten/sui/client';
import {
  CreateProposalConfig,
  AddProposalActionsConfig,
  AdvanceToReviewConfig,
  AdvanceToTradingConfig,
  FinalizeProposalConfig,
  SpotSwapConfig,
  ConditionalSwapConfig,
  ActionConfig,
  WorkflowTransaction,
  ObjectIdOrRef,
  isOwnedObjectRef,
  isTxSharedObjectRef,
} from './types';
import type { IntentExecutorPackages } from './intent-executor';

/**
 * Helper to convert ObjectIdOrRef to tx.object() input
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
 * Package IDs required for proposal workflow
 */
export interface ProposalWorkflowPackages extends IntentExecutorPackages {
  futarchyTypesPackageId: string;
  futarchyMarketsCorePackageId: string;
  futarchyMarketsPrimitivesPackageId: string;
  futarchyMarketsOperationsPackageId: string;
  futarchyGovernanceActionsPackageId: string;
  futarchyCorePackageId: string;
  oneShotUtilsPackageId?: string;
}

/**
 * Shared object references
 */
export interface ProposalWorkflowSharedObjects {
  packageRegistryId: string;
  packageRegistrySharedVersion: number;
}

/**
 * Proposal Workflow - Complete governance proposal orchestration
 *
 * @example
 * ```typescript
 * const workflow = new ProposalWorkflow(client, packages, sharedObjects);
 *
 * // Create a proposal
 * const createTx = workflow.createProposal({
 *   daoAccountId: '0x...',
 *   assetType: '0x123::coin::COIN',
 *   stableType: '0x2::sui::SUI',
 *   title: 'Fund Team Development',
 *   introduction: 'Allocate funds for Q1 development',
 *   metadata: JSON.stringify({ category: 'funding' }),
 *   outcomeMessages: ['Reject', 'Accept'],
 *   outcomeDetails: ['Do nothing', 'Approve funding'],
 *   proposer: '0xABC',
 *   treasuryAddress: '0xTREASURY',
 *   usedQuota: false,
 *   feeCoins: ['0xCOIN1'],
 *   feeAmount: 1_000_000_000n,
 * });
 *
 * // Add actions to Accept outcome
 * const addActionsTx = workflow.addActionsToOutcome({
 *   proposalId: '0x...',
 *   assetType: '0x123::coin::COIN',
 *   stableType: '0x2::sui::SUI',
 *   outcomeIndex: 1,
 *   actions: [
 *     {
 *       type: 'create_stream',
 *       vaultName: 'treasury',
 *       beneficiary: '0xTEAM',
 *       amountPerIteration: 100_000_000n,
 *       ...
 *     },
 *   ],
 * });
 * ```
 */
export class ProposalWorkflow {
  private packages: ProposalWorkflowPackages;
  private sharedObjects: ProposalWorkflowSharedObjects;

  constructor(
    _client: SuiClient,
    packages: ProposalWorkflowPackages,
    sharedObjects: ProposalWorkflowSharedObjects
  ) {
    this.packages = packages;
    this.sharedObjects = sharedObjects;
  }

  // ============================================================================
  // STEP 1: CREATE AND INITIALIZE PROPOSAL (ATOMIC)
  // ============================================================================
  //
  // The new atomic proposal creation pattern ensures proposals are created with
  // all conditional coins in a single transaction, preventing incomplete proposals.
  //
  // Flow in a single PTB:
  // 1. begin_proposal() → returns [Proposal, TokenEscrow] (both unshared)
  // 2. add_outcome_coins() or add_outcome_coins_10() → registers coins with escrow
  // 3. finalize_proposal() → validates completeness, creates AMM pools, shares both

  /**
   * Create and initialize a proposal atomically
   *
   * This combines the old createProposal + advanceToReview into a single atomic operation.
   * The proposal and escrow are created, conditional coins registered, AMM pools created,
   * and both objects shared - all in one transaction.
   *
   * @param config - Configuration including conditional coins for all outcomes
   */
  createAndInitializeProposal(config: CreateProposalConfig & AdvanceToReviewConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const {
      futarchyMarketsCorePackageId,
      accountProtocolPackageId,
      oneShotUtilsPackageId,
    } = this.packages;

    // 1. Prepare fee coins - determine if fee is in asset or stable based on DAO config
    // For now, we assume stable fee (the common case). For asset fee DAOs, use feeInAsset flag.
    const stableCoinObjects = config.feeCoins.map((id) => tx.object(id));
    const [firstStableCoin, ...restStableCoins] = stableCoinObjects;

    if (restStableCoins.length > 0) {
      tx.mergeCoins(firstStableCoin, restStableCoins);
    }

    // Split fee payment and create zero coin for the other type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let stableFee: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let assetFee: any;

    if (config.feeInAsset) {
      // Fee paid in asset token - stableFee should be zero
      // Use factory::zero_coin helper to create a properly typed zero coin
      stableFee = tx.moveCall({
        target: `${this.packages.futarchyFactoryPackageId}::factory::zero_coin`,
        typeArguments: [config.stableType],
        arguments: [],
      });
      [assetFee] = tx.splitCoins(firstStableCoin, [tx.pure.u64(config.feeAmount)]);
    } else {
      // Fee paid in stable token (default) - assetFee should be zero
      // Use factory::zero_coin helper to create a properly typed zero coin
      [stableFee] = tx.splitCoins(firstStableCoin, [tx.pure.u64(config.feeAmount)]);
      assetFee = tx.moveCall({
        target: `${this.packages.futarchyFactoryPackageId}::factory::zero_coin`,
        typeArguments: [config.assetType],
        arguments: [],
      });
    }

    // Create Option::None for intent spec
    const noneOption = tx.moveCall({
      target: '0x1::option::none',
      typeArguments: [`vector<${accountProtocolPackageId}::intents::ActionSpec>`],
      arguments: [],
    });

    // 2. Begin proposal - returns [Proposal, TokenEscrow] both unshared
    const beginResult = tx.moveCall({
      target: `${futarchyMarketsCorePackageId}::proposal::begin_proposal`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        txObject(tx, config.daoAccountId),
        tx.pure.address(config.treasuryAddress),
        tx.pure.string(config.title),
        tx.pure.string(config.introduction),
        tx.pure.string(config.metadata),
        tx.pure.vector('string', config.outcomeMessages),
        tx.pure.vector('string', config.outcomeDetails),
        tx.pure.address(config.proposer),
        tx.pure.bool(config.usedQuota),
        stableFee,
        assetFee,
        noneOption,
        tx.sharedObjectRef({
          objectId: clockId,
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });

    // Extract proposal and escrow from result tuple
    const proposal = beginResult[0];
    const escrow = beginResult[1];

    // 3. Take conditional coins from registry and add to proposal
    if (config.conditionalCoinsRegistry && config.conditionalCoinsRegistry.coinSets.length > 0 && oneShotUtilsPackageId) {
      const registryId = config.conditionalCoinsRegistry.registryId;
      let feeCoin: ReturnType<typeof tx.splitCoins>[0] = tx.splitCoins(tx.gas, [tx.pure.u64(0)])[0];

      for (const coinSet of config.conditionalCoinsRegistry.coinSets) {
        // Take asset conditional coin from registry
        // Returns 4-tuple: (TreasuryCap<T>, MetadataCap<T>, currency_id: ID, Coin<SUI>)
        const assetResults = tx.moveCall({
          target: `${oneShotUtilsPackageId}::blank_coins::take_coin_set_for_ptb`,
          typeArguments: [coinSet.assetCoinType],
          arguments: [
            tx.object(registryId),
            tx.pure.u8(coinSet.assetDecimals || 9), // desired_decimals for asset coins
            tx.pure.id(coinSet.assetCapId),
            feeCoin,
            tx.sharedObjectRef({
              objectId: clockId,
              initialSharedVersion: 1,
              mutable: false,
            }),
          ],
        });

        const assetTreasuryCap = assetResults[0];
        const assetMetadataCap = assetResults[1];
        // assetResults[2] is currency_id (ID) - we use the known currencyId from config instead
        feeCoin = assetResults[3] as ReturnType<typeof tx.splitCoins>[0];

        // Take stable conditional coin from registry
        // Returns 4-tuple: (TreasuryCap<T>, MetadataCap<T>, currency_id: ID, Coin<SUI>)
        const stableResults = tx.moveCall({
          target: `${oneShotUtilsPackageId}::blank_coins::take_coin_set_for_ptb`,
          typeArguments: [coinSet.stableCoinType],
          arguments: [
            tx.object(registryId),
            tx.pure.u8(coinSet.stableDecimals || 6), // desired_decimals for stable coins
            tx.pure.id(coinSet.stableCapId),
            feeCoin,
            tx.sharedObjectRef({
              objectId: clockId,
              initialSharedVersion: 1,
              mutable: false,
            }),
          ],
        });

        const stableTreasuryCap = stableResults[0];
        const stableMetadataCap = stableResults[1];
        // stableResults[2] is currency_id (ID) - we use the known currencyId from config instead
        feeCoin = stableResults[3] as ReturnType<typeof tx.splitCoins>[0];

        // Resolve base currency IDs (support both old and new field names)
        const baseStableCurrencyId = config.baseStableCurrencyId || config.baseStableMetadataId;
        if (!baseStableCurrencyId) {
          throw new Error('baseStableCurrencyId (or baseStableMetadataId) is required for add_outcome_coins_to_proposal');
        }

        // Add outcome coins to proposal using factory wrapper
        // Arguments must match Move function signature exactly:
        //   proposal, escrow, outcome_index,
        //   asset_treasury_cap, asset_currency, asset_metadata_cap,
        //   stable_treasury_cap, stable_currency, stable_metadata_cap,
        //   dao_account, base_asset_currency, base_stable_currency
        tx.moveCall({
          target: `${this.packages.futarchyFactoryPackageId}::factory::add_outcome_coins_to_proposal`,
          typeArguments: [
            config.assetType,
            config.stableType,
            coinSet.assetCoinType,
            coinSet.stableCoinType,
          ],
          arguments: [
            proposal,
            escrow,
            tx.pure.u64(coinSet.outcomeIndex),
            assetTreasuryCap,
            tx.object(coinSet.assetCurrencyId),   // Currency<AssetCondCoin> (shared)
            assetMetadataCap,
            stableTreasuryCap,
            tx.object(coinSet.stableCurrencyId),  // Currency<StableCondCoin> (shared)
            stableMetadataCap,
            txObject(tx, config.daoAccountId),
            txObject(tx, config.baseAssetCurrencyId),   // Currency<AssetType> (shared)
            txObject(tx, baseStableCurrencyId),         // Currency<StableType> (shared)
          ],
        });
      }

      // Transfer remaining fee coin back to sender
      tx.transferObjects([feeCoin], tx.pure.address(config.senderAddress));
    }

    // 5. Add actions to outcomes if provided (before finalization)
    if (config.outcomeActions && config.outcomeActions.length > 0) {
      const { accountActionsPackageId, futarchyMarketsCorePackageId: marketsCorePackage } = this.packages;
      const registryRef = config.registryId ? txObject(tx, config.registryId) : tx.object(this.sharedObjects.packageRegistryId);

      for (const outcomeAction of config.outcomeActions) {
        // Create action spec builder using proposal's new_action_builder
        // This sets up the correct source context (source_type, source_id, outcome_index)
        // for ActionParamsStaged events emitted by add_*_spec functions
        const builder = tx.moveCall({
          target: `${marketsCorePackage}::proposal::new_action_builder`,
          typeArguments: [config.assetType, config.stableType],
          arguments: [
            proposal, // unshared proposal from begin_proposal
            tx.pure.u64(outcomeAction.outcomeIndex),
          ],
        });

        // Add each action to the builder
        for (const action of outcomeAction.actions) {
          this.addActionToBuilder(tx, builder, action, config.assetType, config.stableType);
        }

        // Convert builder to vector
        const specs = tx.moveCall({
          target: `${accountActionsPackageId}::action_spec_builder::into_vector`,
          arguments: [builder],
        });

        // Set intent spec for outcome on the UNSHARED proposal
        tx.moveCall({
          target: `${marketsCorePackage}::proposal::set_intent_spec_for_outcome`,
          typeArguments: [config.assetType, config.stableType],
          arguments: [
            proposal, // unshared proposal from begin_proposal
            tx.pure.u64(outcomeAction.outcomeIndex),
            specs,
            tx.pure.u64(outcomeAction.maxActionsPerOutcome || 10),
            txObject(tx, config.daoAccountId),
            registryRef,
          ],
        });
      }
    }

    // 6. Finalize proposal - validates all coins registered, creates AMM pools, shares both
    tx.moveCall({
      target: `${futarchyMarketsCorePackageId}::proposal::finalize_proposal`,
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        proposal,
        escrow,
        txObject(tx, config.spotPoolId),
        tx.pure.address(config.senderAddress),
        tx.sharedObjectRef({
          objectId: clockId,
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });

    // 7. Consume quota if used - must be after finalize_proposal succeeds
    // This decrements the user's remaining quota count for the current period.
    // If the PTB fails, the entire transaction rolls back so quota won't be consumed.
    if (config.usedQuota) {
      const { futarchyGovernancePackageId } = this.packages;
      tx.moveCall({
        target: `${futarchyGovernancePackageId}::proposal_lifecycle::consume_proposal_quota`,
        arguments: [
          txObject(tx, config.daoAccountId),
          config.registryId ? txObject(tx, config.registryId) : tx.object(this.sharedObjects.packageRegistryId),
          tx.pure.address(config.proposer),
          tx.sharedObjectRef({
            objectId: clockId,
            initialSharedVersion: 1,
            mutable: false,
          }),
        ],
      });
    }

    // Return unused fee coins to sender
    tx.transferObjects([firstStableCoin], tx.pure.address(config.proposer));

    return {
      transaction: tx,
      description: 'Create and initialize governance proposal (atomic)',
    };
  }

  // ============================================================================
  // STEP 2: ADD ACTIONS TO OUTCOME
  // ============================================================================

  /**
   * Add actions to a specific proposal outcome
   */
  addActionsToOutcome(config: AddProposalActionsConfig): WorkflowTransaction {
    const tx = new Transaction();

    const { accountActionsPackageId, futarchyMarketsCorePackageId } = this.packages;

    // Create action spec builder using proposal's new_action_builder
    // This sets up the correct source context (source_type, source_id, outcome_index)
    // for ActionParamsStaged events emitted by add_*_spec functions
    const builder = tx.moveCall({
      target: `${futarchyMarketsCorePackageId}::proposal::new_action_builder`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        txObject(tx, config.proposalId),
        tx.pure.u64(config.outcomeIndex),
      ],
    });

    // Add each action to the builder
    for (const action of config.actions) {
      this.addActionToBuilder(tx, builder, action, config.assetType, config.stableType);
    }

    // Convert builder to vector
    const specs = tx.moveCall({
      target: `${accountActionsPackageId}::action_spec_builder::into_vector`,
      arguments: [builder],
    });

    // Set intent spec for outcome (with whitelist validation)
    tx.moveCall({
      target: `${futarchyMarketsCorePackageId}::proposal::set_intent_spec_for_outcome`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        txObject(tx, config.proposalId),
        tx.pure.u64(config.outcomeIndex),
        specs,
        tx.pure.u64(config.maxActionsPerOutcome || 10),
        txObject(tx, config.daoAccountId),    // account for whitelist check
        txObject(tx, config.registryId),       // PackageRegistry
      ],
    });

    return {
      transaction: tx,
      description: `Add ${config.actions.length} action(s) to outcome ${config.outcomeIndex}`,
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
    assetType: string,
    stableType: string
  ): void {
    const { accountActionsPackageId, futarchyActionsPackageId } = this.packages;

    // Helper to get coin type - uses action's coinType if specified, otherwise falls back to default
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
        tx.moveCall({
          target: `${accountActionsPackageId}::stream_init_actions::add_create_stream_spec`,
          typeArguments: [getCoinType(action.coinType, stableType)],
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
            action.assetType || assetType,
            action.stableType || stableType,
            action.lpType,
          ],
          arguments: [
            builder,
            tx.pure.string(action.vaultName),
            tx.pure.u64(action.assetAmount),
            tx.pure.u64(action.stableAmount),
            tx.pure.u64(action.feeBps),
            tx.pure.u64(action.launchFeeDurationMs ?? 0n),
            tx.pure.id(action.lpTreasuryCapId),
            tx.pure.id(action.lpCurrencyId),
          ],
        });
        break;

      case 'mint':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_mint_spec`,
          typeArguments: [getCoinType(action.coinType, assetType)],
          arguments: [
            builder,
            tx.pure.u64(action.amount),
            tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'burn':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_burn_spec`,
          typeArguments: [getCoinType(action.coinType, assetType)],
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
          typeArguments: [getCoinType(action.coinType, assetType)],
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
          typeArguments: [getCoinType(action.coinType, assetType)],
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
          typeArguments: [getCoinType(action.coinType, assetType)],
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
          typeArguments: [getCoinType(action.coinType, assetType)],
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
          typeArguments: [getCoinType(action.coinType, stableType)],
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
          typeArguments: [getCoinType(action.coinType, stableType)],
          arguments: [builder, tx.pure.string(action.vaultName)],
        });
        break;

      case 'remove_approved_coin_type':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_remove_approved_coin_type_spec`,
          typeArguments: [getCoinType(action.coinType, stableType)],
          arguments: [builder, tx.pure.string(action.vaultName)],
        });
        break;

      case 'disable_currency':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_disable_spec`,
          typeArguments: [getCoinType(action.coinType, assetType)],
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
          typeArguments: [getCoinType(action.coinType, assetType)],
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
          typeArguments: [action.assetType || assetType],
          arguments: [builder],
        });
        break;

      case 'return_treasury_cap':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_return_treasury_cap_spec`,
          typeArguments: [getCoinType(action.coinType, assetType)],
          arguments: [builder, tx.pure.address(action.recipient)],
        });
        break;

      // NOTE: 'return_metadata' case removed - CoinMetadata no longer stored in Account
      // Use sui::coin_registry::Currency<T> for metadata access instead

      // Launchpad-specific actions not typically used in proposals
      case 'update_trading_params':
      case 'update_twap_config':
        throw new Error(`Action type '${action.type}' is not typically used in proposals`);

      default:
        throw new Error(`Unknown action type: ${(action as { type?: string }).type}`);
    }
  }

  // ============================================================================
  // STEP 3: ADVANCE TO TRADING STATE
  // ============================================================================
  //
  // NOTE: The old advanceToReview() has been removed. Use createAndInitializeProposal()
  // which atomically creates the proposal in REVIEW state with all conditional coins.

  /**
   * Advance proposal from REVIEW to TRADING state
   *
   * This triggers 100% quantum split from spot pool to conditional AMMs.
   *
   * Gap Fee: A fee may be charged based on time since last proposal ended.
   * - Starts at 10000x proposal_creation_fee at t=0
   * - Decays exponentially to 0 at t=12hr (30-minute half-life)
   * - Any excess fee is returned to senderAddress
   */
  advanceToTrading(config: AdvanceToTradingConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const { futarchyGovernancePackageId, futarchyFactoryPackageId } = this.packages;

    // Prepare gap fee coins
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let gapFeeAsset: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let gapFeeStable: any;

    if (config.gapFeeCoins && config.gapFeeCoins.length > 0) {
      // Merge gap fee coins if multiple
      const coinObjects = config.gapFeeCoins.map((id) => tx.object(id));
      const [firstCoin, ...restCoins] = coinObjects;

      if (restCoins.length > 0) {
        tx.mergeCoins(firstCoin, restCoins);
      }

      // Split the max fee amount if specified
      const feeCoin = config.maxGapFee
        ? tx.splitCoins(firstCoin, [tx.pure.u64(config.maxGapFee)])[0]
        : firstCoin;

      if (config.feeInAsset) {
        // Gap fee in AssetType - create zero stable coin
        gapFeeAsset = feeCoin;
        gapFeeStable = tx.moveCall({
          target: `${futarchyFactoryPackageId}::factory::zero_coin`,
          typeArguments: [config.stableType],
          arguments: [],
        });
      } else {
        // Gap fee in StableType (default) - create zero asset coin
        gapFeeStable = feeCoin;
        gapFeeAsset = tx.moveCall({
          target: `${futarchyFactoryPackageId}::factory::zero_coin`,
          typeArguments: [config.assetType],
          arguments: [],
        });
      }
    } else {
      // No gap fee coins - create zero coins for both types
      gapFeeAsset = tx.moveCall({
        target: `${futarchyFactoryPackageId}::factory::zero_coin`,
        typeArguments: [config.assetType],
        arguments: [],
      });
      gapFeeStable = tx.moveCall({
        target: `${futarchyFactoryPackageId}::factory::zero_coin`,
        typeArguments: [config.stableType],
        arguments: [],
      });
    }

    // Call advance_proposal_state which returns (bool, Coin<Asset>, Coin<Stable>)
    const result = tx.moveCall({
      target: `${futarchyGovernancePackageId}::proposal_lifecycle::advance_proposal_state`,
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        txObject(tx, config.daoAccountId),
        txObject(tx, config.proposalId),
        txObject(tx, config.escrowId),
        txObject(tx, config.spotPoolId),
        gapFeeAsset,
        gapFeeStable,
        tx.sharedObjectRef({
          objectId: clockId,
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });

    // result[0] is bool (state_changed) - we don't need to use it
    // result[1] is excess asset coin - transfer back to sender
    // result[2] is excess stable coin - transfer back to sender
    const excessAsset = result[1];
    const excessStable = result[2];

    tx.transferObjects([excessAsset, excessStable], tx.pure.address(config.senderAddress));

    // If we had gap fee coins and split from them, return the remainder too
    if (config.gapFeeCoins && config.gapFeeCoins.length > 0 && config.maxGapFee) {
      const coinObjects = config.gapFeeCoins.map((id) => tx.object(id));
      const [firstCoin] = coinObjects;
      tx.transferObjects([firstCoin], tx.pure.address(config.senderAddress));
    }

    return {
      transaction: tx,
      description: 'Advance to TRADING state (100% quantum split)',
    };
  }

  // ============================================================================
  // STEP 5: PERFORM SWAPS
  // ============================================================================

  /**
   * Execute a spot swap during an active proposal
   */
  spotSwap(config: SpotSwapConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const { futarchyMarketsOperationsPackageId, futarchyMarketsPrimitivesPackageId } =
      this.packages;

    // Merge input coins if multiple provided
    const coinObjects = config.inputCoins.map((id) => tx.object(id));
    const [firstCoin, ...restCoins] = coinObjects;

    if (restCoins.length > 0) {
      tx.mergeCoins(firstCoin, restCoins);
    }

    // Split input amount
    const [inputCoin] = tx.splitCoins(firstCoin, [tx.pure.u64(config.amountIn)]);

    // Create Option::None for existing balance
    const noneBalance = tx.moveCall({
      target: '0x1::option::none',
      typeArguments: [
        `${futarchyMarketsPrimitivesPackageId}::conditional_balance::ConditionalMarketBalance<${config.assetType}, ${config.stableType}>`,
      ],
      arguments: [],
    });

    // Execute swap
    const swapTarget =
      config.direction === 'stable_to_asset'
        ? `${futarchyMarketsOperationsPackageId}::swap_entry::swap_spot_stable_to_asset`
        : `${futarchyMarketsOperationsPackageId}::swap_entry::swap_spot_asset_to_stable`;

    const [outputOpt, balanceOpt] = tx.moveCall({
      target: swapTarget,
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        txObject(tx, config.spotPoolId),
        config.proposalId ? txObject(tx, config.proposalId) : tx.object('0x0'), // Empty if no active proposal
        config.escrowId ? txObject(tx, config.escrowId) : tx.object('0x0'), // Empty if no active proposal
        inputCoin,
        tx.pure.u64(config.minAmountOut),
        tx.pure.address(config.recipient),
        noneBalance,
        tx.pure.bool(false), // return_balance = false
        tx.sharedObjectRef({
          objectId: clockId,
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });

    // Destroy empty options
    tx.moveCall({
      target: '0x1::option::destroy_none',
      typeArguments: [
        `0x2::coin::Coin<${config.direction === 'stable_to_asset' ? config.assetType : config.stableType}>`,
      ],
      arguments: [outputOpt],
    });

    tx.moveCall({
      target: '0x1::option::destroy_none',
      typeArguments: [
        `${futarchyMarketsPrimitivesPackageId}::conditional_balance::ConditionalMarketBalance<${config.assetType}, ${config.stableType}>`,
      ],
      arguments: [balanceOpt],
    });

    // Return remaining input coins
    tx.transferObjects([firstCoin], tx.pure.address(config.recipient));

    return {
      transaction: tx,
      description: `Spot swap ${config.direction}`,
    };
  }

  /**
   * Execute a conditional swap to buy tokens in a specific outcome market
   */
  conditionalSwap(config: ConditionalSwapConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const {
      futarchyMarketsOperationsPackageId,
      futarchyMarketsCorePackageId,
      futarchyMarketsPrimitivesPackageId,
    } = this.packages;

    // Merge input coins
    const coinObjects = config.stableCoins.map((id) => tx.object(id));
    const [firstCoin, ...restCoins] = coinObjects;

    if (restCoins.length > 0) {
      tx.mergeCoins(firstCoin, restCoins);
    }

    // Split input amount
    const [stableCoin] = tx.splitCoins(firstCoin, [tx.pure.u64(config.amountIn)]);

    // Start split stable progress
    let splitProgress = tx.moveCall({
      target: `${futarchyMarketsPrimitivesPackageId}::coin_escrow::start_split_stable_progress`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [txObject(tx, config.escrowId), stableCoin],
    });

    // Split stable across all outcomes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stableCoinsByOutcome: Record<number, any> = {};

    // Sort outcomes by index to process in order
    const sortedOutcomes = [...config.allOutcomeCoins].sort((a, b) => a.outcomeIndex - b.outcomeIndex);

    for (const outcome of sortedOutcomes) {
      const result = tx.moveCall({
        target: `${futarchyMarketsPrimitivesPackageId}::coin_escrow::split_stable_progress_step`,
        typeArguments: [
          config.assetType,
          config.stableType,
          outcome.stableCoinType,
        ],
        arguments: [
          splitProgress,
          txObject(tx, config.escrowId),
          tx.pure.u8(outcome.outcomeIndex),
        ],
      });

      // MoveCall returns tuple - access by index using type assertion for nested results
      splitProgress = result[0] as unknown as typeof splitProgress;
      stableCoinsByOutcome[outcome.outcomeIndex] = result[1];
    }

    // Finish split progress
    tx.moveCall({
      target: `${futarchyMarketsPrimitivesPackageId}::coin_escrow::finish_split_stable_progress`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [splitProgress, txObject(tx, config.escrowId)],
    });

    // Begin swap session
    const session = tx.moveCall({
      target: `${futarchyMarketsCorePackageId}::swap_core::begin_swap_session`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [txObject(tx, config.escrowId)],
    });

    // Begin conditional swaps batch
    const batch = tx.moveCall({
      target: `${futarchyMarketsOperationsPackageId}::swap_entry::begin_conditional_swaps`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [txObject(tx, config.escrowId)],
    });

    // Find the target outcome coin types
    const targetOutcome = config.allOutcomeCoins.find(o => o.outcomeIndex === config.outcomeIndex);
    if (!targetOutcome) {
      throw new Error(`No conditional coin types found for outcome ${config.outcomeIndex}`);
    }

    // Swap in the target outcome market
    const condStableInput = stableCoinsByOutcome[config.outcomeIndex];
    const swapResult = tx.moveCall({
      target: `${futarchyMarketsOperationsPackageId}::swap_entry::swap_in_batch`,
      typeArguments: [
        config.assetType,
        config.stableType,
        targetOutcome.stableCoinType,
        targetOutcome.assetCoinType,
      ],
      arguments: [
        batch,
        session,
        txObject(tx, config.escrowId),
        tx.pure.u8(config.outcomeIndex),
        condStableInput,
        tx.pure.bool(config.direction === 'asset_to_stable'),
        tx.pure.u64(config.minAmountOut),
        tx.sharedObjectRef({
          objectId: clockId,
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });
    // MoveCall returns tuple - access by index
    const updatedBatch = swapResult[0];
    const condOutputCoin = swapResult[1];

    // Finalize conditional swaps
    tx.moveCall({
      target: `${futarchyMarketsOperationsPackageId}::swap_entry::finalize_conditional_swaps`,
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        updatedBatch,
        txObject(tx, config.spotPoolId),
        txObject(tx, config.proposalId),
        txObject(tx, config.escrowId),
        session,
        tx.pure.address(config.recipient),
        tx.sharedObjectRef({
          objectId: clockId,
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });

    // Transfer swapped output to recipient
    tx.transferObjects([condOutputCoin], tx.pure.address(config.recipient));

    // Transfer unused conditional stable from OTHER outcomes (not the swapped one)
    for (const outcome of sortedOutcomes) {
      if (outcome.outcomeIndex !== config.outcomeIndex) {
        const otherStable = stableCoinsByOutcome[outcome.outcomeIndex];
        if (otherStable) {
          tx.transferObjects([otherStable], tx.pure.address(config.recipient));
        }
      }
    }

    // Return remaining input coins
    tx.transferObjects([firstCoin], tx.pure.address(config.recipient));

    return {
      transaction: tx,
      description: `Conditional swap in outcome ${config.outcomeIndex}`,
    };
  }

  // ============================================================================
  // STEP 6: FINALIZE PROPOSAL
  // ============================================================================

  /**
   * Finalize proposal after trading period ends
   *
   * Determines winner via TWAP and auto-recombines winning liquidity to spot pool
   */
  finalizeProposal(config: FinalizeProposalConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const { futarchyGovernancePackageId } = this.packages;

    tx.moveCall({
      target: `${futarchyGovernancePackageId}::proposal_lifecycle::end_trading_and_start_execution_window`,
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        txObject(tx, config.proposalId),
        txObject(tx, config.escrowId),
        txObject(tx, config.spotPoolId),
        tx.sharedObjectRef({
          objectId: clockId,
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });

    return {
      transaction: tx,
      description: 'Finalize proposal and determine winner',
    };
  }

  // ============================================================================
  // STEP 7: REDEEM CONDITIONAL TOKENS
  // ============================================================================

  /**
   * Redeem winning conditional tokens for underlying assets
   */
  redeemConditionalTokens(
    proposalId: ObjectIdOrRef,
    escrowId: ObjectIdOrRef,
    assetType: string,
    stableType: string,
    conditionalCoinId: string,
    conditionalCoinType: string,
    outcomeIndex: number,
    isAsset: boolean,
    recipient: string,
    clockId?: string
  ): WorkflowTransaction {
    const tx = new Transaction();
    const clock = clockId || '0x6';

    const { futarchyMarketsOperationsPackageId } = this.packages;

    const redeemTarget = isAsset
      ? `${futarchyMarketsOperationsPackageId}::liquidity_interact::redeem_conditional_asset`
      : `${futarchyMarketsOperationsPackageId}::liquidity_interact::redeem_conditional_stable`;

    const redeemedCoin = tx.moveCall({
      target: redeemTarget,
      typeArguments: [assetType, stableType, conditionalCoinType],
      arguments: [
        txObject(tx, proposalId),
        txObject(tx, escrowId),
        tx.object(conditionalCoinId),
        tx.pure.u64(outcomeIndex),
        tx.sharedObjectRef({
          objectId: clock,
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });

    tx.transferObjects([redeemedCoin], tx.pure.address(recipient));

    return {
      transaction: tx,
      description: `Redeem conditional ${isAsset ? 'asset' : 'stable'} tokens`,
    };
  }

  // ============================================================================
  // MAINTENANCE: JANITOR OPERATIONS
  // ============================================================================

  /**
   * Clean up expired intents and earn storage rebates
   *
   * Anyone can call this to clean up expired governance intents. The caller
   * receives storage rebates as a reward, making this a public good that's
   * economically incentivized.
   *
   * @param daoAccountId - The DAO account to clean up
   * @param maxToClean - Maximum intents to clean (up to 20)
   * @param clockId - Optional clock object ID
   *
   * @example
   * ```typescript
   * // Bot/keeper can call this to earn storage rebates
   * const cleanupTx = workflow.cleanupExpiredIntents(
   *   daoAccountId,
   *   10 // Clean up to 10 expired intents
   * );
   * ```
   */
  cleanupExpiredIntents(
    daoAccountId: string,
    maxToClean: number,
    clockId?: string
  ): WorkflowTransaction {
    const tx = new Transaction();
    const clock = clockId || '0x6';

    const { futarchyGovernanceActionsPackageId } = this.packages;
    const { packageRegistryId } = this.sharedObjects;

    tx.moveCall({
      target: `${futarchyGovernanceActionsPackageId}::intent_janitor::cleanup_expired_futarchy_intents`,
      arguments: [
        tx.object(daoAccountId),
        tx.object(packageRegistryId),
        tx.pure.u64(Math.min(maxToClean, 20)), // Cap at 20 per Move contract
        tx.object(clock),
      ],
    });

    return {
      transaction: tx,
      description: `Clean up to ${maxToClean} expired intents (with storage rebate reward)`,
    };
  }

  /**
   * Check if DAO maintenance is needed
   *
   * Emits a MaintenanceNeeded event if the DAO has more than 10 expired intents.
   * This is a view function used by bots/keepers to determine when cleanup is profitable.
   *
   * @param daoAccountId - The DAO account to check
   * @param clockId - Optional clock object ID
   */
  checkMaintenanceNeeded(
    daoAccountId: string,
    clockId?: string
  ): WorkflowTransaction {
    const tx = new Transaction();
    const clock = clockId || '0x6';

    const { futarchyGovernanceActionsPackageId } = this.packages;
    const { packageRegistryId } = this.sharedObjects;

    tx.moveCall({
      target: `${futarchyGovernanceActionsPackageId}::intent_janitor::check_maintenance_needed`,
      arguments: [
        tx.object(daoAccountId),
        tx.object(packageRegistryId),
        tx.object(clock),
      ],
    });

    return {
      transaction: tx,
      description: 'Check if DAO intent cleanup is needed',
    };
  }
}
