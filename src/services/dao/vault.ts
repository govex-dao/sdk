/**
 * Vault Service - DAO vault operations
 *
 * Handles vault deposits, withdrawals, streams, and balance queries.
 *
 * @module services/dao/vault
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { extractFields, VaultFields, StreamFields, MoveObjectFields } from '../../types';
import type { Packages, SharedObjects } from '../../types';

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

export interface DepositConfig {
  daoId: string;
  vaultName: string;
  coinId: string;
  coinType: string;
}

export interface StreamConfig {
  daoId: string;
  vaultName: string;
  beneficiary: string;
  totalAmount: bigint;
  startTime: number;
  vestingPeriodMs: number;
  iterations?: number;
  cliffMs?: number;
  claimWindowMs?: number;
  maxPerWithdrawal?: bigint;
  coinType: string;
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

export interface VaultBalance {
  coinType: string;
  amount: bigint;
}

export interface VaultInfo {
  name: string;
  balances: VaultBalance[];
}

/**
 * VaultService - Vault operations for DAOs
 *
 * @example
 * ```typescript
 * // Deposit to vault
 * const tx = sdk.dao.vault.depositApproved({
 *   daoId: "0x123...",
 *   vaultName: "treasury",
 *   coinId: "0xabc...",
 *   coinType: "0x2::sui::SUI",
 * });
 *
 * // Get vault balance
 * const balance = await sdk.dao.vault.getBalance(daoId, "treasury", coinType);
 * ```
 */
export class VaultService {
  private client: SuiClient;
  private packages: Packages;
  private sharedObjects: SharedObjects;
  private configType: string;

  constructor(params: ServiceParams) {
    this.client = params.client;
    this.packages = params.packages;
    this.sharedObjects = params.sharedObjects;
    this.configType = `${params.packages.futarchyCore}::futarchy_config::FutarchyConfig`;
  }

  // ============================================================================
  // DEPOSITS
  // ============================================================================

  /**
   * Deposit coins to vault (permissionless for approved coin types)
   */
  depositApproved(config: DepositConfig): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.packages.accountActions}::vault::deposit_approved`,
      typeArguments: [this.configType, config.coinType],
      arguments: [
        tx.object(config.daoId),
        tx.object(this.sharedObjects.packageRegistry.id),
        tx.pure.string(config.vaultName),
        tx.object(config.coinId),
      ],
    });

    return tx;
  }

  /**
   * Deposit SUI to vault
   */
  depositSui(config: { daoId: string; vaultName: string; amount: bigint }): Transaction {
    const tx = new Transaction();

    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(config.amount)]);

    tx.moveCall({
      target: `${this.packages.accountActions}::vault::deposit_approved`,
      typeArguments: [this.configType, '0x2::sui::SUI'],
      arguments: [
        tx.object(config.daoId),
        tx.object(this.sharedObjects.packageRegistry.id),
        tx.pure.string(config.vaultName),
        coin,
      ],
    });

    return tx;
  }

  // ============================================================================
  // STREAMS
  // ============================================================================

  /**
   * Claim from a vesting stream
   */
  claimStream(config: {
    daoId: string;
    vaultName: string;
    streamId: string;
    amount: bigint;
    coinType: string;
    clockId?: string;
  }): Transaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    tx.moveCall({
      target: `${this.packages.accountActions}::vault::withdraw_from_stream`,
      typeArguments: [this.configType, config.coinType],
      arguments: [
        tx.object(config.daoId),
        tx.object(this.sharedObjects.packageRegistry.id),
        tx.pure.string(config.vaultName),
        tx.pure.id(config.streamId),
        tx.pure.u64(config.amount),
        tx.object(clockId),
      ],
    });

    return tx;
  }

  /**
   * Transfer a stream to a new beneficiary (if transferable)
   */
  transferStream(config: {
    daoId: string;
    vaultName: string;
    streamId: string;
    newBeneficiary: string;
    coinType: string;
  }): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.packages.accountActions}::vault::transfer_stream`,
      typeArguments: [this.configType, config.coinType],
      arguments: [
        tx.object(config.daoId),
        tx.object(this.sharedObjects.packageRegistry.id),
        tx.pure.string(config.vaultName),
        tx.pure.id(config.streamId),
        tx.pure.address(config.newBeneficiary),
      ],
    });

    return tx;
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Get vault balance for a specific coin type
   */
  async getBalance(daoId: string, vaultName: string, coinType: string): Promise<bigint> {
    // Query the vault's balance bag
    try {
      const vault = await this.client.getDynamicFieldObject({
        parentId: daoId,
        name: { type: '0x1::string::String', value: vaultName },
      });

      if (!vault.data?.content || vault.data.content.dataType !== 'moveObject') {
        return 0n;
      }

      const vaultFields = extractFields<VaultFields>(vault);
      if (!vaultFields) return 0n;

      const balanceBagId = vaultFields.balances?.fields?.id?.id;
      if (!balanceBagId) return 0n;

      const balance = await this.client.getDynamicFieldObject({
        parentId: balanceBagId,
        name: { type: '0x1::type_name::TypeName', value: coinType },
      });

      if (!balance.data?.content || balance.data.content.dataType !== 'moveObject') {
        return 0n;
      }

      const balanceFields = extractFields<MoveObjectFields & { value?: string }>(balance);
      return BigInt(balanceFields?.value || 0);
    } catch {
      return 0n;
    }
  }

  /**
   * Get stream info
   */
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
        iterationPeriodMs: Number(fields.iteration_period_ms || fields.period_ms),
        maxPerWithdrawal: BigInt(fields.max_per_withdrawal || 0),
        totalAmount: BigInt(fields.amount_per_iteration) * BigInt(fields.iterations_total),
      };
    } catch {
      return null;
    }
  }

  /**
   * Get claimable amount for a stream
   */
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

  /**
   * List streams for a beneficiary
   */
  async listStreamsForBeneficiary(_beneficiary: string): Promise<StreamInfo[]> {
    // This would require indexer support for efficient queries
    // For now, return empty array - users should track stream IDs
    console.warn('listStreamsForBeneficiary requires indexer support');
    return [];
  }

  /**
   * Check if a coin type is approved for deposits
   */
  async isCoinTypeApproved(daoId: string, vaultName: string, coinType: string): Promise<boolean> {
    try {
      const vault = await this.client.getDynamicFieldObject({
        parentId: daoId,
        name: { type: '0x1::string::String', value: vaultName },
      });

      if (!vault.data?.content || vault.data.content.dataType !== 'moveObject') {
        return false;
      }

      const vaultFields = extractFields<VaultFields>(vault);
      if (!vaultFields) return false;

      const approvedTypes = vaultFields.approved_coin_types || [];
      return approvedTypes.includes(coinType);
    } catch {
      return false;
    }
  }

  /**
   * List all vaults and their balances for a DAO
   *
   * @param daoId - DAO account object ID
   * @returns Array of vault info with all coin balances
   */
  async listVaults(daoId: string): Promise<VaultInfo[]> {
    const vaults: VaultInfo[] = [];

    try {
      // Get all dynamic fields on the DAO account
      const fields = await this.client.getDynamicFields({ parentId: daoId });

      for (const field of fields.data) {
        // Check if this is a vault (keyed by VaultKey which wraps a String)
        // The type will be something like "0x...::vault::VaultKey"
        if (!field.name.type.includes('::vault::VaultKey')) {
          continue;
        }

        // Get the vault name from the key
        const vaultName = (field.name.value as { name: string }).name;

        // Get the vault object
        const vaultObj = await this.client.getDynamicFieldObject({
          parentId: daoId,
          name: field.name,
        });

        if (!vaultObj.data?.content || vaultObj.data.content.dataType !== 'moveObject') {
          continue;
        }

        const vaultFields = extractFields<VaultFields>(vaultObj);
        if (!vaultFields) continue;

        // Get the balances bag ID
        const balancesBagId = vaultFields.balances?.fields?.id?.id;
        if (!balancesBagId) {
          vaults.push({ name: vaultName, balances: [] });
          continue;
        }

        // Get all balances in the bag
        const balanceFields = await this.client.getDynamicFields({ parentId: balancesBagId });
        const balances: VaultBalance[] = [];

        for (const balanceField of balanceFields.data) {
          // The key is a TypeName containing the coin type
          const coinType = balanceField.name.value as string;

          // Get the balance value
          const balanceObj = await this.client.getDynamicFieldObject({
            parentId: balancesBagId,
            name: balanceField.name,
          });

          if (balanceObj.data?.content && balanceObj.data.content.dataType === 'moveObject') {
            const fields = balanceObj.data.content.fields as { value?: string };
            const amount = BigInt(fields.value || '0');
            if (amount > 0n) {
              balances.push({ coinType, amount });
            }
          }
        }

        vaults.push({ name: vaultName, balances });
      }
    } catch (error) {
      console.error('Error listing vaults:', error);
    }

    return vaults;
  }
}
