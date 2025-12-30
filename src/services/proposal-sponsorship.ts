/**
 * Proposal Sponsorship Operations
 *
 * Allows team members to sponsor proposals. Sponsored outcomes bypass the TWAP
 * threshold and just need TWAP >= reject TWAP to pass. Sponsorship uses quota.
 *
 * @module proposal-sponsorship
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { TransactionUtils } from './transaction';

/**
 * Configuration for sponsoring a proposal
 */
export interface SponsorProposalConfig {
  governancePackageId: string;
  proposalId: string;
  daoId: string;
  quotaRegistryId: string;
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
 * Team members with quota can sponsor proposals. Sponsored outcomes bypass
 * the TWAP threshold and just need TWAP >= reject TWAP to pass.
 *
 * @example Sponsor a proposal
 * ```typescript
 * const tx = sdk.proposalSponsorship.sponsorProposal({
 *   proposalId,
 *   daoId,
 *   quotaRegistryId,
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
   * Sponsor a proposal using quota
   *
   * Sponsoring marks all non-reject outcomes as sponsored. Sponsored outcomes
   * bypass the TWAP threshold and just need TWAP >= reject TWAP to pass.
   *
   * Requirements:
   * - Caller must have sponsorship quota
   * - Proposal must be in valid state for sponsorship (not finalized)
   * - Quota will be consumed (one quota sponsors all outcomes)
   *
   * @param config - Sponsor configuration
   * @returns Transaction for sponsoring proposal
   *
   * @example
   * ```typescript
   * const tx = sdk.proposalSponsorship.sponsorProposal({
   *   proposalId: "0x123...",
   *   daoId: "0xabc...",
   *   quotaRegistryId: "0xdef...",
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
        tx.object(config.quotaRegistryId), // quota_registry
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
