/**
 * Oracle Query Service
 */

import { SuiClient } from '@mysten/sui/client';
import { extractFields, OracleGrantFields } from '../../../types';
import type { Packages, SharedObjects } from '../../../types';

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

export class OracleQueryService {
  private client: SuiClient;

  constructor(params: ServiceParams) {
    this.client = params.client;
  }

  async getTotalAmount(grantId: string): Promise<bigint> {
    try {
      const obj = await this.client.getObject({
        id: grantId,
        options: { showContent: true },
      });
      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') return 0n;
      return BigInt(extractFields<OracleGrantFields>(obj)?.total_amount || 0);
    } catch {
      return 0n;
    }
  }

  async isCanceled(grantId: string): Promise<boolean> {
    try {
      const obj = await this.client.getObject({
        id: grantId,
        options: { showContent: true },
      });
      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') return false;
      return extractFields<OracleGrantFields>(obj)?.is_canceled || false;
    } catch {
      return false;
    }
  }

  async getDescription(grantId: string): Promise<string> {
    try {
      const obj = await this.client.getObject({
        id: grantId,
        options: { showContent: true },
      });
      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') return '';
      return extractFields<OracleGrantFields>(obj)?.description || '';
    } catch {
      return '';
    }
  }

  async getTierCount(grantId: string): Promise<number> {
    try {
      const obj = await this.client.getObject({
        id: grantId,
        options: { showContent: true },
      });
      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') return 0;
      return Number(extractFields<OracleGrantFields>(obj)?.tier_count || 0);
    } catch {
      return 0;
    }
  }

  async getAllGrantIds(_accountId: string): Promise<string[]> {
    // This would require indexer support
    return [];
  }
}
