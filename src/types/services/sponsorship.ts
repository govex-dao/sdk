/**
 * Sponsorship Types - Configuration types for proposal sponsorship
 *
 * @module types/services/sponsorship
 */

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
 * Configuration for sponsoring a specific outcome
 */
export interface SponsorOutcomeConfig extends SponsorProposalConfig {
  outcomeIndex: number;
  sponsoredThresholdMagnitude: string | number;
  sponsoredThresholdIsNegative: boolean;
}
