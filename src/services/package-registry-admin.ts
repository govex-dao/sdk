import { Transaction } from "@mysten/sui/transactions";
import { SuiClient } from "@mysten/sui/client";
import { BaseTransactionBuilder, TransactionUtils } from "./transaction";

/**
 * Package Registry admin operations requiring PackageAdminCap
 * These are privileged operations for managing the PackageRegistry and account creation
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
     * Pause account creation system-wide
     * When paused, ALL account creation (factory and direct) is blocked
     *
     * @param packageAdminCapId - PackageAdminCap object ID
     * @returns Transaction for pausing account creation
     *
     * @example
     * ```typescript
     * // Pause all account creation
     * const tx = registryOps.pauseAccountCreation(adminCapId);
     * ```
     */
    pauseAccountCreation(packageAdminCapId: string): Transaction {
        const builder = new BaseTransactionBuilder(this.client);
        const tx = builder.getTransaction();

        const target = TransactionUtils.buildTarget(
            this.protocolPackageId,
            "package_registry",
            "pause_account_creation"
        );

        tx.moveCall({
            target,
            arguments: [
                tx.sharedObjectRef({
                    objectId: this.registryObjectId,
                    initialSharedVersion: this.registryInitialSharedVersion,
                    mutable: true,
                }), // registry
                tx.object(packageAdminCapId), // cap
            ],
        });

        return tx;
    }

    /**
     * Unpause account creation system-wide
     * Re-enables account creation after it was paused
     *
     * @param packageAdminCapId - PackageAdminCap object ID
     * @returns Transaction for unpausing account creation
     *
     * @example
     * ```typescript
     * // Re-enable account creation
     * const tx = registryOps.unpauseAccountCreation(adminCapId);
     * ```
     */
    unpauseAccountCreation(packageAdminCapId: string): Transaction {
        const builder = new BaseTransactionBuilder(this.client);
        const tx = builder.getTransaction();

        const target = TransactionUtils.buildTarget(
            this.protocolPackageId,
            "package_registry",
            "unpause_account_creation"
        );

        tx.moveCall({
            target,
            arguments: [
                tx.sharedObjectRef({
                    objectId: this.registryObjectId,
                    initialSharedVersion: this.registryInitialSharedVersion,
                    mutable: true,
                }), // registry
                tx.object(packageAdminCapId), // cap
            ],
        });

        return tx;
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

    // ============================================================================
    // FEE MANAGEMENT
    // ============================================================================

    /**
     * Set account creation fee configuration
     * Fees are collected into a treasury and can be withdrawn later
     *
     * @param packageAdminCapId - PackageAdminCap object ID
     * @param feeAmount - Fee amount in MIST (0 = disabled)
     * @param feeRecipient - Address stored for reference (fees go to treasury)
     * @returns Transaction for setting fee
     *
     * @example
     * ```typescript
     * // Set 0.1 SUI fee
     * const tx = registryOps.setAccountCreationFee(
     *   adminCapId,
     *   100_000_000n, // 0.1 SUI in MIST
     *   "0xTREASURY..."
     * );
     * ```
     */
    setAccountCreationFee(
        packageAdminCapId: string,
        feeAmount: bigint,
        feeRecipient: string
    ): Transaction {
        const builder = new BaseTransactionBuilder(this.client);
        const tx = builder.getTransaction();

        const target = TransactionUtils.buildTarget(
            this.protocolPackageId,
            "package_registry",
            "set_account_creation_fee"
        );

        tx.moveCall({
            target,
            arguments: [
                tx.sharedObjectRef({
                    objectId: this.registryObjectId,
                    initialSharedVersion: this.registryInitialSharedVersion,
                    mutable: true,
                }),
                tx.object(packageAdminCapId),
                tx.pure.u64(feeAmount),
                tx.pure.address(feeRecipient),
            ],
        });

        return tx;
    }

    /**
     * Add a package to the fee-exempt list
     * Exempt packages can create accounts without paying fees
     * Use this to whitelist your own factory/launchpad packages
     *
     * @param packageAdminCapId - PackageAdminCap object ID
     * @param packageAddr - Package address to exempt
     * @returns Transaction for adding fee exemption
     *
     * @example
     * ```typescript
     * // Exempt your factory from fees
     * const tx = registryOps.addFeeExemptPackage(adminCapId, factoryPackageId);
     * ```
     */
    addFeeExemptPackage(
        packageAdminCapId: string,
        packageAddr: string
    ): Transaction {
        const builder = new BaseTransactionBuilder(this.client);
        const tx = builder.getTransaction();

        const target = TransactionUtils.buildTarget(
            this.protocolPackageId,
            "package_registry",
            "add_fee_exempt_package"
        );

        tx.moveCall({
            target,
            arguments: [
                tx.sharedObjectRef({
                    objectId: this.registryObjectId,
                    initialSharedVersion: this.registryInitialSharedVersion,
                    mutable: true,
                }),
                tx.object(packageAdminCapId),
                tx.pure.address(packageAddr),
            ],
        });

        return tx;
    }

    /**
     * Remove a package from the fee-exempt list
     *
     * @param packageAdminCapId - PackageAdminCap object ID
     * @param packageAddr - Package address to remove from exempt list
     * @returns Transaction for removing fee exemption
     *
     * @example
     * ```typescript
     * // Remove exemption (package will pay fees)
     * const tx = registryOps.removeFeeExemptPackage(adminCapId, packageAddr);
     * ```
     */
    removeFeeExemptPackage(
        packageAdminCapId: string,
        packageAddr: string
    ): Transaction {
        const builder = new BaseTransactionBuilder(this.client);
        const tx = builder.getTransaction();

        const target = TransactionUtils.buildTarget(
            this.protocolPackageId,
            "package_registry",
            "remove_fee_exempt_package"
        );

        tx.moveCall({
            target,
            arguments: [
                tx.sharedObjectRef({
                    objectId: this.registryObjectId,
                    initialSharedVersion: this.registryInitialSharedVersion,
                    mutable: true,
                }),
                tx.object(packageAdminCapId),
                tx.pure.address(packageAddr),
            ],
        });

        return tx;
    }

    // ============================================================================
    // SPONSORSHIP AUTHORIZATION
    // ============================================================================

    /**
     * Add a package to the sponsorship-authorized list
     * Authorized packages can create SponsorshipAuth for proposal sponsorship
     * Use this to authorize futarchy_governance to sponsor proposals
     *
     * @param packageAdminCapId - PackageAdminCap object ID
     * @param packageAddr - Package address to authorize
     * @returns Transaction for adding sponsorship authorization
     *
     * @example
     * ```typescript
     * // Authorize futarchy_governance for sponsorship
     * const tx = registryOps.addSponsorshipAuthorizedPackage(adminCapId, governancePackageId);
     * ```
     */
    addSponsorshipAuthorizedPackage(
        packageAdminCapId: string,
        packageAddr: string
    ): Transaction {
        const builder = new BaseTransactionBuilder(this.client);
        const tx = builder.getTransaction();

        const target = TransactionUtils.buildTarget(
            this.protocolPackageId,
            "package_registry",
            "add_sponsorship_authorized_package"
        );

        tx.moveCall({
            target,
            arguments: [
                tx.sharedObjectRef({
                    objectId: this.registryObjectId,
                    initialSharedVersion: this.registryInitialSharedVersion,
                    mutable: true,
                }),
                tx.object(packageAdminCapId),
                tx.pure.address(packageAddr),
            ],
        });

        return tx;
    }

    /**
     * Remove a package from the sponsorship-authorized list
     *
     * @param packageAdminCapId - PackageAdminCap object ID
     * @param packageAddr - Package address to remove from authorized list
     * @returns Transaction for removing sponsorship authorization
     *
     * @example
     * ```typescript
     * // Remove sponsorship authorization
     * const tx = registryOps.removeSponsorshipAuthorizedPackage(adminCapId, packageAddr);
     * ```
     */
    removeSponsorshipAuthorizedPackage(
        packageAdminCapId: string,
        packageAddr: string
    ): Transaction {
        const builder = new BaseTransactionBuilder(this.client);
        const tx = builder.getTransaction();

        const target = TransactionUtils.buildTarget(
            this.protocolPackageId,
            "package_registry",
            "remove_sponsorship_authorized_package"
        );

        tx.moveCall({
            target,
            arguments: [
                tx.sharedObjectRef({
                    objectId: this.registryObjectId,
                    initialSharedVersion: this.registryInitialSharedVersion,
                    mutable: true,
                }),
                tx.object(packageAdminCapId),
                tx.pure.address(packageAddr),
            ],
        });

        return tx;
    }

    // ============================================================================
    // FEE WITHDRAWAL
    // ============================================================================

    /**
     * Withdraw fees from the treasury
     * Returns Coin<SUI> to the caller's address
     *
     * @param packageAdminCapId - PackageAdminCap object ID
     * @param amount - Amount to withdraw in MIST
     * @param recipientAddress - Address to receive the withdrawn coins
     * @returns Transaction for withdrawing fees
     *
     * @example
     * ```typescript
     * // Withdraw 1 SUI worth of fees to DAO treasury
     * const tx = registryOps.withdrawFees(
     *   adminCapId,
     *   1_000_000_000n, // 1 SUI in MIST
     *   daoTreasuryAddress
     * );
     * ```
     */
    withdrawFees(
        packageAdminCapId: string,
        amount: bigint,
        recipientAddress: string
    ): Transaction {
        const builder = new BaseTransactionBuilder(this.client);
        const tx = builder.getTransaction();

        const target = TransactionUtils.buildTarget(
            this.protocolPackageId,
            "package_registry",
            "withdraw_fees"
        );

        // Call withdraw_fees which returns Coin<SUI>
        const coin = tx.moveCall({
            target,
            arguments: [
                tx.sharedObjectRef({
                    objectId: this.registryObjectId,
                    initialSharedVersion: this.registryInitialSharedVersion,
                    mutable: true,
                }),
                tx.object(packageAdminCapId),
                tx.pure.u64(amount),
            ],
        });

        // Transfer the coin to recipient
        tx.transferObjects([coin], recipientAddress);

        return tx;
    }
}
