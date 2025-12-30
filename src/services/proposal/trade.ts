/**
 * Trade Service - Proposal trading operations
 *
 * Provides quote and trade execution for proposal conditional markets.
 * Uses devInspect for accurate quotes and handles the full swap flow.
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { bcs } from '@mysten/sui/bcs';
import type { Packages, SharedObjects } from '../../types';

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

/**
 * Quote result with detailed info
 */
export interface QuoteResult {
  amountOut: bigint;
  effectivePrice: number;
  priceImpactBps: number;
  outcomeIndex: number;
  direction: 'stableToAsset' | 'assetToStable';
}

/**
 * Trade execution config
 */
export interface TradeConfig {
  proposalId: string;
  escrowId: string;
  spotPoolId: string;
  assetType: string;
  stableType: string;
  lpType: string;
  outcomeIndex: number;
  direction: 'stableToAsset' | 'assetToStable';
  amountIn: bigint;
  minAmountOut: bigint;
  recipient: string;
  /** Coin object IDs to use for input */
  inputCoinIds: string[];
  /** Conditional coin types for all outcomes - array indexed by outcome */
  conditionalCoinTypes: Array<{
    outcomeIndex: number;
    assetCoinType: string;
    stableCoinType: string;
  }>;
  clockId?: string;
}

export class TradeService {
  private client: SuiClient;
  private packages: Packages;

  constructor(params: ServiceParams) {
    this.client = params.client;
    this.packages = params.packages;
  }

  /**
   * Get quote for a swap using devInspect
   *
   * Simulates the swap to get accurate output amount, price, and impact.
   *
   * @example
   * ```typescript
   * const quote = await sdk.proposal.trade.getQuote({
   *   proposalId: '0x...',
   *   escrowId: '0x...',
   *   assetType: '0x...::coin::COIN',
   *   stableType: '0x2::sui::SUI',
   *   outcomeIndex: 0,
   *   amountIn: 1_000_000n,
   *   direction: 'stableToAsset',
   * });
   * console.log(`Expected out: ${quote.amountOut}, price impact: ${quote.priceImpactBps}bps`);
   * ```
   */
  async getQuote(config: {
    proposalId: string;
    escrowId: string;
    assetType: string;
    stableType: string;
    outcomeIndex: number;
    amountIn: bigint;
    direction: 'stableToAsset' | 'assetToStable';
  }): Promise<QuoteResult> {
    const tx = new Transaction();
    const pkg = this.packages.futarchyMarketsOperations;

    // Build quote call based on direction using direct moveCall
    const quoteTarget = config.direction === 'stableToAsset'
      ? `${pkg}::spot_conditional_quoter::quote_spot_stable_to_asset`
      : `${pkg}::spot_conditional_quoter::quote_spot_asset_to_stable`;

    const quote = tx.moveCall({
      target: quoteTarget,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.proposalId),
        tx.object(config.escrowId),
        tx.pure.u64(config.outcomeIndex),
        tx.pure.u64(config.amountIn),
      ],
    });

    // Extract individual fields from the quote struct
    tx.moveCall({
      target: `${pkg}::spot_conditional_quoter::get_amount_out`,
      arguments: [quote],
    });
    tx.moveCall({
      target: `${pkg}::spot_conditional_quoter::get_effective_price`,
      arguments: [quote],
    });
    tx.moveCall({
      target: `${pkg}::spot_conditional_quoter::get_price_impact_bps`,
      arguments: [quote],
    });

    // Execute devInspect to simulate
    const result = await this.client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: tx,
    });

    // Parse results - indices 1,2,3 are the accessor calls (0 is the quote call itself)
    if (!result.results || result.results.length < 4) {
      throw new Error('Quote simulation failed - no results');
    }

    // Extract values from return bytes
    const amountOutBytes = result.results[1]?.returnValues?.[0]?.[0];
    const effectivePriceBytes = result.results[2]?.returnValues?.[0]?.[0];
    const priceImpactBpsBytes = result.results[3]?.returnValues?.[0]?.[0];

    if (!amountOutBytes || !effectivePriceBytes || !priceImpactBpsBytes) {
      throw new Error('Quote simulation returned incomplete data');
    }

    // Decode BCS values - all returned as u64 from the contract
    const amountOut = bcs.u64().parse(new Uint8Array(amountOutBytes));
    const effectivePriceRaw = bcs.u64().parse(new Uint8Array(effectivePriceBytes));
    const priceImpactBps = Number(bcs.u64().parse(new Uint8Array(priceImpactBpsBytes)));

    // Convert effective price from fixed point (scaled by 1e12 = price_scale() from constants.move)
    const PRICE_SCALE = 1_000_000_000_000;
    const effectivePrice = Number(effectivePriceRaw) / PRICE_SCALE;

    return {
      amountOut: BigInt(amountOut),
      effectivePrice,
      priceImpactBps,
      outcomeIndex: config.outcomeIndex,
      direction: config.direction,
    };
  }

  /**
   * Find best outcome to route swap through
   *
   * Compares quotes across all outcomes and returns the best route.
   */
  async findBestRoute(config: {
    proposalId: string;
    escrowId: string;
    assetType: string;
    stableType: string;
    amountIn: bigint;
    direction: 'stableToAsset' | 'assetToStable';
  }): Promise<{ outcomeIndex: number; quote: QuoteResult }> {
    const tx = new Transaction();
    const pkg = this.packages.futarchyMarketsOperations;

    // Use the find_best route function with direct moveCall
    const findTarget = config.direction === 'stableToAsset'
      ? `${pkg}::spot_conditional_quoter::find_best_stable_to_asset_route`
      : `${pkg}::spot_conditional_quoter::find_best_asset_to_stable_route`;

    tx.moveCall({
      target: findTarget,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.proposalId),
        tx.object(config.escrowId),
        tx.pure.u64(config.amountIn),
      ],
    });

    const result = await this.client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: tx,
    });

    if (!result.results || result.results.length < 1) {
      throw new Error('Route finding failed - no results');
    }

    // Returns tuple of (best_outcome_index, quote)
    const returnValues = result.results[0]?.returnValues;
    if (!returnValues || returnValues.length < 2) {
      throw new Error('Route finding returned incomplete data');
    }

    const outcomeIndex = Number(bcs.u8().parse(new Uint8Array(returnValues[0][0])));

    // Now get the full quote for that outcome
    const quote = await this.getQuote({
      ...config,
      outcomeIndex,
    });

    return { outcomeIndex, quote };
  }

  /**
   * Get current price for an outcome from the conditional AMM
   *
   * Price is expressed as stable per asset.
   */
  async getPrice(config: {
    proposalId: string;
    escrowId: string;
    assetType: string;
    stableType: string;
    outcomeIndex: number;
  }): Promise<number> {
    // Use a minimal quote to get the effective price at that outcome
    try {
      const quote = await this.getQuote({
        ...config,
        amountIn: 1_000_000n, // Small amount for price discovery
        direction: 'stableToAsset',
      });
      return quote.effectivePrice;
    } catch {
      // If quote fails, return 0 (market may not be initialized)
      return 0;
    }
  }

  // ============================================================================
  // Legacy TX builders (kept for compatibility)
  // ============================================================================

  /**
   * Swap stable for asset (buy outcome tokens)
   * @deprecated Use executeTrade or the proposal workflow instead
   */
  stableForAsset(config: {
    proposalId: string;
    outcomeIndex: number;
    amountIn: bigint;
    minOut: bigint;
    assetType: string;
    stableType: string;
    lpType: string;
    clockId?: string;
  }): Transaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    tx.moveCall({
      target: `${this.packages.futarchyMarketsOperations}::swap_entry::swap_stable_for_conditional_asset`,
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        tx.object(config.proposalId),
        tx.pure.u64(config.outcomeIndex),
        tx.pure.u64(config.amountIn),
        tx.pure.u64(config.minOut),
        tx.object(clockId),
      ],
    });

    return tx;
  }

  /**
   * Swap asset for stable (sell outcome tokens)
   * @deprecated Use executeTrade or the proposal workflow instead
   */
  assetForStable(config: {
    proposalId: string;
    outcomeIndex: number;
    amountIn: bigint;
    minOut: bigint;
    assetType: string;
    stableType: string;
    lpType: string;
    clockId?: string;
  }): Transaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    tx.moveCall({
      target: `${this.packages.futarchyMarketsOperations}::swap_entry::swap_conditional_asset_for_stable`,
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        tx.object(config.proposalId),
        tx.pure.u64(config.outcomeIndex),
        tx.pure.u64(config.amountIn),
        tx.pure.u64(config.minOut),
        tx.object(clockId),
      ],
    });

    return tx;
  }
}
