/**
 * Coin Registry Utilities
 *
 * Registry of pre-created "blank" coin types for conditional tokens.
 * Solves the problem that coin types can't be created dynamically in Sui.
 * Allows proposal creators to acquire coin pairs without requiring two transactions.
 *
 * **Workflow:**
 * 1. Users deposit pre-created TreasuryCap/Metadata pairs with a fee
 * 2. Proposal creators acquire these pairs via `takeCoinSet` in their PTB
 * 3. Multiple pairs can be acquired in one transaction for N-outcome proposals
 * 4. Original depositor gets paid the fee when their coin set is taken
 *
 * @module utils/coin-registry
 */

import { Transaction } from '@mysten/sui/transactions';
import { validateObjectId, validateU64 } from './validators';

/**
 * Configuration for coin registry operations
 */
export interface CoinRegistryConfig {
  oneShotUtilsPackageId: string;
}

/**
 * Configuration for depositing a coin set
 */
export interface DepositCoinSetConfig {
  registryId: string;
  treasuryCap: string;
  coinMetadata: string;
  fee: bigint | number;
  coinType: string;
  clock?: string;
}

/**
 * Configuration for taking a coin set
 */
export interface TakeCoinSetConfig {
  registryId: string;
  capId: string;
  feePayment: ReturnType<Transaction['moveCall']>;
  coinType: string;
  clock?: string;
}

// ============================================================================
// HELPER
// ============================================================================

function buildTarget(packageId: string, module: string, fn: string): `${string}::${string}::${string}` {
  return `${packageId}::${module}::${fn}`;
}

// ============================================================================
// ADMIN / SETUP
// ============================================================================

/**
 * Share a CoinRegistry to make it publicly accessible
 *
 * This is a one-time setup function. After sharing, anyone can deposit
 * coin sets into the registry and anyone can acquire them.
 *
 * @param tx - Transaction instance
 * @param config - Configuration with package ID
 * @param registry - The CoinRegistry object to share
 *
 * @example
 * ```typescript
 * const tx = new Transaction();
 * shareRegistry(tx, { oneShotUtilsPackageId: '0x...' }, registry);
 * ```
 */
export function shareRegistry(
  tx: Transaction,
  config: CoinRegistryConfig,
  registry: ReturnType<Transaction['moveCall']>
): void {
  tx.moveCall({
    target: buildTarget(config.oneShotUtilsPackageId, 'coin_registry', 'share_registry'),
    arguments: [registry],
  });
}

// ============================================================================
// DEPOSIT FUNCTIONS
// ============================================================================

/**
 * Deposit a TreasuryCap/Metadata pair into the registry
 *
 * **Requirements:**
 * - Coin supply must be zero (no minted coins)
 * - Metadata must be empty (name, symbol, description, icon all empty)
 * - Fee must be <= 10 SUI (10_000_000_000 MIST)
 * - Registry must not be full (max 100,000 coin sets)
 *
 * **Process:**
 * 1. Transfers ownership of TreasuryCap and CoinMetadata to registry
 * 2. Sets the fee required to acquire this coin set
 * 3. When taken, depositor receives the fee payment
 *
 * @param tx - Transaction instance
 * @param config - Configuration with package ID
 * @param depositConfig - Deposit configuration
 *
 * @throws {Error} If validation fails (object IDs, fee amount)
 *
 * @example
 * ```typescript
 * const tx = new Transaction();
 * depositCoinSet(tx, { oneShotUtilsPackageId: '0x...' }, {
 *   registryId: '0x...',
 *   treasuryCap: '0x...',
 *   coinMetadata: '0x...',
 *   fee: 2_000_000_000n,
 *   coinType: '0x123::blank_coin::BlankCoin',
 * });
 * ```
 */
export function depositCoinSet(
  tx: Transaction,
  config: CoinRegistryConfig,
  depositConfig: DepositCoinSetConfig
): void {
  validateObjectId(depositConfig.registryId, 'registryId');
  validateObjectId(depositConfig.treasuryCap, 'treasuryCap');
  validateObjectId(depositConfig.coinMetadata, 'coinMetadata');
  validateU64(depositConfig.fee, 'fee');

  const clock = depositConfig.clock || '0x6';

  tx.moveCall({
    target: buildTarget(config.oneShotUtilsPackageId, 'coin_registry', 'deposit_coin_set_entry'),
    typeArguments: [depositConfig.coinType],
    arguments: [
      tx.object(depositConfig.registryId),
      tx.object(depositConfig.treasuryCap),
      tx.object(depositConfig.coinMetadata),
      tx.pure.u64(depositConfig.fee),
      tx.object(clock),
    ],
  });
}

// ============================================================================
// TAKE FUNCTIONS
// ============================================================================

/**
 * Take a coin set from the registry (acquire TreasuryCap/Metadata pair)
 *
 * **Critical for optimized proposal creation:**
 * - Call this N times in a PTB to acquire N conditional token pairs
 * - Returns remaining payment coin for chaining multiple takes
 * - TreasuryCap and CoinMetadata are transferred to transaction sender
 * - Fee is paid to original depositor
 *
 * @param tx - Transaction instance
 * @param config - Configuration with package ID
 * @param takeConfig - Take configuration
 * @returns Remaining payment coin (Coin<SUI>) for chaining
 *
 * @throws {Error} If validation fails or insufficient payment
 *
 * @example
 * ```typescript
 * const tx = new Transaction();
 * const [payment] = tx.splitCoins(tx.gas, [1_000_000_000n]);
 *
 * const remaining = takeCoinSet(tx, { oneShotUtilsPackageId: '0x...' }, {
 *   registryId: '0x...',
 *   capId: '0x...',
 *   feePayment: payment,
 *   coinType: '0x123::outcome::Outcome',
 * });
 *
 * tx.transferObjects([remaining], tx.pure.address(myAddress));
 * ```
 */
export function takeCoinSet(
  tx: Transaction,
  config: CoinRegistryConfig,
  takeConfig: TakeCoinSetConfig
): ReturnType<Transaction['moveCall']> {
  validateObjectId(takeConfig.registryId, 'registryId');
  validateObjectId(takeConfig.capId, 'capId');

  const clock = takeConfig.clock || '0x6';

  return tx.moveCall({
    target: buildTarget(config.oneShotUtilsPackageId, 'coin_registry', 'take_coin_set'),
    typeArguments: [takeConfig.coinType],
    arguments: [
      tx.object(takeConfig.registryId),
      tx.pure.id(takeConfig.capId),
      takeConfig.feePayment,
      tx.object(clock),
    ],
  });
}

// ============================================================================
// VIEW FUNCTIONS
// ============================================================================

/**
 * Get total number of coin sets available in the registry
 *
 * @param tx - Transaction instance
 * @param config - Configuration with package ID
 * @param registryId - The coin registry object ID
 * @returns Total count of available coin sets
 */
export function totalSets(
  tx: Transaction,
  config: CoinRegistryConfig,
  registryId: string
): ReturnType<Transaction['moveCall']> {
  validateObjectId(registryId, 'registryId');

  return tx.moveCall({
    target: buildTarget(config.oneShotUtilsPackageId, 'coin_registry', 'total_sets'),
    arguments: [tx.object(registryId)],
  });
}

/**
 * Check if a specific coin set is available
 *
 * @param tx - Transaction instance
 * @param config - Configuration with package ID
 * @param registryId - The coin registry object ID
 * @param capId - The TreasuryCap ID to check
 * @returns Boolean indicating if the coin set exists
 */
export function hasCoinSet(
  tx: Transaction,
  config: CoinRegistryConfig,
  registryId: string,
  capId: string
): ReturnType<Transaction['moveCall']> {
  validateObjectId(registryId, 'registryId');
  validateObjectId(capId, 'capId');

  return tx.moveCall({
    target: buildTarget(config.oneShotUtilsPackageId, 'coin_registry', 'has_coin_set'),
    arguments: [tx.object(registryId), tx.pure.id(capId)],
  });
}

/**
 * Get the fee required to acquire a specific coin set
 *
 * @param tx - Transaction instance
 * @param config - Configuration with package ID
 * @param registryId - The coin registry object ID
 * @param capId - The TreasuryCap ID
 * @param coinType - The coin type
 * @returns Fee amount in SUI MIST
 */
export function getFee(
  tx: Transaction,
  config: CoinRegistryConfig,
  registryId: string,
  capId: string,
  coinType: string
): ReturnType<Transaction['moveCall']> {
  validateObjectId(registryId, 'registryId');
  validateObjectId(capId, 'capId');

  return tx.moveCall({
    target: buildTarget(config.oneShotUtilsPackageId, 'coin_registry', 'get_fee'),
    typeArguments: [coinType],
    arguments: [tx.object(registryId), tx.pure.id(capId)],
  });
}

/**
 * Get the owner (depositor) of a specific coin set
 *
 * The owner will receive the fee payment when the coin set is taken.
 *
 * @param tx - Transaction instance
 * @param config - Configuration with package ID
 * @param registryId - The coin registry object ID
 * @param capId - The TreasuryCap ID
 * @param coinType - The coin type
 * @returns Address of the coin set owner
 */
export function getOwner(
  tx: Transaction,
  config: CoinRegistryConfig,
  registryId: string,
  capId: string,
  coinType: string
): ReturnType<Transaction['moveCall']> {
  validateObjectId(registryId, 'registryId');
  validateObjectId(capId, 'capId');

  return tx.moveCall({
    target: buildTarget(config.oneShotUtilsPackageId, 'coin_registry', 'get_owner'),
    typeArguments: [coinType],
    arguments: [tx.object(registryId), tx.pure.id(capId)],
  });
}
