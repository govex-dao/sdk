import { DeploymentConfig, PackageDeployment } from "../deployment";
import { NetworkType } from "../network";

// Import bundled deployment configs
import devnetDeployments from "../../../deployments/_all-packages.json";

/**
 * Map of network to bundled deployment configuration
 */
const bundledDeployments: Partial<Record<NetworkType, DeploymentConfig>> = {
    devnet: devnetDeployments as DeploymentConfig,
    // testnet: testnetDeployments,  // TODO: Add when available
    // mainnet: mainnetDeployments,  // TODO: Add when available
};

/**
 * Get bundled deployments for a network
 * @param network - The network type
 * @returns DeploymentConfig for the network, or undefined if not available
 */
export function getBundledDeployments(network: NetworkType | string): DeploymentConfig | undefined {
    if (network === "mainnet" || network === "testnet" || network === "devnet" || network === "localnet") {
        return bundledDeployments[network];
    }
    // Custom RPC URLs don't have bundled deployments
    return undefined;
}

/**
 * Check if bundled deployments are available for a network
 */
export function hasBundledDeployments(network: NetworkType | string): boolean {
    return getBundledDeployments(network) !== undefined;
}

/**
 * Deployment configuration manager
 * Loads and provides access to package deployment data
 */
export class DeploymentManager {
    private deployments: DeploymentConfig;

    constructor(deployments: DeploymentConfig) {
        this.deployments = deployments;
    }

    /**
     * Create DeploymentManager from deployment config object
     */
    static fromConfig(config: DeploymentConfig): DeploymentManager {
        return new DeploymentManager(config);
    }

    /**
     * Get deployment info for a specific package
     */
    getPackage(packageName: string): PackageDeployment | undefined {
        return this.deployments[packageName];
    }

    /**
     * Get package ID for a specific package
     */
    getPackageId(packageName: string): string | undefined {
        return this.deployments[packageName]?.packageId;
    }

    /**
     * Get all shared objects across all packages
     */
    getAllSharedObjects() {
        const shared: Array<{ package: string; object: any }> = [];
        for (const [pkg, deployment] of Object.entries(this.deployments)) {
            deployment.sharedObjects.forEach((obj) => {
                shared.push({ package: pkg, object: obj });
            });
        }
        return shared;
    }

    /**
     * Get all admin caps across all packages
     */
    getAllAdminCaps() {
        const caps: Array<{ package: string; cap: any }> = [];
        for (const [pkg, deployment] of Object.entries(this.deployments)) {
            deployment.adminCaps.forEach((cap) => {
                caps.push({ package: pkg, cap });
            });
        }
        return caps;
    }

    /**
     * Get Factory shared object from futarchy_factory package
     */
    getFactory() {
        const factory = this.getPackage("futarchy_factory");
        return factory?.sharedObjects.find(obj => obj.name === "Factory");
    }

    /**
     * Get PackageRegistry from AccountProtocol
     */
    getPackageRegistry() {
        const protocol = this.getPackage("AccountProtocol");
        return protocol?.sharedObjects.find(obj => obj.name === "PackageRegistry");
    }

    /**
     * Get PackageAdminCap from AccountProtocol
     * This cap controls account creation pause/unpause and package registry management
     */
    getPackageAdminCap() {
        const protocol = this.getPackage("AccountProtocol");
        return protocol?.adminCaps.find(cap => cap.name === "PackageAdminCap");
    }

    /**
     * Get FeeAdminCap from futarchy_markets_core
     *
     * IMPORTANT: This cap must be transferred to the protocol DAO account and registered
     * as a managed asset with key "protocol:fee_admin_cap" for governance actions to work.
     *
     * @returns FeeAdminCap object info or undefined if not found
     */
    getFeeAdminCap() {
        const marketsCore = this.getPackage("futarchy_markets_core");
        return marketsCore?.adminCaps.find(cap => cap.name === "FeeAdminCap");
    }

    /**
     * Get all package IDs as a map
     */
    getAllPackageIds(): Record<string, string> {
        const packageIds: Record<string, string> = {};
        for (const [name, deployment] of Object.entries(this.deployments)) {
            packageIds[name] = deployment.packageId;
        }
        return packageIds;
    }
}
