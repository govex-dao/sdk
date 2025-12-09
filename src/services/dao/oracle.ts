/**
 * DAO Oracle - Sub-namespace for oracle grant operations
 *
 * @module services/dao/oracle
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { OracleGrant } from '@/types';

interface DAOOracleConfig {
  client: SuiClient;
  futarchyGovernancePackageId: string;
}

export class DAOOracle {
  private client: SuiClient;
  private futarchyGovernancePackageId: string;

  constructor(config: DAOOracleConfig) {
    this.client = config.client;
    this.futarchyGovernancePackageId = config.futarchyGovernancePackageId;
  }

  /**
   * Claim an oracle grant
   */
  claimGrant(grantId: string, clockId: string = '0x6'): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.futarchyGovernancePackageId}::oracle::claim_grant`,
      arguments: [
        tx.object(grantId),
        tx.object(clockId),
      ],
    });

    return tx;
  }

  /**
   * Get all oracle grants for a DAO
   */
  async getGrants(daoId: string): Promise<OracleGrant[]> {
    // Query dynamic fields for oracle grants
    const dynamicFields = await this.client.getDynamicFields({
      parentId: daoId,
    });

    const grants: OracleGrant[] = [];

    for (const field of dynamicFields.data) {
      // Check if this is an oracle grant field
      if (field.name?.type?.includes('oracle') || field.objectType?.includes('OracleGrant')) {
        const grantObj = await this.client.getObject({
          id: field.objectId,
          options: { showContent: true },
        });

        if (grantObj.data?.content && grantObj.data.content.dataType === 'moveObject') {
          const fields = grantObj.data.content.fields as any;
          grants.push({
            id: field.objectId,
            daoId,
            grantee: fields.grantee || '',
            amount: BigInt(fields.amount || 0),
            claimedAmount: BigInt(fields.claimed_amount || 0),
            expiresAt: Number(fields.expires_at || 0),
          });
        }
      }
    }

    return grants;
  }
}
