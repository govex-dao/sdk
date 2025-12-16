/**
 * Proposal Service - Governance proposal operations
 *
 * Wraps the ProposalWorkflow to provide a clean service API.
 *
 * @module services/proposal
 */

import { SuiClient } from '@mysten/sui/client';
import { extractFields, ProposalFields } from '../../types';
import type { Packages, SharedObjects } from '../../types';
import { ProposalWorkflow, ProposalWorkflowPackages, ProposalWorkflowSharedObjects } from '../../workflows/proposal-workflow';
import type {
  CreateProposalConfig,
  AddProposalActionsConfig,
  AdvanceToReviewConfig,
  AdvanceToTradingConfig,
  FinalizeProposalConfig,
  ExecuteProposalActionsConfig,
  SpotSwapConfig,
  ConditionalSwapConfig,
  WorkflowTransaction,
} from '../../workflows/types';

// Re-export sub-services
export { SponsorshipService } from './sponsorship';
export { TradeService } from './trade';
export { TwapService } from './twap';
export { EscrowService } from './escrow';

import { SponsorshipService } from './sponsorship';
import { TradeService } from './trade';
import { TwapService } from './twap';
import { EscrowService } from './escrow';

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

/**
 * ProposalService - Governance proposal operations
 *
 * @example
 * ```typescript
 * // Create a proposal
 * const tx = sdk.proposal.createProposal({
 *   daoAccountId: '0x...',
 *   assetType: '0x...::coin::COIN',
 *   stableType: '0x2::sui::SUI',
 *   title: 'My Proposal',
 *   introduction: 'Description...',
 *   metadata: '{}',
 *   outcomeMessages: ['Reject', 'Accept'],
 *   outcomeDetails: ['Do nothing', 'Approve'],
 *   proposer: '0x...',
 *   treasuryAddress: '0x...',
 *   usedQuota: false,
 *   feeCoins: ['0x...'],
 *   feeAmount: 1000000000n,
 * });
 *
 * // Trade on proposal outcomes
 * const tx = sdk.proposal.trade.stableForAsset({...});
 * ```
 */
export class ProposalService {
  private client: SuiClient;
  private packages: Packages;
  private workflow: ProposalWorkflow;

  /** Sponsorship operations */
  public sponsorship: SponsorshipService;

  /** Trade operations */
  public trade: TradeService;

  /** TWAP oracle operations */
  public twap: TwapService;

  /** Escrow operations */
  public escrow: EscrowService;

  constructor(params: ServiceParams) {
    this.client = params.client;
    this.packages = params.packages;

    // Build workflow packages - map from Packages to ProposalWorkflowPackages
    const workflowPackages: ProposalWorkflowPackages = {
      // From IntentExecutorPackages
      accountProtocolPackageId: params.packages.accountProtocol,
      accountActionsPackageId: params.packages.accountActions,
      futarchyCorePackageId: params.packages.futarchyCore,
      futarchyActionsPackageId: params.packages.futarchyActions,
      futarchyFactoryPackageId: params.packages.futarchyFactory,
      futarchyGovernancePackageId: params.packages.futarchyGovernance,
      futarchyGovernanceActionsPackageId: params.packages.futarchyGovernanceActions,
      futarchyOracleActionsPackageId: params.packages.futarchyOracleActions,
      packageRegistryId: params.sharedObjects.packageRegistry.id,
      // ProposalWorkflow specific
      futarchyTypesPackageId: params.packages.futarchyTypes,
      futarchyMarketsCorePackageId: params.packages.futarchyMarketsCore,
      futarchyMarketsPrimitivesPackageId: params.packages.futarchyMarketsPrimitives,
      futarchyMarketsOperationsPackageId: params.packages.futarchyMarketsOperations,
      oneShotUtilsPackageId: params.packages.oneShotUtils,
    };

    const workflowSharedObjects: ProposalWorkflowSharedObjects = {
      packageRegistryId: params.sharedObjects.packageRegistry.id,
      packageRegistrySharedVersion: params.sharedObjects.packageRegistry.version,
    };

    this.workflow = new ProposalWorkflow(params.client, workflowPackages, workflowSharedObjects);

    // Initialize sub-services
    this.sponsorship = new SponsorshipService(params);
    this.trade = new TradeService(params);
    this.twap = new TwapService(params);
    this.escrow = new EscrowService(params);
  }

  // ============================================================================
  // PROPOSAL LIFECYCLE
  // ============================================================================

  /**
   * Create a new governance proposal
   */
  createProposal(config: CreateProposalConfig): WorkflowTransaction {
    return this.workflow.createProposal(config);
  }

  /**
   * Add actions to a specific proposal outcome
   */
  addActionsToOutcome(config: AddProposalActionsConfig): WorkflowTransaction {
    return this.workflow.addActionsToOutcome(config);
  }

  /**
   * Advance proposal to REVIEW state
   * Creates escrow, registers conditional coins, and advances state
   */
  advanceToReview(config: AdvanceToReviewConfig): WorkflowTransaction {
    return this.workflow.advanceToReview(config);
  }

  /**
   * Advance proposal from REVIEW to TRADING state
   * Triggers 100% quantum split from spot pool to conditional AMMs
   */
  advanceToTrading(config: AdvanceToTradingConfig): WorkflowTransaction {
    return this.workflow.advanceToTrading(config);
  }

  /**
   * Finalize proposal after trading period ends
   * Determines winner via TWAP and auto-recombines winning liquidity
   */
  finalizeProposal(config: FinalizeProposalConfig): WorkflowTransaction {
    return this.workflow.finalizeProposal(config);
  }

  /**
   * Execute actions for winning outcome
   */
  executeActions(config: ExecuteProposalActionsConfig): WorkflowTransaction {
    return this.workflow.executeActions(config);
  }

  // ============================================================================
  // SWAPS
  // ============================================================================

  /**
   * Execute a spot swap during an active proposal
   */
  spotSwap(config: SpotSwapConfig): WorkflowTransaction {
    return this.workflow.spotSwap(config);
  }

  /**
   * Execute a conditional swap to buy tokens in a specific outcome market
   */
  conditionalSwap(config: ConditionalSwapConfig): WorkflowTransaction {
    return this.workflow.conditionalSwap(config);
  }

  /**
   * Redeem winning conditional tokens for underlying assets
   */
  redeemConditionalTokens(
    proposalId: string,
    escrowId: string,
    assetType: string,
    stableType: string,
    conditionalCoinId: string,
    conditionalCoinType: string,
    outcomeIndex: number,
    isAsset: boolean,
    recipient: string,
    clockId?: string
  ): WorkflowTransaction {
    return this.workflow.redeemConditionalTokens(
      proposalId,
      escrowId,
      assetType,
      stableType,
      conditionalCoinId,
      conditionalCoinType,
      outcomeIndex,
      isAsset,
      recipient,
      clockId
    );
  }

  // ============================================================================
  // MAINTENANCE
  // ============================================================================

  /**
   * Clean up expired intents and earn storage rebates
   */
  cleanupExpiredIntents(
    daoAccountId: string,
    maxToClean: number,
    clockId?: string
  ): WorkflowTransaction {
    return this.workflow.cleanupExpiredIntents(daoAccountId, maxToClean, clockId);
  }

  /**
   * Check if DAO maintenance is needed
   */
  checkMaintenanceNeeded(
    daoAccountId: string,
    clockId?: string
  ): WorkflowTransaction {
    return this.workflow.checkMaintenanceNeeded(daoAccountId, clockId);
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Get proposal info
   */
  async getInfo(proposalId: string): Promise<any> {
    const obj = await this.client.getObject({
      id: proposalId,
      options: { showContent: true },
    });

    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
      throw new Error(`Could not fetch proposal: ${proposalId}`);
    }

    return extractFields<ProposalFields>(obj);
  }

  /**
   * Get market state for a proposal
   */
  async getMarket(proposalId: string): Promise<any> {
    const proposal = await this.getInfo(proposalId);
    return proposal.market_state;
  }

  /**
   * Get all proposals
   */
  async getAll(): Promise<any[]> {
    const events = await this.client.queryEvents({
      query: {
        MoveEventType: `${this.packages.futarchyFactory}::proposal::ProposalCreated`,
      },
      limit: 50,
    });

    return events.data.map((e: any) => e.parsedJson);
  }

  /**
   * Get proposals for a specific DAO
   */
  async getByDao(daoId: string): Promise<any[]> {
    const all = await this.getAll();
    return all.filter((p: any) => p.dao_id === daoId);
  }
}
