/**
 * Transfer Init Actions
 *
 * Builders for transfer operations during initialization/intent staging.
 * Handles object transfers via executable_resources pattern.
 *
 * NOTE: For vault withdrawals + transfers, use the composable pattern:
 * 1. VaultSpend action (puts coin in executable_resources with resourceName)
 * 2. TransferObject action (takes from executable_resources using same resourceName)
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
 * // Spend from vault and transfer to recipient (composable pattern)
 * VaultInitActions.addSpend(tx, builder, actionsPackageId, {
 *   vaultName: 'treasury',
 *   amount: 1_000_000_000n,
 *   spendAll: false,
 *   resourceName: 'my_coin',
 *   coinType: '0x2::sui::SUI',
 * });
 * TransferInitActions.addTransferObject(tx, builder, actionsPackageId, {
 *   recipient: '0xRECIPIENT',
 *   resourceName: 'my_coin',
 *   objectType: '0x2::coin::Coin<0x2::sui::SUI>',
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
}
