/**
 * Test Constants
 *
 * All magic numbers and constants for E2E tests in one place.
 */

// ============================================================================
// Outcome Indices
// ============================================================================

export const REJECT_OUTCOME_INDEX = 0;
export const ACCEPT_OUTCOME_INDEX = 1;

// ============================================================================
// Proposal States
// ============================================================================

export const STATE_PREMARKET = 0;
export const STATE_REVIEW = 1;
export const STATE_TRADING = 2;
export const STATE_AWAITING_EXECUTION = 3;
export const STATE_FINALIZED = 4;

export const STATE_NAMES: Record<number, string> = {
  [STATE_PREMARKET]: "PREMARKET",
  [STATE_REVIEW]: "REVIEW",
  [STATE_TRADING]: "TRADING",
  [STATE_AWAITING_EXECUTION]: "AWAITING_EXECUTION",
  [STATE_FINALIZED]: "FINALIZED",
};

export function getStateName(state: number): string {
  return STATE_NAMES[state] ?? `UNKNOWN(${state})`;
}

// ============================================================================
// Time Windows (in milliseconds)
// ============================================================================

// Execution window for proposals
export const EXECUTION_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

// Test timing defaults - must match launchpad-e2e.ts config
export const DEFAULT_REVIEW_PERIOD_MS = 1_000; // 1 second (matches launchpad)
export const DEFAULT_TRADING_PERIOD_MS = 60_000; // 60 seconds (matches launchpad)

// ============================================================================
// Test Token Amounts
// ============================================================================

// Standard test amounts (in smallest units, typically 9 decimals)
export const TEST_AMOUNTS = {
  MINT_AMOUNT: BigInt(1_000_000_000_000), // 1,000 tokens
  SMALL_SWAP: BigInt(1_000_000_000), // 1 token
  MEDIUM_SWAP: BigInt(10_000_000_000), // 10 tokens
  LARGE_SWAP: BigInt(100_000_000_000), // 100 tokens
  CONTRIBUTION: BigInt(1_500_000_000_000), // 1,500 tokens (standard launchpad contribution)
} as const;

// ============================================================================
// Numeric Limits
// ============================================================================

export const MAX_U64 = BigInt("18446744073709551615");
export const MAX_U128 = BigInt("340282366920938463463374607431768211455");

// ============================================================================
// Default Slippage
// ============================================================================

export const DEFAULT_SLIPPAGE_BPS = 100; // 1%
export const MAX_SLIPPAGE_BPS = 1000; // 10%
