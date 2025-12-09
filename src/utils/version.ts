import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../services/utils';

/*
 * Get the current version witness
 * @param tx - Transaction instance
 * @param packageId - The package ID
 * @returns The current version witness
 */
export function getCurrentVersionWitness(tx: Transaction, packageId: string): ReturnType<Transaction['moveCall']> {
  return tx.moveCall({
    target: TransactionUtils.buildTarget(
      packageId,
      'version',
      'current'
    ),
  });
}

/*
 * Get the version number
 * @param tx - Transaction instance
 * @param packageId - The package ID
 * @returns The version number
 */
export function getVersionNumber(tx: Transaction, packageId: string): ReturnType<Transaction['moveCall']> {
  return  tx.moveCall({
    target: TransactionUtils.buildTarget(
      packageId,
      'version',
      'get'
    ),
  });
}
