/**
 * Vault Query Service
 */

import { SuiClient } from '@mysten/sui/client';
import { extractFields, StreamFields } from '../../../types';
import type { Packages, SharedObjects } from '../../../types';

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

export interface StreamInfo {
  id: string;
  beneficiary: string;
  amountPerIteration: bigint;
  claimedAmount: bigint;
  startTime: number;
  cliffTime?: number;
  iterationsTotal: number;
  iterationPeriodMs: number;
  maxPerWithdrawal: bigint;
  totalAmount: bigint;
}

export class VaultQueryService {
  private client: SuiClient;

  constructor(params: ServiceParams) {
    this.client = params.client;
  }

  async getStream(streamId: string): Promise<StreamInfo | null> {
    try {
      const obj = await this.client.getObject({
        id: streamId,
        options: { showContent: true },
      });

      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
        return null;
      }

      const fields = extractFields<StreamFields>(obj);
      if (!fields) return null;

      return {
        id: streamId,
        beneficiary: fields.beneficiary,
        amountPerIteration: BigInt(fields.amount_per_iteration),
        claimedAmount: BigInt(fields.claimed_amount || fields.iterations_claimed || 0),
        startTime: Number(fields.start_time),
        cliffTime: fields.cliff_time ? Number(fields.cliff_time) : undefined,
        iterationsTotal: Number(fields.iterations_total),
        iterationPeriodMs: Number(fields.iteration_period_ms || fields.period_ms || 0),
        maxPerWithdrawal: BigInt(fields.max_per_withdrawal || 0),
        totalAmount: BigInt(fields.amount_per_iteration) * BigInt(fields.iterations_total),
      };
    } catch {
      return null;
    }
  }

  async getClaimableAmount(streamId: string): Promise<bigint> {
    const stream = await this.getStream(streamId);
    if (!stream) return 0n;

    const now = Date.now();
    if (now < stream.startTime) return 0n;
    if (stream.cliffTime && now < stream.cliffTime) return 0n;

    const elapsedMs = now - stream.startTime;
    const vestedIterations = Math.min(
      Math.floor(elapsedMs / stream.iterationPeriodMs),
      stream.iterationsTotal
    );

    const vestedAmount = BigInt(vestedIterations) * stream.amountPerIteration;
    return vestedAmount - stream.claimedAmount;
  }

  async listStreamsForBeneficiary(_beneficiary: string): Promise<StreamInfo[]> {
    // This would require indexer support
    return [];
  }
}
