import { SuiClient } from "@mysten/sui/client";
import { NetworkType, createNetworkConfig, NetworkConfig, DeploymentManager, getBundledDeployments, DeploymentConfig } from "./config";
import type { Packages, SharedObjects } from "@/types";

// Services (usable classes with SuiClient) - includes operations and workflows
import {
    // Operations
    DAOService,
    MarketService,
    LaunchpadService,
    ProposalService,
    AdminService,
    QueryHelper,
    BaseTransactionBuilder,
    IntentService,
    CurrencyUtils,
} from "./services";

/**
 * Main SDK class for interacting with Futarchy Protocol on Sui
 *
 * @example
 * ```typescript
 * import { FutarchySDK } from '@govex/futarchy-sdk';
 *
 * // Using bundled deployments (recommended for supported networks)
 * const sdk = new FutarchySDK({ network: 'devnet' });
 *
 * // Using custom deployments
 * const sdk = new FutarchySDK({
 *   network: 'devnet',
 *   deployments: customDeployments
 * });
 * ```
 */
export class FutarchySDK {
    // ========================================================================
    // Services
    // ========================================================================

    /**
     * DAO operations
     *
     * Sub-namespaces:
     * - oracle: Oracle grant operations
     * - vault: Vault operations
     */
    public dao: DAOService;

    /** Launchpad operations */
    public launchpad: LaunchpadService;

    /**
     * Proposal operations
     *
     * Sub-namespaces:
     * - sponsorship: Proposal sponsorship operations
     * - trade: Trade on proposal outcomes
     * - twap: TWAP price oracle
     * - escrow: Proposal escrow operations
     */
    public proposal: ProposalService;

    /**
     * Market operations
     *
     * Sub-namespaces:
     * - pool: Liquidity pool operations
     */
    public market: MarketService;

    /**
     * Admin operations (requires admin capabilities)
     *
     * Sub-namespaces:
     * - factory: Factory settings (pause, unpause, stable types)
     * - verification: Verification operations
     * - packageRegistry: Package registry admin
     * - feeManager: Fee configuration
     */
    public admin: AdminService;

    /**
     * Intent-related functionality including staging, execution, and queries. Primarily intended for internal use; users are generally discouraged from direct access.
     *
     * Sub-namespaces:
     * - executor: Intent executor for executing staged actions
     * - composer: Transaction composer for building complex PTBs
     * - staging: Action staging classes (stream, currency, vault, transfer, memo, accessControl, packageUpgrade, config, quota, liquidityInit, liquidityMarkers, liquidityConstructors, liquidityExecutors, liquidityGetters, dissolution, packageRegistry, protocolAdmin, oracle)
     * - execution: Action execution classes (vault, currency, transfer, memo, accessControl, packageUpgrade, packageUpgradeAuditable, daoConfig, daoDissolution, daoDissolutionOps, daoQuota, governanceIntents, intentJanitor, packageRegistry, protocolAdmin, oracle)
     * - oracleQueries: Oracle query operations
     * - vaultQueries: Vault query operations
     */
    public intents: IntentService;

    /**
     * Utility helpers
     *
     * Sub-namespaces:
     * - transactionBuilder: Transaction building utilities
     * - queryHelper: Query utilities
     * - currency: Currency formatting and queries
     */
    public utils: {
        transactionBuilder: BaseTransactionBuilder;
        queryHelper: QueryHelper;
        currency: CurrencyUtils;
    }

    // ========================================================================
    // UTILITIES
    // ========================================================================

    public client: SuiClient;
    public network: NetworkConfig;
    public deployments: DeploymentManager;

    public packages: Packages;
    public sharedObjects: SharedObjects;

    /**
     * Create a new FutarchySDK instance
     *
     * @param config - Configuration object
     * @param config.network - Network to connect to (devnet, testnet, mainnet, or custom URL)
     * @param config.deployments - Optional deployment configuration. If not provided, bundled deployments will be used.
     *
     */
    constructor(config: {
        network: NetworkType | string;
        deployments?: DeploymentConfig;
    }) {
        // Set up network and client
        const networkConfig = createNetworkConfig(config.network);

        // Resolve deployments: use provided or fall back to bundled
        const deploymentsConfig = config.deployments ?? getBundledDeployments(config.network);

        if (!deploymentsConfig) {
            throw new Error(
                `No deployments available for network "${config.network}". ` +
                `Either provide deployments in the config, or use a network with bundled deployments (devnet, testnet, mainnet).`
            );
        }

        // Set up deployment manager
        const deploymentManager = DeploymentManager.fromConfig(deploymentsConfig);

        this.client = networkConfig.client;
        this.network = networkConfig;
        this.deployments = deploymentManager;

        // Get shared objects from deployments
        const factoryObject = deploymentManager.getFactory();
        const packageRegistry = deploymentManager.getPackageRegistry();
        const marketsCoreDeployment = deploymentManager.getPackage("futarchy_markets_core");
        const feeManager = marketsCoreDeployment?.sharedObjects.find(
            (obj) => obj.name === "FeeManager"
        );

        if (!factoryObject || !packageRegistry || !feeManager) {
            throw new Error(
                "Missing required deployment objects. Ensure Factory, PackageRegistry, and FeeManager are deployed."
            );
        }

        // ====================================================================
        // Build unified Packages object
        // ====================================================================
        this.packages = {
            accountProtocol: deploymentManager.getPackageId("AccountProtocol")!,
            accountActions: deploymentManager.getPackageId("AccountActions")!,
            futarchyCore: deploymentManager.getPackageId("futarchy_core")!,
            futarchyTypes: deploymentManager.getPackageId("futarchy_types")!,
            futarchyFactory: deploymentManager.getPackageId("futarchy_factory")!,
            futarchyActions: deploymentManager.getPackageId("futarchy_actions")!,
            futarchyGovernance: deploymentManager.getPackageId("futarchy_governance")!,
            futarchyGovernanceActions: deploymentManager.getPackageId("futarchy_governance_actions")!,
            futarchyOracleActions: deploymentManager.getPackageId("futarchy_oracle_actions")!,
            futarchyMarketsCore: deploymentManager.getPackageId("futarchy_markets_core")!,
            futarchyMarketsPrimitives: deploymentManager.getPackageId("futarchy_markets_primitives")!,
            futarchyMarketsOperations: deploymentManager.getPackageId("futarchy_markets_operations")!,
            oneShotUtils: deploymentManager.getPackageId("futarchy_one_shot_utils"),
        };

        // ====================================================================
        // Build unified SharedObjects object
        // ====================================================================
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
        };

        // ====================================================================
        // Initialize Services (all receive the same packages & sharedObjects)
        // ====================================================================
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
    }

    // ========================================================================
    // TOP-LEVEL QUERIES
    // ========================================================================

    /**
     * Get all raises from events
     */
    async getRaises(): Promise<any[]> {
        return this.launchpad.getAll();
    }

    /**
     * Get all DAOs from factory events
     */
    async getDaos(): Promise<any[]> {
        const factoryPackageId = this.deployments.getPackageId("futarchy_factory")!;
        return this.dao.getAll(factoryPackageId);
    }

    /**
     * Get all proposals from events
     */
    async getProposals(): Promise<any[]> {
        return this.proposal.getAll();
    }

    // ========================================================================
    // HELPERS
    // ========================================================================

    /**
     * Get package ID for a specific package by name
     */
    getPackageId(packageName: string): string | undefined {
        return this.deployments.getPackageId(packageName);
    }

    /**
     * Get all package IDs
     */
    getAllPackageIds(): Record<string, string> {
        return this.deployments.getAllPackageIds();
    }
}
