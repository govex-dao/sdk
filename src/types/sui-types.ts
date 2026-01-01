/**
 * Sui Object Type Definitions
 *
 * Provides type-safe access to Sui object content and fields.
 * These types help avoid `any` casts when working with on-chain data.
 *
 * @module types/sui-types
 */

import type { SuiObjectResponse, SuiObjectData, SuiMoveObject } from '@mysten/sui/client';
import type { TransactionResult } from '@mysten/sui/transactions';

// ============================================================================
// SUI OBJECT FIELD TYPES
// ============================================================================

/**
 * Generic Move object fields accessor
 */
export interface MoveObjectFields {
  [key: string]: unknown;
}

/**
 * Type guard to check if object data has move object content
 */
export function isMoveObject(
  data: SuiObjectData | undefined
): data is SuiObjectData & { content: SuiMoveObject } {
  return !!data?.content && data.content.dataType === 'moveObject';
}

/**
 * Extract fields from a Sui object response safely
 */
export function extractFields<T extends MoveObjectFields = MoveObjectFields>(
  obj: SuiObjectResponse
): T | null {
  if (!obj.data || !isMoveObject(obj.data)) {
    return null;
  }
  return obj.data.content.fields as T;
}

/**
 * Extract fields or throw if not available
 */
export function extractFieldsOrThrow<T extends MoveObjectFields = MoveObjectFields>(
  obj: SuiObjectResponse,
  errorMessage?: string
): T {
  const fields = extractFields<T>(obj);
  if (!fields) {
    throw new Error(errorMessage || 'Could not extract fields from object');
  }
  return fields;
}

// ============================================================================
// COMMON SUI OBJECT FIELD TYPES
// ============================================================================

/**
 * DAO/Account object fields
 */
export interface DAOFields extends MoveObjectFields {
  id: { id: string };
  name: string;
  metadata?: { fields?: { name?: string; description?: string; icon_url?: string; [key: string]: unknown } };
  members?: { fields: { contents: unknown[] } };
  config?: { fields: { spot_pool_id?: string; trading_period_ms?: string; review_period_ms?: string; proposals_enabled?: boolean; [key: string]: unknown } };
  object_tracker?: { fields: { deposits_enabled?: boolean; current_count?: string; max_objects?: string; [key: string]: unknown } };
}

/**
 * Raise/Launchpad object fields
 */
export interface RaiseFields extends MoveObjectFields {
  id: { id: string };
  state: number;
  total_raised?: string;
  creator?: string;
  tokens_for_sale?: string;
  min_raise_amount?: string;
}

/**
 * Proposal state constants
 *
 * State transitions:
 * PREMARKET -> REVIEW -> TRADING -> AWAITING_EXECUTION -> FINALIZED
 *                                 \-> FINALIZED (if REJECT wins immediately)
 */
export enum ProposalState {
  PREMARKET = 0,           // Proposal exists, outcomes can be added/mutated
  REVIEW = 1,              // Market initialized and locked for review
  TRADING = 2,             // Market is live and trading
  AWAITING_EXECUTION = 3,  // TWAP measured, 30-min execution window active
  FINALIZED = 4,           // Market has resolved (execution succeeded or timeout)
}

/**
 * Proposal object fields
 */
export interface ProposalFields extends MoveObjectFields {
  id: { id: string };
  title: string;
  state: number;
  market_state?: unknown;
  dao_id?: string;
  winning_outcome?: number;
}

/**
 * Vault object fields
 */
export interface VaultFields extends MoveObjectFields {
  name: string;
  balance?: { fields: { value: string } };
  balances?: { fields: { id: { id: string } } };
  coin_type?: string;
  approved_coin_types?: string[];
}

/**
 * Pool object fields
 */
export interface PoolFields extends MoveObjectFields {
  fee_bps?: number;
  lp_supply?: string;
  reserve_asset?: string;
  reserve_stable?: string;
  asset_reserve?: string;
  stable_reserve?: string;
}

/**
 * Factory object fields
 */
export interface FactoryFields extends MoveObjectFields {
  dao_count?: number | string;
  is_paused?: boolean;
  permanently_disabled?: boolean;
  allowed_stable_types?: string[];
  launchpad_bid_fee?: string;
  launchpad_cranker_reward?: string;
  launchpad_settlement_reward?: string;
}

/**
 * FeeManager object fields
 */
export interface FeeManagerFields extends MoveObjectFields {
  dao_creation_fee?: string;
  proposal_creation_fee?: string;
  launchpad_creation_fee?: string;
  sui_balance?: string;
}

/**
 * Stream object fields
 */
export interface StreamFields extends MoveObjectFields {
  id: { id: string };
  beneficiary: string;
  amount_per_iteration: string;
  iterations_total: string;
  iterations_claimed: string;
  claimed_amount?: string;
  start_time: string;
  period_ms: string;
  iteration_period_ms?: string;
  cliff_time?: string;
  claim_window_ms?: string;
  max_per_withdrawal?: string;
}

/**
 * Oracle Grant object fields
 */
export interface OracleGrantFields extends MoveObjectFields {
  dao_id?: string;
  total_amount?: string;
  claimed_amount?: string;
  is_canceled?: boolean;
  description?: string;
  tier_count?: number;
  tiers?: unknown[];
}

/**
 * Escrow object fields
 */
export interface EscrowFields extends MoveObjectFields {
  balance?: string;
  proposal_id?: string;
}

/**
 * Market status struct (matches on-chain MarketStatus)
 */
export interface MarketStatus {
  trading_started: boolean;
  trading_ended: boolean;
  in_execution_window: boolean;  // New: true during 30-min execution window
  finalized: boolean;
}

/**
 * Market State object fields
 */
export interface MarketStateFields extends MoveObjectFields {
  current_twap?: string;
  observation_count?: number | string;
  last_observation_time?: string;
  status?: MarketStatus;
  execution_deadline?: string;     // New: timestamp when execution window expires
  frozen_twaps?: string[];         // New: TWAP values captured at trading end
  market_winner?: number;          // New: what TWAP determined should win
}

/**
 * Coin object fields
 */
export interface CoinFields extends MoveObjectFields {
  balance?: string;
  id?: { id: string };
}

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Generic Sui event data
 */
export interface SuiEventData<T = unknown> {
  id: { txDigest: string; eventSeq: string };
  packageId: string;
  transactionModule: string;
  sender: string;
  type: string;
  parsedJson: T;
  timestampMs?: string;
}

/**
 * DAO Created event
 * Emitted when a DAO is created via factory or launchpad
 */
export interface DAOCreatedEvent {
  account_id: string;
  dao_name: string;
  asset_type: string;
  stable_type: string;
  asset_decimals: number;
  stable_decimals: number;
  creator: string;
  affiliate_id: string;
  timestamp: string;
}

/**
 * Raise Created event
 * Emitted when a launchpad raise is created
 */
export interface RaiseCreatedEvent {
  raise_id: string;
  creator: string;
  affiliate_id: string;
  raise_token_type: string;
  stable_coin_type: string;
  raise_token_decimals: number;
  stable_coin_decimals: number;
  min_raise_amount: string;
  tokens_for_sale: string;
  start_time_ms: string;
  deadline_ms: string;
  description: string;
  metadata_keys: string[];
  metadata_values: string[];
}

/**
 * Raise Completed event
 */
export interface RaiseCompletedEvent {
  raise_id: string;
  dao_id: string;
  creator: string;
  total_raised: string;
  success: boolean;
}

/**
 * Proposal Created event
 */
export interface ProposalCreatedEvent {
  proposal_id: string;
  dao_id: string;
  proposer: string;
  title: string;
}

/**
 * Oracle Grant Created event
 */
export interface OracleGrantCreatedEvent {
  grant_id: string;
  dao_id: string;
  total_amount: string;
  description: string;
}

/**
 * Execution Window Started event (new for execution-required finalization)
 */
export interface ExecutionWindowStartedEvent {
  proposal_id: string;
  dao_id: string;
  market_winner: string;
  execution_deadline: string;
  timestamp: string;
}

/**
 * Proposal Execution Succeeded event (new for execution-required finalization)
 */
export interface ProposalExecutionSucceededEvent {
  proposal_id: string;
  dao_id: string;
  winning_outcome: string;
  intent_key: string;
  timestamp: string;
}

/**
 * Proposal Market Finalized event
 */
export interface ProposalMarketFinalizedEvent {
  proposal_id: string;
  dao_id: string;
  winning_outcome: string;
  approved: boolean;
  timestamp: string;
}

/**
 * Execution Timed Out event (new for execution-required finalization)
 */
export interface ExecutionTimedOutEvent {
  proposal_id: string;
  dao_id: string;
  original_market_winner: string;
  timestamp: string;
}

/**
 * Extract parsedJson with type safety
 */
export function extractEventData<T>(event: { parsedJson?: unknown }): T | null {
  return (event.parsedJson as T) ?? null;
}

// ============================================================================
// TRANSACTION TYPES
// ============================================================================

/**
 * Transaction argument types that can be passed to move calls
 */
export type TransactionArgument = TransactionResult | ReturnType<import('@mysten/sui/transactions').Transaction['pure']['u64']>;

/**
 * Shared object reference for transaction inputs
 */
export interface SharedObjectInput {
  objectId: string;
  initialSharedVersion: number;
  mutable?: boolean;
}

/**
 * Object reference for transaction inputs
 */
export interface ObjectInput {
  objectId: string;
  version?: string;
  digest?: string;
}

// ============================================================================
// TRANSACTION RESULT HELPERS
// ============================================================================

/**
 * Type for transaction results that return tuples
 * Use with destructuring: const [first, second] = result as TransactionResultTuple
 */
export type TransactionResultTuple = readonly [TransactionResult, TransactionResult, ...TransactionResult[]];

/**
 * Get first element from a transaction result (for single returns or tuple[0])
 */
export function txResultFirst(result: TransactionResult): TransactionResult {
  return (result as unknown as TransactionResult[])[0] ?? result;
}

/**
 * Get second element from a transaction result tuple
 */
export function txResultSecond(result: TransactionResult): TransactionResult {
  return (result as unknown as TransactionResult[])[1];
}

/**
 * Get element at index from transaction result
 */
export function txResultAt(result: TransactionResult, index: number): TransactionResult {
  return (result as unknown as TransactionResult[])[index];
}

// ============================================================================
// TYPE UTILS
// ============================================================================

/**
 * Get the type property from an unknown action (for error messages)
 */
export function getUnknownType(action: unknown): string {
  if (action && typeof action === 'object' && 'type' in action) {
    return String((action as { type: unknown }).type);
  }
  return 'unknown';
}

// ============================================================================
// DEPLOYMENT TYPES
// ============================================================================

/**
 * Shared object from deployment
 */
export interface DeployedSharedObject {
  name: string;
  objectId: string;
  initialSharedVersion: number;
}

/**
 * Admin cap from deployment
 */
export interface DeployedAdminCap {
  name: string;
  objectId: string;
}
