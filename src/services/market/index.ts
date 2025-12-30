/**
 * Market Service - AMM and trading operations
 *
 * Provides spot pool trading and quote functionality.
 * Uses devInspect for accurate quotes.
 *
 * @module services/market
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { bcs } from '@mysten/sui/bcs';
import { extractFields, PoolFields } from '../../types';
import type { Packages, SharedObjects } from '../../types';

// Re-export sub-services
export { PoolService } from './pool';

import { PoolService } from './pool';

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

export interface SwapConfig {
  poolId: string;
  assetType: string;
  stableType: string;
  amountIn: bigint;
  minOut: bigint;
  coinId?: string;
}

/**
 * Quote result for spot pool swaps
 */
export interface SpotQuoteResult {
  amountOut: bigint;
  effectivePrice: number;
  feeBps: number;
}

/**
 * MarketService - AMM and trading operations
 *
 * @example
 * ```typescript
 * // Get quote for swap
 * const quote = await sdk.market.getQuote({
 *   poolId: '0x...',
 *   assetType: '0x...::coin::COIN',
 *   stableType: '0x2::sui::SUI',
 *   amountIn: 100_000_000n,
 *   isAssetToStable: true,
 * });
 *
 * // Swap asset for stable
 * const tx = sdk.market.swapAssetForStable({
 *   poolId: '0x...',
 *   assetType: '0x...::coin::COIN',
 *   stableType: '0x2::sui::SUI',
 *   amountIn: 100_000_000n,
 *   minOut: quote.amountOut * 99n / 100n, // 1% slippage
 * });
 *
 * // Pool operations
 * const tx = sdk.market.pool.addLiquidity({...});
 * ```
 */
export class MarketService {
  private client: SuiClient;
  private packages: Packages;

  /** Pool operations (liquidity add/remove) */
  public pool: PoolService;

  constructor(params: ServiceParams) {
    this.client = params.client;
    this.packages = params.packages;

    // Initialize sub-services
    this.pool = new PoolService(params);
  }

  // ============================================================================
  // SWAPS
  // ============================================================================

  /**
   * Swap asset for stable in spot pool
   */
  swapAssetForStable(config: SwapConfig): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.packages.futarchyMarketsCore}::unified_spot_pool::swap_asset_for_stable`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.poolId),
        tx.pure.u64(config.amountIn),
        tx.pure.u64(config.minOut),
      ],
    });

    return tx;
  }

  /**
   * Swap stable for asset in spot pool
   */
  swapStableForAsset(config: SwapConfig): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.packages.futarchyMarketsCore}::unified_spot_pool::swap_stable_for_asset`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.poolId),
        tx.pure.u64(config.amountIn),
        tx.pure.u64(config.minOut),
      ],
    });

    return tx;
  }

  /**
   * Swap SUI for asset (convenience method)
   */
  swapSuiForAsset(config: {
    poolId: string;
    assetType: string;
    amountIn: bigint;
    minOut: bigint;
  }): Transaction {
    const tx = new Transaction();

    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(config.amountIn)]);

    tx.moveCall({
      target: `${this.packages.futarchyMarketsCore}::unified_spot_pool::swap_stable_for_asset_with_coin`,
      typeArguments: [config.assetType, '0x2::sui::SUI'],
      arguments: [
        tx.object(config.poolId),
        coin,
        tx.pure.u64(config.minOut),
      ],
    });

    return tx;
  }

  // ============================================================================
  // QUOTES (devInspect)
  // ============================================================================

  /**
   * Get quote for a spot pool swap using devInspect
   *
   * Simulates the swap to get accurate output amount.
   *
   * @example
   * ```typescript
   * const quote = await sdk.market.getQuote({
   *   poolId: '0x...',
   *   assetType: '0x...::coin::COIN',
   *   stableType: '0x2::sui::SUI',
   *   amountIn: 1_000_000_000n,
   *   isAssetToStable: true,
   * });
   * console.log(`Expected out: ${quote.amountOut}`);
   * ```
   */
  async getQuote(config: {
    poolId: string;
    assetType: string;
    stableType: string;
    amountIn: bigint;
    isAssetToStable: boolean;
  }): Promise<SpotQuoteResult> {
    const tx = new Transaction();

    // Build simulation call - use direct moveCall to avoid type issues
    if (config.isAssetToStable) {
      tx.moveCall({
        target: `${this.packages.futarchyMarketsCore}::unified_spot_pool::simulate_swap_asset_to_stable`,
        typeArguments: [config.assetType, config.stableType],
        arguments: [tx.object(config.poolId), tx.pure.u64(config.amountIn)],
      });
    } else {
      tx.moveCall({
        target: `${this.packages.futarchyMarketsCore}::unified_spot_pool::simulate_swap_stable_to_asset`,
        typeArguments: [config.assetType, config.stableType],
        arguments: [tx.object(config.poolId), tx.pure.u64(config.amountIn)],
      });
    }

    // Execute devInspect
    const result = await this.client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: tx,
    });

    if (!result.results || result.results.length < 1) {
      throw new Error('Quote simulation failed - no results');
    }

    const returnValues = result.results[0]?.returnValues;
    if (!returnValues || returnValues.length < 1) {
      throw new Error('Quote simulation returned no data');
    }

    // Parse the u64 result
    const amountOut = BigInt(bcs.u64().parse(new Uint8Array(returnValues[0][0])));

    // Calculate effective price
    const effectivePrice = config.isAssetToStable
      ? Number(amountOut) / Number(config.amountIn)
      : Number(config.amountIn) / Number(amountOut);

    // Get fee from pool
    const feeBps = await this.getTotalFeeBps(config.poolId);

    return {
      amountOut,
      effectivePrice,
      feeBps,
    };
  }

  /**
   * Get current price from a pool by reserves
   */
  async getPrice(poolId: string): Promise<number> {
    return this.getPriceByPoolId(poolId);
  }

  /**
   * Get total fee bps for a pool
   */
  async getTotalFeeBps(poolId: string): Promise<number> {
    try {
      const obj = await this.client.getObject({
        id: poolId,
        options: { showContent: true },
      });

      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
        return 0;
      }

      return Number(extractFields<PoolFields>(obj)?.fee_bps || 0);
    } catch {
      return 0;
    }
  }

  /**
   * Get price by pool ID (from reserves)
   */
  async getPriceByPoolId(poolId: string): Promise<number> {
    try {
      const obj = await this.client.getObject({
        id: poolId,
        options: { showContent: true },
      });

      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
        return 0;
      }

      const fields = extractFields<PoolFields>(obj);
      const assetReserve = BigInt(fields?.asset_reserve || 0);
      const stableReserve = BigInt(fields?.stable_reserve || 0);

      if (assetReserve === 0n) return 0;
      return Number(stableReserve) / Number(assetReserve);
    } catch {
      return 0;
    }
  }

  /**
   * Get pool reserves
   */
  async getReserves(poolId: string): Promise<{ asset: bigint; stable: bigint }> {
    try {
      const obj = await this.client.getObject({
        id: poolId,
        options: { showContent: true },
      });

      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
        return { asset: 0n, stable: 0n };
      }

      const fields = extractFields<PoolFields>(obj);
      return {
        asset: BigInt(fields?.asset_reserve || 0),
        stable: BigInt(fields?.stable_reserve || 0),
      };
    } catch {
      return { asset: 0n, stable: 0n };
    }
  }

  /**
   * Get LP token supply for a pool
   */
  async getLpTokenSupply(poolId: string): Promise<bigint> {
    try {
      const obj = await this.client.getObject({
        id: poolId,
        options: { showContent: true },
      });

      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
        return 0n;
      }

      return BigInt(extractFields<PoolFields>(obj)?.lp_supply || 0);
    } catch {
      return 0n;
    }
  }
}
