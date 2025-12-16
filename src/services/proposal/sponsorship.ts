/**
 * Sponsorship Service - Proposal sponsorship operations
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import type { Packages, SharedObjects } from '../../types';

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

export class SponsorshipService {
  private packages: Packages;

  constructor(params: ServiceParams) {
    this.packages = params.packages;
  }

  /**
   * Sponsor a proposal
   */
  sponsor(config: {
    proposalId: string;
    daoId: string;
    assetType: string;
    stableType: string;
    amount: bigint;
    clockId?: string;
  }): Transaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    tx.moveCall({
      target: `${this.packages.futarchyFactory}::proposal::sponsor`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.proposalId),
        tx.object(config.daoId),
        tx.pure.u64(config.amount),
        tx.object(clockId),
      ],
    });

    return tx;
  }

  /**
   * Check if address can sponsor a proposal
   */
  async canSponsor(
    _proposalId: string,
    _daoId: string,
    _quotaRegistryId: string,
    _potentialSponsor: string,
    _assetType: string,
    _stableType: string,
    _clock?: string
  ): Promise<boolean> {
    // This would require a devInspect call
    // For now, return true - actual implementation would check quota
    return true;
  }
}
