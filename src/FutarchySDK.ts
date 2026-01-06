/**
 * FutarchySDK - Main entry point for the Futarchy Protocol SDK
 *
 * @example
 * ```typescript
 * import { FutarchySDK } from '@govex/futarchy-sdk';
 *
 * // Using bundled deployments (recommended for supported networks)
 * const sdk = new FutarchySDK({ network: 'devnet' });
 *
 * // Using custom deployments
 * const sdk = new FutarchySDK({ network: 'devnet', deployments: customDeployments });
 *
 * // DAO operations
 * const info = await sdk.dao.getInfo(daoId);
 * const tx = sdk.dao.vault.depositApproved({...});
 *
 * // Launchpad operations
 * const tx = sdk.launchpad.createRaise({...});
 *
 * // Proposal operations
 * const tx = sdk.proposal.createProposal({...});
 * const tx = sdk.proposal.trade.stableForAsset({...});
 *
 * // Workflows (low-level access)
 * const tx = sdk.workflows.launchpad.createRaiseWithActions({...});
 * const tx = sdk.workflows.proposal.advanceToTrading({...});
 *
 * // Market operations
 * const tx = sdk.market.swapAssetForStable({...});
 * ```
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { NetworkType, createNetworkConfig, NetworkConfig, DeploymentManager, getBundledDeployments } from './config';
import type { DeploymentConfig } from './types/deployment';
import type { Packages, SharedObjects } from './types';

import {
  DAOService,
  MarketService,
  LaunchpadService,
  ProposalService,
  AdminService,
  IntentService,
  QueryHelper,
  BaseTransactionBuilder,
  CurrencyUtils,
  FactoryAdminService,
  FeeManagerService,
} from './services';

import { LaunchpadWorkflow, LaunchpadWorkflowPackages, LaunchpadWorkflowSharedObjects } from './workflows/launchpad-workflow';
import { ProposalWorkflow, ProposalWorkflowPackages, ProposalWorkflowSharedObjects } from './workflows/proposal-workflow';
import { AutoExecutor } from './workflows/auto-executor';

export class FutarchySDK {
  // ========================================================================
  // SERVICES
  // ========================================================================

  /** DAO operations (vault, oracle, managed objects) */
  public dao: DAOService;

  /** Launchpad operations (create, contribute, complete raises) */
  public launchpad: LaunchpadService;

  /** Proposal operations (create, trade, finalize) */
  public proposal: ProposalService;

  /** Market operations (swaps, liquidity) */
  public market: MarketService;

  /** Admin operations (factory, verification, fees) */
  public admin: AdminService;

  /** Intent operations (internal use) */
  public intents: IntentService;

  /** Utility helpers */
  public utils: {
    transactionBuilder: BaseTransactionBuilder;
    queryHelper: QueryHelper;
    currency: CurrencyUtils;
  };

  /**
   * Direct workflow access for advanced use cases
   * Services wrap these internally, but tests may need direct access
   */
  public workflows: {
    launchpad: LaunchpadWorkflow;
    proposal: ProposalWorkflow;
  };

  // ========================================================================
  // BACKWARDS-COMPATIBLE ALIASES
  // ========================================================================

  /** @deprecated Use sdk.admin.factory instead */
  public factoryAdmin: FactoryAdminService;

  /** @deprecated Use sdk.admin.feeManager instead */
  public feeManager: FeeManagerServiceExtended;

  // ========================================================================
  // INFRASTRUCTURE
  // ========================================================================

  public client: SuiClient;
  public network: NetworkConfig;
  public deployments: DeploymentManager;
  public packages: Packages;
  public sharedObjects: SharedObjects;

  constructor(config: {
    network: NetworkType | string;
    rpcUrl?: string;
    deployments?: DeploymentConfig;
  }) {
    // Setup network and client
    const networkConfig = createNetworkConfig(config.network, config.rpcUrl);

    // Resolve deployments: use provided or fall back to bundled
    const deploymentsConfig = config.deployments ?? getBundledDeployments(config.network);

    if (!deploymentsConfig) {
      throw new Error(
        `No deployments available for network "${config.network}". ` +
        `Either provide deployments in the config, or use a network with bundled deployments (devnet, testnet, mainnet).`
      );
    }

    const deploymentManager = DeploymentManager.fromConfig(deploymentsConfig);

    this.client = networkConfig.client;
    this.network = networkConfig;
    this.deployments = deploymentManager;

    // Get required shared objects
    const factoryObject = deploymentManager.getFactory();
    const packageRegistry = deploymentManager.getPackageRegistry();
    const marketsCoreDeployment = deploymentManager.getPackage('futarchy_markets_core');
    const feeManager = marketsCoreDeployment?.sharedObjects.find(
      (obj) => obj.name === 'FeeManager'
    );
    const futarchyCoreDeployment = deploymentManager.getPackage('futarchy_core');
    const sponsorshipRegistry = futarchyCoreDeployment?.sharedObjects.find(
      (obj) => obj.name === 'SponsorshipRegistry'
    );

    if (!factoryObject || !packageRegistry || !feeManager || !sponsorshipRegistry) {
      throw new Error(
        'Missing required deployment objects. Ensure Factory, PackageRegistry, FeeManager, and SponsorshipRegistry are deployed.'
      );
    }

    // Build Packages object
    this.packages = {
      accountProtocol: deploymentManager.getPackageId('AccountProtocol')!,
      accountActions: deploymentManager.getPackageId('AccountActions')!,
      futarchyCore: deploymentManager.getPackageId('futarchy_core')!,
      futarchyTypes: deploymentManager.getPackageId('futarchy_types')!,
      futarchyFactory: deploymentManager.getPackageId('futarchy_factory')!,
      futarchyActions: deploymentManager.getPackageId('futarchy_actions')!,
      futarchyGovernance: deploymentManager.getPackageId('futarchy_governance')!,
      futarchyGovernanceActions: deploymentManager.getPackageId('futarchy_governance_actions')!,
      futarchyOracleActions: deploymentManager.getPackageId('futarchy_oracle_actions')!,
      futarchyMarketsCore: deploymentManager.getPackageId('futarchy_markets_core')!,
      futarchyMarketsPrimitives: deploymentManager.getPackageId('futarchy_markets_primitives')!,
      futarchyMarketsOperations: deploymentManager.getPackageId('futarchy_markets_operations')!,
      oneShotUtils: deploymentManager.getPackageId('futarchy_one_shot_utils'),
    };

    // Build SharedObjects
    this.sharedObjects = {
      factory: {
        id: factoryObject.objectId,
        version: factoryObject.initialSharedVersion,
      },
      feeManager: {
        id: feeManager.objectId,
        version: feeManager.initialSharedVersion,
      },
      packageRegistry: {
        id: packageRegistry.objectId,
        version: packageRegistry.initialSharedVersion,
      },
      sponsorshipRegistry: {
        id: sponsorshipRegistry.objectId,
        version: sponsorshipRegistry.initialSharedVersion,
      },
    };

    // Initialize services
    const params = {
      client: this.client,
      packages: this.packages,
      sharedObjects: this.sharedObjects,
    };

    this.admin = new AdminService(params);
    this.dao = new DAOService(params);
    this.market = new MarketService(params);
    this.launchpad = new LaunchpadService(params);
    this.proposal = new ProposalService(params);
    this.intents = new IntentService(params);

    this.utils = {
      transactionBuilder: new BaseTransactionBuilder(this.client),
      queryHelper: new QueryHelper(this.client),
      currency: new CurrencyUtils({
        client: this.client,
        accountActionsPackageId: this.packages.accountActions,
        futarchyCorePackageId: this.packages.futarchyCore,
        packageRegistryId: this.sharedObjects.packageRegistry.id,
      }),
    };

    // Initialize workflows for direct access
    const launchpadWorkflowPackages: LaunchpadWorkflowPackages = {
      accountProtocolPackageId: this.packages.accountProtocol,
      accountActionsPackageId: this.packages.accountActions,
      futarchyCorePackageId: this.packages.futarchyCore,
      futarchyTypesPackageId: this.packages.futarchyTypes,
      futarchyFactoryPackageId: this.packages.futarchyFactory,
      futarchyActionsPackageId: this.packages.futarchyActions,
      futarchyGovernancePackageId: this.packages.futarchyGovernance,
      futarchyGovernanceActionsPackageId: this.packages.futarchyGovernanceActions,
      futarchyOracleActionsPackageId: this.packages.futarchyOracleActions,
      futarchyMarketsCorePackageId: this.packages.futarchyMarketsCore,
      packageRegistryId: this.sharedObjects.packageRegistry.id,
      oneShotUtilsPackageId: this.packages.oneShotUtils,
    };

    const launchpadWorkflowSharedObjects: LaunchpadWorkflowSharedObjects = {
      factoryId: this.sharedObjects.factory.id,
      factorySharedVersion: this.sharedObjects.factory.version,
      packageRegistryId: this.sharedObjects.packageRegistry.id,
      packageRegistrySharedVersion: this.sharedObjects.packageRegistry.version,
      feeManagerId: this.sharedObjects.feeManager.id,
      feeManagerSharedVersion: this.sharedObjects.feeManager.version,
    };

    const proposalWorkflowPackages: ProposalWorkflowPackages = {
      accountProtocolPackageId: this.packages.accountProtocol,
      accountActionsPackageId: this.packages.accountActions,
      futarchyCorePackageId: this.packages.futarchyCore,
      futarchyTypesPackageId: this.packages.futarchyTypes,
      futarchyFactoryPackageId: this.packages.futarchyFactory,
      futarchyActionsPackageId: this.packages.futarchyActions,
      futarchyGovernancePackageId: this.packages.futarchyGovernance,
      futarchyGovernanceActionsPackageId: this.packages.futarchyGovernanceActions,
      futarchyOracleActionsPackageId: this.packages.futarchyOracleActions,
      futarchyMarketsCorePackageId: this.packages.futarchyMarketsCore,
      futarchyMarketsPrimitivesPackageId: this.packages.futarchyMarketsPrimitives,
      futarchyMarketsOperationsPackageId: this.packages.futarchyMarketsOperations,
      packageRegistryId: this.sharedObjects.packageRegistry.id,
      oneShotUtilsPackageId: this.packages.oneShotUtils,
    };

    const proposalWorkflowSharedObjects: ProposalWorkflowSharedObjects = {
      packageRegistryId: this.sharedObjects.packageRegistry.id,
      packageRegistrySharedVersion: this.sharedObjects.packageRegistry.version,
    };

    this.workflows = {
      launchpad: new LaunchpadWorkflow(this.client, launchpadWorkflowPackages, launchpadWorkflowSharedObjects),
      proposal: new ProposalWorkflow(this.client, proposalWorkflowPackages, proposalWorkflowSharedObjects),
    };

    // Backwards-compatible aliases
    this.factoryAdmin = this.admin.factory;
    this.feeManager = new FeeManagerServiceExtended(params);
  }

  // ========================================================================
  // TOP-LEVEL QUERIES
  // ========================================================================

  async getRaises(): Promise<any[]> {
    return this.launchpad.getAll();
  }

  async getDaos(): Promise<any[]> {
    const factoryPackageId = this.deployments.getPackageId('futarchy_factory')!;
    return this.dao.getAll(factoryPackageId);
  }

  async getProposals(): Promise<any[]> {
    return this.proposal.getAll();
  }

  // ========================================================================
  // HELPERS
  // ========================================================================

  getPackageId(packageName: string): string | undefined {
    return this.deployments.getPackageId(packageName);
  }

  getAllPackageIds(): Record<string, string> {
    return this.deployments.getAllPackageIds();
  }

  /**
   * Create an AutoExecutor instance for executing actions via backend API
   *
   * @example
   * ```typescript
   * const autoExecutor = sdk.createAutoExecutor('http://localhost:9090');
   *
   * // Execute launchpad init actions
   * const { transaction } = await autoExecutor.executeLaunchpad(raiseId, { accountId });
   *
   * // Execute proposal winning outcome actions
   * const { transaction } = await autoExecutor.executeProposal(proposalId, { accountId });
   * ```
   *
   * @param backendUrl - The backend API base URL (e.g., 'http://localhost:9090')
   * @returns AutoExecutor instance configured with SDK packages
   */
  createAutoExecutor(backendUrl: string): AutoExecutor {
    return new AutoExecutor(this.client, {
      backendUrl,
      packages: {
        accountProtocolPackageId: this.packages.accountProtocol,
        accountActionsPackageId: this.packages.accountActions,
        futarchyCorePackageId: this.packages.futarchyCore,
        futarchyActionsPackageId: this.packages.futarchyActions,
        futarchyFactoryPackageId: this.packages.futarchyFactory,
        futarchyGovernancePackageId: this.packages.futarchyGovernance,
        futarchyGovernanceActionsPackageId: this.packages.futarchyGovernanceActions,
        futarchyOracleActionsPackageId: this.packages.futarchyOracleActions,
        futarchyMarketsCorePackageId: this.packages.futarchyMarketsCore,
        packageRegistryId: this.sharedObjects.packageRegistry.id,
      },
    });
  }
}

/**
 * Extended FeeManagerService with admin operations for backwards compatibility
 */
class FeeManagerServiceExtended extends FeeManagerService {
  private _packages: Packages;
  private _sharedObjects: SharedObjects;

  constructor(params: { client: SuiClient; packages: Packages; sharedObjects: SharedObjects }) {
    super(params);
    this._packages = params.packages;
    this._sharedObjects = params.sharedObjects;
  }

  /**
   * Add coin fee configuration (admin operation)
   */
  addCoinFeeConfig(
    config: {
      coinType: string;
      decimals: number;
      daoCreationFee: bigint;
      proposalFeePerOutcome: bigint;
    },
    feeAdminCapId: string,
    clock: string = '0x6'
  ): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this._packages.futarchyMarketsCore}::fee::add_coin_fee_config_entry`,
      typeArguments: [config.coinType],
      arguments: [
        tx.object(this._sharedObjects.feeManager.id),
        tx.object(feeAdminCapId),
        tx.pure.u8(config.decimals),
        tx.pure.u64(config.daoCreationFee),
        tx.pure.u64(config.proposalFeePerOutcome),
        tx.object(clock),
      ],
    });

    return tx;
  }
}
