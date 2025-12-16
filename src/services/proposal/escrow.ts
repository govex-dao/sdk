/**
 * Escrow Service - Proposal escrow operations
 */

import { SuiClient } from '@mysten/sui/client';
import { extractFields, EscrowFields } from '../../types';
import type { Packages, SharedObjects } from '../../types';

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

export class EscrowService {
  private client: SuiClient;

  constructor(params: ServiceParams) {
    this.client = params.client;
  }

  /**
   * Check if user has escrow receipt for an outcome
   */
  async hasEscrowReceipt(
    _proposalId: string,
    _outcomeIndex: number,
    _assetType: string,
    _stableType: string
  ): Promise<boolean> {
    // This would query the user's objects
    return false;
  }

  /**
   * Get escrow balance
   */
  async getBalance(escrowId: string, _assetType: string): Promise<bigint> {
    try {
      const obj = await this.client.getObject({
        id: escrowId,
        options: { showContent: true },
      });

      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
        return 0n;
      }

      return BigInt(extractFields<EscrowFields>(obj)?.balance || 0);
    } catch {
      return 0n;
    }
  }

  /**
   * Check if escrow is empty
   */
  async isEmpty(escrowId: string, assetType: string): Promise<boolean> {
    const balance = await this.getBalance(escrowId, assetType);
    return balance === 0n;
  }
}
