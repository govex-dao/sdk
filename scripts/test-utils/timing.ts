/**
 * Timing Utilities for E2E Tests
 *
 * Consolidated timing constants and smart waiting utilities.
 * Replaces ad-hoc sleep() calls with configurable, network-aware waits.
 */

/**
 * Test timing configuration - all timing values in one place
 */
export const TEST_CONFIG = {
  // Transaction confirmation delays
  TX_CONFIRMATION_MS: 500,
  TX_PROPAGATION_MS: 1000,

  // Indexer polling
  INDEXER_POLL_INTERVAL_MS: 500,
  INDEXER_MAX_WAIT_MS: 30_000,

  // State transition polling
  STATE_POLL_INTERVAL_MS: 2000,
  STATE_MAX_WAIT_MS: 120_000,

  // Proposal timing (for tests) - must match launchpad-e2e.ts config
  REVIEW_PERIOD_MS: 1_000,      // 1 second (matches launchpad reviewPeriodMs: 1000n)
  TRADING_PERIOD_MS: 60_000,    // 60 seconds (matches launchpad tradingPeriodMs: 60_000n)

  // Network-specific multipliers
  LOCALNET_MULTIPLIER: 1,
  DEVNET_MULTIPLIER: 2,
  TESTNET_MULTIPLIER: 3,
} as const;

/**
 * Simple async sleep
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a condition to become true with polling
 */
export async function waitFor<T>(
  condition: () => Promise<T | null | undefined>,
  options: {
    pollInterval?: number;
    maxWait?: number;
    description?: string;
  } = {}
): Promise<T> {
  const {
    pollInterval = TEST_CONFIG.INDEXER_POLL_INTERVAL_MS,
    maxWait = TEST_CONFIG.INDEXER_MAX_WAIT_MS,
    description = 'condition',
  } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    const result = await condition();
    if (result !== null && result !== undefined) {
      return result;
    }
    await sleep(pollInterval);
  }

  throw new Error(
    `Timeout waiting for ${description} after ${maxWait}ms`
  );
}

/**
 * Wait for transaction to be indexed (check for specific object or event)
 */
export async function waitForTxIndexed(
  checkFn: () => Promise<boolean>,
  options: {
    maxWait?: number;
    description?: string;
  } = {}
): Promise<void> {
  const { maxWait = TEST_CONFIG.INDEXER_MAX_WAIT_MS, description = 'transaction' } = options;

  await waitFor(
    async () => {
      const indexed = await checkFn();
      return indexed ? true : null;
    },
    {
      pollInterval: TEST_CONFIG.INDEXER_POLL_INTERVAL_MS,
      maxWait,
      description: `${description} to be indexed`,
    }
  );
}

// Note: waitForProposalState is in indexer-wait.ts with SuiClient integration

/**
 * Get timing multiplier based on network
 */
export function getNetworkMultiplier(network: string): number {
  switch (network) {
    case 'localnet':
      return TEST_CONFIG.LOCALNET_MULTIPLIER;
    case 'devnet':
      return TEST_CONFIG.DEVNET_MULTIPLIER;
    case 'testnet':
      return TEST_CONFIG.TESTNET_MULTIPLIER;
    default:
      return TEST_CONFIG.DEVNET_MULTIPLIER;
  }
}

/**
 * Get adjusted timing value for the current network
 */
export function getNetworkTiming(baseMs: number, network: string): number {
  return baseMs * getNetworkMultiplier(network);
}
