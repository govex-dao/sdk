/**
 * Proposal Sponsorship - Sub-namespace for sponsorship operations
 *
 * @module services/proposal/sponsorship
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { TransactionUtils } from '../utils';
import { SponsorProposalConfig, CanSponsorResult, Packages } from '@/types';

export class ProposalSponsorship {
  private client: SuiClient;
  private packages: Packages;

  constructor(client: SuiClient, packages: Packages) {
    this.client = client;
    this.packages = packages;
  }

  /**
   * Sponsor a proposal using quota
   */
  sponsor(config: SponsorProposalConfig): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.governancePackageId,
        'proposal_sponsorship',
        'sponsor_proposal'
      ),
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.proposalId),
        tx.object(config.daoId),
        tx.object(config.quotaRegistryId),
        tx.object(config.clock || '0x6'),
      ],
    });

    return tx;
  }

  /**
   * Sponsor proposal to zero threshold (FREE for team members)
   */
  sponsorToZero(config: SponsorProposalConfig): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.governancePackageId,
        'proposal_sponsorship',
        'sponsor_proposal_to_zero'
      ),
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.proposalId),
        tx.object(config.daoId),
        tx.object(config.quotaRegistryId),
        tx.object(config.clock || '0x6'),
      ],
    });

    return tx;
  }

  /**
   * Check if user can sponsor a proposal
   */
  async canSponsor(
    proposalId: string,
    daoId: string,
    quotaRegistryId: string,
    potentialSponsor: string,
    assetType: string,
    stableType: string,
    clock: string = '0x6'
  ): Promise<CanSponsorResult> {
    const { futarchyGovernance } = this.packages;

    const result = await this.client.devInspectTransactionBlock({
      sender: potentialSponsor,
      transactionBlock: (() => {
        const tx = new Transaction();
        tx.moveCall({
          target: TransactionUtils.buildTarget(
            futarchyGovernance,
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

      return { canSponsor: canSponsorBool, reason };
    }

    return { canSponsor: false, reason: 'Failed to query sponsorship eligibility' };
  }
}
