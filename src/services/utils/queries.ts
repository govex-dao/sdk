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
}
