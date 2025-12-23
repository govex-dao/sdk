/**
 * Unified Actions Namespace
 *
 * Provides a clean, organized namespace for all action builders.
 * This replaces direct imports of individual action modules.
 *
 * @example
 * ```typescript
 * // Instead of:
 * import { StreamInitActions } from './lib/actions/stream-actions';
 * StreamInitActions.addCreateStreamSpec(tx, builder, ...);
 *
 * // Use:
 * sdk.actions.stream.addCreateStream(tx, builder, ...);
 * ```
 *
 * @module actions-unified
 */

import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';

/**
 * Package IDs required for action builders
 */
export interface ActionsPackages {
  accountActionsPackageId: string;
  futarchyActionsPackageId: string;
  futarchyTypesPackageId: string;
  futarchyOracleActionsPackageId: string;
  futarchyGovernanceActionsPackageId: string;
  futarchyCorePackageId: string;
}

/**
 * Stream action builder
 */
export class StreamActions {
  constructor(private packages: ActionsPackages) {}

  /**
   * Add a create stream action spec to the builder
   */
  addCreateStream(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    config: {
      vaultName: string;
      beneficiary: string;
      amountPerIteration: bigint;
      startTime: number;
      iterationsTotal: bigint;
      iterationPeriodMs: bigint;
      cliffTime?: number;
      claimWindowMs?: bigint;
      maxPerWithdrawal: bigint;
      // Note: Vault streams are always DAO-controlled (cancellable, non-transferable)
    }
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::stream_init_actions::add_create_stream_spec`,
      arguments: [
        builder,
        tx.pure.string(config.vaultName),
        tx.pure(bcs.Address.serialize(config.beneficiary).toBytes()),
        tx.pure.u64(config.amountPerIteration),
        tx.pure.u64(config.startTime),
        tx.pure.u64(config.iterationsTotal),
        tx.pure.u64(config.iterationPeriodMs),
        tx.pure.option('u64', config.cliffTime ?? null),
        tx.pure.option('u64', config.claimWindowMs ? Number(config.claimWindowMs) : null),
        tx.pure.u64(config.maxPerWithdrawal),
      ],
    });
  }
}

/**
 * Currency action builder
 */
export class CurrencyActions {
  constructor(private packages: ActionsPackages) {}

  /**
   * Add a mint action spec
   * Mints coins and stores them in executable_resources under resourceName
   * for consumption by subsequent actions (e.g., CreateVesting, TransferCoin)
   */
  addMint(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    amount: bigint,
    resourceName: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::currency_init_actions::add_mint_spec`,
      arguments: [builder, tx.pure.u64(amount), tx.pure.string(resourceName)],
    });
  }

  /**
   * Add a burn action spec
   * Burns coins from executable_resources with the given resourceName
   */
  addBurn(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    amount: bigint,
    resourceName: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::currency_init_actions::add_burn_spec`,
      arguments: [builder, tx.pure.u64(amount), tx.pure.string(resourceName)],
    });
  }

  /**
   * Add a return treasury cap action spec
   */
  addReturnTreasuryCap(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    recipient: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::currency_init_actions::add_return_treasury_cap_spec`,
      arguments: [builder, tx.pure.address(recipient)],
    });
  }

  /**
   * Add a return metadata action spec
   */
  addReturnMetadata(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    recipient: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::currency_init_actions::add_return_metadata_spec`,
      arguments: [builder, tx.pure.address(recipient)],
    });
  }
}

/**
 * Liquidity action builder
 */
export class LiquidityActions {
  constructor(private packages: ActionsPackages) {}

  /**
   * Add a create pool with mint action spec
   */
  addCreatePoolWithMint(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    config: {
      vaultName: string;
      assetAmount: bigint;
      stableAmount: bigint;
      feeBps: number;
      launchFeeDurationMs?: bigint;
    }
  ): void {
    tx.moveCall({
      target: `${this.packages.futarchyActionsPackageId}::liquidity_init_actions::add_create_pool_with_mint_spec`,
      arguments: [
        builder,
        tx.pure.string(config.vaultName),
        tx.pure.u64(config.assetAmount),
        tx.pure.u64(config.stableAmount),
        tx.pure.u64(config.feeBps),
        tx.pure.u64(config.launchFeeDurationMs ?? 0n),
      ],
    });
  }
}

/**
 * Vault action builder
 */
export class VaultActions {
  constructor(private packages: ActionsPackages) {}

  /**
   * Add a deposit action spec
   * @param resourceName - The name of the resource to take from executable_resources
   */
  addDeposit(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    vaultName: string,
    amount: bigint,
    resourceName: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::vault_init_actions::add_deposit_spec`,
      arguments: [builder, tx.pure.string(vaultName), tx.pure.u64(amount), tx.pure.string(resourceName)],
    });
  }

  /**
   * Add a spend action spec
   * @param resourceName - The name to store the coin in executable_resources
   */
  addSpend(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    vaultName: string,
    amount: bigint,
    spendAll: boolean,
    resourceName: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::vault_init_actions::add_spend_spec`,
      arguments: [
        builder,
        tx.pure.string(vaultName),
        tx.pure.u64(amount),
        tx.pure.bool(spendAll),
        tx.pure.string(resourceName),
      ],
    });
  }

  /**
   * Add a transfer object action spec
   * @param resourceName - The name of the resource to take from executable_resources
   */
  addTransfer(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    recipient: string,
    resourceName: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::transfer_init_actions::add_transfer_object_spec`,
      arguments: [builder, tx.pure.address(recipient), tx.pure.string(resourceName)],
    });
  }

  /**
   * Add a deposit from resources action spec
   *
   * Deposits coins from executable_resources into the "temporary_deposits" vault.
   * The vault is hardcoded for security - prevents manipulation attacks with unknown-amount deposits.
   * Use `crankTemporaryToTreasury` to move funds to treasury afterward (permissionless).
   *
   * @param resourceName - The name of the coin resource in executable_resources
   */
  addDepositFromResources(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    resourceName: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::vault_init_actions::add_deposit_from_resources_spec`,
      arguments: [builder, tx.pure.string(resourceName)],
    });
  }

  /**
   * Permissionless crank: move coins from temporary_deposits to treasury
   *
   * ANYONE can call this function - it's completely permissionless.
   * This is safe because:
   * 1. Only moves coins FROM temporary_deposits TO treasury (one direction)
   * 2. Both vaults belong to the same Account
   * 3. No value leaves the DAO - just internal reallocation
   *
   * Use case: After a proposal executes actions that deposit LP tokens or swap outputs
   * to temporary_deposits, anyone can crank them to treasury.
   *
   * @param accountId - The DAO Account ID
   * @param registryId - The PackageRegistry ID
   * @param registryInitialVersion - The PackageRegistry initial shared version
   * @param coinType - The coin type to crank
   * @param configType - The Config type (e.g., FutarchyConfig)
   */
  crankTemporaryToTreasury(
    tx: Transaction,
    config: {
      accountId: string;
      registryId: string;
      registryInitialVersion: number;
      coinType: string;
      configType: string;
    }
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::vault::crank_temporary_to_treasury`,
      typeArguments: [config.configType, config.coinType],
      arguments: [
        tx.object(config.accountId),
        tx.sharedObjectRef({
          objectId: config.registryId,
          initialSharedVersion: config.registryInitialVersion,
          mutable: false,
        }),
      ],
    });
  }
}

/**
 * Config action builder
 */
export class ConfigActions {
  constructor(private packages: ActionsPackages) {}

  /**
   * Add an update trading params action spec
   */
  addUpdateTradingParams(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    config: {
      minAssetAmount?: bigint;
      minStableAmount?: bigint;
      reviewPeriodMs?: bigint;
      tradingPeriodMs?: bigint;
      ammTotalFeeBps?: number;
    }
  ): void {
    tx.moveCall({
      target: `${this.packages.futarchyActionsPackageId}::futarchy_config_init_actions::add_update_trading_params_spec`,
      arguments: [
        builder,
        tx.pure.option('u64', config.minAssetAmount ? Number(config.minAssetAmount) : null),
        tx.pure.option('u64', config.minStableAmount ? Number(config.minStableAmount) : null),
        tx.pure.option('u64', config.reviewPeriodMs ? Number(config.reviewPeriodMs) : null),
        tx.pure.option('u64', config.tradingPeriodMs ? Number(config.tradingPeriodMs) : null),
        tx.pure.option('u64', config.ammTotalFeeBps ?? null),
      ],
    });
  }

  /**
   * Add an update TWAP config action spec
   */
  addUpdateTwapConfig(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    config: {
      startDelay?: bigint;
      stepMax?: bigint;
      initialObservation?: bigint;
      threshold?: bigint;
    }
  ): void {
    let thresholdOption: ReturnType<Transaction['moveCall']>;
    if (config.threshold !== undefined) {
      const signedThreshold = tx.moveCall({
        target: `${this.packages.futarchyTypesPackageId}::signed::from_u128`,
        arguments: [tx.pure.u128(config.threshold)],
      });
      thresholdOption = tx.moveCall({
        target: '0x1::option::some',
        typeArguments: [`${this.packages.futarchyTypesPackageId}::signed::SignedU128`],
        arguments: [signedThreshold],
      });
    } else {
      thresholdOption = tx.moveCall({
        target: '0x1::option::none',
        typeArguments: [`${this.packages.futarchyTypesPackageId}::signed::SignedU128`],
        arguments: [],
      });
    }

    tx.moveCall({
      target: `${this.packages.futarchyActionsPackageId}::futarchy_config_init_actions::add_update_twap_config_spec`,
      arguments: [
        builder,
        tx.pure.option('u64', config.startDelay ? Number(config.startDelay) : null),
        tx.pure.option('u64', config.stepMax ? Number(config.stepMax) : null),
        tx.pure.option('u128', config.initialObservation ?? null),
        thresholdOption,
      ],
    });
  }
}

/**
 * Transfer action builder
 */
export class TransferActions {
  constructor(private packages: ActionsPackages) {}

  /**
   * Add a transfer object action spec
   * Note: The object to transfer is passed at execution time
   */
  addTransfer(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    recipient: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::transfer_init_actions::add_transfer_object_spec`,
      arguments: [builder, tx.pure.address(recipient)],
    });
  }

  /**
   * Add a transfer to sender action spec
   * Transfers object to whoever executes the intent (cranker)
   */
  addTransferToSender(tx: Transaction, builder: ReturnType<Transaction['moveCall']>): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::transfer_init_actions::add_transfer_to_sender_spec`,
      arguments: [builder],
    });
  }
}

/**
 * Memo action builder
 */
export class MemoActions {
  constructor(private packages: ActionsPackages) {}

  /**
   * Add a memo action spec
   */
  addMemo(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    message: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::memo_init_actions::add_emit_memo_spec`,
      arguments: [builder, tx.pure.string(message)],
    });
  }
}

/**
 * Action spec builder utilities
 */
export class ActionSpecBuilderUtils {
  constructor(private packages: ActionsPackages) {}

  /**
   * Create a new action spec builder
   */
  newBuilder(tx: Transaction): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::action_spec_builder::new`,
      arguments: [],
    });
  }

  /**
   * Convert builder to vector
   */
  intoVector(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::action_spec_builder::into_vector`,
      arguments: [builder],
    });
  }
}

/**
 * Unified Actions Namespace
 *
 * Organizes all action builders under a single, clean interface.
 */
export class UnifiedActions {
  public readonly stream: StreamActions;
  public readonly currency: CurrencyActions;
  public readonly liquidity: LiquidityActions;
  public readonly vault: VaultActions;
  public readonly config: ConfigActions;
  public readonly transfer: TransferActions;
  public readonly memo: MemoActions;
  public readonly builder: ActionSpecBuilderUtils;

  constructor(packages: ActionsPackages) {
    this.stream = new StreamActions(packages);
    this.currency = new CurrencyActions(packages);
    this.liquidity = new LiquidityActions(packages);
    this.vault = new VaultActions(packages);
    this.config = new ConfigActions(packages);
    this.transfer = new TransferActions(packages);
    this.memo = new MemoActions(packages);
    this.builder = new ActionSpecBuilderUtils(packages);
  }
}
