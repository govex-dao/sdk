import { Transaction } from "@mysten/sui/transactions";
import { SuiClient } from "@mysten/sui/client";
import { BaseTransactionBuilder, TransactionUtils, QueryHelper } from "../utils";
import { AllowedStableType } from "@/types";

/**
 * Factory admin operations requiring FactoryOwnerCap
 * These are privileged operations for managing the Factory
 */
export class FactoryService {
    private client: SuiClient;
    private factoryPackageId: string;
    private factoryObjectId: string;
    private factoryInitialSharedVersion: number;
    private packageRegistryId: string;

    constructor(
        client: SuiClient,
        factoryPackageId: string,
        factoryObjectId: string,
        factoryInitialSharedVersion: number,
        packageRegistryId: string
    ) {
        this.client = client;
        this.factoryPackageId = factoryPackageId;
        this.factoryObjectId = factoryObjectId;
        this.factoryInitialSharedVersion = factoryInitialSharedVersion;
        this.packageRegistryId = packageRegistryId;
    }

    /**
     * Toggle factory pause state (reversible)
     * When paused, no new DAOs can be created
     *
     * @param factoryOwnerCapId - FactoryOwnerCap object ID
     * @returns Transaction for toggling pause
     *
     * @example
     * ```typescript
     * // Pause the factory
     * const tx = adminOps.togglePause(ownerCapId);
     * // To unpause, call again
     * ```
     */
    togglePause(factoryOwnerCapId: string): Transaction {
        const builder = new BaseTransactionBuilder(this.client);
        const tx = builder.getTransaction();

        const target = TransactionUtils.buildTarget(
            this.factoryPackageId,
            "factory",
            "toggle_pause"
        );

        tx.moveCall({
            target,
            arguments: [
                tx.sharedObjectRef({
                    objectId: this.factoryObjectId,
                    initialSharedVersion: this.factoryInitialSharedVersion,
                    mutable: true,
                }), // factory
                tx.object(factoryOwnerCapId), // cap
            ],
        });

        return tx;
    }

    /**
     * PERMANENTLY disable the factory (IRREVERSIBLE!)
     * This action cannot be undone. The factory will never accept new DAOs again.
     *
     * @param factoryOwnerCapId - FactoryOwnerCap object ID
     * @param clock - Clock object ID
     * @returns Transaction for permanent disable
     *
     * @example
     * ```typescript
     * // WARNING: This is permanent and cannot be undone!
     * const tx = adminOps.disablePermanently(ownerCapId);
     * ```
     */
    disablePermanently(
        factoryOwnerCapId: string,
        clock: string = "0x6"
    ): Transaction {
        const builder = new BaseTransactionBuilder(this.client);
        const tx = builder.getTransaction();

        const target = TransactionUtils.buildTarget(
            this.factoryPackageId,
            "factory",
            "disable_permanently"
        );

        tx.moveCall({
            target,
            arguments: [
                tx.sharedObjectRef({
                    objectId: this.factoryObjectId,
                    initialSharedVersion: this.factoryInitialSharedVersion,
                    mutable: true,
                }), // factory
                tx.object(factoryOwnerCapId), // cap
                tx.object(clock), // clock
            ],
        });

        return tx;
    }

    /**
     * Add a stable coin type to the factory allowlist
     * Once added, DAOs can use this coin as their stable coin
     *
     * @param stableCoinType - Full type path for stable coin (e.g., "0x2::sui::SUI")
     * @param factoryOwnerCapId - FactoryOwnerCap object ID
     * @param clock - Clock object ID
     * @returns Transaction for adding stable type
     *
     * @example
     * ```typescript
     * const tx = adminOps.addAllowedStableType(
     *   "0x2::sui::SUI",
     *   ownerCapId
     * );
     * ```
     */
    addAllowedStableType(
        stableCoinType: string,
        factoryOwnerCapId: string,
        clock: string = "0x6"
    ): Transaction {
        const builder = new BaseTransactionBuilder(this.client);
        const tx = builder.getTransaction();

        const target = TransactionUtils.buildTarget(
            this.factoryPackageId,
            "factory",
            "add_allowed_stable_type"
        );

        tx.moveCall({
            target,
            typeArguments: [stableCoinType],
            arguments: [
                tx.sharedObjectRef({
                    objectId: this.factoryObjectId,
                    initialSharedVersion: this.factoryInitialSharedVersion,
                    mutable: true,
                }), // factory
                tx.object(factoryOwnerCapId), // owner_cap
                tx.object(clock), // clock
            ],
        });

        return tx;
    }

    /**
     * Remove a stable coin type from the factory allowlist
     * Existing DAOs using this stable coin are unaffected
     *
     * @param stableCoinType - Full type path for stable coin to remove
     * @param factoryOwnerCapId - FactoryOwnerCap object ID
     * @param clock - Clock object ID
     * @returns Transaction for removing stable type
     *
     * @example
     * ```typescript
     * const tx = adminOps.removeAllowedStableType(
     *   "0xOLD::usdc::USDC",
     *   ownerCapId
     * );
     * ```
     */
    removeAllowedStableType(
        stableCoinType: string,
        factoryOwnerCapId: string,
        clock: string = "0x6"
    ): Transaction {
        const builder = new BaseTransactionBuilder(this.client);
        const tx = builder.getTransaction();

        const target = TransactionUtils.buildTarget(
            this.factoryPackageId,
            "factory",
            "remove_allowed_stable_type"
        );

        tx.moveCall({
            target,
            typeArguments: [stableCoinType],
            arguments: [
                tx.sharedObjectRef({
                    objectId: this.factoryObjectId,
                    initialSharedVersion: this.factoryInitialSharedVersion,
                    mutable: true,
                }), // factory
                tx.object(factoryOwnerCapId), // owner_cap
                tx.object(clock), // clock
            ],
        });

        return tx;
    }

    /**
     * Update launchpad fee configuration
     *
     * @param config - New fee configuration
     * @param factoryOwnerCapId - FactoryOwnerCap object ID
     * @param clock - Clock object ID
     * @returns Transaction for updating fees
     *
     * @example
     * ```typescript
     * const tx = adminOps.updateLaunchpadFees({
     *   bidFee: TransactionUtils.suiToMist(0.1),        // 0.1 SUI per contribution
     *   crankerReward: TransactionUtils.suiToMist(0.05), // 0.05 SUI per batch claim
     *   settlementReward: TransactionUtils.suiToMist(0.05) // 0.05 SUI for settlement
     * }, ownerCapId);
     * ```
     */
    updateLaunchpadFees(
        config: {
            bidFee: bigint | number;
            crankerReward: bigint | number;
            settlementReward: bigint | number;
        },
        factoryOwnerCapId: string,
        clock: string = "0x6"
    ): Transaction {
        const builder = new BaseTransactionBuilder(this.client);
        const tx = builder.getTransaction();

        const target = TransactionUtils.buildTarget(
            this.factoryPackageId,
            "factory",
            "update_launchpad_fees"
        );

        tx.moveCall({
            target,
            arguments: [
                tx.sharedObjectRef({
                    objectId: this.factoryObjectId,
                    initialSharedVersion: this.factoryInitialSharedVersion,
                    mutable: true,
                }), // factory
                tx.object(factoryOwnerCapId), // owner_cap
                tx.pure.u64(config.bidFee), // new_bid_fee
                tx.pure.u64(config.crankerReward), // new_cranker_reward
                tx.pure.u64(config.settlementReward), // new_settlement_reward
                tx.object(clock), // clock
            ],
        });

        return tx;
    }

    /**
     * Burn the FactoryOwnerCap (renounce ownership)
     * WARNING: This cannot be undone! The factory will become unmanageable.
     *
     * @param factoryOwnerCapId - FactoryOwnerCap object ID to burn
     * @returns Transaction for burning the cap
     *
     * @example
     * ```typescript
     * // WARNING: This makes the factory permanently unmanageable!
     * const tx = adminOps.burnFactoryOwnerCap(ownerCapId);
     * ```
     */
    burnFactoryOwnerCap(factoryOwnerCapId: string): Transaction {
        const builder = new BaseTransactionBuilder(this.client);
        const tx = builder.getTransaction();

        const target = TransactionUtils.buildTarget(
            this.factoryPackageId,
            "factory",
            "burn_factory_owner_cap"
        );

        tx.moveCall({
            target,
            arguments: [
                tx.sharedObjectRef({
                    objectId: this.factoryObjectId,
                    initialSharedVersion: this.factoryInitialSharedVersion,
                    mutable: false,
                }), // factory (immutable for cap burn)
                tx.object(factoryOwnerCapId), // cap (consumed)
            ],
        });

        return tx;
    }


    /**
     * Borrow CoinMetadata from DAO Account
     */
    borrowCoinMetadata(
        accountId: string,
        coinType: string
    ): Transaction {
        const builder = new BaseTransactionBuilder(this.client);
        const tx = builder.getTransaction();

        tx.moveCall({
            target: TransactionUtils.buildTarget(
                this.factoryPackageId,
                'factory',
                'borrow_coin_metadata'
            ),
            typeArguments: [coinType],
            arguments: [
                tx.object(accountId),
                tx.object(this.packageRegistryId),
            ],
        });

        return tx;
    }

    // ============================================================================
    // QUERIES
    // ============================================================================

    /**
     * Get total DAO count
     */
    async getDaoCount(): Promise<number> {
        const factory = await this.client.getObject({
            id: this.factoryObjectId,
            options: { showContent: true },
        });

        if (!factory.data?.content || factory.data.content.dataType !== 'moveObject') {
            throw new Error('Factory not found');
        }

        const fields = factory.data.content.fields as any;
        return Number(fields.dao_count || 0);
    }

    /**
     * Check if factory is paused
     */
    async isPaused(): Promise<boolean> {
        const factory = await this.client.getObject({
            id: this.factoryObjectId,
            options: { showContent: true },
        });

        if (!factory.data?.content || factory.data.content.dataType !== 'moveObject') {
            throw new Error('Factory not found');
        }

        const fields = factory.data.content.fields as any;
        return fields.is_paused === true;
    }

    /**
     * Check if factory is permanently disabled
     */
    async isPermanentlyDisabled(): Promise<boolean> {
        const factory = await this.client.getObject({
            id: this.factoryObjectId,
            options: { showContent: true },
        });

        if (!factory.data?.content || factory.data.content.dataType !== 'moveObject') {
            throw new Error('Factory not found');
        }

        const fields = factory.data.content.fields as any;
        return fields.permanently_disabled === true;
    }

    /**
     * Check if a stable type is allowed
     */
    async isStableTypeAllowed(stableType: string): Promise<boolean> {
        const factory = await this.client.getObject({
            id: this.factoryObjectId,
            options: { showContent: true },
        });

        if (!factory.data?.content || factory.data.content.dataType !== 'moveObject') {
            throw new Error('Factory not found');
        }

        const fields = factory.data.content.fields as any;
        const allowedTypes = fields.allowed_stable_types?.fields?.contents || [];

        return allowedTypes.some((entry: any) => {
            const typeName = entry.fields?.key?.fields?.name;
            return typeName === stableType;
        });
    }

    /**
     * Get all allowed stable types with TreasuryCap info
     */
    async getAllowedStableTypes(): Promise<AllowedStableType[]> {
        const factory = await this.client.getObject({
            id: this.factoryObjectId,
            options: { showContent: true },
        });

        if (!factory.data?.content || factory.data.content.dataType !== 'moveObject') {
            throw new Error('Factory not found');
        }

        const fields = factory.data.content.fields as any;
        const allowedTypes = fields.allowed_stable_types?.fields?.contents || [];

        const queryHelper = new QueryHelper(this.client);
        const stableTypes: AllowedStableType[] = [];

        for (const entry of allowedTypes) {
            const typeName = entry.fields?.name || '';
            if (!typeName) continue;

            const packageId = '0x' + typeName.split('::')[0];
            const treasuryCapInfo = await queryHelper.findTreasuryCap('0x' + typeName);

            stableTypes.push({
                type: typeName,
                packageId,
                treasuryCapId: treasuryCapInfo?.objectId,
                isSharedTreasuryCap: !!treasuryCapInfo?.isShared,
            });
        }

        return stableTypes;
    }

    /**
     * Get launchpad bid fee
     */
    async getLaunchpadBidFee(): Promise<bigint> {
        const factory = await this.client.getObject({
            id: this.factoryObjectId,
            options: { showContent: true },
        });

        if (!factory.data?.content || factory.data.content.dataType !== 'moveObject') {
            throw new Error('Factory not found');
        }

        const fields = factory.data.content.fields as any;
        return BigInt(fields.launchpad_bid_fee || 0);
    }

    /**
     * Get launchpad cranker reward
     */
    async getLaunchpadCrankerReward(): Promise<bigint> {
        const factory = await this.client.getObject({
            id: this.factoryObjectId,
            options: { showContent: true },
        });

        if (!factory.data?.content || factory.data.content.dataType !== 'moveObject') {
            throw new Error('Factory not found');
        }

        const fields = factory.data.content.fields as any;
        return BigInt(fields.launchpad_cranker_reward || 0);
    }

    /**
     * Get launchpad settlement reward
     */
    async getLaunchpadSettlementReward(): Promise<bigint> {
        const factory = await this.client.getObject({
            id: this.factoryObjectId,
            options: { showContent: true },
        });

        if (!factory.data?.content || factory.data.content.dataType !== 'moveObject') {
            throw new Error('Factory not found');
        }

        const fields = factory.data.content.fields as any;
        return BigInt(fields.launchpad_settlement_reward || 0);
    }
}
