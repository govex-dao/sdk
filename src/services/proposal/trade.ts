/**
 * Trade Service - Proposal trading operations
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import type { Packages, SharedObjects } from '../../types';

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

export class TradeService {
  private packages: Packages;

  constructor(params: ServiceParams) {
    this.packages = params.packages;
  }

  /**
   * Swap stable for asset (buy outcome tokens)
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

  /**
   * Get quote for a swap
   */
  async getQuote(
    _proposalId: string,
    _outcomeIndex: number,
    amountIn: bigint,
    _direction: 'stableToAsset' | 'assetToStable'
  ): Promise<bigint> {
    // This would require a devInspect call
    // For now, return a placeholder
    return amountIn;
  }

  /**
   * Get current price for an outcome
   */
  async getPrice(_proposalId: string, _outcomeIndex: number): Promise<number> {
    // This would query the market state
    return 0.5;
  }
}
