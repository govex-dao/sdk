/**
 * Transfer Init Actions
 *
 * Builders for transfer operations during initialization/intent staging.
 * Handles object and coin transfers via executable_resources pattern.
 *
 * NOTE: There are TWO sets of transfer actions for different key formats:
 *
 * 1. TransferObject/TransferToSender - For objects placed via `provide_object`
 *    - Key format: "name::object::Type"
 *    - Use when previous action used provide_object<T>()
 *
 * 2. TransferCoin/TransferCoinToSender - For coins placed via `provide_coin`
 *    - Key format: "name::coin::CoinType"
 *    - Use when previous action used provide_coin<CoinType>() (e.g., VaultSpend, CurrencyMint)
 *
 * For vault withdrawals + transfers (common pattern):
 * 1. VaultSpend action (puts coin in executable_resources via provide_coin)
 * 2. TransferCoin action (takes from executable_resources via take_coin)
 *
 * @module transfer-init-actions
 */

import { Transaction } from '@mysten/sui/transactions';

/**
 * Transfer initialization action builders
 *
 * @example
 * ```typescript
 * const tx = new Transaction();
 * const builder = ActionSpecBuilder.new(tx, actionsPackageId);
 *
 * // Spend from vault and transfer to recipient using TransferCoin (composable pattern)
 * // VaultSpend uses provide_coin, so use TransferCoin (not TransferObject)
 * VaultInitActions.addSpend(tx, builder, actionsPackageId, {
 *   vaultName: 'treasury',
 *   amount: 1_000_000_000n,
 *   spendAll: false,
 *   resourceName: 'my_coin',
 *   coinType: '0x2::sui::SUI',
 * });
 * TransferInitActions.addTransferCoin(tx, builder, actionsPackageId, {
 *   recipient: '0xRECIPIENT',
 *   resourceName: 'my_coin',
 * });
 * ```
 */
export class TransferInitActions {
  /**
   * Add action to transfer an object to recipient
   *
   * Takes an object from executable_resources (placed there by a previous action
   * like VaultSpend) and transfers it to a recipient address.
   *
   * @param tx - Transaction
   * @param builder - ActionSpec builder
   * @param actionsPackageId - Package ID for account_actions
   * @param config - Transfer configuration
   */
  static addTransferObject(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    actionsPackageId: string,
    config: {
      recipient: string;
      resourceName: string;
      objectType: string;
    }
  ): void {
    tx.moveCall({
      target: `${actionsPackageId}::transfer_init_actions::add_transfer_object_spec`,
      typeArguments: [config.objectType],
      arguments: [builder, tx.pure.address(config.recipient), tx.pure.string(config.resourceName)],
    });
  }

  /**
   * Add action to transfer object to transaction sender
   *
   * Takes an object from executable_resources and transfers it to
   * whoever executes the intent (the cranker).
   *
   * @param tx - Transaction
   * @param builder - ActionSpec builder
   * @param actionsPackageId - Package ID for account_actions
   * @param config - Transfer configuration
   */
  static addTransferToSender(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    actionsPackageId: string,
    config: {
      resourceName: string;
      objectType: string;
    }
  ): void {
    tx.moveCall({
      target: `${actionsPackageId}::transfer_init_actions::add_transfer_to_sender_spec`,
      typeArguments: [config.objectType],
      arguments: [builder, tx.pure.string(config.resourceName)],
    });
  }

  /**
   * Add action to transfer a coin to recipient
   *
   * Takes a coin from executable_resources (placed there by a previous action
   * like VaultSpend or CurrencyMint via provide_coin) and transfers it to a recipient.
   *
   * Use this instead of addTransferObject when the coin was placed via provide_coin,
   * because the key formats differ:
   * - provide_coin uses: "name::coin::CoinType"
   * - provide_object uses: "name::object::Coin<CoinType>"
   *
   * @param tx - Transaction
   * @param builder - ActionSpec builder
   * @param actionsPackageId - Package ID for account_actions
   * @param config - Transfer configuration
   */
  static addTransferCoin(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    actionsPackageId: string,
    config: {
      recipient: string;
      resourceName: string;
    }
  ): void {
    tx.moveCall({
      target: `${actionsPackageId}::transfer_init_actions::add_transfer_coin_spec`,
      arguments: [builder, tx.pure.address(config.recipient), tx.pure.string(config.resourceName)],
    });
  }

  /**
   * Add action to transfer a coin to transaction sender (cranker)
   *
   * Takes a coin from executable_resources (placed there via provide_coin)
   * and transfers it to whoever executes the intent.
   *
   * Use this for crank fees when the coin was placed via provide_coin.
   *
   * @param tx - Transaction
   * @param builder - ActionSpec builder
   * @param actionsPackageId - Package ID for account_actions
   * @param config - Transfer configuration
   */
  static addTransferCoinToSender(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    actionsPackageId: string,
    config: {
      resourceName: string;
    }
  ): void {
    tx.moveCall({
      target: `${actionsPackageId}::transfer_init_actions::add_transfer_coin_to_sender_spec`,
      arguments: [builder, tx.pure.string(config.resourceName)],
    });
  }
}
