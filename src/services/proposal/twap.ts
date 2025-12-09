/**
 * Proposal TWAP - Sub-namespace for TWAP price oracle
 *
 * @module services/proposal/twap
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { Packages } from '@/types';

export class ProposalTWAP {
  private client: SuiClient;
  private packages: Packages;

  constructor(client: SuiClient, packages: Packages) {
    this.client = client;
    this.packages = packages;
  }

  /**
   * Get current TWAP price for a specific outcome
   */
  async getCurrentPrice(proposalId: string, outcomeIndex: number): Promise<bigint> {
    const proposal = await this.client.getObject({
      id: proposalId,
      options: { showContent: true },
    });

    if (!proposal.data?.content || proposal.data.content.dataType !== 'moveObject') {
      throw new Error('Proposal not found');
    }

    const fields = proposal.data.content.fields as any;
    const marketStateId = fields.market_state_id;

    const marketState = await this.client.getObject({
      id: marketStateId,
      options: { showContent: true },
    });

    if (!marketState.data?.content || marketState.data.content.dataType !== 'moveObject') {
      throw new Error('Market state not found');
    }

    const stateFields = marketState.data.content.fields as any;
    const twapData = stateFields.twap_data?.fields?.contents || [];
    const outcomeTwap = twapData[outcomeIndex];

    if (!outcomeTwap) {
      return 0n;
    }

    return BigInt(outcomeTwap.fields?.current_twap || 0);
  }

  /**
   * Get all TWAP observations for a proposal
   */
  async getObservations(proposalId: string): Promise<{
    outcomeIndex: number;
    twap: bigint;
    observationCount: number;
  }[]> {
    const proposal = await this.client.getObject({
      id: proposalId,
      options: { showContent: true },
    });

    if (!proposal.data?.content || proposal.data.content.dataType !== 'moveObject') {
      throw new Error('Proposal not found');
    }

    const fields = proposal.data.content.fields as any;
    const marketStateId = fields.market_state_id;

    const marketState = await this.client.getObject({
      id: marketStateId,
      options: { showContent: true },
    });

    if (!marketState.data?.content || marketState.data.content.dataType !== 'moveObject') {
      throw new Error('Market state not found');
    }

    const stateFields = marketState.data.content.fields as any;
    const twapData = stateFields.twap_data?.fields?.contents || [];

    return twapData.map((data: any, index: number) => ({
      outcomeIndex: index,
      twap: BigInt(data.fields?.current_twap || 0),
      observationCount: Number(data.fields?.observation_count || 0),
    }));
  }

  /**
   * Record a TWAP observation (cranker operation)
   */
  recordObservation(marketStateId: string, clockId: string = '0x6'): Transaction {
    const tx = new Transaction();
    const { futarchyMarketsCore } = this.packages;

    tx.moveCall({
      target: `${futarchyMarketsCore}::twap::record_observation`,
      arguments: [tx.object(marketStateId), tx.object(clockId)],
    });

    return tx;
  }
}
