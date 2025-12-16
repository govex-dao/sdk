/**
 * TWAP Service - Time-weighted average price operations
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import type { Packages, SharedObjects } from '../../types';

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

export class TwapService {
  private packages: Packages;

  constructor(params: ServiceParams) {
    this.packages = params.packages;
  }

  /**
   * Get current TWAP price for an outcome
   */
  async getCurrentPrice(_proposalId: string, _outcomeIndex: number): Promise<number> {
    // This would query the market state
    return 0.5;
  }

  /**
   * Get TWAP observations
   */
  async getObservations(_proposalId: string): Promise<any[]> {
    // This would query the market state observations
    return [];
  }

  /**
   * Record a TWAP observation
   */
  recordObservation(marketStateId: string, clockId?: string): Transaction {
    const tx = new Transaction();
    const clock = clockId || '0x6';

    tx.moveCall({
      target: `${this.packages.futarchyMarketsCore}::pcw_twap_oracle::record_observation`,
      arguments: [
        tx.object(marketStateId),
        tx.object(clock),
      ],
    });

    return tx;
  }
}
