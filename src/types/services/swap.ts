/**
 * Swap Service Types - Configuration types for swap operations
 *
 * @module types/services/swap
 */

/**
 * Configuration for a spot swap
 */
export interface SpotSwapConfig {
  /** Spot pool object ID */
  spotPoolId: string;
  /** Proposal object ID (if during active proposal) */
  proposalId?: string;
  /** Escrow object ID (if during active proposal) */
  escrowId?: string;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** LP coin type for the spot pool */
  lpType: string;
  /** Direction of swap */
  direction: 'stable_to_asset' | 'asset_to_stable';
  /** Amount to swap (in input token) */
  amountIn: bigint;
  /** Minimum output amount */
  minAmountOut: bigint;
  /** Recipient address */
  recipient: string;
  /** Input coin object IDs */
  inputCoins: string[];
  /** Clock object ID */
  clockId?: string;
}

/**
 * Configuration for a conditional swap
 */
export interface ConditionalSwapConfig {
  /** Escrow object ID */
  escrowId: string;
  /** Spot pool object ID */
  spotPoolId: string;
  /** Proposal object ID */
  proposalId: string;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** LP coin type for the spot pool */
  lpType: string;
  /** Outcome index to swap in (this is where the swap will occur) */
  outcomeIndex: number;
  /** Direction of swap */
  direction: 'stable_to_asset' | 'asset_to_stable';
  /** Amount to swap */
  amountIn: bigint;
  /** Minimum output amount */
  minAmountOut: bigint;
  /** Recipient address */
  recipient: string;
  /**
   * All conditional coin types for each outcome
   * Key is outcome index (0, 1, etc.)
   * Required because stable splitting must happen across ALL outcomes
   */
  allOutcomeCoins: Array<{
    outcomeIndex: number;
    assetCoinType: string;
    stableCoinType: string;
  }>;
  /** Input stable coins (for splitting) */
  stableCoins: string[];
  /** Clock object ID */ 
  clockId?: string;
}
