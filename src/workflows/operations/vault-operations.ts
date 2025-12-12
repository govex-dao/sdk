/**
 * Vault Operations - High-level vault management
 *
 * Provides simple, user-friendly API for managing DAO vaults.
 * Hides all complexity: package IDs, type arguments, auth patterns, etc.
 *
 * @module vault-operations
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { BaseTransactionBuilder, TransactionUtils } from '../../services/transaction';

/**
 * Configuration for VaultOperations
 */
export interface VaultOperationsConfig {
  client: SuiClient;
  accountActionsPackageId: string;
  futarchyCorePackageId: string;
  packageRegistryId: string;
}

/**
 * Stream configuration
 */
export interface CreateStreamConfig {
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
  // Note: Vault streams are always DAO-controlled (cancellable, non-transferable).
  // For transferable vestings with beneficiary control, use the standalone vesting module.
}

/**
 * Stream info
 * Note: Vault streams are always DAO-controlled (cancellable, non-transferable).
 * For transferable vestings with beneficiary control, use the standalone vesting module.
 */
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
  /** Computed: amountPerIteration * iterationsTotal */
  totalAmount: bigint;
}

/**
 * Vault info
 */
export interface VaultInfo {
  name: string;
  balances: { coinType: string; amount: bigint }[];
  approvedCoinTypes: string[];
}

/**
 * High-level vault operations
 *
 * @example
 * ```typescript
 * // Deposit to vault (permissionless for approved types)
 * const tx = sdk.vault.depositApproved({
 *   daoId: "0x123...",
 *   vaultName: "treasury",
 *   coinId: "0xabc...",
 *   coinType: "0x2::sui::SUI",
 * });
 *
 * // Create vesting stream
 * const tx = sdk.vault.createStream({
 *   daoId: "0x123...",
 *   vaultName: "treasury",
 *   beneficiary: "0xdef...",
 *   totalAmount: 1_000_000n,
 *   startTime: Date.now(),
 *   vestingPeriodMs: 365 * 24 * 60 * 60 * 1000, // 1 year
 *   iterations: 12, // Monthly
 *   coinType: "0x...::token::TOKEN",
 * });
 * ```
 */
export class VaultOperations {
  private client: SuiClient;
  private accountActionsPackageId: string;
  private packageRegistryId: string;
  private configType: string;

  constructor(config: VaultOperationsConfig) {
    this.client = config.client;
    this.accountActionsPackageId = config.accountActionsPackageId;
    this.packageRegistryId = config.packageRegistryId;
    this.configType = `${config.futarchyCorePackageId}::futarchy_config::FutarchyConfig`;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Extract coin type from a coin object ID
   */
  private async getCoinType(coinId: string): Promise<string> {
    const obj = await this.client.getObject({
      id: coinId,
      options: { showType: true },
    });

    if (!obj.data?.type) {
      throw new Error(`Could not determine type for coin: ${coinId}`);
    }

    // Extract type from "0x2::coin::Coin<TYPE>"
    const match = obj.data.type.match(/0x2::coin::Coin<(.+)>/);
    if (!match) {
      throw new Error(`Invalid coin type format: ${obj.data.type}`);
    }

    return match[1];
  }

  // ============================================================================
  // DEPOSITS
  // ============================================================================

  /**
   * Deposit coins to vault (permissionless for approved coin types)
   *
   * Anyone can deposit approved coin types. This is useful for
   * revenue sharing, donations, etc.
   *
   * @param config - Deposit configuration
   * @returns Transaction to execute
   *
   * @example
   * ```typescript
   * const tx = await sdk.vault.depositApproved({
   *   daoId: "0x123...",
   *   vaultName: "treasury",
   *   coinId: "0xabc...",
   * });
   * ```
   */
  async depositApproved(config: {
    daoId: string;
    vaultName: string;
    coinId: string;
  }): Promise<Transaction> {
    // Auto-fetch coinType from coinId
    const coinType = await this.getCoinType(config.coinId);

    const builder = new BaseTransactionBuilder(this.client);
    const tx = builder.getTransaction();

    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.accountActionsPackageId,
        'vault',
        'deposit_approved'
      ),
      typeArguments: [this.configType, coinType],
      arguments: [
        tx.object(config.daoId),
        tx.object(this.packageRegistryId),
        tx.pure.string(config.vaultName),
        tx.object(config.coinId),
      ],
    });

    return tx;
  }

  /**
   * Deposit coins from SUI gas (splits and deposits)
   *
   * Convenience method that splits SUI from gas and deposits.
   *
   * @param config - Deposit configuration
   * @returns Transaction to execute
   */
  depositSui(config: {
    daoId: string;
    vaultName: string;
    amount: bigint;
  }): Transaction {
    const builder = new BaseTransactionBuilder(this.client);
    const tx = builder.getTransaction();

    // Split SUI from gas
    const coin = builder.splitSui(config.amount);

    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.accountActionsPackageId,
        'vault',
        'deposit_approved'
      ),
      typeArguments: [this.configType, '0x2::sui::SUI'],
      arguments: [
        tx.object(config.daoId),
        tx.object(this.packageRegistryId),
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
   *
   * Beneficiary calls this to claim available vested tokens.
   *
   * @param config - Claim configuration
   * @returns Transaction to execute
   *
   * @example
   * ```typescript
   * const tx = await sdk.vault.claimStream({
   *   streamId: "0x123...",
   * });
   * ```
   */
  async claimStream(config: {
    streamId: string;
  }): Promise<Transaction> {
    // Auto-fetch coinType from stream object
    const streamObj = await this.client.getObject({
      id: config.streamId,
      options: { showType: true },
    });

    if (!streamObj.data?.type) {
      throw new Error(`Could not determine type for stream: ${config.streamId}`);
    }

    // Extract type from "...::vault::Stream<TYPE>"
    const match = streamObj.data.type.match(/::vault::Stream<(.+)>/);
    if (!match) {
      throw new Error(`Invalid stream type format: ${streamObj.data.type}`);
    }
    const coinType = match[1];

    const builder = new BaseTransactionBuilder(this.client);
    const tx = builder.getTransaction();

    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.accountActionsPackageId,
        'vault',
        'withdraw_from_stream'
      ),
      typeArguments: [coinType],
      arguments: [
        tx.object(config.streamId),
        tx.object('0x6'), // clock
      ],
    });

    return tx;
  }

  /**
   * Transfer stream to new beneficiary
   *
   * Only works if stream is transferable.
   *
   * @param config - Transfer configuration
   * @returns Transaction to execute
   */
  async transferStream(config: {
    streamId: string;
    newBeneficiary: string;
  }): Promise<Transaction> {
    // Auto-fetch coinType from stream object
    const streamObj = await this.client.getObject({
      id: config.streamId,
      options: { showType: true },
    });

    if (!streamObj.data?.type) {
      throw new Error(`Could not determine type for stream: ${config.streamId}`);
    }

    const match = streamObj.data.type.match(/::vault::Stream<(.+)>/);
    if (!match) {
      throw new Error(`Invalid stream type format: ${streamObj.data.type}`);
    }
    const coinType = match[1];

    const builder = new BaseTransactionBuilder(this.client);
    const tx = builder.getTransaction();

    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.accountActionsPackageId,
        'vault',
        'transfer_stream'
      ),
      typeArguments: [coinType],
      arguments: [
        tx.object(config.streamId),
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
   *
   * @param daoId - DAO account ID
   * @param vaultName - Vault name
   * @param coinType - Coin type to check
   * @returns Balance amount
   *
   * @example
   * ```typescript
   * const balance = await sdk.vault.getBalance(
   *   "0x123...",
   *   "treasury",
   *   "0x2::sui::SUI"
   * );
   * ```
   */
  async getBalance(
    _daoId: string,
    _vaultName: string,
    _coinType: string
  ): Promise<bigint> {
    // This requires resolving dynamic fields which is complex
    // Use devInspect with a view function instead
    throw new Error(
      'getBalance is not yet implemented. ' +
      'Vault balances require dynamic field resolution. ' +
      'Consider using on-chain view functions via devInspect.'
    );
  }

  /**
   * Get stream information
   *
   * @param streamId - Stream object ID
   * @returns Stream info
   *
   * @example
   * ```typescript
   * const stream = await sdk.vault.getStream("0x123...");
   * console.log(`Claimed: ${stream.claimedAmount}/${stream.totalAmount}`);
   * ```
   */
  async getStream(streamId: string): Promise<StreamInfo> {
    const obj = await this.client.getObject({
      id: streamId,
      options: { showContent: true },
    });

    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
      throw new Error(`Stream not found: ${streamId}`);
    }

    const fields = obj.data.content.fields as any;

    const amountPerIteration = BigInt(fields.amount_per_iteration || 0);
    const iterationsTotal = Number(fields.iterations_total || 0);

    return {
      id: streamId,
      beneficiary: fields.beneficiary || '',
      amountPerIteration,
      claimedAmount: BigInt(fields.claimed_amount || 0),
      startTime: Number(fields.start_time || 0),
      cliffTime: fields.cliff_time ? Number(fields.cliff_time) : undefined,
      iterationsTotal,
      iterationPeriodMs: Number(fields.iteration_period_ms || 0),
      maxPerWithdrawal: BigInt(fields.max_per_withdrawal || 0),
      totalAmount: amountPerIteration * BigInt(iterationsTotal),
    };
  }

  /**
   * Get claimable amount from a stream
   *
   * @param streamId - Stream object ID
   * @returns Claimable amount
   */
  async getClaimableAmount(streamId: string): Promise<bigint> {
    const stream = await this.getStream(streamId);
    const now = Date.now();

    if (now < stream.startTime) {
      return 0n;
    }

    if (stream.cliffTime && now < stream.cliffTime) {
      return 0n;
    }

    const elapsed = now - stream.startTime;
    const iterationsElapsed = Math.floor(elapsed / stream.iterationPeriodMs);
    const vestedIterations = Math.min(iterationsElapsed, stream.iterationsTotal);
    const vestedAmount = stream.amountPerIteration * BigInt(vestedIterations);

    // Claimable = vested - already claimed
    const claimable = vestedAmount - stream.claimedAmount;
    return claimable > 0n ? claimable : 0n;
  }

  /**
   * List all streams for a beneficiary
   *
   * @param beneficiary - Beneficiary address
   * @returns Array of stream IDs
   */
  async listStreamsForBeneficiary(beneficiary: string): Promise<string[]> {
    // Query owned objects of type Stream
    const result = await this.client.getOwnedObjects({
      owner: beneficiary,
      filter: {
        StructType: `${this.accountActionsPackageId}::vault::Stream`,
      },
      options: { showType: true },
    });

    return result.data.map((obj) => obj.data?.objectId || '').filter(Boolean);
  }

  /**
   * Check if a coin type is approved for permissionless deposits
   *
   * @param daoId - DAO account ID
   * @param vaultName - Vault name
   * @param coinType - Coin type to check
   * @returns True if approved
   */
  async isCoinTypeApproved(
    _daoId: string,
    _vaultName: string,
    _coinType: string
  ): Promise<boolean> {
    // This requires resolving dynamic fields which is complex
    throw new Error(
      'isCoinTypeApproved is not yet implemented. ' +
      'Checking approved types requires dynamic field resolution. ' +
      'Consider using on-chain view functions via devInspect.'
    );
  }
}
