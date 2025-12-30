/**
 * Query Helper Utilities
 */

import { SuiClient, SuiObjectResponse } from '@mysten/sui/client';
import { extractFields } from '../../types';

/**
 * Helper class for common Sui queries
 */
export class QueryHelper {
  private client: SuiClient;

  constructor(client: SuiClient) {
    this.client = client;
  }

  /**
   * Get a single object by ID
   */
  async getObject(objectId: string): Promise<SuiObjectResponse> {
    return this.client.getObject({
      id: objectId,
      options: {
        showContent: true,
        showType: true,
        showOwner: true,
      },
    });
  }

  /**
   * Get multiple objects by IDs
   */
  async getObjects(objectIds: string[]): Promise<SuiObjectResponse[]> {
    return this.client.multiGetObjects({
      ids: objectIds,
      options: {
        showContent: true,
        showType: true,
        showOwner: true,
      },
    });
  }

  /**
   * Get owned objects for an address
   */
  async getOwnedObjects(address: string, filter?: any): Promise<any[]> {
    const result = await this.client.getOwnedObjects({
      owner: address,
      filter,
      options: {
        showContent: true,
        showType: true,
      },
    });
    return result.data;
  }

  /**
   * Get dynamic fields for an object
   */
  async getDynamicFields(parentObjectId: string): Promise<any[]> {
    const result = await this.client.getDynamicFields({
      parentId: parentObjectId,
    });
    return result.data;
  }

  /**
   * Get a dynamic field object
   */
  async getDynamicFieldObject(parentObjectId: string, name: any): Promise<SuiObjectResponse> {
    return this.client.getDynamicFieldObject({
      parentId: parentObjectId,
      name,
    });
  }

  /**
   * Query events
   */
  async queryEvents(query: any): Promise<any[]> {
    const result = await this.client.queryEvents(query);
    return result.data;
  }

  /**
   * Extract a field from an object's content
   */
  extractField(object: SuiObjectResponse, fieldPath: string): unknown {
    if (!object.data?.content || object.data.content.dataType !== 'moveObject') {
      return undefined;
    }
    const fields = extractFields(object);
    if (!fields) return undefined;

    const parts = fieldPath.split('.');
    let current: unknown = fields;
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  /**
   * Get balance for an address and coin type
   */
  async getBalance(address: string, coinType: string): Promise<bigint> {
    const result = await this.client.getBalance({
      owner: address,
      coinType,
    });
    return BigInt(result.totalBalance);
  }

  /**
   * Get all balances for an address
   */
  async getAllBalances(address: string): Promise<any[]> {
    const result = await this.client.getAllBalances({
      owner: address,
    });
    return result;
  }

  /**
   * Get spot balances for a DAO's coin pair
   *
   * @param address - Wallet address
   * @param assetType - DAO's asset coin type
   * @param stableType - DAO's stable coin type
   * @param decimals - Coin decimals (default 9)
   * @returns Formatted balances { asset, stable, assetRaw, stableRaw }
   */
  async getSpotBalances(
    address: string,
    assetType: string,
    stableType: string,
    decimals = 9
  ): Promise<{
    asset: string;
    stable: string;
    assetRaw: bigint;
    stableRaw: bigint;
  }> {
    const [assetRaw, stableRaw] = await Promise.all([
      this.getBalance(address, assetType),
      this.getBalance(address, stableType),
    ]);

    const formatBalance = (raw: bigint): string => {
      const divisor = BigInt(10 ** decimals);
      const whole = raw / divisor;
      const fraction = raw % divisor;
      const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 4);
      return `${whole}.${fractionStr}`;
    };

    return {
      asset: formatBalance(assetRaw),
      stable: formatBalance(stableRaw),
      assetRaw,
      stableRaw,
    };
  }

  /**
   * Find treasury cap for a coin type
   */
  async findTreasuryCap(_coinType: string): Promise<string | null> {
    // This would search for TreasuryCap objects
    return null;
  }

  /**
   * Check if an object is shared
   */
  async isObjectShared(objectId: string): Promise<boolean> {
    const obj = await this.getObject(objectId);
    const owner = obj.data?.owner;
    return owner !== undefined && owner !== null && typeof owner === 'object' && 'Shared' in owner;
  }

  /**
   * Get all balances for a proposal (spot + conditional per outcome)
   *
   * @param address - Wallet address
   * @param assetType - DAO's asset coin type
   * @param stableType - DAO's stable coin type
   * @param conditionalAssetTypes - Conditional asset coin types per outcome
   * @param conditionalStableTypes - Conditional stable coin types per outcome
   * @param decimals - Coin decimals (default 9)
   * @returns Complete balance info for trading
   */
  async getProposalBalances(
    address: string,
    assetType: string,
    stableType: string,
    conditionalAssetTypes: string[],
    conditionalStableTypes: string[],
    decimals = 9
  ): Promise<ProposalBalances> {
    const formatBalance = (raw: bigint): string => {
      const divisor = BigInt(10 ** decimals);
      const whole = raw / divisor;
      const fraction = raw % divisor;
      const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 4);
      return `${whole}.${fractionStr}`;
    };

    // Fetch all balances in parallel
    const balancePromises: Promise<bigint>[] = [
      this.getBalance(address, assetType),
      this.getBalance(address, stableType),
    ];

    // Add conditional coin balance fetches
    for (const coinType of conditionalAssetTypes) {
      balancePromises.push(this.getBalance(address, coinType));
    }
    for (const coinType of conditionalStableTypes) {
      balancePromises.push(this.getBalance(address, coinType));
    }

    const rawBalances = await Promise.all(balancePromises);

    // Parse results
    const spotAssetRaw = rawBalances[0];
    const spotStableRaw = rawBalances[1];

    const outcomeCount = conditionalAssetTypes.length;
    const outcomes: OutcomeBalances[] = [];

    for (let i = 0; i < outcomeCount; i++) {
      const condAssetRaw = rawBalances[2 + i];
      const condStableRaw = rawBalances[2 + outcomeCount + i];

      outcomes.push({
        outcomeIndex: i,
        conditionalAsset: {
          coinType: conditionalAssetTypes[i],
          raw: condAssetRaw,
          formatted: formatBalance(condAssetRaw),
        },
        conditionalStable: {
          coinType: conditionalStableTypes[i],
          raw: condStableRaw,
          formatted: formatBalance(condStableRaw),
        },
      });
    }

    return {
      spot: {
        asset: {
          coinType: assetType,
          raw: spotAssetRaw,
          formatted: formatBalance(spotAssetRaw),
        },
        stable: {
          coinType: stableType,
          raw: spotStableRaw,
          formatted: formatBalance(spotStableRaw),
        },
      },
      outcomes,
    };
  }
}

// Types for proposal balances
export interface CoinBalance {
  coinType: string;
  raw: bigint;
  formatted: string;
}

export interface OutcomeBalances {
  outcomeIndex: number;
  conditionalAsset: CoinBalance;
  conditionalStable: CoinBalance;
}

export interface ProposalBalances {
  spot: {
    asset: CoinBalance;
    stable: CoinBalance;
  };
  outcomes: OutcomeBalances[];
}
