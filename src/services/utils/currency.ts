/**
 * Currency Utilities
 *
 * General currency/token utilities - queries, formatting, permissionless operations.
 * These are not intent-specific operations.
 *
 * @module utils/currency
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { TransactionUtils } from '.';

/**
 * Coin metadata info
 */
export interface CoinMetadataInfo {
  name: string;
  symbol: string;
  description: string;
  iconUrl: string;
  decimals: number;
}

/**
 * Currency utilities configuration
 */
export interface CurrencyUtilsConfig {
  client: SuiClient;
  accountActionsPackageId: string;
  futarchyCorePackageId: string;
  packageRegistryId: string;
}

/**
 * Currency utilities
 *
 * @example
 * ```typescript
 * // Get decimals
 * const decimals = await sdk.utils.currency.getDecimals("0x2::sui::SUI");
 *
 * // Format amount
 * const formatted = sdk.utils.currency.formatAmount(1000000000n, 9);
 * // Returns "1"
 *
 * // Parse amount
 * const raw = sdk.utils.currency.parseAmount("1.5", 9);
 * // Returns 1500000000n
 * ```
 */
export class CurrencyUtils {
  private client: SuiClient;
  private accountActionsPackageId: string;
  private packageRegistryId: string;
  private configType: string;

  constructor(config: CurrencyUtilsConfig) {
    this.client = config.client;
    this.accountActionsPackageId = config.accountActionsPackageId;
    this.packageRegistryId = config.packageRegistryId;
    this.configType = `${config.futarchyCorePackageId}::futarchy_config::FutarchyConfig`;
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Get decimals for a coin type
   *
   * @param coinType - Full coin type path
   * @returns Number of decimals
   */
  async getDecimals(coinType: string): Promise<number> {
    const result = await this.client.getCoinMetadata({ coinType });
    return result?.decimals ?? 9;
  }

  /**
   * Get coin metadata for a coin type
   *
   * @param coinType - Full coin type path
   * @returns Coin metadata info
   */
  async getMetadata(coinType: string): Promise<CoinMetadataInfo | null> {
    const result = await this.client.getCoinMetadata({ coinType });
    if (!result) {
      return null;
    }

    return {
      name: result.name,
      symbol: result.symbol,
      description: result.description,
      iconUrl: result.iconUrl || '',
      decimals: result.decimals,
    };
  }

  /**
   * Get total supply of a coin type
   *
   * @param coinType - Full coin type path
   * @returns Total supply
   */
  async getTotalSupply(coinType: string): Promise<bigint> {
    const result = await this.client.getTotalSupply({ coinType });
    return BigInt(result.value);
  }

  // ============================================================================
  // PERMISSIONLESS OPERATIONS
  // ============================================================================

  /**
   * Burn coins (permissionless)
   *
   * Anyone can burn their own coins if the DAO has burning enabled.
   *
   * @param config - Burn configuration
   * @returns Transaction to execute
   */
  burn(config: {
    daoId: string;
    coinType: string;
    coinId: string;
  }): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.accountActionsPackageId,
        'currency',
        'public_burn'
      ),
      typeArguments: [this.configType, config.coinType],
      arguments: [
        tx.object(config.daoId),
        tx.object(this.packageRegistryId),
        tx.object(config.coinId),
      ],
    });

    return tx;
  }

  // ============================================================================
  // FORMATTING
  // ============================================================================

  /**
   * Format amount with proper decimals
   *
   * @param amount - Raw amount (smallest unit)
   * @param decimals - Number of decimals
   * @returns Formatted string
   */
  formatAmount(amount: bigint, decimals: number): string {
    const divisor = BigInt(10 ** decimals);
    const whole = amount / divisor;
    const fraction = amount % divisor;

    if (fraction === 0n) {
      return whole.toString();
    }

    const fractionStr = fraction.toString().padStart(decimals, '0');
    const trimmed = fractionStr.replace(/0+$/, '');
    return `${whole}.${trimmed}`;
  }

  /**
   * Parse amount from decimal string
   *
   * @param amountStr - Amount string (e.g., "1.5")
   * @param decimals - Number of decimals
   * @returns Raw amount in smallest unit
   */
  parseAmount(amountStr: string, decimals: number): bigint {
    const [whole, fraction = ''] = amountStr.split('.');
    const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
    return BigInt(whole + paddedFraction);
  }
}
