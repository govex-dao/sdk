/**
 * MarketService - Market operations
 *
 * Provides simple, user-friendly API for swapping and liquidity.
 * Auto-fetches DAO info so users only need to provide daoId.
 *
 * Sub-namespaces:
 * - pool: Liquidity pool operations
 *
 * @module services/market
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { DAOInfoHelper } from '../dao';
import * as UnifiedSpotPool from '@/protocol/markets/unified-spot-pool';
import { Packages, SDKConfigWithObjects, SwapQuote } from '@/types';
import { MarketPool } from './pool';

export class MarketService {
  private client: SuiClient;
  private packages: Packages;
  private daoHelper: DAOInfoHelper;

  // Sub-namespaces
  public readonly pool: MarketPool;

  constructor({client, packages}: SDKConfigWithObjects) {
    this.client = client;
    this.packages = packages;
    this.daoHelper = new DAOInfoHelper(client);

    // Initialize sub-namespaces
    this.pool = new MarketPool({
      client,
      marketsCorePackageId: packages.futarchyMarketsCore,
    });
  }

  // ============================================================================
  // SWAPS
  // ============================================================================

  /**
   * Swap asset tokens for stable tokens
   */
  async swapAssetForStable(config: {
    daoId: string;
    amountIn: bigint;
    minAmountOut: bigint;
    coinId: string;
  }): Promise<Transaction> {
    const daoInfo = await this.daoHelper.getInfo(config.daoId);
    const tx = new Transaction();

    UnifiedSpotPool.swapAssetForStable(tx, {
      marketsCorePackageId: this.packages.futarchyMarketsCore,
      assetType: daoInfo.assetType,
      stableType: daoInfo.stableType,
      lpType: daoInfo.lpType,
      pool: tx.object(daoInfo.spotPoolId),
      assetCoin: tx.object(config.coinId),
      minStableOut: config.minAmountOut,
    });

    return tx;
  }

  /**
   * Swap stable tokens for asset tokens
   */
  async swapStableForAsset(config: {
    daoId: string;
    amountIn: bigint;
    minAmountOut: bigint;
    coinId: string;
  }): Promise<Transaction> {
    const daoInfo = await this.daoHelper.getInfo(config.daoId);
    const tx = new Transaction();

    UnifiedSpotPool.swapStableForAsset(tx, {
      marketsCorePackageId: this.packages.futarchyMarketsCore,
      assetType: daoInfo.assetType,
      stableType: daoInfo.stableType,
      lpType: daoInfo.lpType,
      pool: tx.object(daoInfo.spotPoolId),
      stableCoin: tx.object(config.coinId),
      minAssetOut: config.minAmountOut,
    });

    return tx;
  }

  /**
   * Swap SUI for asset (splits from gas)
   */
  async swapSuiForAsset(config: {
    daoId: string;
    amountIn: bigint;
    minAmountOut: bigint;
  }): Promise<Transaction> {
    const daoInfo = await this.daoHelper.getInfo(config.daoId);
    const tx = new Transaction();

    const [coin] = tx.splitCoins(tx.gas, [config.amountIn]);

    UnifiedSpotPool.swapStableForAsset(tx, {
      marketsCorePackageId: this.packages.futarchyMarketsCore,
      assetType: daoInfo.assetType,
      stableType: daoInfo.stableType,
      lpType: daoInfo.lpType,
      pool: tx.object(daoInfo.spotPoolId),
      stableCoin: coin,
      minAssetOut: config.minAmountOut,
    });

    return tx;
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Get swap quote (estimate output amount)
   */
  async getQuote(config: {
    daoId: string;
    amountIn: bigint;
    direction: 'asset_to_stable' | 'stable_to_asset';
  }): Promise<SwapQuote> {
    const reserves = await this.pool.getReserves(config.daoId);
    const assetToStable = config.direction === 'asset_to_stable';

    const reserveIn = assetToStable ? reserves.asset : reserves.stable;
    const reserveOut = assetToStable ? reserves.stable : reserves.asset;

    // Constant product formula with 0.3% fee
    const amountInAfterFee = (config.amountIn * 997n) / 1000n;
    const amountOut = (reserveOut * amountInAfterFee) / (reserveIn + amountInAfterFee);
    const fee = config.amountIn - amountInAfterFee;

    // Price impact
    const spotPrice = (reserveOut * 1_000_000n) / reserveIn;
    const execPrice = (amountOut * 1_000_000n) / config.amountIn;
    const priceImpact = spotPrice > 0n
      ? Number((spotPrice - execPrice) * 10000n / spotPrice) / 100
      : 0;

    return {
      amountIn: config.amountIn,
      amountOut,
      priceImpact,
      fee,
    };
  }

  /**
   * Get current spot price (asset per stable)
   */
  async getPrice(daoId: string): Promise<bigint> {
    const reserves = await this.pool.getReserves(daoId);
    if (reserves.asset === 0n) return 0n;
    return (reserves.stable * 1_000_000_000n) / reserves.asset;
  }

  // ============================================================================
  // DIRECT POOL OPERATIONS (by poolId with types)
  // ============================================================================

  /**
   * Swap asset for stable by pool ID directly
   */
  swapAssetForStableDirect(config: {
    poolId: string;
    assetType: string;
    stableType: string;
    lpType: string;
    coinId: string;
    minOut: bigint | number;
  }): Transaction {
    const tx = new Transaction();

    UnifiedSpotPool.swapAssetForStable(tx, {
      marketsCorePackageId: this.packages.futarchyMarketsCore,
      assetType: config.assetType,
      stableType: config.stableType,
      lpType: config.lpType,
      pool: tx.object(config.poolId),
      assetCoin: tx.object(config.coinId),
      minStableOut: BigInt(config.minOut),
    });

    return tx;
  }

  /**
   * Swap stable for asset by pool ID directly
   */
  swapStableForAssetDirect(config: {
    poolId: string;
    assetType: string;
    stableType: string;
    lpType: string;
    coinId: string;
    minOut: bigint | number;
  }): Transaction {
    const tx = new Transaction();

    UnifiedSpotPool.swapStableForAsset(tx, {
      marketsCorePackageId: this.packages.futarchyMarketsCore,
      assetType: config.assetType,
      stableType: config.stableType,
      lpType: config.lpType,
      pool: tx.object(config.poolId),
      stableCoin: tx.object(config.coinId),
      minAssetOut: BigInt(config.minOut),
    });

    return tx;
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
   * Get current price by pool ID directly
   */
  async getPriceByPoolId(poolId: string): Promise<bigint> {
    const reserves = await this.pool.getReserves(poolId);
    if (reserves.asset === 0n) return 0n;
    return (reserves.stable * 1_000_000_000n) / reserves.asset;
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

  /**
   * Get LP token balance for an address
   */
  async getLpBalance(daoId: string, owner: string): Promise<bigint> {
    const daoInfo = await this.daoHelper.getInfo(daoId);

    const objects = await this.client.getOwnedObjects({
      owner,
      filter: {
        StructType: `0x2::coin::Coin<${this.packages.futarchyMarketsCore}::unified_spot_pool::LP<${daoInfo.assetType}, ${daoInfo.stableType}>>`,
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

  // ============================================================================
  // STATIC HELPERS
  // ============================================================================

  /**
   * Calculate output amount for swap (with fee)
   */
  static calculateSwapOutput(
    amountIn: bigint,
    reserveIn: bigint,
    reserveOut: bigint,
    feeBps: number
  ): bigint {
    const amountInAfterFee = (amountIn * BigInt(10000 - feeBps)) / 10000n;
    const numerator = amountInAfterFee * reserveOut;
    const denominator = reserveIn + amountInAfterFee;
    return numerator / denominator;
  }

  /**
   * Calculate price impact of swap
   */
  static calculatePriceImpact(
    amountIn: bigint,
    reserveIn: bigint,
    reserveOut: bigint
  ): number {
    const priceBefore = Number(reserveOut) / Number(reserveIn);
    const priceAfter =
      Number(reserveOut - this.calculateSwapOutput(amountIn, reserveIn, reserveOut, 0)) /
      Number(reserveIn + amountIn);
    return Math.abs(((priceAfter - priceBefore) / priceBefore) * 100);
  }
}