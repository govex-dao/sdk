/**
 * Auto Executor - High-level functions for automatic intent execution
 *
 * Fetches parsed actions from backend API and builds execution PTBs automatically.
 *
 * @module workflows/auto-executor
 */

import { SuiClient } from '@mysten/sui/client';
import { IntentExecutor, IntentExecutorPackages } from './intent-executor';
import { parsedActionsToExecutionConfigs, ParsedAction } from './action-converter';
import type { WorkflowTransaction, ObjectIdOrRef } from './types';

/**
 * Backend API response for a launchpad (raise)
 */
export interface BackendRaiseResponse {
  id: string;
  dao_id: string;
  asset_type: string;
  stable_type: string;
  state: string;
  success_actions: ParsedAction[];
  failure_actions: ParsedAction[];
  [key: string]: any;
}

/**
 * Backend API response for a proposal
 */
export interface BackendProposalResponse {
  id: string;
  dao_id: string;
  asset_type: string;
  stable_type: string;
  lp_type?: string;
  state: string;
  winning_outcome?: number;
  escrow_id?: string;
  spot_pool_id?: string;
  /** Actions grouped by outcome: { "1": [...], "2": [...] } */
  staged_actions: Record<string, ParsedAction[]>;
  [key: string]: any;
}

/**
 * Backend API response for a DAO
 */
export interface BackendDaoResponse {
  id: string;
  asset_type: string;
  stable_type: string;
  [key: string]: any;
}

/**
 * Configuration for auto-executor
 */
export interface AutoExecutorConfig {
  /** Backend API base URL (e.g., "https://api.govex.io") */
  backendUrl: string;
  /** Package IDs for building PTBs */
  packages: IntentExecutorPackages;
}

/**
 * Auto Executor - Fetches from backend and builds execution PTBs
 *
 * @example
 * ```typescript
 * const autoExecutor = new AutoExecutor(client, {
 *   backendUrl: 'https://api.govex.io',
 *   packages: sdk.packages,
 * });
 *
 * // Execute launchpad init
 * const { transaction } = await autoExecutor.executeLaunchpad(raiseId, {
 *   accountId: '0x...',
 * });
 *
 * // Execute proposal winning outcome
 * const { transaction } = await autoExecutor.executeProposal(proposalId, {
 *   accountId: '0x...',
 * });
 * ```
 */
export class AutoExecutor {
  private config: AutoExecutorConfig;
  private intentExecutor: IntentExecutor;

  constructor(client: SuiClient, config: AutoExecutorConfig) {
    this.config = config;
    this.intentExecutor = new IntentExecutor(client, config.packages);
  }

  /**
   * Execute launchpad init actions automatically
   *
   * Fetches raise data from backend, converts parsed actions, and builds PTB.
   *
   * @param raiseId - The raise object ID
   * @param options - Additional execution options
   * @returns Transaction ready for signing
   */
  async executeLaunchpad(
    raiseId: string,
    options: {
      accountId: ObjectIdOrRef;
      /** Override which actions to execute (default: success_actions) */
      actionType?: 'success' | 'failure';
      clockId?: string;
    }
  ): Promise<WorkflowTransaction & { raise: BackendRaiseResponse }> {
    // 1. Fetch raise data from backend
    const raise = await this.fetchRaise(raiseId);

    // 2. Select actions based on type
    const parsedActions =
      options.actionType === 'failure' ? raise.failure_actions : raise.success_actions;

    if (!parsedActions || parsedActions.length === 0) {
      throw new Error(`No ${options.actionType || 'success'} actions found for raise ${raiseId}`);
    }

    // 3. Convert to execution configs
    const actions = parsedActionsToExecutionConfigs(parsedActions);

    // 4. Build and return PTB
    const result = this.intentExecutor.execute({
      intentType: 'launchpad',
      accountId: options.accountId,
      raiseId,
      assetType: raise.asset_type,
      stableType: raise.stable_type,
      actions,
      clockId: options.clockId,
    });

    return {
      ...result,
      raise,
    };
  }

  /**
   * Execute proposal winning outcome actions automatically
   *
   * Fetches proposal data from backend, gets winning outcome actions, and builds PTB.
   *
   * @param proposalId - The proposal object ID
   * @param options - Additional execution options
   * @returns Transaction ready for signing
   */
  async executeProposal(
    proposalId: string,
    options: {
      accountId: ObjectIdOrRef;
      /** Override which outcome to execute (default: winning_outcome) */
      outcome?: number;
      /** Escrow ID (fetched from backend if not provided) */
      escrowId?: ObjectIdOrRef;
      /** Spot pool ID (fetched from backend if not provided) */
      spotPoolId?: ObjectIdOrRef;
      clockId?: string;
    }
  ): Promise<WorkflowTransaction & { proposal: BackendProposalResponse }> {
    // 1. Fetch proposal data from backend
    const proposal = await this.fetchProposal(proposalId);

    // 2. Determine which outcome to execute
    const outcomeToExecute = options.outcome ?? proposal.winning_outcome;
    if (outcomeToExecute === undefined || outcomeToExecute === null) {
      throw new Error(`No winning outcome for proposal ${proposalId}`);
    }
    if (outcomeToExecute === 0) {
      throw new Error(`Cannot execute REJECT outcome (0) for proposal ${proposalId}`);
    }

    // 3. Get actions for the outcome
    const parsedActions = proposal.staged_actions[String(outcomeToExecute)];
    if (!parsedActions || parsedActions.length === 0) {
      throw new Error(`No actions found for outcome ${outcomeToExecute} in proposal ${proposalId}`);
    }

    // 4. Get required IDs
    const escrowId = options.escrowId || proposal.escrow_id;
    const spotPoolId = options.spotPoolId || proposal.spot_pool_id;
    const lpType = proposal.lp_type;

    if (!escrowId) {
      throw new Error(`escrowId not found for proposal ${proposalId}`);
    }
    if (!spotPoolId) {
      throw new Error(`spotPoolId not found for proposal ${proposalId}`);
    }
    if (!lpType) {
      throw new Error(`lpType not found for proposal ${proposalId}`);
    }

    // 5. Convert to execution configs
    const actions = parsedActionsToExecutionConfigs(parsedActions);

    // 6. Build and return PTB
    const result = this.intentExecutor.execute({
      intentType: 'proposal',
      accountId: options.accountId,
      proposalId,
      escrowId,
      spotPoolId,
      assetType: proposal.asset_type,
      stableType: proposal.stable_type,
      lpType,
      actions,
      clockId: options.clockId,
    });

    return {
      ...result,
      proposal,
    };
  }

  /**
   * Fetch raise data from backend API
   */
  private async fetchRaise(raiseId: string): Promise<BackendRaiseResponse> {
    const url = `${this.config.backendUrl}/launchpads/${raiseId}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch raise ${raiseId}: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { data?: BackendRaiseResponse } & BackendRaiseResponse;
    return data.data || data;
  }

  /**
   * Fetch proposal data from backend API
   */
  private async fetchProposal(proposalId: string): Promise<BackendProposalResponse> {
    const url = `${this.config.backendUrl}/proposals/${proposalId}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch proposal ${proposalId}: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as { data?: BackendProposalResponse } & BackendProposalResponse;
    return data.data || data;
  }

  /**
   * Fetch DAO data from backend API (for future use)
   */
  async fetchDao(daoId: string): Promise<BackendDaoResponse> {
    const url = `${this.config.backendUrl}/daos/${daoId}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch DAO ${daoId}: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { data?: BackendDaoResponse } & BackendDaoResponse;
    return data.data || data;
  }

  /**
   * Get the IntentExecutor for direct access
   */
  getIntentExecutor(): IntentExecutor {
    return this.intentExecutor;
  }
}

/**
 * Create an auto-executor instance
 *
 * @param client - Sui client
 * @param config - Configuration
 * @returns AutoExecutor instance
 */
export function createAutoExecutor(client: SuiClient, config: AutoExecutorConfig): AutoExecutor {
  return new AutoExecutor(client, config);
}
