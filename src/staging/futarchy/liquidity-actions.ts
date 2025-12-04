/**
 * Liquidity Actions
 *
 * Post-initialization liquidity management actions for DAO-owned AMM pools.
 * LP tokens are now standard Sui Coins stored in vault.
 *
 * Categories:
 * - Liquidity Operations: Add/remove liquidity
 * - Swaps: Token swaps in pools
 *
 * @module liquidity-actions
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

/**
 * Liquidity Action Markers
 *
 * Static utilities for getting action type markers.
 */
export class LiquidityActionMarkers {
  static addLiquidityMarker(
    tx: Transaction,
    futarchyActionsPackageId: string
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        futarchyActionsPackageId,
        'liquidity_actions',
        'add_liquidity_marker'
      ),
      arguments: [],
    });
  }

  static removeLiquidityMarker(
    tx: Transaction,
    futarchyActionsPackageId: string
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        futarchyActionsPackageId,
        'liquidity_actions',
        'remove_liquidity_marker'
      ),
      arguments: [],
    });
  }

  static swapMarker(
    tx: Transaction,
    futarchyActionsPackageId: string
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        futarchyActionsPackageId,
        'liquidity_actions',
        'swap_marker'
      ),
      arguments: [],
    });
  }
}

/**
 * Liquidity Action Constructors
 *
 * Static utilities for creating action structs.
 * All actions now require LPType as third type parameter.
 */
export class LiquidityActionConstructors {
  static newAddLiquidityAction(
    tx: Transaction,
    config: {
      futarchyActionsPackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      poolId: string;
      assetAmount: bigint;
      stableAmount: bigint;
      minLpOut: bigint;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyActionsPackageId,
        'liquidity_actions',
        'new_add_liquidity_action'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        tx.pure.id(config.poolId),
        tx.pure.u64(config.assetAmount),
        tx.pure.u64(config.stableAmount),
        tx.pure.u64(config.minLpOut),
      ],
    });
  }

  static newRemoveLiquidityAction(
    tx: Transaction,
    config: {
      futarchyActionsPackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      poolId: string;
      lpAmount: bigint;
      minAssetAmount: bigint;
      minStableAmount: bigint;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyActionsPackageId,
        'liquidity_actions',
        'new_remove_liquidity_action'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        tx.pure.id(config.poolId),
        tx.pure.u64(config.lpAmount),
        tx.pure.u64(config.minAssetAmount),
        tx.pure.u64(config.minStableAmount),
      ],
    });
  }

  static newSwapAction(
    tx: Transaction,
    config: {
      futarchyActionsPackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      poolId: string;
      swapAsset: boolean;
      amountIn: bigint;
      minAmountOut: bigint;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyActionsPackageId,
        'liquidity_actions',
        'new_swap_action'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        tx.pure.id(config.poolId),
        tx.pure.bool(config.swapAsset),
        tx.pure.u64(config.amountIn),
        tx.pure.u64(config.minAmountOut),
      ],
    });
  }
}

/**
 * Liquidity Action Executors
 *
 * Static utilities for executing liquidity actions in PTB.
 * All executors now require LPType as the third type parameter.
 */
export class LiquidityActionExecutors {
  static doAddLiquidity(
    tx: Transaction,
    config: {
      futarchyActionsPackageId: string;
      daoId: string;
      registryId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      outcomeType: string;
      intentWitnessType: string;
    },
    executable: ReturnType<Transaction['moveCall']>,
    versionWitness: ReturnType<Transaction['moveCall']>,
    intentWitness: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyActionsPackageId,
        'liquidity_actions',
        'do_add_liquidity'
      ),
      typeArguments: [
        config.assetType,
        config.stableType,
        config.lpType,
        config.outcomeType,
        config.intentWitnessType,
      ],
      arguments: [
        executable,
        tx.object(config.daoId),
        tx.object(config.registryId),
        versionWitness,
        intentWitness,
      ],
    });
  }

  static doRemoveLiquidity(
    tx: Transaction,
    config: {
      futarchyActionsPackageId: string;
      daoId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      outcomeType: string;
      intentWitnessType: string;
    },
    executable: ReturnType<Transaction['moveCall']>,
    versionWitness: ReturnType<Transaction['moveCall']>,
    intentWitness: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyActionsPackageId,
        'liquidity_actions',
        'do_remove_liquidity'
      ),
      typeArguments: [
        config.assetType,
        config.stableType,
        config.lpType,
        config.outcomeType,
        config.intentWitnessType,
      ],
      arguments: [
        executable,
        tx.object(config.daoId),
        versionWitness,
        intentWitness,
      ],
    });
  }

  static doSwap(
    tx: Transaction,
    config: {
      futarchyActionsPackageId: string;
      daoId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      outcomeType: string;
      intentWitnessType: string;
    },
    executable: ReturnType<Transaction['moveCall']>,
    versionWitness: ReturnType<Transaction['moveCall']>,
    intentWitness: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyActionsPackageId,
        'liquidity_actions',
        'do_swap'
      ),
      typeArguments: [
        config.assetType,
        config.stableType,
        config.lpType,
        config.outcomeType,
        config.intentWitnessType,
      ],
      arguments: [
        executable,
        tx.object(config.daoId),
        versionWitness,
        intentWitness,
      ],
    });
  }
}

/**
 * Liquidity Action Getters
 *
 * Static utilities for reading AddLiquidityAction parameters.
 */
export class LiquidityActionGetters {
  static getPoolId(
    tx: Transaction,
    futarchyActionsPackageId: string,
    assetType: string,
    stableType: string,
    lpType: string,
    action: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(futarchyActionsPackageId, 'liquidity_actions', 'get_pool_id'),
      typeArguments: [assetType, stableType, lpType],
      arguments: [action],
    });
  }

  static getAssetAmount(
    tx: Transaction,
    futarchyActionsPackageId: string,
    assetType: string,
    stableType: string,
    lpType: string,
    action: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(futarchyActionsPackageId, 'liquidity_actions', 'get_asset_amount'),
      typeArguments: [assetType, stableType, lpType],
      arguments: [action],
    });
  }

  static getStableAmount(
    tx: Transaction,
    futarchyActionsPackageId: string,
    assetType: string,
    stableType: string,
    lpType: string,
    action: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(futarchyActionsPackageId, 'liquidity_actions', 'get_stable_amount'),
      typeArguments: [assetType, stableType, lpType],
      arguments: [action],
    });
  }

  static getMinLpAmount(
    tx: Transaction,
    futarchyActionsPackageId: string,
    assetType: string,
    stableType: string,
    lpType: string,
    action: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(futarchyActionsPackageId, 'liquidity_actions', 'get_min_lp_amount'),
      typeArguments: [assetType, stableType, lpType],
      arguments: [action],
    });
  }
}
