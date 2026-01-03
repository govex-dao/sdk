import { Transaction } from "@mysten/sui/transactions";
import { SuiClient } from "@mysten/sui/client";
import { BaseTransactionBuilder, TransactionUtils } from "./transaction";

/**
 * Package Registry admin operations requiring PackageAdminCap
 * These are privileged operations for managing the PackageRegistry
 */
export class PackageRegistryAdminOperations {
    private client: SuiClient;
    private protocolPackageId: string;
    private registryObjectId: string;
    private registryInitialSharedVersion: number;

    constructor(
        client: SuiClient,
        protocolPackageId: string,
        registryObjectId: string,
        registryInitialSharedVersion: number
    ) {
        this.client = client;
        this.protocolPackageId = protocolPackageId;
        this.registryObjectId = registryObjectId;
        this.registryInitialSharedVersion = registryInitialSharedVersion;
    }

    /**
     * Add a new package to the registry
     *
     * @param config - Package configuration
     * @returns Transaction for adding package
     *
     * @example
     * ```typescript
     * const tx = registryOps.addPackage({
     *   name: "my_package",
     *   addr: "0xABC...",
     *   version: 1,
     *   actionTypes: ["my_package::actions::MyAction"],
     *   category: "defi",
     *   description: "My awesome package"
     * });
     * ```
     */
    addPackage(config: {
        name: string;
        addr: string;
        version: number;
        actionTypes: string[];
        category: string;
        description: string;
    }): Transaction {
        const builder = new BaseTransactionBuilder(this.client);
        const tx = builder.getTransaction();

        const target = TransactionUtils.buildTarget(
            this.protocolPackageId,
            "package_registry",
            "add_package"
        );

        tx.moveCall({
            target,
            arguments: [
                tx.sharedObjectRef({
                    objectId: this.registryObjectId,
                    initialSharedVersion: this.registryInitialSharedVersion,
                    mutable: true,
                }), // registry
                tx.pure.string(config.name),
                tx.pure.address(config.addr),
                tx.pure.u64(config.version),
                tx.pure.vector("string", config.actionTypes),
                tx.pure.string(config.category),
                tx.pure.string(config.description),
            ],
        });

        return tx;
    }

    /**
     * Remove a package from the registry
     *
     * @param packageName - Name of package to remove
     * @returns Transaction for removing package
     *
     * @example
     * ```typescript
     * const tx = registryOps.removePackage("old_package");
     * ```
     */
    removePackage(packageName: string): Transaction {
        const builder = new BaseTransactionBuilder(this.client);
        const tx = builder.getTransaction();

        const target = TransactionUtils.buildTarget(
            this.protocolPackageId,
            "package_registry",
            "remove_package"
        );

        tx.moveCall({
            target,
            arguments: [
                tx.sharedObjectRef({
                    objectId: this.registryObjectId,
                    initialSharedVersion: this.registryInitialSharedVersion,
                    mutable: true,
                }), // registry
                tx.pure.string(packageName),
            ],
        });

        return tx;
    }

    /**
     * Update package version
     *
     * @param config - Version update configuration
     * @returns Transaction for updating version
     *
     * @example
     * ```typescript
     * const tx = registryOps.updatePackageVersion({
     *   name: "my_package",
     *   addr: "0xNEW...",
     *   version: 2
     * });
     * ```
     */
    updatePackageVersion(config: {
        name: string;
        addr: string;
        version: number;
    }): Transaction {
        const builder = new BaseTransactionBuilder(this.client);
        const tx = builder.getTransaction();

        const target = TransactionUtils.buildTarget(
            this.protocolPackageId,
            "package_registry",
            "update_package_version"
        );

        tx.moveCall({
            target,
            arguments: [
                tx.sharedObjectRef({
                    objectId: this.registryObjectId,
                    initialSharedVersion: this.registryInitialSharedVersion,
                    mutable: true,
                }), // registry
                tx.pure.string(config.name),
                tx.pure.address(config.addr),
                tx.pure.u64(config.version),
            ],
        });

        return tx;
    }

    /**
     * Update package metadata
     *
     * @param config - Metadata update configuration
     * @returns Transaction for updating metadata
     *
     * @example
     * ```typescript
     * const tx = registryOps.updatePackageMetadata({
     *   name: "my_package",
     *   actionTypes: ["my_package::actions::NewAction"],
     *   category: "governance",
     *   description: "Updated description"
     * });
     * ```
     */
    updatePackageMetadata(config: {
        name: string;
        actionTypes: string[];
        category: string;
        description: string;
    }): Transaction {
        const builder = new BaseTransactionBuilder(this.client);
        const tx = builder.getTransaction();

        const target = TransactionUtils.buildTarget(
            this.protocolPackageId,
            "package_registry",
            "update_package_metadata"
        );

        tx.moveCall({
            target,
            arguments: [
                tx.sharedObjectRef({
                    objectId: this.registryObjectId,
                    initialSharedVersion: this.registryInitialSharedVersion,
                    mutable: true,
                }), // registry
                tx.pure.string(config.name),
                tx.pure.vector("string", config.actionTypes),
                tx.pure.string(config.category),
                tx.pure.string(config.description),
            ],
        });

        return tx;
    }

}
