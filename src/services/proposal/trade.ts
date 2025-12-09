/**
 * Proposal Trade - Sub-namespace for trading on proposal outcomes
 *
 * @module services/proposal/trade
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { ConditionalSwapConfig, Packages } from '@/types';

export class ProposalTrade {
  private client: SuiClient;
  private packages: Packages;

  constructor(client: SuiClient, packages: Packages) {
    this.client = client;
    this.packages = packages;
  }

  /**
   * Swap stable for asset in a specific outcome market
   */
  stableForAsset(config: Omit<ConditionalSwapConfig, 'direction'>): Transaction {
    return this.buildConditionalSwap({ ...config, direction: 'stable_to_asset' });
  }

  /**
   * Swap asset for stable in a specific outcome market
   */
  assetForStable(config: Omit<ConditionalSwapConfig, 'direction'>): Transaction {
    return this.buildConditionalSwap({ ...config, direction: 'asset_to_stable' });
  }

  /**
   * Get quote for a conditional swap
   */
  async getQuote(
    proposalId: string,
    outcomeIndex: number,
    amountIn: bigint,
    direction: 'stable_to_asset' | 'asset_to_stable'
  ): Promise<{ amountOut: bigint; priceImpact: number }> {
    const proposal = await this.client.getObject({
      id: proposalId,
      options: { showContent: true },
    });

    if (!proposal.data?.content || proposal.data.content.dataType !== 'moveObject') {
      throw new Error('Proposal not found');
    }

    const fields = proposal.data.content.fields as any;
    const escrowId = fields.escrow_id;

    const escrow = await this.client.getObject({
      id: escrowId,
      options: { showContent: true },
    });

    if (!escrow.data?.content || escrow.data.content.dataType !== 'moveObject') {
      throw new Error('Escrow not found');
    }

    const escrowFields = escrow.data.content.fields as any;
    const conditionalPools = escrowFields.conditional_pools?.fields?.contents || [];
    const pool = conditionalPools[outcomeIndex];

    if (!pool) {
      throw new Error(`No pool found for outcome ${outcomeIndex}`);
    }

    const poolFields = pool.fields?.value?.fields || pool.fields || {};
    const assetReserve = BigInt(poolFields.asset_reserve || 0);
    const stableReserve = BigInt(poolFields.stable_reserve || 0);

    const reserveIn = direction === 'stable_to_asset' ? stableReserve : assetReserve;
    const reserveOut = direction === 'stable_to_asset' ? assetReserve : stableReserve;

    // Constant product formula with 0.3% fee
    const amountInAfterFee = (amountIn * 997n) / 1000n;
    const amountOut = (reserveOut * amountInAfterFee) / (reserveIn + amountInAfterFee);

    // Price impact
    const spotPrice = (reserveOut * 1_000_000n) / reserveIn;
    const execPrice = (amountOut * 1_000_000n) / amountIn;
    const priceImpact = spotPrice > 0n
      ? Number((spotPrice - execPrice) * 10000n / spotPrice) / 100
      : 0;

    return { amountOut, priceImpact };
  }

  /**
   * Get current price for a specific outcome
   */
  async getPrice(proposalId: string, outcomeIndex: number): Promise<bigint> {
    const proposal = await this.client.getObject({
      id: proposalId,
      options: { showContent: true },
    });

    if (!proposal.data?.content || proposal.data.content.dataType !== 'moveObject') {
      throw new Error('Proposal not found');
    }

    const fields = proposal.data.content.fields as any;
    const escrowId = fields.escrow_id;

    const escrow = await this.client.getObject({
      id: escrowId,
      options: { showContent: true },
    });

    if (!escrow.data?.content || escrow.data.content.dataType !== 'moveObject') {
      throw new Error('Escrow not found');
    }

    const escrowFields = escrow.data.content.fields as any;
    const conditionalPools = escrowFields.conditional_pools?.fields?.contents || [];
    const pool = conditionalPools[outcomeIndex];

    if (!pool) {
      throw new Error(`No pool found for outcome ${outcomeIndex}`);
    }

    const poolFields = pool.fields?.value?.fields || pool.fields || {};
    const assetReserve = BigInt(poolFields.asset_reserve || 0);
    const stableReserve = BigInt(poolFields.stable_reserve || 0);

    if (assetReserve === 0n) return 0n;
    return (stableReserve * 1_000_000_000n) / assetReserve;
  }

  private buildConditionalSwap(config: ConditionalSwapConfig): Transaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const {
      futarchyMarketsOperations,
      futarchyMarketsCore,
      futarchyMarketsPrimitives,
    } = this.packages;

    // Merge input coins
    const coinObjects = config.stableCoins.map((id) => tx.object(id));
    const [firstCoin, ...restCoins] = coinObjects;

    if (restCoins.length > 0) {
      tx.mergeCoins(firstCoin, restCoins);
    }

    // Split input amount
    const [stableCoin] = tx.splitCoins(firstCoin, [tx.pure.u64(config.amountIn)]);

    // Start split stable progress
    let splitProgress = tx.moveCall({
      target: `${futarchyMarketsPrimitives}::coin_escrow::start_split_stable_progress`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [tx.object(config.escrowId), stableCoin],
    });

    // Split stable across all outcomes
    const stableCoinsByOutcome: Record<number, any> = {};
    const sortedOutcomes = [...config.allOutcomeCoins].sort((a, b) => a.outcomeIndex - b.outcomeIndex);

    for (const outcome of sortedOutcomes) {
      const result = tx.moveCall({
        target: `${futarchyMarketsPrimitives}::coin_escrow::split_stable_progress_step`,
        typeArguments: [
          config.assetType,
          config.stableType,
          outcome.stableCoinType,
        ],
        arguments: [
          splitProgress,
          tx.object(config.escrowId),
          tx.pure.u8(outcome.outcomeIndex),
        ],
      });

      splitProgress = (result as any)[0];
      stableCoinsByOutcome[outcome.outcomeIndex] = (result as any)[1];
    }

    // Finish split progress
    tx.moveCall({
      target: `${futarchyMarketsPrimitives}::coin_escrow::finish_split_stable_progress`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [splitProgress, tx.object(config.escrowId)],
    });

    // Begin swap session
    const session = tx.moveCall({
      target: `${futarchyMarketsCore}::swap_core::begin_swap_session`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [tx.object(config.escrowId)],
    });

    // Begin conditional swaps batch
    const batch = tx.moveCall({
      target: `${futarchyMarketsOperations}::swap_entry::begin_conditional_swaps`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [tx.object(config.escrowId)],
    });

    // Find the target outcome coin types
    const targetOutcome = config.allOutcomeCoins.find(o => o.outcomeIndex === config.outcomeIndex);
    if (!targetOutcome) {
      throw new Error(`No conditional coin types found for outcome ${config.outcomeIndex}`);
    }

    // Swap in the target outcome market
    const condStableInput = stableCoinsByOutcome[config.outcomeIndex];
    const swapResult = tx.moveCall({
      target: `${futarchyMarketsOperations}::swap_entry::swap_in_batch`,
      typeArguments: [
        config.assetType,
        config.stableType,
        targetOutcome.stableCoinType,
        targetOutcome.assetCoinType,
      ],
      arguments: [
        batch,
        session,
        tx.object(config.escrowId),
        tx.pure.u8(config.outcomeIndex),
        condStableInput,
        tx.pure.bool(config.direction === 'asset_to_stable'),
        tx.pure.u64(config.minAmountOut),
        tx.sharedObjectRef({
          objectId: clockId,
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });

    const updatedBatch = (swapResult as any)[0];
    const condOutputCoin = (swapResult as any)[1];

    // Finalize conditional swaps
    tx.moveCall({
      target: `${futarchyMarketsOperations}::swap_entry::finalize_conditional_swaps`,
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        updatedBatch,
        tx.object(config.spotPoolId),
        tx.object(config.proposalId),
        tx.object(config.escrowId),
        session,
        tx.pure.address(config.recipient),
        tx.sharedObjectRef({
          objectId: clockId,
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });

    // Transfer swapped output to recipient
    tx.transferObjects([condOutputCoin], tx.pure.address(config.recipient));

    // Transfer unused conditional stable from OTHER outcomes
    for (const outcome of sortedOutcomes) {
      if (outcome.outcomeIndex !== config.outcomeIndex) {
        const otherStable = stableCoinsByOutcome[outcome.outcomeIndex];
        if (otherStable) {
          tx.transferObjects([otherStable], tx.pure.address(config.recipient));
        }
      }
    }

    // Return remaining input coins
    tx.transferObjects([firstCoin], tx.pure.address(config.recipient));

    return tx;
  }
}
