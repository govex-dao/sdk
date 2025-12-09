/**
 * Market Pool - Sub-namespace for liquidity pool operations
 *
 * @module services/market/pool
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { DAOInfoHelper } from '../dao';
import * as UnifiedSpotPool from '../../protocol/markets/unified-spot-pool';


export class MarketPool {
  private client: SuiClient;
  private marketsCorePackageId: string;
  private daoHelper: DAOInfoHelper;

  constructor({ client, marketsCorePackageId }: { client: SuiClient, marketsCorePackageId: string }) {
    this.client = client;
    this.marketsCorePackageId = marketsCorePackageId;
    this.daoHelper = new DAOInfoHelper(client);
  }

  /**
   * Add liquidity to the spot pool
   */
  async addLiquidity(config: {
    daoId: string;
    assetCoinId: string;
    stableCoinId: string;
    minLpOut?: bigint;
  }): Promise<Transaction> {
    const daoInfo = await this.daoHelper.getInfo(config.daoId);
    const tx = new Transaction();

    UnifiedSpotPool.addLiquidity(tx, {
      marketsCorePackageId: this.marketsCorePackageId,
      assetType: daoInfo.assetType,
      stableType: daoInfo.stableType,
      pool: tx.object(daoInfo.spotPoolId),
      assetCoin: tx.object(config.assetCoinId),
      stableCoin: tx.object(config.stableCoinId),
      minLpOut: config.minLpOut || 0n,
    });

    return tx;
  }

  /**
   * Remove liquidity from the spot pool
   */
  async removeLiquidity(config: {
    daoId: string;
    lpCoinId: string;
    minAssetOut?: bigint;
    minStableOut?: bigint;
  }): Promise<Transaction> {
    const daoInfo = await this.daoHelper.getInfo(config.daoId);
    const tx = new Transaction();

    UnifiedSpotPool.removeLiquidity(tx, {
      marketsCorePackageId: this.marketsCorePackageId,
      assetType: daoInfo.assetType,
      stableType: daoInfo.stableType,
      pool: tx.object(daoInfo.spotPoolId),
      lpToken: tx.object(config.lpCoinId),
      minAssetOut: config.minAssetOut || 0n,
      minStableOut: config.minStableOut || 0n,
    });

    return tx;
  }

  async get(daoId: string): Promise<string> {
    const daoInfo = await this.daoHelper.getInfo(daoId);

    return daoInfo.spotPoolId;
  }

  /**
   * Get pool reserves by daoId
   */
  async getReserves(poolId: string): Promise<{ asset: bigint; stable: bigint }> {
    const pool = await this.client.getObject({
      id: poolId,
      options: { showContent: true },
    });

    if (!pool.data?.content || pool.data.content.dataType !== 'moveObject') {
      throw new Error('Pool not found');
    }

    const fields = pool.data.content.fields as any;
    return {
      asset: BigInt(fields.asset_reserve || 0),
      stable: BigInt(fields.stable_reserve || 0),
    };
  }

  /**
   * Get LP token balance for an address
   */
  async getLpBalance(daoId: string, owner: string): Promise<bigint> {
    const daoInfo = await this.daoHelper.getInfo(daoId);

    const objects = await this.client.getOwnedObjects({
      owner,
      filter: {
        StructType: `0x2::coin::Coin<${this.marketsCorePackageId}::unified_spot_pool::LP<${daoInfo.assetType}, ${daoInfo.stableType}>>`,
      },
      options: { showContent: true },
    });

    let total = 0n;
    for (const obj of objects.data) {
      if (obj.data?.content && obj.data.content.dataType === 'moveObject') {
        const fields = obj.data.content.fields as any;
        total += BigInt(fields.balance || 0);
      }
    }

    return total;
  }

  /**
   * Get pool fee in basis points by pool ID directly
   */
  async getTotalFeeBps(poolId: string): Promise<number> {
    const pool = await this.client.getObject({
      id: poolId,
      options: { showContent: true },
    });

    if (!pool.data?.content || pool.data.content.dataType !== 'moveObject') {
      throw new Error('Pool not found');
    }

    const fields = pool.data.content.fields as any;
    return Number(fields.total_fee_bps || fields.fee_bps || 0);
  }

  /**
   * Get LP token supply by pool ID directly
   */
  async getLpTokenSupply(poolId: string): Promise<bigint> {
    const pool = await this.client.getObject({
      id: poolId,
      options: { showContent: true },
    });

    if (!pool.data?.content || pool.data.content.dataType !== 'moveObject') {
      throw new Error('Pool not found');
    }

    const fields = pool.data.content.fields as any;
    return BigInt(fields.lp_token_supply || fields.lp_supply || 0);
  }
}
