/**
 * Oracle Service - Price-based grant operations
 *
 * Handles oracle grants that unlock tokens based on price conditions.
 *
 * @module services/dao/oracle
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { extractFields, OracleGrantFields, extractEventData, OracleGrantCreatedEvent } from '../../types';
import type { Packages, SharedObjects } from '../../types';

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

export interface GrantInfo {
  id: string;
  daoId: string;
  totalAmount: bigint;
  claimedAmount: bigint;
  tierCount: number;
  description: string;
  isCanceled: boolean;
}

/**
 * OracleService - Oracle grant operations
 *
 * @example
 * ```typescript
 * // Claim a grant tier
 * const tx = sdk.dao.oracle.claimGrant({
 *   grantId: "0x123...",
 *   clockId: "0x6",
 * });
 *
 * // Get grant info
 * const grants = await sdk.dao.oracle.getGrants(daoId);
 * ```
 */
export class OracleService {
  private client: SuiClient;
  private packages: Packages;

  constructor(params: ServiceParams) {
    this.client = params.client;
    this.packages = params.packages;
  }

  // ============================================================================
  // GRANT OPERATIONS
  // ============================================================================

  /**
   * Claim a grant tier when price conditions are met
   */
  claimGrant(config: {
    grantId: string;
    clockId?: string;
  }): Transaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    // Note: This is a simplified version - actual implementation
    // needs the full context (asset/stable types, pool IDs, etc.)
    tx.moveCall({
      target: `${this.packages.futarchyOracleActions}::oracle::claim_grant`,
      arguments: [
        tx.object(config.grantId),
        tx.object(clockId),
      ],
    });

    return tx;
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Get all grants for a DAO
   */
  async getGrants(daoId: string): Promise<GrantInfo[]> {
    try {
      // Query oracle grant events for this DAO
      const events = await this.client.queryEvents({
        query: {
          MoveEventType: `${this.packages.futarchyOracleActions}::oracle::GrantCreated`,
        },
        limit: 50,
      });

      const grants: GrantInfo[] = [];

      for (const event of events.data) {
        const parsed = extractEventData<OracleGrantCreatedEvent>(event);
        if (parsed?.dao_id === daoId) {
          const grantInfo = await this.getGrantInfo(parsed.grant_id);
          if (grantInfo) {
            grants.push(grantInfo);
          }
        }
      }

      return grants;
    } catch {
      return [];
    }
  }

  /**
   * Get grant info by ID
   */
  async getGrantInfo(grantId: string): Promise<GrantInfo | null> {
    try {
      const obj = await this.client.getObject({
        id: grantId,
        options: { showContent: true },
      });

      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
        return null;
      }

      const fields = extractFields<OracleGrantFields>(obj);
      if (!fields) {
        return null;
      }
      return {
        id: grantId,
        daoId: fields.dao_id || '',
        totalAmount: BigInt(fields.total_amount || 0),
        claimedAmount: BigInt(fields.claimed_amount || 0),
        tierCount: Number(fields.tier_count || 0),
        description: fields.description || '',
        isCanceled: fields.is_canceled || false,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if a grant is canceled
   */
  async isCanceled(grantId: string): Promise<boolean> {
    const info = await this.getGrantInfo(grantId);
    return info?.isCanceled ?? false;
  }

  /**
   * Get total amount for a grant
   */
  async getTotalAmount(grantId: string): Promise<bigint> {
    const info = await this.getGrantInfo(grantId);
    return info?.totalAmount ?? 0n;
  }

  /**
   * Get description for a grant
   */
  async getDescription(grantId: string): Promise<string> {
    const info = await this.getGrantInfo(grantId);
    return info?.description ?? '';
  }

  /**
   * Get tier count for a grant
   */
  async getTierCount(grantId: string): Promise<number> {
    const info = await this.getGrantInfo(grantId);
    return info?.tierCount ?? 0;
  }
}
