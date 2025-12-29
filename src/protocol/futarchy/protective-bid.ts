/**
 * Protective Bid Operations
 *
 * SDK module for interacting with the protective bid system.
 * Allows token holders to sell back to the DAO at snapshot NAV price.
 *
 * @module protocol/futarchy/protective-bid
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

export interface ProtectiveBidConfig {
  factoryPackageId: string;
}

/**
 * Protective Bid Static Functions
 *
 * Sell tokens back to the DAO at NAV-based price floor.
 *
 * @example Sell tokens to bid
 * ```typescript
 * const stableOut = ProtectiveBid.sellToBid(tx, {
 *   factoryPackageId,
 *   bidId: '0x...',
 *   raiseTokenType: '0x...::token::TOKEN',
 *   stableCoinType: '0x2::sui::SUI',
 *   tokens: tokenCoin,
 * });
 * // Transfer stableOut to recipient
 * ```
 */
export class ProtectiveBid {
  // ============================================================================
  // Sell Operations
  // ============================================================================

  /**
   * Sell tokens to the protective bid at snapshot NAV price
   *
   * @param tx - Transaction
   * @param config - Sell configuration
   * @returns Stable coin received
   *
   * @example
   * ```typescript
   * const stableOut = ProtectiveBid.sellToBid(tx, {
   *   factoryPackageId,
   *   bidId: '0x...',
   *   raiseTokenType: '0x...::token::TOKEN',
   *   stableCoinType: '0x2::sui::SUI',
   *   tokens: tokenCoin,
   * });
   * tx.transferObjects([stableOut], tx.pure.address(recipient));
   * ```
   */
  static sellToBid(
    tx: Transaction,
    config: {
      factoryPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
      tokens: ReturnType<Transaction['object']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.factoryPackageId,
        'protective_bid',
        'sell_to_bid'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [tx.object(config.bidId), config.tokens],
    });
  }

  // ============================================================================
  // View Functions
  // ============================================================================

  /**
   * Get quote for selling tokens
   *
   * @param tx - Transaction
   * @param config - Quote configuration
   * @returns Quoted stable amount
   */
  static quoteSell(
    tx: Transaction,
    config: {
      factoryPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
      tokenAmount: bigint;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.factoryPackageId,
        'protective_bid',
        'quote_sell'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [tx.object(config.bidId), tx.pure.u64(config.tokenAmount)],
    });
  }

  /**
   * Get current NAV
   *
   * @returns NAV scaled by 1e9
   */
  static currentNav(
    tx: Transaction,
    config: {
      factoryPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.factoryPackageId,
        'protective_bid',
        'current_nav'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [tx.object(config.bidId)],
    });
  }

  /**
   * Get remaining stable in bid vault
   */
  static remainingStable(
    tx: Transaction,
    config: {
      factoryPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.factoryPackageId,
        'protective_bid',
        'remaining_stable'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [tx.object(config.bidId)],
    });
  }

  /**
   * Get max tokens that can be sold
   */
  static maxSellableTokens(
    tx: Transaction,
    config: {
      factoryPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.factoryPackageId,
        'protective_bid',
        'max_sellable_tokens'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [tx.object(config.bidId)],
    });
  }

  /**
   * Check if bid is still active
   */
  static isActive(
    tx: Transaction,
    config: {
      factoryPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.factoryPackageId,
        'protective_bid',
        'is_active'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [tx.object(config.bidId)],
    });
  }

  /**
   * Get fee in basis points
   */
  static feeBps(
    tx: Transaction,
    config: {
      factoryPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.factoryPackageId,
        'protective_bid',
        'fee_bps'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [tx.object(config.bidId)],
    });
  }

  /**
   * Get snapshot backing
   */
  static snapshotBacking(
    tx: Transaction,
    config: {
      factoryPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.factoryPackageId,
        'protective_bid',
        'snapshot_backing'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [tx.object(config.bidId)],
    });
  }

  /**
   * Get snapshot circulating supply
   */
  static snapshotCirculating(
    tx: Transaction,
    config: {
      factoryPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.factoryPackageId,
        'protective_bid',
        'snapshot_circulating'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [tx.object(config.bidId)],
    });
  }

  // ============================================================================
  // Sync Operations (Permissionless)
  // ============================================================================

  /**
   * Sync snapshot from live state
   *
   * Permissionless operation that:
   * 1. Burns accumulated tokens
   * 2. Refreshes snapshots from live Account + Pool state
   *
   * Call after: donations, AMM fee accumulation, external burns
   */
  static syncSnapshot(
    tx: Transaction,
    config: {
      factoryPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
      assetType: string;
      stableType: string;
      lpType: string;
      accountId: string;
      spotPoolId: string;
      registryId: string;
      configType: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.factoryPackageId,
        'protective_bid',
        'sync_snapshot'
      ),
      typeArguments: [
        config.configType,
        config.raiseTokenType,
        config.stableCoinType,
        config.assetType,
        config.stableType,
        config.lpType,
      ],
      arguments: [
        tx.object(config.bidId),
        tx.object(config.accountId),
        tx.object(config.spotPoolId),
        tx.object(config.registryId),
      ],
    });
  }
}
