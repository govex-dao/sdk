/**
 * Oracle Queries
 *
 * Read operations for oracle grants - fetching grant state, tier info, etc.
 *
 * @module query/oracle
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { TransactionUtils } from '@/services/utils';

/**
 * Oracle grant query operations
 *
 * @example
 * ```typescript
 * // Check if a grant tier can be claimed
 * const totalAmount = await sdk.oracle.getTotalAmount(grantId);
 * const isCanceled = await sdk.oracle.isCanceled(grantId);
 * ```
 */
export class OracleQueries {
  private client: SuiClient;
  private oracleActionsPackageId: string;
  private packageRegistryId: string;

  constructor(
    client: SuiClient,
    oracleActionsPackageId: string,
    packageRegistryId: string
  ) {
    this.client = client;
    this.oracleActionsPackageId = oracleActionsPackageId;
    this.packageRegistryId = packageRegistryId;
  }

  /**
   * Get total amount claimable in grant
   */
  async getTotalAmount(grantId: string): Promise<bigint> {
    const grant = await this.client.getObject({
      id: grantId,
      options: { showContent: true },
    });

    if (!grant.data?.content || grant.data.content.dataType !== 'moveObject') {
      throw new Error('Grant not found');
    }

    const fields = grant.data.content.fields as any;
    return BigInt(fields.total_amount || 0);
  }

  /**
   * Check if grant is cancelled
   */
  async isCanceled(grantId: string): Promise<boolean> {
    const grant = await this.client.getObject({
      id: grantId,
      options: { showContent: true },
    });

    if (!grant.data?.content || grant.data.content.dataType !== 'moveObject') {
      throw new Error('Grant not found');
    }

    const fields = grant.data.content.fields as any;
    return fields.is_canceled === true;
  }

  /**
   * Get grant description
   */
  async getDescription(grantId: string): Promise<string> {
    const grant = await this.client.getObject({
      id: grantId,
      options: { showContent: true },
    });

    if (!grant.data?.content || grant.data.content.dataType !== 'moveObject') {
      throw new Error('Grant not found');
    }

    const fields = grant.data.content.fields as any;
    return fields.description || '';
  }

  /**
   * Get number of tiers in grant
   */
  async getTierCount(grantId: string): Promise<number> {
    const grant = await this.client.getObject({
      id: grantId,
      options: { showContent: true },
    });

    if (!grant.data?.content || grant.data.content.dataType !== 'moveObject') {
      throw new Error('Grant not found');
    }

    const fields = grant.data.content.fields as any;
    const tiers = fields.tiers as any[];
    return tiers?.length || 0;
  }

  /**
   * Get all grant IDs for a DAO
   */
  async getAllGrantIds(accountId: string): Promise<string[]> {
    const tx = new Transaction();

    const versionWitness = tx.moveCall({
      target: `${this.packageRegistryId}::version::current`,
      arguments: [],
    });

    const result = await this.client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: (() => {
        tx.moveCall({
          target: TransactionUtils.buildTarget(
            this.oracleActionsPackageId,
            'oracle_actions',
            'get_all_grant_ids'
          ),
          arguments: [
            tx.object(accountId),
            tx.object(this.packageRegistryId),
            versionWitness,
          ],
        });
        return tx;
      })(),
    });

    if (result.results && result.results[0]?.returnValues) {
      try {
        const [returnValue] = result.results[0].returnValues;
        if (returnValue && returnValue[0]) {
          const bytes = new Uint8Array(returnValue[0]);
          const dataView = new DataView(bytes.buffer);
          const length = dataView.getUint32(0, true);
          const ids: string[] = [];
          let offset = 4;
          for (let i = 0; i < length && offset + 32 <= bytes.length; i++) {
            const idBytes = bytes.slice(offset, offset + 32);
            const hex = '0x' + Array.from(idBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            ids.push(hex);
            offset += 32;
          }
          return ids;
        }
      } catch {
        // Deserialization failed, return empty array
      }
    }

    return [];
  }
}
