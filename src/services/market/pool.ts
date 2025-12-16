/**
 * Pool Service - Liquidity pool operations
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { extractFields, PoolFields } from '../../types';
import type { Packages, SharedObjects } from '../../types';

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

export interface AddLiquidityConfig {
  poolId: string;
  assetType: string;
  stableType: string;
  assetAmount: bigint;
  stableAmount: bigint;
  minLpOut: bigint;
}

export interface RemoveLiquidityConfig {
  poolId: string;
  assetType: string;
  stableType: string;
  lpAmount: bigint;
  minAssetOut: bigint;
  minStableOut: bigint;
}

export class PoolService {
  private client: SuiClient;
  private packages: Packages;

  constructor(params: ServiceParams) {
    this.client = params.client;
    this.packages = params.packages;
  }

  /**
   * Add liquidity to a pool
   */
  addLiquidity(config: AddLiquidityConfig): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.packages.futarchyMarketsCore}::unified_spot_pool::add_liquidity`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.poolId),
        tx.pure.u64(config.assetAmount),
        tx.pure.u64(config.stableAmount),
        tx.pure.u64(config.minLpOut),
      ],
    });

    return tx;
  }

  /**
   * Remove liquidity from a pool
   */
  removeLiquidity(config: RemoveLiquidityConfig): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.packages.futarchyMarketsCore}::unified_spot_pool::remove_liquidity`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.poolId),
        tx.pure.u64(config.lpAmount),
        tx.pure.u64(config.minAssetOut),
        tx.pure.u64(config.minStableOut),
      ],
    });

    return tx;
  }

  /**
   * Get pool info by DAO ID
   */
  async get(_daoId: string): Promise<any> {
    // This would query for the pool associated with the DAO
    return null;
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
   * Get LP balance for an address
   */
  async getLpBalance(_daoId: string, _owner: string): Promise<bigint> {
    // This would query the user's LP tokens
    return 0n;
  }

  /**
   * Get total fee bps
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
   * Get LP token supply
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
