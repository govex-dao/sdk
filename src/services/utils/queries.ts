import { SuiClient, SuiObjectResponse, SuiEventFilter } from "@mysten/sui/client";

/**
 * Info about a TreasuryCap for a coin type
 */
export interface TreasuryCapInfo {
    /** TreasuryCap object ID */
    objectId: string;
    /** Full coin type (e.g., "0xabc::coin::COIN") */
    coinType: string;
    /** Whether the TreasuryCap is shared (allows public minting) */
    isShared: boolean;
}

/**
 * Query utilities for reading on-chain data
 * Generic utilities that are not specific to any service
 */
export class QueryHelper {
    private client: SuiClient;

    constructor(client: SuiClient) {
        this.client = client;
    }

    /**
     * Get an object with full content
     */
    async getObject(objectId: string): Promise<SuiObjectResponse> {
        return this.client.getObject({
            id: objectId,
            options: {
                showContent: true,
                showOwner: true,
                showType: true,
                showDisplay: true,
            },
        });
    }

    /**
     * Get multiple objects
     */
    async getObjects(objectIds: string[]): Promise<SuiObjectResponse[]> {
        return this.client.multiGetObjects({
            ids: objectIds,
            options: {
                showContent: true,
                showOwner: true,
                showType: true,
            },
        });
    }

    /**
     * Get objects owned by an address
     */
    async getOwnedObjects(address: string, filter?: { StructType: string }) {
        return this.client.getOwnedObjects({
            owner: address,
            filter,
            options: {
                showContent: true,
                showType: true,
            },
        });
    }

    /**
     * Get dynamic fields of an object
     */
    async getDynamicFields(parentObjectId: string) {
        return this.client.getDynamicFields({
            parentId: parentObjectId,
        });
    }

    /**
     * Get a dynamic field object
     */
    async getDynamicFieldObject(parentObjectId: string, name: any) {
        return this.client.getDynamicFieldObject({
            parentId: parentObjectId,
            name,
        });
    }

    /**
     * Query events by type
     */
    async queryEvents(query: SuiEventFilter) {
        return this.client.queryEvents({
            query,
        });
    }

    /**
     * Helper: Extract field value from object content
     */
    extractField<T = any>(
        object: SuiObjectResponse,
        fieldPath: string
    ): T | undefined {
        if (!object.data?.content || object.data.content.dataType !== "moveObject") {
            return undefined;
        }

        const fields = object.data.content.fields as any;
        const parts = fieldPath.split(".");

        let current = fields;
        for (const part of parts) {
            if (current === undefined || current === null) {
                return undefined;
            }
            current = current[part];
        }

        return current as T;
    }

    /**
     * Get user's token balance
     */
    async getBalance(address: string, coinType: string) {
        return this.client.getBalance({
            owner: address,
            coinType,
        });
    }

    /**
     * Get all coin balances for an address
     */
    async getAllBalances(address: string) {
        return this.client.getAllBalances({
            owner: address,
        });
    }

    // ========================================
    // TreasuryCap Utilities
    // ========================================

    /**
     * Find TreasuryCap for a coin type and check if it's shared
     *
     * @param coinType - Full coin type (e.g., "0xabc::coin::COIN")
     * @returns TreasuryCapInfo if found, null otherwise
     */
    async findTreasuryCap(coinType: string): Promise<TreasuryCapInfo | null> {
        try {
            // Query transaction blocks that published the package
            const packageId = coinType.split('::')[0];

            const txs = await this.client.queryTransactionBlocks({
                filter: { ChangedObject: packageId },
                options: { showObjectChanges: true },
                limit: 10,
            });

            for (const tx of txs.data) {
                const treasuryCapChange = tx.objectChanges?.find(
                    (change: any) =>
                        change.type === 'created' &&
                        change.objectType?.includes('TreasuryCap') &&
                        change.objectType?.includes(coinType)
                );

                if (treasuryCapChange && 'objectId' in treasuryCapChange) {
                    const isShared = await this.isObjectShared(treasuryCapChange.objectId);
                    return {
                        objectId: treasuryCapChange.objectId,
                        coinType,
                        isShared,
                    };
                }
            }

            return null;
        } catch {
            return null;
        }
    }

    /**
     * Check if an object is shared
     *
     * @param objectId - Object ID to check
     * @returns true if the object is shared, false otherwise
     */
    async isObjectShared(objectId: string): Promise<boolean> {
        try {
            const obj = await this.client.getObject({
                id: objectId,
                options: { showOwner: true },
            });

            const owner = obj.data?.owner;
            return owner !== null && typeof owner === 'object' && 'Shared' in owner;
        } catch {
            return false;
        }
    }
}
