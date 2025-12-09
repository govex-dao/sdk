/**
 * Unified Spot Pool Module
 *
 * UNIFIED SPOT POOL - Single pool type with optional aggregator support
 *
 * Design Goals:
 * - Replace both SpotAMM and AccountSpotPool with single unified type
 * - Optional aggregator features (zero overhead when disabled)
 * - NO circular dependencies (uses IDs, not concrete types)
 * - Backward compatible initialization
 *
 * Key Features:
 * - Constant product AMM (x * y = k)
 * - Bucket-based LP management (LIVE, TRANSITIONING, WITHDRAW_ONLY, PENDING)
 * - Quantum liquidity (LP splits to conditional markets during proposals)
 * - TWAP oracle integration
 * - Dynamic fee scheduling (anti-snipe for launchpads)
 * - Protocol fee collection
 *
 * @module unified-spot-pool
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/utils';

// ============================================================================
// Types
// ============================================================================

// TransactionArgument covers all valid PTB argument types:
// - tx.object() returns ObjectRef
// - tx.moveCall() returns TransactionResult
// - tx.splitCoins() returns NestedResult
// Using 'any' here for flexibility - the Move runtime validates types
type TransactionArgument = any;
type TransactionResult = ReturnType<Transaction['moveCall']>;

interface BaseConfig {
  marketsCorePackageId: string;
  assetType: string;
  stableType: string;
}

interface PoolConfig extends BaseConfig {
  pool: TransactionArgument;
}

interface LpTokenConfig extends BaseConfig {
  lpToken: TransactionArgument;
}

// ============================================================================
// LP Token Functions
// ============================================================================

/**
 * Get LP token amount
 *
 * Returns the amount of LP tokens held by this token.
 */
export function lpTokenAmount(
  tx: Transaction,
  config: LpTokenConfig
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'lp_token_amount'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.lpToken],
  });
}

/**
 * Get the pool ID this LP belongs to
 *
 * Returns the ID of the parent pool that minted this LP token.
 */
export function lpTokenPoolId(
  tx: Transaction,
  config: LpTokenConfig
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'lp_token_pool_id'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.lpToken],
  });
}

/**
 * Check if LP is locked in a proposal
 *
 * Returns true if LP is locked and proposal is not finalized.
 */
export function isLockedInProposal(
  tx: Transaction,
  config: LpTokenConfig
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'is_locked_in_proposal'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.lpToken],
  });
}

/**
 * Get the proposal ID this LP is locked in
 *
 * Returns Option<ID> with the proposal ID if locked.
 */
export function getLockedProposal(
  tx: Transaction,
  config: LpTokenConfig
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_locked_proposal'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.lpToken],
  });
}

/**
 * Check if LP is in withdraw mode
 *
 * Returns true if LP has been marked for withdrawal.
 */
export function isWithdrawMode(
  tx: Transaction,
  config: LpTokenConfig
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'is_withdraw_mode'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.lpToken],
  });
}

// ============================================================================
// Pool Creation Functions
// ============================================================================

/**
 * Create a futarchy spot pool with FULL features
 *
 * All futarchy pools have: TWAP oracle, escrow tracking, bucket management.
 * There is NO "simple" mode - all pools need these features for governance.
 */
export function newPool(
  tx: Transaction,
  config: BaseConfig & {
    feeBps: bigint;
    feeSchedule: TransactionArgument | null; // Option<FeeSchedule>
    oracleConditionalThresholdBps: bigint; // When to use conditional vs spot oracle (typically 5000 = 50%)
    conditionalLiquidityRatioPercent: bigint; // DAO's configured ratio for quantum split (1-99)
    clock?: string;
  }
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'new'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [
      tx.pure.u64(config.feeBps),
      config.feeSchedule || tx.object('0x0'),
      tx.pure.u64(config.oracleConditionalThresholdBps),
      tx.pure.u64(config.conditionalLiquidityRatioPercent),
      tx.object(config.clock || '0x6'),
    ],
  });
}

/**
 * DEPRECATED: Use newPool() instead - all pools now have full features
 *
 * This function is kept for backwards compatibility but just calls new().
 */
export function newWithAggregator(
  tx: Transaction,
  config: BaseConfig & {
    feeBps: bigint;
    feeSchedule: TransactionArgument | null;
    oracleConditionalThresholdBps: bigint;
    conditionalLiquidityRatioPercent: bigint;
    clock?: string;
  }
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'new_with_aggregator'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [
      tx.pure.u64(config.feeBps),
      config.feeSchedule || tx.object('0x0'),
      tx.pure.u64(config.oracleConditionalThresholdBps),
      tx.pure.u64(config.conditionalLiquidityRatioPercent),
      tx.object(config.clock || '0x6'),
    ],
  });
}

/**
 * Upgrade existing pool to add aggregator support
 *
 * Can be called via governance to enable aggregator features.
 * No-op: all pools already have full features enabled at creation.
 */
export function enableAggregator(
  tx: Transaction,
  config: PoolConfig & {
    oracleConditionalThresholdBps: bigint;
    clock?: string;
  }
): void {
  tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'enable_aggregator'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [
      config.pool,
      tx.pure.u64(config.oracleConditionalThresholdBps),
      tx.object(config.clock || '0x6'),
    ],
  });
}

// ============================================================================
// Escrow Management Functions (Aggregator Only)
// ============================================================================

/**
 * Store active escrow ID when proposal starts trading
 *
 * NOTE: Takes ID (not TokenEscrow object) because shared objects can't be stored.
 */
export function storeActiveEscrow(
  tx: Transaction,
  config: PoolConfig & { escrowId: string }
): void {
  tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'store_active_escrow'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool, tx.object(config.escrowId)],
  });
}

/**
 * Extract active escrow ID when proposal ends
 *
 * Returns the escrow ID to caller (to look up the shared object).
 */
export function extractActiveEscrow(
  tx: Transaction,
  config: PoolConfig
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'extract_active_escrow'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool],
  });
}

/**
 * Get active escrow ID (read-only)
 *
 * Returns None if no active escrow.
 */
export function getActiveEscrowId(
  tx: Transaction,
  config: PoolConfig
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_active_escrow_id'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool],
  });
}

// ============================================================================
// Core AMM Functions
// ============================================================================

/**
 * Add liquidity to the pool and return LP token with excess coins
 *
 * IMPORTANT: LP can be added anytime, including during active proposals.
 * - If no proposal active: LP goes to LIVE bucket (participates immediately)
 * - If proposal active: LP goes to PENDING bucket (joins spot pool when proposal ends)
 *
 * This prevents new LP from unfairly benefiting from conditional market outcomes.
 * Returns: (LPToken, excess_asset_coin, excess_stable_coin)
 */
export function addLiquidity(
  tx: Transaction,
  config: PoolConfig & {
    assetCoin: TransactionArgument;
    stableCoin: TransactionArgument;
    minLpOut: bigint;
  }
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'add_liquidity'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [
      config.pool,
      config.assetCoin,
      config.stableCoin,
      tx.pure.u64(config.minLpOut),
    ],
  });
}

/**
 * Add liquidity and return LP token with excess coins (explicit name for clarity)
 *
 * Returns: (LPToken, excess_asset_coin, excess_stable_coin)
 *
 * CRITICAL: This function calculates the optimal amounts needed to match pool ratio
 * and returns any excess coins instead of depositing them (which would donate to existing LPs).
 */
export function addLiquidityAndReturn(
  tx: Transaction,
  config: PoolConfig & {
    assetCoin: TransactionArgument;
    stableCoin: TransactionArgument;
    minLpOut: bigint;
  }
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'add_liquidity_and_return'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [
      config.pool,
      config.assetCoin,
      config.stableCoin,
      tx.pure.u64(config.minLpOut),
    ],
  });
}

/**
 * Remove liquidity from the pool
 *
 * NOTE: This function is for removing from LIVE bucket ONLY.
 * For withdrawal after marking, use markLpForWithdrawal() + withdrawLp().
 */
export function removeLiquidity(
  tx: Transaction,
  config: PoolConfig & {
    lpToken: TransactionArgument;
    minAssetOut: bigint;
    minStableOut: bigint;
  }
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'remove_liquidity'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [
      config.pool,
      config.lpToken,
      tx.pure.u64(config.minAssetOut),
      tx.pure.u64(config.minStableOut),
    ],
  });
}

// ============================================================================
// LP Withdrawal System
// ============================================================================

/**
 * Mark LP for withdrawal - user triggers this to exit
 *
 * If proposal is active: moves LIVE → TRANSITIONING (still trades)
 * If no proposal: moves LIVE → WITHDRAW_ONLY (immediate)
 */
export function markLpForWithdrawal(
  tx: Transaction,
  config: PoolConfig & { lpToken: TransactionArgument }
): void {
  tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'mark_lp_for_withdrawal'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool, config.lpToken],
  });
}

/**
 * Withdraw LP as coins (final step)
 *
 * Burns LP token and returns proportional share of WITHDRAW_ONLY bucket as coins.
 * LP must be in withdraw mode and NOT locked.
 */
export function withdrawLp(
  tx: Transaction,
  config: PoolConfig & { lpToken: TransactionArgument }
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'withdraw_lp'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool, config.lpToken],
  });
}

/**
 * Transition leaving bucket to frozen claimable bucket
 *
 * Public function to move TRANSITIONING → WITHDRAW_ONLY after proposal ends.
 * Anyone can call this to help users claim their LP.
 */
export function transitionLeavingToFrozenClaimable(
  tx: Transaction,
  config: PoolConfig
): void {
  tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'transition_leaving_to_frozen_claimable'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool],
  });
}

/**
 * Check if pool can create proposals
 *
 * Returns true if pool has sufficient liquidity and no active proposal.
 */
export function canCreateProposals(
  tx: Transaction,
  config: PoolConfig
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'can_create_proposals'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool],
  });
}

// ============================================================================
// Swap Functions
// ============================================================================

/**
 * Swap stable for asset
 *
 * Swaps stable coins for asset coins using constant product AMM.
 * Applies dynamic fees if fee_schedule is configured.
 */
export function swapStableForAsset(
  tx: Transaction,
  config: PoolConfig & {
    lpType: string;
    stableCoin: TransactionArgument;
    minAssetOut: bigint;
    clock?: string;
  }
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'swap_stable_for_asset'),
    typeArguments: [config.assetType, config.stableType, config.lpType],
    arguments: [
      config.pool,
      config.stableCoin,
      tx.pure.u64(config.minAssetOut),
      tx.object(config.clock || '0x6'),
    ],
  });
}

/**
 * Swap asset for stable
 *
 * Swaps asset coins for stable coins using constant product AMM.
 * Applies dynamic fees if fee_schedule is configured.
 */
export function swapAssetForStable(
  tx: Transaction,
  config: PoolConfig & {
    lpType: string;
    assetCoin: TransactionArgument;
    minStableOut: bigint;
    clock?: string;
  }
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'swap_asset_for_stable'),
    typeArguments: [config.assetType, config.stableType, config.lpType],
    arguments: [
      config.pool,
      config.assetCoin,
      tx.pure.u64(config.minStableOut),
      tx.object(config.clock || '0x6'),
    ],
  });
}

// ============================================================================
// View Functions
// ============================================================================

/**
 * Get pool reserves
 *
 * Returns (asset_reserve, stable_reserve).
 */
export function getReserves(
  tx: Transaction,
  config: PoolConfig
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_reserves'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool],
  });
}

/**
 * Get LP supply
 *
 * Returns total LP supply for the pool.
 */
export function lpSupply(
  tx: Transaction,
  config: PoolConfig
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'lp_supply'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool],
  });
}

/**
 * Get active quantum LP reserves
 *
 * Returns (asset, stable) reserves for LIVE bucket.
 */
export function getActiveQuantumLpReserves(
  tx: Transaction,
  config: PoolConfig
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_active_quantum_lp_reserves'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool],
  });
}

/**
 * Get active quantum LP supply
 *
 * Returns LP supply for LIVE bucket.
 */
export function getActiveQuantumLpSupply(
  tx: Transaction,
  config: PoolConfig
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_active_quantum_lp_supply'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool],
  });
}

/**
 * Get leaving on proposal end reserves
 *
 * Returns (asset, stable, lp) for TRANSITIONING bucket.
 */
export function getLeavingOnProposalEndReserves(
  tx: Transaction,
  config: PoolConfig
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_leaving_on_proposal_end_reserves'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool],
  });
}

/**
 * Get frozen claimable LP reserves
 *
 * Returns (asset, stable) for WITHDRAW_ONLY bucket.
 */
export function getFrozenClaimableLpReserves(
  tx: Transaction,
  config: PoolConfig
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_frozen_claimable_lp_reserves'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool],
  });
}

/**
 * Get spot price
 *
 * Returns current price (stable per asset) with PRECISION scaling (1e12).
 */
export function getSpotPrice(
  tx: Transaction,
  config: PoolConfig
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_spot_price'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool],
  });
}

/**
 * Check if aggregator is enabled
 *
 * Returns true if pool has aggregator features.
 * (Always true for new pools - kept for backwards compatibility)
 */
export function isAggregatorEnabled(
  tx: Transaction,
  config: PoolConfig
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'is_aggregator_enabled'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool],
  });
}

/**
 * Check if pool has active escrow
 *
 * Returns true if proposal is active and trading.
 */
export function hasActiveEscrow(
  tx: Transaction,
  config: PoolConfig
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'has_active_escrow'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool],
  });
}

/**
 * Check if pool is locked for proposal
 *
 * Returns true if proposal is active.
 */
export function isLockedForProposal(
  tx: Transaction,
  config: PoolConfig
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'is_locked_for_proposal'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool],
  });
}

/**
 * Get conditional liquidity ratio percent
 *
 * Returns the percentage of liquidity that gets quantum-split (1-99).
 */
export function getConditionalLiquidityRatioPercent(
  tx: Transaction,
  config: PoolConfig
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_conditional_liquidity_ratio_percent'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool],
  });
}

/**
 * Get oracle conditional threshold bps
 *
 * Returns the threshold for switching between conditional and spot oracles.
 */
export function getOracleConditionalThresholdBps(
  tx: Transaction,
  config: PoolConfig
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_oracle_conditional_threshold_bps'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool],
  });
}

/**
 * Mark liquidity to proposal
 *
 * Updates last_proposal_usage timestamp for oracle switching logic.
 */
export function markLiquidityToProposal(
  tx: Transaction,
  config: PoolConfig & { proposalId: string }
): void {
  tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'mark_liquidity_to_proposal'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool, tx.object(config.proposalId)],
  });
}

// ============================================================================
// TWAP Functions
// ============================================================================

/**
 * Check if TWAP is ready
 *
 * Returns true if enough observations have been made.
 */
export function isTwapReady(
  tx: Transaction,
  config: PoolConfig & { clock?: string }
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'is_twap_ready'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool, tx.object(config.clock || '0x6')],
  });
}

/**
 * Get geometric TWAP
 *
 * Returns geometric mean TWAP price.
 */
export function getGeometricTwap(
  tx: Transaction,
  config: PoolConfig & { clock?: string }
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_geometric_twap'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool, tx.object(config.clock || '0x6')],
  });
}

/**
 * Get TWAP with conditional fallback
 *
 * Returns TWAP from conditional oracle or spot oracle based on threshold.
 */
export function getTwapWithConditional(
  tx: Transaction,
  config: PoolConfig & {
    escrow: TransactionArgument;
    clock?: string;
  }
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_twap_with_conditional'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool, config.escrow, tx.object(config.clock || '0x6')],
  });
}

/**
 * Get simple TWAP
 *
 * Returns simple TWAP from spot pool oracle.
 */
export function getSimpleTwap(
  tx: Transaction,
  config: PoolConfig & { clock?: string }
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_simple_twap'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool, tx.object(config.clock || '0x6')],
  });
}

/**
 * Get fee bps
 *
 * Returns the current fee in basis points.
 */
export function getFeeBps(
  tx: Transaction,
  config: PoolConfig
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_fee_bps'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool],
  });
}

// ============================================================================
// Simulation Functions
// ============================================================================

/**
 * Simulate swap asset to stable
 *
 * Returns expected output without executing the swap.
 */
export function simulateSwapAssetToStable(
  tx: Transaction,
  config: PoolConfig & { assetIn: bigint }
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'simulate_swap_asset_to_stable'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool, tx.pure.u64(config.assetIn)],
  });
}

/**
 * Simulate swap stable to asset
 *
 * Returns expected output without executing the swap.
 */
export function simulateSwapStableToAsset(
  tx: Transaction,
  config: PoolConfig & { stableIn: bigint }
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'simulate_swap_stable_to_asset'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool, tx.pure.u64(config.stableIn)],
  });
}

// ============================================================================
// DAO Dissolution Functions
// ============================================================================

/**
 * Remove liquidity for dissolution
 *
 * Extracts all liquidity for DAO dissolution process.
 */
export function removeLiquidityForDissolution(
  tx: Transaction,
  config: PoolConfig
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'remove_liquidity_for_dissolution'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool],
  });
}

/**
 * Get DAO LP value
 *
 * Returns the current value of DAO-owned LP.
 */
export function getDaoLpValue(
  tx: Transaction,
  config: PoolConfig & { daoLpAmount: bigint }
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_dao_lp_value'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool, tx.pure.u64(config.daoLpAmount)],
  });
}

/**
 * Get protocol fee amounts
 *
 * Returns the current protocol fee balances.
 */
export function getProtocolFeeAmounts(
  tx: Transaction,
  config: PoolConfig
): TransactionResult {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_protocol_fee_amounts'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool],
  });
}

/**
 * Share pool object
 *
 * Makes pool a shared object (callable by anyone).
 */
export function share(
  tx: Transaction,
  config: PoolConfig
): void {
  tx.moveCall({
    target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'share'),
    typeArguments: [config.assetType, config.stableType],
    arguments: [config.pool],
  });
}
