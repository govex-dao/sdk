/**
 * Services Results Types - Result/info types returned from queries
 *
 * @module types/services/results
 */

/**
 * Lightweight DAO information (just types and pool ID)
 */
export interface DAOInfo {
  id: string;
  assetType: string;
  stableType: string;
  lpType: string;
  spotPoolId: string;
}

/**
 * DAO configuration info
 */
export interface DAOConfigInfo {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  assetType: string;
  stableType: string;
  spotPoolId: string;
  tradingPeriodMs: number;
  reviewPeriodMs: number;
  proposalsEnabled: boolean;
}

/**
 * Managed object info
 */
export interface ManagedObjectInfo {
  name: string;
  objectId: string;
  objectType: string;
}

/**
 * Stream info
 */
export interface StreamInfo {
  id: string;
  beneficiary: string;
  totalAmount: bigint;
  claimedAmount: bigint;
  startTime: number;
  cliffTime?: number;
  iterationsTotal: number;
  iterationsClaimed: number;
  iterationPeriodMs: number;
  isTransferable: boolean;
  isCancellable: boolean;
}

/**
 * Vault info
 */
export interface VaultInfo {
  name: string;
  balances: { coinType: string; amount: bigint }[];
  approvedCoinTypes: string[];
}

/**
 * Swap quote result
 */
export interface SwapQuote {
  amountIn: bigint;
  amountOut: bigint;
  priceImpact: number;
  fee: bigint;
}

/**
 * Pool reserves
 */
export interface PoolReserves {
  assetReserve: bigint;
  stableReserve: bigint;
  lpSupply: bigint;
}

/**
 * Info about an allowed stable type in the Factory
 */
export interface AllowedStableType {
  type: string;
  packageId: string;
  treasuryCapId?: string;
  isSharedTreasuryCap: boolean;
}

/**
 * Result of checking if user can sponsor
 */
export interface CanSponsorResult {
  canSponsor: boolean;
  reason: string;
}

/**
 * Oracle grant info
 */
export interface OracleGrant {
  id: string;
  daoId: string;
  grantee: string;
  amount: bigint;
  claimedAmount: bigint;
  expiresAt: number;
}
