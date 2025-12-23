/**
 * Indexer Wait Utilities for E2E Tests
 *
 * Smart waiting utilities that poll the indexer or RPC to verify
 * transactions have been processed, instead of using hardcoded sleeps.
 */

import { SuiClient } from "@mysten/sui/client";
import { TEST_CONFIG, sleep } from "./timing";
import { isLocalnet } from "./network";

/**
 * Wait for a transaction to be confirmed and indexed.
 * Returns when the transaction digest is found in the network.
 */
export async function waitForTxConfirmation(
  client: SuiClient,
  digest: string,
  options: {
    maxWait?: number;
    pollInterval?: number;
  } = {}
): Promise<void> {
  const {
    maxWait = TEST_CONFIG.INDEXER_MAX_WAIT_MS,
    pollInterval = TEST_CONFIG.INDEXER_POLL_INTERVAL_MS,
  } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    try {
      const tx = await client.getTransactionBlock({ digest });
      if (tx) {
        return; // Transaction found
      }
    } catch (e) {
      // Transaction not found yet, continue polling
    }
    await sleep(pollInterval);
  }

  throw new Error(`Transaction ${digest} not confirmed after ${maxWait}ms`);
}

/**
 * Wait for an object to exist and be queryable.
 */
export async function waitForObject(
  client: SuiClient,
  objectId: string,
  options: {
    maxWait?: number;
    pollInterval?: number;
  } = {}
): Promise<void> {
  const {
    maxWait = TEST_CONFIG.INDEXER_MAX_WAIT_MS,
    pollInterval = TEST_CONFIG.INDEXER_POLL_INTERVAL_MS,
  } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    try {
      const obj = await client.getObject({ id: objectId });
      if (obj.data) {
        return; // Object found
      }
    } catch (e) {
      // Object not found yet, continue polling
    }
    await sleep(pollInterval);
  }

  throw new Error(`Object ${objectId} not found after ${maxWait}ms`);
}

/**
 * Wait for object to have a specific version (after mutation).
 */
export async function waitForObjectVersion(
  client: SuiClient,
  objectId: string,
  minVersion: number | string,
  options: {
    maxWait?: number;
    pollInterval?: number;
  } = {}
): Promise<void> {
  const {
    maxWait = TEST_CONFIG.INDEXER_MAX_WAIT_MS,
    pollInterval = TEST_CONFIG.INDEXER_POLL_INTERVAL_MS,
  } = options;

  const minVersionNum = typeof minVersion === 'string' ? parseInt(minVersion, 10) : minVersion;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    try {
      const obj = await client.getObject({ id: objectId });
      if (obj.data) {
        const currentVersion = typeof obj.data.version === 'string'
          ? parseInt(obj.data.version, 10)
          : obj.data.version;
        if (currentVersion >= minVersionNum) {
          return; // Object has expected version
        }
      }
    } catch (e) {
      // Object not found yet, continue polling
    }
    await sleep(pollInterval);
  }

  throw new Error(`Object ${objectId} did not reach version ${minVersion} after ${maxWait}ms`);
}

/**
 * Wait for a proposal to reach a specific state.
 */
export async function waitForProposalState(
  client: SuiClient,
  proposalId: string,
  targetState: number,
  options: {
    maxWait?: number;
    pollInterval?: number;
  } = {}
): Promise<void> {
  const {
    maxWait = TEST_CONFIG.STATE_MAX_WAIT_MS,
    pollInterval = TEST_CONFIG.STATE_POLL_INTERVAL_MS,
  } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    try {
      const proposal = await client.getObject({
        id: proposalId,
        options: { showContent: true },
      });

      if (proposal.data?.content && "fields" in proposal.data.content) {
        const currentState = Number((proposal.data.content.fields as any).state);
        if (currentState === targetState) {
          return;
        }
        // Log progress for long waits
        if (Date.now() - startTime > 10000) {
          console.log(`   Current state: ${currentState}, waiting for: ${targetState}`);
        }
      }
    } catch (e) {
      // Proposal not found yet, continue polling
    }
    await sleep(pollInterval);
  }

  throw new Error(`Proposal ${proposalId} did not reach state ${targetState} after ${maxWait}ms`);
}

/**
 * Smart indexer wait - use this after transactions on localnet.
 * On other networks, this is a no-op or minimal delay.
 */
export async function waitForIndexer(
  network: string,
  options: {
    minWait?: number;
    description?: string;
  } = {}
): Promise<void> {
  const { minWait = TEST_CONFIG.TX_CONFIRMATION_MS, description = "indexer" } = options;

  if (isLocalnet(network)) {
    console.log(`⏳ Waiting for ${description} to catch up...`);
    await sleep(minWait);
  }
  // On devnet/testnet, indexer is fast enough - no wait needed
}

/**
 * Wait for a time period to elapse (for proposal review/trading periods).
 * This logs progress and can be interrupted.
 */
export async function waitForTimePeriod(
  durationMs: number,
  options: {
    description?: string;
    progressInterval?: number;
  } = {}
): Promise<void> {
  const {
    description = "time period",
    progressInterval = 10000, // Log progress every 10 seconds
  } = options;

  const startTime = Date.now();
  const endTime = startTime + durationMs;

  console.log(`⏳ Waiting for ${description} (${Math.round(durationMs / 1000)}s)...`);

  while (Date.now() < endTime) {
    const remaining = Math.round((endTime - Date.now()) / 1000);
    if (remaining > 0 && remaining % (progressInterval / 1000) === 0) {
      console.log(`   ${remaining}s remaining...`);
    }
    await sleep(Math.min(1000, endTime - Date.now()));
  }

  console.log(`✅ ${description} complete`);
}
