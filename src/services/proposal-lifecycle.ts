/**
 * Proposal Lifecycle Service
 *
 * Operations for transitioning proposals through their lifecycle states,
 * including the new execution-required finalization model.
 *
 * Lifecycle States:
 * - PREMARKET (0): Proposal created, awaiting initialization
 * - REVIEW (1): Market initialized, in review period
 * - TRADING (2): Trading active, TWAP accumulating
 * - AWAITING_EXECUTION (3): Trading ended, 30-min execution window active
 * - FINALIZED (4): Winner determined, payouts available
 *
 * @module proposal-lifecycle
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from './transaction';

/**
 * Proposal Lifecycle Operations
 *
 * Handles transitions between proposal states, particularly the new
 * execution-required finalization flow.
 *
 * @example End trading and start execution window
 * ```typescript
 * const tx = new Transaction();
 *
 * // Called when trading period ends
 * const rejectWonImmediately = ProposalLifecycleOperations.endTradingAndStartExecutionWindow(tx, {
 *   governancePackageId,
 *   proposalId,
 *   escrowId,
 *   marketStateId,
 *   spotPoolId,
 *   assetType,
 *   stableType,
 *   lpType,
 * });
 *
 * // Returns true if REJECT won immediately (no execution needed)
 * // Returns false if execution window started (30 minutes to execute)
 * ```
 */
export class ProposalLifecycleOperations {
  /**
   * End trading and start execution window (or finalize immediately if REJECT won)
   *
   * This is the key function for transitioning from TRADING to either:
   * 1. AWAITING_EXECUTION (if an accept outcome won by TWAP) - 30-min execution window starts
   * 2. FINALIZED (if REJECT won by TWAP) - no execution needed, finalized immediately
   *
   * REJECT FAST PATH: If TWAP determines REJECT wins (market_winner == 0), there's no
   * need for an execution window since there are no actions to execute.
   *
   * ACCEPT PATH: If an accept outcome wins (market_winner > 0), the 30-minute execution
   * window starts, and execution must succeed for accept to actually win.
   *
   * @param tx - Transaction to add the call to
   * @param config - Configuration
   * @returns TransactionArgument for bool (true = REJECT won immediately, false = execution window started)
   *
   * @example
   * ```typescript
   * const tx = new Transaction();
   *
   * const result = ProposalLifecycleOperations.endTradingAndStartExecutionWindow(tx, {
   *   governancePackageId,
   *   proposalId,
   *   escrowId,
   *   marketStateId,
   *   spotPoolId,
   *   assetType,
   *   stableType,
   *   lpType,
   * });
   * ```
   */
  static endTradingAndStartExecutionWindow(
    tx: Transaction,
    config: {
      governancePackageId: string;
      proposalId: string;
      escrowId: string;
      marketStateId: string;
      spotPoolId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.governancePackageId,
        'proposal_lifecycle',
        'end_trading_and_start_execution_window'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        tx.object(config.proposalId), // proposal
        tx.object(config.escrowId), // escrow
        tx.object(config.marketStateId), // market_state
        tx.object(config.spotPoolId), // spot_pool
        tx.object(config.clock || '0x6'), // clock
      ],
    });
  }

  /**
   * Finalize proposal market (legacy - for backwards compatibility)
   *
   * @deprecated Use endTradingAndStartExecutionWindow for the new execution-required model.
   *
   * This function may still be used for proposals that don't require execution
   * or for testing purposes.
   */
  static finalizeProposalMarket(
    tx: Transaction,
    config: {
      governancePackageId: string;
      protocolPackageId: string;
      daoId: string;
      registryId: string;
      proposalId: string;
      escrowId: string;
      marketStateId: string;
      spotPoolId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.governancePackageId,
        'proposal_lifecycle',
        'finalize_proposal_market'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        tx.object(config.daoId), // account
        tx.object(config.registryId), // registry
        tx.object(config.proposalId), // proposal
        tx.object(config.escrowId), // escrow
        tx.object(config.marketStateId), // market_state
        tx.object(config.spotPoolId), // spot_pool
        tx.object(config.clock || '0x6'), // clock
      ],
    });
  }

  /**
   * Activate proposal from queue
   *
   * Transitions a queued proposal to active trading when a slot is available.
   */
  static activateProposal(
    tx: Transaction,
    config: {
      governancePackageId: string;
      proposalId: string;
      escrowId: string;
      marketStateId: string;
      spotPoolId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.governancePackageId,
        'proposal_lifecycle',
        'activate_proposal'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        tx.object(config.proposalId), // proposal
        tx.object(config.escrowId), // escrow
        tx.object(config.marketStateId), // market_state
        tx.object(config.spotPoolId), // spot_pool
        tx.object(config.clock || '0x6'), // clock
      ],
    });
  }

  /**
   * Calculate winning outcome with TWAPs
   *
   * Computes the winning outcome based on TWAP prices.
   * Returns (market_winner: u64, twap_prices: vector<u128>)
   */
  static calculateWinningOutcomeWithTwaps(
    tx: Transaction,
    config: {
      governancePackageId: string;
      proposalId: string;
      escrowId: string;
      assetType: string;
      stableType: string;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.governancePackageId,
        'proposal_lifecycle',
        'calculate_winning_outcome_with_twaps'
      ),
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.proposalId), // proposal
        tx.object(config.escrowId), // escrow
        tx.object(config.clock || '0x6'), // clock
      ],
    });
  }

  /**
   * Force reject on timeout (permissionless)
   *
   * Anyone can call this when the 30-minute execution window has expired
   * without successful execution. REJECT wins regardless of what TWAP said.
   *
   * This is a critical safety mechanism ensuring unexecutable proposals cannot win.
   *
   * @param tx - Transaction to add the call to
   * @param config - Configuration
   */
  static forceRejectOnTimeout(
    tx: Transaction,
    config: {
      governancePackageId: string;
      proposalId: string;
      escrowId: string;
      marketStateId: string;
      spotPoolId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.governancePackageId,
        'proposal_lifecycle',
        'force_reject_on_timeout'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        tx.object(config.proposalId), // proposal
        tx.object(config.escrowId), // escrow
        tx.object(config.marketStateId), // market_state
        tx.object(config.spotPoolId), // spot_pool
        tx.object(config.clock || '0x6'), // clock
      ],
    });
  }
}
