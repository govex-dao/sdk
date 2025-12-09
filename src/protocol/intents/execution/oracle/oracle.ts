/**
 * Oracle Actions
 *
 * Price-based grants that unlock tokens when price conditions are met.
 * Grants have multiple tiers, each with its own price threshold and recipients.
 *
 * @module oracle
 */

import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { TransactionUtils } from '@/services';
import { ClaimGrantConfig, CreateGrantConfig } from '@/types';

/**
 * Oracle Actions for price-based grants
 *
 * PTB builders for oracle grant operations:
 * - Markers
 * - Public Operations
 * - Constructors
 * - Do Functions (execute from intent)
 * - Delete Functions (cleanup expired intents)
 * - Helpers
 *
 * @example Create a grant with price tiers
 * ```typescript
 * // Via SDK
 * const tx = new Transaction();
 * sdk.oracleActions.createGrant(tx, {
 *   accountId: daoId,
 *   assetType,
 *   stableType,
 *   tiers: [
 *     {
 *       priceThreshold: 1_000_000_000n, // $1
 *       isAbove: true,
 *       recipients: [{ recipient: teamAddress, amount: 100_000n }],
 *       tierDescription: "Unlock at $1",
 *     },
 *   ],
 *   useRelativePricing: false,
 *   earliestExecutionOffsetMs: 30 * 24 * 60 * 60 * 1000, // 30 days
 *   expiryYears: 4,
 *   cancelable: true,
 *   description: "Team vesting based on price milestones",
 *   daoId,
 * });
 * ```
 */
export class OracleActions {
  private oracleActionsPackageId: string;
  private packageRegistryId: string;
  private futarchyCorePackageId: string;

  constructor(
    oracleActionsPackageId: string,
    packageRegistryId: string,
    futarchyCorePackageId: string
  ) {
    this.oracleActionsPackageId = oracleActionsPackageId;
    this.packageRegistryId = packageRegistryId;
    this.futarchyCorePackageId = futarchyCorePackageId;
  }
  // ============================================================================
  // MARKERS (2)
  // ============================================================================

  /**
   * Create a CreateOracleGrant action type marker
   */
  createOracleGrantMarker(tx: Transaction): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.oracleActionsPackageId,
        'oracle_actions',
        'create_oracle_grant_marker'
      ),
      arguments: [],
    });
  }

  /**
   * Create a CancelGrant action type marker
   */
  cancelGrantMarker(tx: Transaction): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.oracleActionsPackageId,
        'oracle_actions',
        'cancel_grant_marker'
      ),
      arguments: [],
    });
  }

  // ============================================================================
  // PUBLIC OPERATIONS (3)
  // ============================================================================

  /**
   * Create a price-based grant with multiple tiers
   *
   * Each tier unlocks when the asset price reaches the threshold.
   * Recipients can claim their tokens once the condition is met and
   * the earliest execution time has passed.
   */
  createGrant(tx: Transaction, config: CreateGrantConfig): void {
    const target = TransactionUtils.buildTarget(
      this.oracleActionsPackageId,
      'oracle_actions',
      'create_grant'
    );

    // Build tier specs
    const tierSpecArgs = config.tiers.map((tier) => {
      // Build recipient mints for this tier
      const recipientArgs = tier.recipients.map((r) =>
        tx.moveCall({
          target: TransactionUtils.buildTarget(
            this.oracleActionsPackageId,
            'oracle_actions',
            'new_recipient_mint'
          ),
          arguments: [
            tx.pure(bcs.Address.serialize(r.recipient).toBytes()),
            tx.pure.u64(r.amount),
          ],
        })
      );

      // Create tier spec
      return tx.moveCall({
        target: TransactionUtils.buildTarget(
          this.oracleActionsPackageId,
          'oracle_actions',
          'new_tier_spec'
        ),
        arguments: [
          tx.pure.u128(tier.priceThreshold),
          tx.pure.bool(tier.isAbove),
          tx.makeMoveVec({ elements: recipientArgs }),
          tx.pure.string(tier.tierDescription),
        ],
      });
    });

    // Create tier vector
    const tiersVec = tx.makeMoveVec({ elements: tierSpecArgs });

    // Create grant
    tx.moveCall({
      target,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.accountId),
        tx.object(this.packageRegistryId),
        tiersVec,
        tx.pure.bool(config.useRelativePricing),
        tx.pure.option('u64', config.launchpadMultiplier ?? null),
        tx.pure.u64(config.earliestExecutionOffsetMs),
        tx.pure.u64(config.expiryYears),
        tx.pure.bool(config.cancelable),
        tx.pure.string(config.description),
        tx.pure.id(config.daoId),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  /**
   * Claim tokens from a grant tier with fulfill (Step 1 & 2 combined)
   *
   * This creates a ClaimRequest and fulfills it in the same transaction.
   * The two-step process validates price conditions before minting.
   */
  claimGrantWithFulfill(tx: Transaction, config: ClaimGrantConfig): void {
    const versionWitness = tx.moveCall({
      target: `${this.packageRegistryId}::version::current`,
      arguments: [],
    });

    // Step 1: Create claim request
    const claimRequest = tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.oracleActionsPackageId,
        'oracle_actions',
        'claim_grant'
      ),
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.accountId),
        tx.object(this.packageRegistryId),
        versionWitness,
        tx.object(config.grantId),
        tx.pure.u64(config.tierIndex),
        tx.object(config.claimCapId),
        tx.object(config.spotPoolId),
        tx.makeMoveVec({
          elements: config.conditionalPoolIds.map((id) => tx.object(id)),
        }),
        tx.object(config.clock || '0x6'),
      ],
    });

    // Step 2: Fulfill claim (mint tokens)
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.oracleActionsPackageId,
        'oracle_actions',
        'fulfill_claim_grant_from_account'
      ),
      typeArguments: [
        config.assetType,
        config.stableType,
        `${this.futarchyCorePackageId}::futarchy_config::FutarchyConfig`,
      ],
      arguments: [
        claimRequest,
        tx.object(config.accountId),
        tx.object(this.packageRegistryId),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  /**
   * Cancel a grant (if cancelable)
   */
  cancelGrant(
    tx: Transaction,
    grantId: string,
    assetType: string,
    stableType: string,
    clock: string = '0x6'
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.oracleActionsPackageId,
        'oracle_actions',
        'cancel_grant'
      ),
      typeArguments: [assetType, stableType],
      arguments: [tx.object(grantId), tx.object(clock)],
    });
  }

  // ============================================================================
  // CONSTRUCTORS (4) - For building action structs in PTBs
  // ============================================================================

  /**
   * Create new RecipientMint struct
   */
  newRecipientMint(
    tx: Transaction,
    recipient: string,
    amount: bigint
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.oracleActionsPackageId,
        'oracle_actions',
        'new_recipient_mint'
      ),
      arguments: [
        tx.pure(bcs.Address.serialize(recipient).toBytes()),
        tx.pure.u64(amount),
      ],
    });
  }

  /**
   * Create new TierSpec struct
   */
  newTierSpec(
    tx: Transaction,
    priceThreshold: bigint,
    isAbove: boolean,
    recipients: ReturnType<Transaction['moveCall']>[],
    tierDescription: string
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.oracleActionsPackageId,
        'oracle_actions',
        'new_tier_spec'
      ),
      arguments: [
        tx.pure.u128(priceThreshold),
        tx.pure.bool(isAbove),
        tx.makeMoveVec({ elements: recipients }),
        tx.pure.string(tierDescription),
      ],
    });
  }

  /**
   * Create CreateOracleGrant action for PTB
   */
  newCreateOracleGrant(
    tx: Transaction,
    config: {
      assetType: string;
      stableType: string;
      tiers: ReturnType<Transaction['moveCall']>[];
      useRelativePricing: boolean;
      launchpadMultiplier: bigint | null;
      earliestExecutionOffsetMs: bigint;
      expiryYears: bigint;
      cancelable: boolean;
      description: string;
      daoId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.oracleActionsPackageId,
        'oracle_actions',
        'new_create_oracle_grant'
      ),
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.makeMoveVec({ elements: config.tiers }),
        tx.pure.bool(config.useRelativePricing),
        tx.pure.option('u64', config.launchpadMultiplier),
        tx.pure.u64(config.earliestExecutionOffsetMs),
        tx.pure.u64(config.expiryYears),
        tx.pure.bool(config.cancelable),
        tx.pure.string(config.description),
        tx.pure.id(config.daoId),
      ],
    });
  }

  /**
   * Create CancelGrant action for PTB
   */
  newCancelGrant(tx: Transaction, grantId: string): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.oracleActionsPackageId,
        'oracle_actions',
        'new_cancel_grant'
      ),
      arguments: [tx.pure.id(grantId)],
    });
  }

  // ============================================================================
  // DO FUNCTIONS (2) - Execute from intent/governance
  // ============================================================================

  /**
   * Execute create oracle grant from intent
   */
  doCreateOracleGrant(
    tx: Transaction,
    config: {
      daoId: string;
      assetType: string;
      stableType: string;
      outcomeType: string;
      intentWitnessType: string;
      clock?: string;
    },
    executable: ReturnType<Transaction['moveCall']>,
    versionWitness: ReturnType<Transaction['moveCall']>,
    intentWitness: ReturnType<Transaction['moveCall']>
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.oracleActionsPackageId,
        'oracle_actions',
        'do_create_oracle_grant'
      ),
      typeArguments: [
        config.assetType,
        config.stableType,
        config.outcomeType,
        config.intentWitnessType,
      ],
      arguments: [
        executable,
        tx.object(config.daoId),
        tx.object(this.packageRegistryId),
        versionWitness,
        intentWitness,
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  /**
   * Execute cancel grant from intent
   */
  doCancelGrant(
    tx: Transaction,
    config: {
      daoId: string;
      assetType: string;
      stableType: string;
      outcomeType: string;
      intentWitnessType: string;
      clock?: string;
    },
    executable: ReturnType<Transaction['moveCall']>,
    versionWitness: ReturnType<Transaction['moveCall']>,
    intentWitness: ReturnType<Transaction['moveCall']>
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.oracleActionsPackageId,
        'oracle_actions',
        'do_cancel_grant'
      ),
      typeArguments: [
        config.assetType,
        config.stableType,
        config.outcomeType,
        config.intentWitnessType,
      ],
      arguments: [
        executable,
        tx.object(config.daoId),
        tx.object(this.packageRegistryId),
        versionWitness,
        intentWitness,
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  // ============================================================================
  // DELETE FUNCTIONS (2) - Cleanup expired intents
  // ============================================================================

  /**
   * Delete a CreateOracleGrant from an expired intent
   */
  deleteCreateOracleGrant(
    tx: Transaction,
    assetType: string,
    stableType: string,
    expired: ReturnType<Transaction['moveCall']>
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.oracleActionsPackageId,
        'oracle_actions',
        'delete_create_oracle_grant'
      ),
      typeArguments: [assetType, stableType],
      arguments: [expired],
    });
  }

  /**
   * Delete a CancelGrant from an expired intent
   */
  deleteCancelGrant(
    tx: Transaction,
    expired: ReturnType<Transaction['moveCall']>
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.oracleActionsPackageId,
        'oracle_actions',
        'delete_cancel_grant'
      ),
      arguments: [expired],
    });
  }

  // ============================================================================
  // HELPERS (3) - Price calculations
  // ============================================================================

  /**
   * Calculate absolute price from launchpad price and multiplier
   *
   * @example
   * ```typescript
   * // If launched at $0.10, 10x = $1.00
   * const threshold = sdk.oracleActions.calculateAbsoluteThreshold(
   *   100_000_000n, // $0.10
   *   10 // 10x
   * ); // Returns 1_000_000_000n ($1.00)
   * ```
   */
  calculateAbsoluteThreshold(launchpadPrice: bigint, multiplier: number): bigint {
    return launchpadPrice * BigInt(multiplier);
  }

  /**
   * Convert relative price (multiplier) to absolute threshold via Move call
   */
  relativeToAbsoluteThreshold(
    tx: Transaction,
    launchpadPrice: bigint,
    multiplier: bigint
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.oracleActionsPackageId,
        'oracle_actions',
        'relative_to_absolute_threshold'
      ),
      arguments: [tx.pure.u128(launchpadPrice), tx.pure.u64(multiplier)],
    });
  }

  /**
   * Create absolute price condition
   */
  absolutePriceCondition(
    tx: Transaction,
    priceThreshold: bigint,
    isAbove: boolean
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.oracleActionsPackageId,
        'oracle_actions',
        'absolute_price_condition'
      ),
      arguments: [tx.pure.u128(priceThreshold), tx.pure.bool(isAbove)],
    });
  }
}
