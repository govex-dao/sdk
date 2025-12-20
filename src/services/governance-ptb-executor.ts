/**
 * Governance PTB Executor
 *
 * PTB (Programmable Transaction Block) execution helpers for Futarchy proposals
 * with execution-required finalization.
 *
 * The frontend composes a programmable transaction that:
 * 1. Calls `begin_execution` to receive the governance executable hot potato.
 * 2. Invokes the relevant `do_init_*` action functions in order.
 * 3. Calls `finalize_execution_success` to confirm, finalize proposal, and emit events.
 *
 * CRITICAL: Execution must succeed for accept outcomes to win.
 * - If execution succeeds: market_winner becomes actual winner
 * - If execution fails (PTB aborts): no state change, can retry
 * - If timeout: anyone calls force_reject_on_timeout() -> REJECT wins
 *
 * This ensures unexecutable proposals cannot win.
 *
 * @module governance-ptb-executor
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from './transaction';

/**
 * Governance PTB Executor
 *
 * Use this for advanced PTB composition where you need to execute proposal actions
 * with custom logic between begin and finalize steps.
 *
 * @example Execute proposal with custom logic
 * ```typescript
 * const tx = new Transaction();
 *
 * // Step 1: Begin execution (requires AWAITING_EXECUTION state)
 * const [executable, intentKey] = GovernancePTBExecutor.beginExecution(tx, {
 *   governancePackageId,
 *   daoId,
 *   proposalId,
 *   marketStateId,
 *   registryId,
 *   assetType,
 *   stableType,
 * });
 *
 * // Step 2: Execute actions (custom logic here)
 * // The executable hot potato allows you to call do_init_* functions
 * // from account_actions package
 *
 * // Step 3: Finalize execution (confirms success and finalizes proposal)
 * GovernancePTBExecutor.finalizeExecutionSuccess(tx, {
 *   governancePackageId,
 *   daoId,
 *   proposalId,
 *   escrowId,
 *   marketStateId,
 *   spotPoolId,
 *   registryId,
 *   assetType,
 *   stableType,
 *   lpType,
 * }, executable);
 * ```
 */
export class GovernancePTBExecutor {
  /**
   * Begin execution of proposal actions (Step 1 of 3)
   *
   * Creates an Executable hot potato that must be consumed by finalizeExecutionSuccess.
   * Between begin and finalize, you can call do_init_* actions.
   *
   * Requirements:
   * - Proposal must be in AWAITING_EXECUTION state
   * - Market winner must be an accept outcome (> 0)
   * - Must be within the 30-minute execution deadline
   *
   * @param tx - Transaction to add the call to
   * @param config - Execution configuration
   * @returns TransactionArgument tuple [Executable, intent_key: String]
   *
   * @example
   * ```typescript
   * const tx = new Transaction();
   *
   * const [executable, intentKey] = GovernancePTBExecutor.beginExecution(tx, {
   *   governancePackageId,
   *   daoId,
   *   proposalId,
   *   marketStateId,
   *   registryId,
   *   assetType,
   *   stableType,
   *   clock: '0x6',
   * });
   * ```
   */
  static beginExecution(
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
        tx.object(config.marketStateId), // market_state
        tx.object(config.clock || '0x6'), // clock
      ],
    });
  }

  /**
   * Begin execution using escrow reference (alternative to beginExecution)
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
   * const executable = GovernancePTBExecutor.beginExecutionWithEscrow(tx, {
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
  static beginExecutionWithEscrow(
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
   * Finalize execution success (Step 3 of 3)
   *
   * Consumes the Executable hot potato, confirms all actions were executed,
   * and finalizes the proposal with the market winner as actual winner.
   * Emits ProposalExecutionSucceeded and ProposalMarketFinalized events.
   *
   * @param tx - Transaction to add the call to
   * @param config - Execution configuration
   * @param executable - The Executable hot potato from beginExecution
   *
   * @example
   * ```typescript
   * const tx = new Transaction();
   *
   * // After begin_execution and do_init_* calls
   * GovernancePTBExecutor.finalizeExecutionSuccess(tx, {
   *   governancePackageId,
   *   daoId,
   *   proposalId,
   *   escrowId,
   *   marketStateId,
   *   spotPoolId,
   *   registryId,
   *   assetType,
   *   stableType,
   *   lpType,
   *   clock: '0x6',
   * }, executable);
   * ```
   */
  static finalizeExecutionSuccess(
    tx: Transaction,
    config: {
      governancePackageId: string;
      daoId: string;
      proposalId: string;
      escrowId: string;
      marketStateId: string;
      spotPoolId: string;
      registryId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      clock?: string;
    },
    executable: ReturnType<Transaction['moveCall']>
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.governancePackageId,
        'ptb_executor',
        'finalize_execution_success'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        tx.object(config.daoId), // account
        tx.object(config.registryId), // registry
        tx.object(config.proposalId), // proposal
        tx.object(config.escrowId), // escrow
        tx.object(config.marketStateId), // market_state
        tx.object(config.spotPoolId), // spot_pool
        executable, // executable
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
   * NOTE: This function is in proposal_lifecycle module, not ptb_executor.
   * It's included here for convenience since it's part of the execution flow.
   *
   * @param tx - Transaction to add the call to
   * @param config - Configuration
   *
   * @example
   * ```typescript
   * const tx = new Transaction();
   *
   * // Execution window expired, force REJECT to win
   * GovernancePTBExecutor.forceRejectOnTimeout(tx, {
   *   governancePackageId,
   *   proposalId,
   *   escrowId,
   *   marketStateId,
   *   spotPoolId,
   *   assetType,
   *   stableType,
   *   lpType,
   *   clock: '0x6',
   * });
   * ```
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

  /**
   * @deprecated Use finalizeExecutionSuccess instead.
   *
   * The old finalize_execution function is replaced by finalize_execution_success
   * in the execution-required finalization model.
   */
  static finalizeExecution(
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
    console.warn(
      'GovernancePTBExecutor.finalizeExecution is deprecated. Use finalizeExecutionSuccess instead.'
    );
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
