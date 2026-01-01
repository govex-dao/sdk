import { SuiClient } from "@mysten/sui/client";
import { extractFields, FactoryFields } from "../types";

/**
 * Factory operations for creating DAOs
 */
export class FactoryOperations {
    private client: SuiClient;
    private factoryObjectId: string;

    constructor(
        client: SuiClient,
        _factoryPackageId: string,  // Kept for API compatibility
        _futarchyTypesPackageId: string,  // Kept for API compatibility
        factoryObjectId: string,
        _factoryInitialSharedVersion: number,  // Kept for API compatibility
        _packageRegistryId: string,  // Kept for API compatibility
        _feeManagerId: string,  // Kept for API compatibility
        _feeManagerInitialSharedVersion: number  // Kept for API compatibility
    ) {
        this.client = client;
        this.factoryObjectId = factoryObjectId;
    }

    /**
     * View: Get total DAO count
     */
    async getDaoCount(): Promise<number> {
        const factory = await this.client.getObject({
            id: this.factoryObjectId,
            options: { showContent: true },
        });

        const fields = extractFields<FactoryFields>(factory);
        if (!fields) {
            throw new Error('Factory not found');
        }

        return Number(fields.dao_count || 0);
    }

    /**
     * View: Check if factory is paused
     */
    async isPaused(): Promise<boolean> {
        const factory = await this.client.getObject({
            id: this.factoryObjectId,
            options: { showContent: true },
        });

        const fields = extractFields<FactoryFields>(factory);
        if (!fields) {
            throw new Error('Factory not found');
        }

        return fields.is_paused === true;
    }

    /**
     * View: Check if factory is permanently disabled
     */
    async isPermanentlyDisabled(): Promise<boolean> {
        const factory = await this.client.getObject({
            id: this.factoryObjectId,
            options: { showContent: true },
        });

        const fields = extractFields<FactoryFields>(factory);
        if (!fields) {
            throw new Error('Factory not found');
        }

        return fields.permanently_disabled === true;
    }

    /**
     * View: Check if a stable type is allowed
     */
    async isStableTypeAllowed(stableType: string): Promise<boolean> {
        const factory = await this.client.getObject({
            id: this.factoryObjectId,
            options: { showContent: true },
        });

        const fields = extractFields<FactoryFields>(factory);
        if (!fields) {
            throw new Error('Factory not found');
        }

        const allowedTypes = fields.allowed_stable_types || [];
        return allowedTypes.includes(stableType);
    }

    /**
     * View: Get launchpad bid fee
     */
    async getLaunchpadBidFee(): Promise<bigint> {
        const factory = await this.client.getObject({
            id: this.factoryObjectId,
            options: { showContent: true },
        });

        const fields = extractFields<FactoryFields>(factory);
        if (!fields) {
            throw new Error('Factory not found');
        }

        return BigInt(fields.launchpad_bid_fee || 0);
    }

    /**
     * View: Get launchpad cranker reward
     */
    async getLaunchpadCrankerReward(): Promise<bigint> {
        const factory = await this.client.getObject({
            id: this.factoryObjectId,
            options: { showContent: true },
        });

        const fields = extractFields<FactoryFields>(factory);
        if (!fields) {
            throw new Error('Factory not found');
        }

        return BigInt(fields.launchpad_cranker_reward || 0);
    }

    /**
     * View: Get launchpad settlement reward
     */
    async getLaunchpadSettlementReward(): Promise<bigint> {
        const factory = await this.client.getObject({
            id: this.factoryObjectId,
            options: { showContent: true },
        });

        const fields = extractFields<FactoryFields>(factory);
        if (!fields) {
            throw new Error('Factory not found');
        }

        return BigInt(fields.launchpad_settlement_reward || 0);
    }
}
