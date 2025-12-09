/**
 * Vault Queries
 *
 * Read operations for vault state - streams, claimable amounts.
 *
 * @module query/account/vault
 */

import { SuiClient } from '@mysten/sui/client';

/**
 * Stream info returned from queries
 */
export interface StreamInfo {
  id: string;
  beneficiary: string;
  totalAmount: bigint;
  claimedAmount: bigint;
  startTime: number;
  cliffTime?: number;
  iterationsTotal: number;
  iterationsClaimed: number;
  iterationPeriodMs: number;
  isTransferable: boolean;
  isCancellable: boolean;
}

/**
 * Vault query operations
 *
 * @example
 * ```typescript
 * // Get stream info
 * const stream = await sdk.vault.getStream("0x123...");
 * console.log(`Claimed: ${stream.claimedAmount}/${stream.totalAmount}`);
 *
 * // Get claimable amount
 * const claimable = await sdk.vault.getClaimableAmount("0x123...");
 * ```
 */
export class VaultQueries {
  private client: SuiClient;
  private accountActionsPackageId: string;

  constructor(config: {
    client: SuiClient;
    accountActionsPackageId: string;
  }) {
    this.client = config.client;
    this.accountActionsPackageId = config.accountActionsPackageId;
  }

  /**
   * Get stream information
   *
   * @param streamId - Stream object ID
   * @returns Stream info
   */
  async getStream(streamId: string): Promise<StreamInfo> {
    const obj = await this.client.getObject({
      id: streamId,
      options: { showContent: true },
    });

    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
      throw new Error(`Stream not found: ${streamId}`);
    }

    const fields = obj.data.content.fields as any;

    return {
      id: streamId,
      beneficiary: fields.beneficiary || '',
      totalAmount: BigInt(fields.total_amount || 0),
      claimedAmount: BigInt(fields.claimed_amount || 0),
      startTime: Number(fields.start_time || 0),
      cliffTime: fields.cliff_time ? Number(fields.cliff_time) : undefined,
      iterationsTotal: Number(fields.iterations_total || 0),
      iterationsClaimed: Number(fields.iterations_claimed || 0),
      iterationPeriodMs: Number(fields.iteration_period_ms || 0),
      isTransferable: fields.is_transferable === true,
      isCancellable: fields.is_cancellable === true,
    };
  }

  /**
   * Get claimable amount from a stream
   *
   * @param streamId - Stream object ID
   * @returns Claimable amount
   */
  async getClaimableAmount(streamId: string): Promise<bigint> {
    const stream = await this.getStream(streamId);
    const now = Date.now();

    if (now < stream.startTime) {
      return 0n;
    }

    if (stream.cliffTime && now < stream.cliffTime) {
      return 0n;
    }

    const elapsed = now - stream.startTime;
    const iterationsElapsed = Math.floor(elapsed / stream.iterationPeriodMs);
    const claimableIterations = Math.min(
      iterationsElapsed,
      stream.iterationsTotal
    ) - stream.iterationsClaimed;

    if (claimableIterations <= 0) {
      return 0n;
    }

    const amountPerIteration = stream.totalAmount / BigInt(stream.iterationsTotal);
    return amountPerIteration * BigInt(claimableIterations);
  }

  /**
   * List all streams for a beneficiary
   *
   * @param beneficiary - Beneficiary address
   * @returns Array of stream IDs
   */
  async listStreamsForBeneficiary(beneficiary: string): Promise<string[]> {
    const result = await this.client.getOwnedObjects({
      owner: beneficiary,
      filter: {
        StructType: `${this.accountActionsPackageId}::vault::Stream`,
      },
      options: { showType: true },
    });

    return result.data.map((obj) => obj.data?.objectId || '').filter(Boolean);
  }
}
