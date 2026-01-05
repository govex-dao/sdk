/**
 * Proposal Sponsorship Operations
 *
 * Allows team members to sponsor proposals with per-outcome sponsorship types.
 *
 * Two sponsorship types:
 * - ZERO_THRESHOLD (1): Outcome just needs TWAP >= reject_twap to pass
 * - NEGATIVE_DISCOUNT (2): Outcome can pass with TWAP >= reject_twap - sponsored_threshold%
 *
 * Sponsorship uses quota (one quota per proposal regardless of how many outcomes sponsored).
 *
 * @module proposal-sponsorship
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { TransactionUtils } from './transaction';

/**
 * Sponsorship type constants
 * Must match the Move constants in proposal.move
 */
export const SPONSORSHIP_NONE = 0;
export const SPONSORSHIP_ZERO_THRESHOLD = 1;
export const SPONSORSHIP_NEGATIVE_DISCOUNT = 2;

export type SponsorshipType =
  | typeof SPONSORSHIP_NONE
  | typeof SPONSORSHIP_ZERO_THRESHOLD
  | typeof SPONSORSHIP_NEGATIVE_DISCOUNT;

/**
 * Configuration for sponsoring a proposal
 */
export interface SponsorProposalConfig {
  governancePackageId: string;
  proposalId: string;
  daoId: string;
  packageRegistryId: string;
  sponsorshipRegistryId: string;
  /**
   * Array of sponsorship types, one per outcome.
   * Index 0 (reject) must be SPONSORSHIP_NONE.
   * Example for 3 outcomes: [0, 1, 2] = none, zero_threshold, negative_discount
   */
  sponsorshipTypes: SponsorshipType[];
  assetType: string;
  stableType: string;
  clock?: string;
}


/**
 * Result of checking if user can sponsor
 */
export interface CanSponsorResult {
  canSponsor: boolean;
  reason: string;
}

/**
 * Proposal Sponsorship operations
 *
 * Team members with quota can sponsor specific outcomes with different sponsorship types:
 * - ZERO_THRESHOLD (1): Outcome just needs TWAP >= reject_twap
 * - NEGATIVE_DISCOUNT (2): Outcome can pass with TWAP >= reject_twap - sponsored_threshold%
 *
 * @example Sponsor outcomes with different types
 * ```typescript
 * const tx = sdk.proposalSponsorship.sponsorProposal({
 *   proposalId,
 *   daoId,
 *   packageRegistryId,
 *   sponsorshipRegistryId,
 *   // [reject=none, outcome1=zero_threshold, outcome2=negative_discount]
 *   sponsorshipTypes: [0, 1, 2],
 *   assetType,
 *   stableType,
 * });
 * ```
 */
export class ProposalSponsorshipOperations {
  private client: SuiClient;
  private governancePackageId: string;

  constructor(client: SuiClient, governancePackageId: string) {
    this.client = client;
    this.governancePackageId = governancePackageId;
  }

  /**
   * Sponsor specific outcomes of a proposal using quota
   *
   * Sponsorship types per outcome:
   * - SPONSORSHIP_NONE (0): Skip this outcome (or keep unsponsored)
   * - SPONSORSHIP_ZERO_THRESHOLD (1): Outcome just needs TWAP >= reject_twap
   * - SPONSORSHIP_NEGATIVE_DISCOUNT (2): Can pass with TWAP >= reject_twap - sponsored_threshold%
   *
   * Requirements:
   * - Caller must have sponsorship quota
   * - Proposal must be in valid state for sponsorship (not finalized)
   * - sponsorshipTypes[0] must be 0 (reject outcome cannot be sponsored)
   * - Vector length must match proposal outcome count
   * - Quota will be consumed (one quota per proposal)
   *
   * Idempotent: re-sponsoring already-sponsored outcomes is a no-op.
   *
   * @param config - Sponsor configuration with sponsorship types vector
   * @returns Transaction for sponsoring proposal
   *
   * @example
   * ```typescript
   * // For a proposal with 3 outcomes:
   * // - Outcome 0 (reject): cannot sponsor, must be 0
   * // - Outcome 1: ZERO_THRESHOLD (just needs TWAP >= reject)
   * // - Outcome 2: NEGATIVE_DISCOUNT (can be up to sponsored_threshold% below reject)
   * const tx = sdk.proposalSponsorship.sponsorProposal({
   *   proposalId: "0x123...",
   *   daoId: "0xabc...",
   *   packageRegistryId: "0xpkg...",
   *   sponsorshipRegistryId: "0xreg...",
   *   sponsorshipTypes: [0, 1, 2],
   *   assetType: "0x2::sui::SUI",
   *   stableType: "0x2::sui::USDC",
   * });
   * await client.signAndExecuteTransaction({ transaction: tx, signer });
   * ```
   */
  sponsorProposal(config: SponsorProposalConfig): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.governancePackageId,
        'proposal_sponsorship',
        'sponsor_proposal'
      ),
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.proposalId), // proposal
        tx.object(config.daoId), // account (DAO)
        tx.object(config.packageRegistryId), // package_registry
        tx.object(config.sponsorshipRegistryId), // sponsorship_registry
        tx.pure.vector('u8', config.sponsorshipTypes), // sponsorship_types
        tx.object(config.clock || '0x6'), // clock
      ],
    });

    return tx;
  }

  /**
   * Check if user can sponsor a proposal
   *
   * View function to check if a specific address can sponsor the proposal.
   * Returns both a boolean result and a reason string.
   *
   * @param proposalId - Proposal object ID
   * @param daoId - DAO account ID
   * @param quotaRegistryId - Quota registry ID
   * @param potentialSponsor - Address to check
   * @param assetType - DAO asset type
   * @param stableType - DAO stable type
   * @param clock - Clock object ID
   * @returns Promise with can sponsor result and reason
   *
   * @example
   * ```typescript
   * const result = await sdk.proposalSponsorship.canSponsorProposal(
   *   proposalId,
   *   daoId,
   *   quotaRegistryId,
   *   userAddress,
   *   assetType,
   *   stableType
   * );
   * if (result.canSponsor) {
   *   console.log("User can sponsor");
   * } else {
   *   console.log(`Cannot sponsor: ${result.reason}`);
   * }
   * ```
   */
  async canSponsorProposal(
    proposalId: string,
    daoId: string,
    quotaRegistryId: string,
    potentialSponsor: string,
    assetType: string,
    stableType: string,
    clock: string = '0x6'
  ): Promise<CanSponsorResult> {
    const result = await this.client.devInspectTransactionBlock({
      sender: potentialSponsor,
      transactionBlock: (() => {
        const tx = new Transaction();
        tx.moveCall({
          target: TransactionUtils.buildTarget(
            this.governancePackageId,
            'proposal_sponsorship',
            'can_sponsor_proposal'
          ),
          typeArguments: [assetType, stableType],
          arguments: [
            tx.object(proposalId),
            tx.object(daoId),
            tx.object(quotaRegistryId),
            tx.pure.address(potentialSponsor),
            tx.object(clock),
          ],
        });
        return tx;
      })(),
    });

    if (result.results && result.results[0]?.returnValues) {
      const canSponsor = result.results[0].returnValues[0];
      const reasonBytes = result.results[0].returnValues[1];

      const canSponsorBool = canSponsor[0][0] === 1;
      const reason = new TextDecoder().decode(new Uint8Array(reasonBytes[0]));

      return {
        canSponsor: canSponsorBool,
        reason,
      };
    }

    return {
      canSponsor: false,
      reason: 'Failed to query sponsorship eligibility',
    };
  }
}
