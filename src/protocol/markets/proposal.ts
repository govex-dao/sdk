/**
 * Proposal Module
 *
 * Core proposal management for futarchy governance.
 *
 * Lifecycle:
 * 1. PREMARKET - Proposal created, awaiting initialization
 * 2. REVIEW - Market initialized, in review period
 * 3. LIVE - Trading active
 * 4. FINALIZED - Winner determined, ready for execution
 *
 * Key Features:
 * - Multi-outcome prediction markets (2-N outcomes)
 * - TWAP-based resolution
 * - Intent specs for executable actions
 * - Sponsorship system for reduced barriers
 * - Quantum LP management
 *
 * @module proposal
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

/**
 * Proposal Static Functions
 *
 * Comprehensive proposal lifecycle management.
 */
export class Proposal {
  // ============================================================================
  // Cancel Witness Functions
  // ============================================================================

  static cancelWitnessProposal(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      witness: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'cancel_witness_proposal'),
      arguments: [config.witness],
    });
  }

  static cancelWitnessOutcomeIndex(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      witness: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'cancel_witness_outcome_index'),
      arguments: [config.witness],
    });
  }

  // ============================================================================
  // Creation Functions - Atomic Proposal Pattern
  // ============================================================================
  //
  // The atomic proposal creation pattern ensures proposals are created with all
  // conditional coins in a single transaction, preventing incomplete proposals.
  //
  // Flow:
  // 1. beginProposal() → returns [Proposal, TokenEscrow] (both unshared)
  // 2. addOutcomeCoins() or addOutcomeCoins10() → registers coins with escrow
  // 3. finalizeProposal() → validates completeness, creates AMM pools, shares both
  //
  // Example PTB for 2 outcomes:
  //   const [proposal, escrow] = Proposal.beginProposal(tx, {...});
  //   Proposal.addOutcomeCoins(tx, { proposal, escrow, outcomeIndex: 0, ... });
  //   Proposal.addOutcomeCoins(tx, { proposal, escrow, outcomeIndex: 1, ... });
  //   Proposal.finalizeProposal(tx, { proposal, escrow, ... });
  //
  // Example PTB for 10 outcomes (optimized):
  //   const [proposal, escrow] = Proposal.beginProposal(tx, {...});
  //   Proposal.addOutcomeCoins10(tx, { proposal, escrow, startOutcomeIndex: 0, ... });
  //   Proposal.finalizeProposal(tx, { proposal, escrow, ... });

  /**
   * Begin creating a proposal atomically. Returns UNSHARED proposal and escrow.
   * Must call addOutcomeCoins/addOutcomeCoins10 to register all conditional coins,
   * then finalizeProposal to validate and share.
   *
   * Fee type is determined by DAO config (fee_in_asset_token):
   * - If fee_in_asset_token = false: pass stableFee, assetFee should be zero coin
   * - If fee_in_asset_token = true: pass assetFee, stableFee should be zero coin
   *
   * @returns [Proposal, TokenEscrow] - both unshared, must call finalizeProposal
   */
  static beginProposal(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      protocolPackageId: string;
      assetType: string;
      stableType: string;
      daoAccountId: string;
      treasuryAddress: string;
      title: string;
      introductionDetails: string;
      metadata: string;
      outcomeMessages: string[];
      outcomeDetails: string[];
      proposer: string;
      usedQuota: boolean;
      stableFee: ReturnType<Transaction['moveCall']> | ReturnType<Transaction['splitCoins']>; // Coin<StableType>
      assetFee: ReturnType<Transaction['moveCall']> | ReturnType<Transaction['splitCoins']>; // Coin<AssetType>
      intentSpecForYes?: ReturnType<Transaction['moveCall']>;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    const intentSpec = config.intentSpecForYes || tx.moveCall({
      target: '0x1::option::none',
      typeArguments: [`vector<${config.protocolPackageId}::intents::ActionSpec>`],
      arguments: [],
    });

    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'begin_proposal'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.daoAccountId),
        tx.pure.address(config.treasuryAddress),
        tx.pure.string(config.title),
        tx.pure.string(config.introductionDetails),
        tx.pure.string(config.metadata),
        tx.pure.vector('string', config.outcomeMessages),
        tx.pure.vector('string', config.outcomeDetails),
        tx.pure.address(config.proposer),
        tx.pure.bool(config.usedQuota),
        config.stableFee,
        config.assetFee,
        intentSpec,
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  /**
   * Add one outcome's conditional coins (asset + stable pair).
   * Validates blank metadata, updates with DAO naming, registers caps with escrow.
   *
   * Must be called once per outcome before finalizeProposal.
   * For proposals with many outcomes, use addOutcomeCoins10 for efficiency.
   */
  static addOutcomeCoins(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      assetCondCoinType: string;
      stableCondCoinType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      escrow: ReturnType<Transaction['moveCall']>;
      outcomeIndex: number;
      assetTreasuryCap: ReturnType<Transaction['moveCall']>;
      assetMetadata: ReturnType<Transaction['moveCall']>;
      stableTreasuryCap: ReturnType<Transaction['moveCall']>;
      stableMetadata: ReturnType<Transaction['moveCall']>;
      /** DAO Account - function borrows DaoConfig internally */
      daoAccount: ReturnType<Transaction['moveCall']> | string;
      baseAssetMetadata: ReturnType<Transaction['moveCall']> | string;
      baseStableMetadata: ReturnType<Transaction['moveCall']> | string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'add_outcome_coins'),
      typeArguments: [
        config.assetType,
        config.stableType,
        config.assetCondCoinType,
        config.stableCondCoinType,
      ],
      arguments: [
        config.proposal,
        config.escrow,
        tx.pure.u64(config.outcomeIndex),
        config.assetTreasuryCap,
        config.assetMetadata,
        config.stableTreasuryCap,
        config.stableMetadata,
        typeof config.daoAccount === 'string' ? tx.object(config.daoAccount) : config.daoAccount,
        typeof config.baseAssetMetadata === 'string' ? tx.object(config.baseAssetMetadata) : config.baseAssetMetadata,
        typeof config.baseStableMetadata === 'string' ? tx.object(config.baseStableMetadata) : config.baseStableMetadata,
      ],
    });
  }

  /**
   * Add up to 10 outcomes' conditional coins (20 coins total) in one call.
   * For proposals with up to 10 outcomes, this is a single PTB call.
   * For larger proposals, combine with addOutcomeCoins for remaining outcomes.
   *
   * Unused outcome slots (when outcomeCount < 10) will have their caps/metadata
   * transferred to burn address automatically.
   */
  static addOutcomeCoins10(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      // 10 pairs of conditional coin types
      condCoinTypes: Array<{ asset: string; stable: string }>;
      proposal: ReturnType<Transaction['moveCall']>;
      escrow: ReturnType<Transaction['moveCall']>;
      // 10 pairs of treasury caps
      treasuryCaps: Array<{
        asset: ReturnType<Transaction['moveCall']>;
        stable: ReturnType<Transaction['moveCall']>;
      }>;
      // 10 pairs of metadata
      metadatas: Array<{
        asset: ReturnType<Transaction['moveCall']>;
        stable: ReturnType<Transaction['moveCall']>;
      }>;
      /** DAO Account - function borrows DaoConfig internally */
      daoAccount: ReturnType<Transaction['moveCall']> | string;
      baseAssetMetadata: ReturnType<Transaction['moveCall']> | string;
      baseStableMetadata: ReturnType<Transaction['moveCall']> | string;
      startOutcomeIndex: number;
    }
  ): void {
    // Validate we have exactly 10 of each
    if (config.condCoinTypes.length !== 10 || config.treasuryCaps.length !== 10 || config.metadatas.length !== 10) {
      throw new Error('addOutcomeCoins10 requires exactly 10 conditional coin type pairs, treasury cap pairs, and metadata pairs');
    }

    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'add_outcome_coins_10'),
      typeArguments: [
        config.assetType,
        config.stableType,
        // Outcome 0
        config.condCoinTypes[0].asset, config.condCoinTypes[0].stable,
        // Outcome 1
        config.condCoinTypes[1].asset, config.condCoinTypes[1].stable,
        // Outcome 2
        config.condCoinTypes[2].asset, config.condCoinTypes[2].stable,
        // Outcome 3
        config.condCoinTypes[3].asset, config.condCoinTypes[3].stable,
        // Outcome 4
        config.condCoinTypes[4].asset, config.condCoinTypes[4].stable,
        // Outcome 5
        config.condCoinTypes[5].asset, config.condCoinTypes[5].stable,
        // Outcome 6
        config.condCoinTypes[6].asset, config.condCoinTypes[6].stable,
        // Outcome 7
        config.condCoinTypes[7].asset, config.condCoinTypes[7].stable,
        // Outcome 8
        config.condCoinTypes[8].asset, config.condCoinTypes[8].stable,
        // Outcome 9
        config.condCoinTypes[9].asset, config.condCoinTypes[9].stable,
      ],
      arguments: [
        config.proposal,
        config.escrow,
        // Outcome 0
        config.treasuryCaps[0].asset, config.metadatas[0].asset,
        config.treasuryCaps[0].stable, config.metadatas[0].stable,
        // Outcome 1
        config.treasuryCaps[1].asset, config.metadatas[1].asset,
        config.treasuryCaps[1].stable, config.metadatas[1].stable,
        // Outcome 2
        config.treasuryCaps[2].asset, config.metadatas[2].asset,
        config.treasuryCaps[2].stable, config.metadatas[2].stable,
        // Outcome 3
        config.treasuryCaps[3].asset, config.metadatas[3].asset,
        config.treasuryCaps[3].stable, config.metadatas[3].stable,
        // Outcome 4
        config.treasuryCaps[4].asset, config.metadatas[4].asset,
        config.treasuryCaps[4].stable, config.metadatas[4].stable,
        // Outcome 5
        config.treasuryCaps[5].asset, config.metadatas[5].asset,
        config.treasuryCaps[5].stable, config.metadatas[5].stable,
        // Outcome 6
        config.treasuryCaps[6].asset, config.metadatas[6].asset,
        config.treasuryCaps[6].stable, config.metadatas[6].stable,
        // Outcome 7
        config.treasuryCaps[7].asset, config.metadatas[7].asset,
        config.treasuryCaps[7].stable, config.metadatas[7].stable,
        // Outcome 8
        config.treasuryCaps[8].asset, config.metadatas[8].asset,
        config.treasuryCaps[8].stable, config.metadatas[8].stable,
        // Outcome 9
        config.treasuryCaps[9].asset, config.metadatas[9].asset,
        config.treasuryCaps[9].stable, config.metadatas[9].stable,
        // Config and base metadata
        typeof config.daoAccount === 'string' ? tx.object(config.daoAccount) : config.daoAccount,
        typeof config.baseAssetMetadata === 'string' ? tx.object(config.baseAssetMetadata) : config.baseAssetMetadata,
        typeof config.baseStableMetadata === 'string' ? tx.object(config.baseStableMetadata) : config.baseStableMetadata,
        tx.pure.u64(config.startOutcomeIndex),
      ],
    });
  }

  /**
   * Finalize proposal creation: validate all coins registered, create AMM pools, share.
   * Must be called after all addOutcomeCoins/addOutcomeCoins10 calls.
   */
  static finalizeProposal(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      escrow: ReturnType<Transaction['moveCall']>;
      spotPool: ReturnType<Transaction['moveCall']> | string;
      liquidityProvider: string;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'finalize_proposal'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        config.proposal,
        config.escrow,
        typeof config.spotPool === 'string' ? tx.object(config.spotPool) : config.spotPool,
        tx.pure.address(config.liquidityProvider),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  // ============================================================================
  // Fee Escrow Functions
  // ============================================================================

  /**
   * Takes the escrowed fee balance out of the proposal (StableType version)
   * Used for refunding fees to proposer if any accept wins.
   * Call this when feePaidInAsset() returns false.
   */
  static takeFeeEscrowStable(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'take_fee_escrow_stable'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  /**
   * Takes the escrowed fee balance out of the proposal (AssetType version)
   * Used for refunding fees to proposer if any accept wins.
   * Call this when feePaidInAsset() returns true.
   */
  static takeFeeEscrowAsset(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'take_fee_escrow_asset'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  /**
   * Check if fee was paid in AssetType (true) or StableType (false)
   */
  static feePaidInAsset(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'fee_paid_in_asset'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  // ============================================================================
  // TWAP Functions
  // ============================================================================

  static getTwapsForProposal(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      spotPool: ReturnType<Transaction['moveCall']>;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_twaps_for_proposal'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        config.proposal,
        config.spotPool,
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  static calculateCurrentWinnerByPrice(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      prices: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'calculate_current_winner_by_price'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, config.prices],
    });
  }

  static calculateCurrentWinner(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      spotPool: ReturnType<Transaction['moveCall']>;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'calculate_current_winner'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        config.proposal,
        config.spotPool,
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  static getTwapPrices(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_twap_prices'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getLastTwapUpdate(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_last_twap_update'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getTwapByOutcome(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      outcomeIdx: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_twap_by_outcome'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.pure.u8(config.outcomeIdx)],
    });
  }

  static getWinningTwap(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_winning_twap'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  // ============================================================================
  // State Functions
  // ============================================================================

  static isFinalized(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'is_finalized'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static state(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'state'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static isLive(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'is_live'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getWinningOutcome(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_winning_outcome'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static isWinningOutcomeSet(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'is_winning_outcome_set'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static advanceState(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      spotPool: ReturnType<Transaction['moveCall']>;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'advance_state'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        config.proposal,
        config.spotPool,
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  static setState(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      newState: number;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'set_state'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.pure.u8(config.newState)],
    });
  }

  static setTwapPrices(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      prices: ReturnType<Transaction['moveCall']>;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'set_twap_prices'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, config.prices],
    });
  }

  static setLastTwapUpdate(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      timestamp: bigint;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'set_last_twap_update'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.pure.u64(config.timestamp)],
    });
  }

  static setWinningOutcome(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      outcomeIdx: number;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'set_winning_outcome'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.pure.u8(config.outcomeIdx)],
    });
  }

  // ============================================================================
  // Metadata/Info Functions (Continued in next section due to length)
  // ============================================================================

  static treasuryAddress(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'treasury_address'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getId(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_id'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static escrowId(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'escrow_id'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static marketStateId(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'market_state_id'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getMarketInitializedAt(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_market_initialized_at'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static outcomeCount(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'outcome_count'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getNumOutcomes(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_num_outcomes'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static proposer(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'proposer'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static createdAt(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'created_at'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getMetadata(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_metadata'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getIntroductionDetails(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_introduction_details'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getAmmPoolIds(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_amm_pool_ids'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getState(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_state'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getDaoId(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_dao_id'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static proposalId(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'proposal_id'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getCreatedAt(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_created_at'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getReviewPeriodMs(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_review_period_ms'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getTradingPeriodMs(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_trading_period_ms'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getTwapThreshold(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_twap_threshold'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getSponsoredThreshold(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_sponsored_threshold'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getTwapStartDelay(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_twap_start_delay'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getTwapInitialObservation(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_twap_initial_observation'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getTwapStepMax(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_twap_step_max'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getAmmTotalFeeBps(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_amm_total_fee_bps'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getMarketInitParams(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_market_init_params'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getOutcomeCreators(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_outcome_creators'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getOutcomeCreator(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      outcomeIdx: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_outcome_creator'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.pure.u8(config.outcomeIdx)],
    });
  }

  static getOutcomeCreatorFee(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      outcomeIdx: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_outcome_creator_fee'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.pure.u8(config.outcomeIdx)],
    });
  }

  static getOutcomeCreatorFees(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_outcome_creator_fees'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getLiquidityProvider(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_liquidity_provider'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getProposer(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_proposer'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getUsedQuota(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_used_quota'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static isWithdrawOnly(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'is_withdraw_only'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static setWithdrawOnlyMode(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      mode: boolean;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'set_withdraw_only_mode'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.pure.bool(config.mode)],
    });
  }

  static getOutcomeMessages(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_outcome_messages'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  // ============================================================================
  // Intent Spec Functions
  // ============================================================================

  static getIntentSpecForOutcome(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      outcomeIdx: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_intent_spec_for_outcome'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.pure.u8(config.outcomeIdx)],
    });
  }

  static takeIntentSpecForOutcome(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      outcomeIdx: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'take_intent_spec_for_outcome'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.pure.u8(config.outcomeIdx)],
    });
  }

  static makeCancelWitness(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      outcomeIdx: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'make_cancel_witness'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.pure.u8(config.outcomeIdx)],
    });
  }

  /**
   * Set intent spec for an outcome with whitelist validation
   *
   * SECURITY: Validates ALL action types are from authorized packages based on authorization level:
   * - Level 0 (GLOBAL_ONLY): All action packages must be in global registry (checked at staging)
   * - Level 1 (WHITELIST): Any action can be staged, but must be in global OR account whitelist at execution
   * - Level 2 (PERMISSIVE): No checks at staging or execution
   *
   * @param tx - Transaction
   * @param config - Configuration including whitelist validation parameters
   */
  static setIntentSpecForOutcome(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      outcomeIdx: number;
      intentSpec: ReturnType<Transaction['moveCall']>;
      maxActionsPerOutcome: number;
      account: string | ReturnType<Transaction['moveCall']>;      // DAO account for whitelist check
      registry: string | ReturnType<Transaction['moveCall']>;     // PackageRegistry
      accountDeps: string | ReturnType<Transaction['moveCall']>;  // Table<address, DepInfo>
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'set_intent_spec_for_outcome'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        config.proposal,
        tx.pure.u64(config.outcomeIdx),
        config.intentSpec,
        tx.pure.u64(config.maxActionsPerOutcome),
        typeof config.account === 'string' ? tx.object(config.account) : config.account,
        typeof config.registry === 'string' ? tx.object(config.registry) : config.registry,
        typeof config.accountDeps === 'string' ? tx.object(config.accountDeps) : config.accountDeps,
      ],
    });
  }

  static hasIntentSpec(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      outcomeIdx: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'has_intent_spec'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.pure.u8(config.outcomeIdx)],
    });
  }

  static getActionsForOutcome(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      outcomeIdx: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_actions_for_outcome'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.pure.u8(config.outcomeIdx)],
    });
  }

  static clearIntentSpecForOutcome(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      outcomeIdx: number;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'clear_intent_spec_for_outcome'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.pure.u8(config.outcomeIdx)],
    });
  }

  static emitOutcomeMutated(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      proposalId: string;
      outcomeIdx: number;
      numActions: bigint;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'emit_outcome_mutated'),
      arguments: [
        tx.object(config.proposalId),
        tx.pure.u8(config.outcomeIdx),
        tx.pure.u64(config.numActions),
      ],
    });
  }

  static setOutcomeCreator(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      outcomeIdx: number;
      creator: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'set_outcome_creator'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        config.proposal,
        tx.pure.u8(config.outcomeIdx),
        tx.pure.address(config.creator),
      ],
    });
  }

  // ============================================================================
  // Helper Functions
  // ============================================================================

  static id(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'id'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static idAddress(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'id_address'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  // ============================================================================
  // Sponsorship Functions
  // ============================================================================

  static getSponsoredBy(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_sponsored_by'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getSponsorThresholdReduction(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_sponsor_threshold_reduction'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  /**
   * Check if any outcome in the proposal is sponsored
   */
  static isSponsored(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'is_sponsored'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  /**
   * Check if a specific outcome is sponsored (any type)
   */
  static isOutcomeSponsored(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      outcomeIndex: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'is_outcome_sponsored'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.pure.u64(config.outcomeIndex)],
    });
  }

  /**
   * Get the sponsorship type for a specific outcome
   * Returns: 0 = NONE, 1 = ZERO_THRESHOLD, 2 = NEGATIVE_DISCOUNT
   */
  static getOutcomeSponsorshipType(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      outcomeIndex: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_outcome_sponsorship_type'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.pure.u64(config.outcomeIndex)],
    });
  }

  /**
   * Get the full sponsorship types vector for all outcomes
   * Returns vector where index = outcome, value = sponsorship type (0=none, 1=zero, 2=negative)
   */
  static getOutcomeSponsorshipTypes(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'get_outcome_sponsorship_types'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  /**
   * Get sponsorship type constant: NONE (0)
   */
  static sponsorshipNone(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'sponsorship_none'),
      arguments: [],
    });
  }

  /**
   * Get sponsorship type constant: ZERO_THRESHOLD (1)
   */
  static sponsorshipZeroThreshold(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'sponsorship_zero_threshold'),
      arguments: [],
    });
  }

  /**
   * Get sponsorship type constant: NEGATIVE_DISCOUNT (2)
   */
  static sponsorshipNegativeDiscount(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'sponsorship_negative_discount'),
      arguments: [],
    });
  }

  // ============================================================================
  // State Constants (Added for execution-required finalization)
  // ============================================================================

  /**
   * Get PREMARKET state constant (0)
   */
  static statePremarket(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'state_premarket'),
      arguments: [],
    });
  }

  /**
   * Get REVIEW state constant (1)
   */
  static stateReview(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'state_review'),
      arguments: [],
    });
  }

  /**
   * Get TRADING state constant (2)
   */
  static stateTrading(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'state_trading'),
      arguments: [],
    });
  }

  /**
   * Get AWAITING_EXECUTION state constant (3)
   *
   * New state: TWAP measured, 30-minute execution window active.
   */
  static stateAwaitingExecution(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'state_awaiting_execution'),
      arguments: [],
    });
  }

  /**
   * Get FINALIZED state constant (4)
   *
   * Note: Changed from 3 to 4 with addition of AWAITING_EXECUTION state.
   */
  static stateFinalized(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'state_finalized'),
      arguments: [],
    });
  }

  // ============================================================================
  // Execution Window Functions (Added for execution-required finalization)
  // ============================================================================

  /**
   * Check if proposal is in the execution window (AWAITING_EXECUTION state)
   *
   * @returns True if proposal is awaiting execution
   */
  static isAwaitingExecution(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'is_awaiting_execution'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  /**
   * Check if the trading period has ended based on current time
   *
   * @returns True if current_time >= trading_end
   */
  static isTradingPeriodEnded(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'is_trading_period_ended'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.object(config.clock || '0x6')],
    });
  }

  /**
   * Get the execution window duration in milliseconds (30 minutes)
   *
   * @returns 30 * 60 * 1000 = 1800000 ms
   */
  static executionWindowMs(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'proposal', 'execution_window_ms'),
      arguments: [],
    });
  }
}
