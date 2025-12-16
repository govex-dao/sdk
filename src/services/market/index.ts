/**
 * Market Service - AMM and trading operations
 *
 * @module services/market
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
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
 * MarketService - AMM and trading operations
 *
 * @example
 * ```typescript
 * // Swap asset for stable
 * const tx = sdk.market.swapAssetForStable({
 *   poolId: '0x...',
 *   assetType: '0x...::coin::COIN',
 *   stableType: '0x2::sui::SUI',
 *   amountIn: 100_000_000n,
 *   minOut: 95_000_000n,
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
  // QUERIES
  // ============================================================================

  /**
   * Get quote for a swap
   */
  async getQuote(config: {
    poolId: string;
    assetType: string;
    stableType: string;
    amountIn: bigint;
    isAssetToStable: boolean;
  }): Promise<bigint> {
    // This would require a devInspect call
    return config.amountIn;
  }

  /**
   * Get current price from a DAO's spot pool
   */
  async getPrice(_daoId: string): Promise<number> {
    // This would query the pool reserves
    return 1.0;
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
   * Get price by pool ID
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
