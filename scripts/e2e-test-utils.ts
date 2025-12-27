/**
 * Shared E2E Test Utilities
 *
 * Re-exports common utilities from test-utils modules and provides
 * SDK-dependent utilities.
 *
 * Usage:
 *   import { loadDaoInfo, sleep, mintStableTokens } from './e2e-test-utils';
 */

import { Transaction } from "@mysten/sui/transactions";
import { FutarchySDK } from "../src/FutarchySDK";
import { executeTransaction } from "./execute-tx";

// Re-export everything from test-utils
export * from "./test-utils";

// ============================================================================
// SDK-Dependent Utilities
// ============================================================================

import {
  DaoInfo,
  ConditionalCoinsInfo,
  ConditionalOutcomeCoinSet,
  loadDaoInfo,
  loadConditionalCoinsInfo,
  extractConditionalOutcomes,
} from "./test-utils";

/**
 * Wait for a proposal to reach a specific state
 */
export async function waitForStateTransition(
  sdk: FutarchySDK,
  proposalId: string,
  targetState: number,
  maxWaitMs: number = 120000,
  pollIntervalMs: number = 5000
): Promise<void> {
  const { sleep } = await import("./test-utils");
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const proposal = await sdk.client.getObject({
      id: proposalId,
      options: { showContent: true },
    });

    const content = proposal.data?.content;
    if (content && "fields" in content) {
      const currentState = (content.fields as any).state;
      if (Number(currentState) === targetState) {
        return;
      }
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(
    `Timeout waiting for proposal ${proposalId} to reach state ${targetState}`
  );
}

/**
 * Mint stable tokens using the SDK
 */
export async function mintStableTokens(
  sdk: FutarchySDK,
  stableTreasuryCap: string,
  stableType: string,
  amount: bigint,
  recipient: string,
  isShared: boolean = false
): Promise<void> {
  const tx = new Transaction();

  // Always use tx.object() - SDK resolves shared/owned automatically
  const treasuryCapArg = tx.object(stableTreasuryCap);

  const mintedCoin = tx.moveCall({
    target: "0x2::coin::mint",
    typeArguments: [stableType],
    arguments: [treasuryCapArg, tx.pure.u64(amount)],
  });

  tx.transferObjects([mintedCoin], tx.pure.address(recipient));

  await executeTransaction(sdk, tx, { network: "devnet" });
}

/**
 * Pre-flight checks for E2E tests
 */
export function checkPrerequisites(options: {
  requireDaoInfo?: boolean;
  requireConditionalCoins?: boolean;
  minOutcomes?: number;
}): {
  daoInfo?: DaoInfo;
  conditionalCoinsInfo?: ConditionalCoinsInfo;
  conditionalOutcomes?: ConditionalOutcomeCoinSet[];
} {
  const result: {
    daoInfo?: DaoInfo;
    conditionalCoinsInfo?: ConditionalCoinsInfo;
    conditionalOutcomes?: ConditionalOutcomeCoinSet[];
  } = {};

  if (options.requireDaoInfo) {
    result.daoInfo = loadDaoInfo();
    console.log(`✅ Loaded DAO info: ${result.daoInfo.accountId}`);
  }

  if (options.requireConditionalCoins) {
    result.conditionalCoinsInfo = loadConditionalCoinsInfo();
    if (!result.conditionalCoinsInfo) {
      throw new Error(
        "No conditional coins info found.\n" +
          "Please run: npm run deploy-conditional-coins"
      );
    }
    console.log(
      `✅ Loaded conditional coins: ${result.conditionalCoinsInfo.registryId}`
    );

    result.conditionalOutcomes = extractConditionalOutcomes(
      result.conditionalCoinsInfo
    );
    console.log(
      `   Found ${result.conditionalOutcomes.length} outcome coin sets`
    );

    if (
      options.minOutcomes &&
      result.conditionalOutcomes.length < options.minOutcomes
    ) {
      throw new Error(
        `Need at least ${options.minOutcomes} outcome coin sets, ` +
          `but only found ${result.conditionalOutcomes.length}.\n` +
          `Please deploy more conditional coins.`
      );
    }
  }

  return result;
}
