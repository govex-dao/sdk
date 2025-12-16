/**
 * Launchpad Service - Token launch operations
 *
 * Wraps the LaunchpadWorkflow to provide a clean service API.
 *
 * @module services/launchpad
 */

import { SuiClient, SuiEvent } from '@mysten/sui/client';
import type { Packages, SharedObjects, RaiseFields, RaiseCreatedEvent } from '../../types';
import { isMoveObject } from '../../types';
import { LaunchpadWorkflow, LaunchpadWorkflowPackages, LaunchpadWorkflowSharedObjects } from '../../workflows/launchpad-workflow';
import type { CreateRaiseConfig, StageActionsConfig, ContributeConfig, ExecuteLaunchpadActionsConfig, WorkflowTransaction } from '../../workflows/types';

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

/**
 * LaunchpadService - Token launch operations
 */
export class LaunchpadService {
  private client: SuiClient;
  private packages: Packages;
  private workflow: LaunchpadWorkflow;

  /** Unlimited cap constant for contribution tiers */
  static readonly UNLIMITED_CAP = 18446744073709551615n;

  constructor(params: ServiceParams) {
    this.client = params.client;
    this.packages = params.packages;

    // Build workflow packages
    const workflowPackages: LaunchpadWorkflowPackages = {
      accountProtocolPackageId: params.packages.accountProtocol,
      accountActionsPackageId: params.packages.accountActions,
      futarchyCorePackageId: params.packages.futarchyCore,
      futarchyTypesPackageId: params.packages.futarchyTypes,
      futarchyFactoryPackageId: params.packages.futarchyFactory,
      futarchyActionsPackageId: params.packages.futarchyActions,
      futarchyGovernancePackageId: params.packages.futarchyGovernance,
      futarchyGovernanceActionsPackageId: params.packages.futarchyGovernanceActions,
      futarchyOracleActionsPackageId: params.packages.futarchyOracleActions,
      packageRegistryId: params.sharedObjects.packageRegistry.id,
      oneShotUtilsPackageId: params.packages.oneShotUtils,
    };

    const workflowSharedObjects: LaunchpadWorkflowSharedObjects = {
      factoryId: params.sharedObjects.factory.id,
      factorySharedVersion: params.sharedObjects.factory.version,
      packageRegistryId: params.sharedObjects.packageRegistry.id,
      packageRegistrySharedVersion: params.sharedObjects.packageRegistry.version,
      feeManagerId: params.sharedObjects.feeManager.id,
      feeManagerSharedVersion: params.sharedObjects.feeManager.version,
    };

    this.workflow = new LaunchpadWorkflow(params.client, workflowPackages, workflowSharedObjects);
  }

  // ============================================================================
  // RAISE LIFECYCLE
  // ============================================================================

  /**
   * Create a new token raise
   */
  createRaise(config: CreateRaiseConfig): WorkflowTransaction {
    return this.workflow.createRaise(config);
  }

  /**
   * Stage actions for success/failure outcomes
   */
  stageActions(config: StageActionsConfig): WorkflowTransaction {
    return this.workflow.stageActions(config);
  }

  /**
   * Contribute to a raise
   */
  contribute(config: ContributeConfig): WorkflowTransaction {
    return this.workflow.contribute(config);
  }

  /**
   * Execute actions after raise completes
   */
  executeActions(config: ExecuteLaunchpadActionsConfig): WorkflowTransaction {
    return this.workflow.executeActions(config);
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Get raise info by ID
   */
  async getRaise(raiseId: string): Promise<RaiseFields> {
    const obj = await this.client.getObject({
      id: raiseId,
      options: { showContent: true },
    });

    if (!obj.data || !isMoveObject(obj.data)) {
      throw new Error(`Could not fetch raise: ${raiseId}`);
    }

    return obj.data.content.fields as RaiseFields;
  }

  /**
   * Get all raises from events
   */
  async getAll(): Promise<RaiseCreatedEvent[]> {
    const events = await this.client.queryEvents({
      query: {
        MoveEventType: `${this.packages.futarchyFactory}::launchpad::RaiseCreated`,
      },
      limit: 50,
    });

    return events.data.map((e: SuiEvent) => e.parsedJson as RaiseCreatedEvent);
  }

  /**
   * Get raises by creator
   */
  async getByCreator(creator: string): Promise<RaiseCreatedEvent[]> {
    const all = await this.getAll();
    return all.filter((r) => r.creator === creator);
  }

  /**
   * Check if a raise is settled
   */
  async isSettled(raiseId: string): Promise<boolean> {
    const raise = await this.getRaise(raiseId);
    return raise.state === 2 || raise.state === 3; // SUCCESS or FAILED
  }

  /**
   * Get raise state
   */
  async getState(raiseId: string): Promise<number> {
    const raise = await this.getRaise(raiseId);
    return raise.state;
  }

  /**
   * Get total raised amount
   */
  async getTotalRaised(raiseId: string): Promise<bigint> {
    const raise = await this.getRaise(raiseId);
    return BigInt(raise.total_raised || 0);
  }
}
