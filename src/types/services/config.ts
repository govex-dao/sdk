/**
 * Services Config Types - Configuration types for service operations
 *
 * @module types/services/config
 */

import { SuiClient } from '@mysten/sui/client';
import { Packages, SharedObjects } from '../common';

/**
 * Base configuration for service operations
 */
export interface BaseOperationsConfig {
  client: SuiClient;
}

/**
 * Standard SDK configuration used by all services
 */
export interface SDKConfig {
  client: SuiClient;
  packages: Packages;
}


export interface SDKConfigWithObjects extends SDKConfig {
  sharedObjects: SharedObjects;
}

/**
 * Configuration for creating a new DAO
 */
export interface CreateDAOConfig {
  assetType: string;
  stableType: string;
  treasuryCap: string;
  coinMetadata: string;
  daoName: string;
  iconUrl: string;
  description: string;
  minAssetAmount: bigint;
  minStableAmount: bigint;
  reviewPeriodMs: bigint;
  tradingPeriodMs: bigint;
  twapStartDelay: bigint;
  twapStepMax: bigint;
  twapInitialObservation: bigint;
  twapThreshold: bigint;
  /** Whether the threshold is negative */
  twapThresholdNegative?: boolean;
  ammTotalFeeBps: number;
  maxOutcomes: number;
  /** Payment amount in SUI for DAO creation fee */
  paymentAmount: bigint;
  /** Optional affiliate ID for tracking */
  affiliateId?: string;
  /** Agreement lines for proposal acceptance */
  agreementLines?: string[];
  /** Difficulty levels for agreement lines */
  agreementDifficulties?: number[];
  /** Optional clock object ID (defaults to 0x6) */
  clockId?: string;
}

/**
 * Stream creation configuration
 */
export interface CreateStreamConfig {
  daoId: string;
  vaultName: string;
  beneficiary: string;
  totalAmount: bigint;
  startTime: number;
  vestingPeriodMs: number;
  iterations?: number;
  cliffMs?: number;
  claimWindowMs?: number;
  maxPerWithdrawal?: bigint;
  isTransferable?: boolean;
  isCancellable?: boolean;
  coinType: string;
}

/**
 * Init action specification for DAO creation
 */
export interface InitActionSpec {
  /**
   * TypeName of the action marker type
   * Format: "package::module::Type"
   *
   * Examples:
   * - "futarchy_actions::config_actions::MetadataUpdate"
   * - "futarchy_actions::liquidity_actions::CreatePoolAction"
   */
  actionType: string;

  /**
   * BCS-serialized action data as byte array
   * This must match the Move struct layout exactly
   */
  actionData: number[];
}
