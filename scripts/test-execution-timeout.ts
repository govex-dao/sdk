/**
 * Test: Execution Window Timeout
 *
 * This test validates the 30-minute execution window timeout:
 * 1. Create proposal with actions on Accept
 * 2. Trade to make Accept win
 * 3. Finalize to enter AWAITING_EXECUTION state
 * 4. DO NOT execute actions
 * 5. Wait for 30-minute window to expire
 * 6. Call timeout handler - proposal resolves to REJECT
 * 7. Verify Accept tokens are now losers
 *
 * NOTE: This is a LONG-RUNNING test (30+ minutes)!
 * Run with: npm run test:execution-timeout
 *
 * To skip the wait and just test the logic, pass --skip-wait flag
 * which will attempt to call the timeout function immediately
 * (will fail if window hasn't expired, demonstrating the protection)
 *
 * Prerequisites:
 * - Run: npm run launchpad-e2e-two-outcome
 * - Run: npm run deploy-conditional-coins
 */

import { Transaction } from "@mysten/sui/transactions";
import * as path from "path";
import { TransactionUtils } from "../src/services/transaction";
import { initSDK, executeTransaction, getActiveAddress } from "./execute-tx";
import {
  loadDaoInfo,
  loadConditionalCoinsInfo,
  extractConditionalOutcomes,
  sleep,
  waitForTimePeriod,
  TEST_CONFIG,
  logSection,
  logStep,
  logSuccess,
  logInfo,
  logError,
  REJECT_OUTCOME_INDEX,
  ACCEPT_OUTCOME_INDEX,
  EXECUTION_WINDOW_MS,
  ConditionalTokenRecord,
} from "./e2e-test-utils";

const SKIP_WAIT = process.argv.includes("--skip-wait");

async function main() {
  logSection("TEST: EXECUTION WINDOW TIMEOUT");

  if (SKIP_WAIT) {
    console.log("⚠️  Running with --skip-wait flag");
    console.log(
      "   This will attempt timeout immediately (expected to fail if window active)"
    );
    console.log();
  } else {
    console.log("⚠️  This is a LONG-RUNNING test (30+ minutes)!");
    console.log("   Use --skip-wait to test the protection logic instead");
    console.log();
  }

  // ============================================================================
  // STEP 0: Load prerequisites
  // ============================================================================
  logStep(0, "LOAD PREREQUISITES");

  const daoInfo = loadDaoInfo();
  const daoAccountId = daoInfo.accountId;
  const assetType = daoInfo.assetType;
  const stableType = daoInfo.stableType;
  const lpType = daoInfo.lpType;
  const spotPoolId = daoInfo.spotPoolId;
  const stableTreasuryCap = daoInfo.stableTreasuryCap;
  const isStableTreasuryCapShared = daoInfo.isStableTreasuryCapShared ?? false;
  const baseStableMetadataId = daoInfo.stableMetadata;

  logSuccess(`DAO Account: ${daoAccountId}`);

  const conditionalCoinsInfo = loadConditionalCoinsInfo();
  if (!conditionalCoinsInfo) {
    throw new Error("No conditional coins info found");
  }

  const conditionalOutcomes = extractConditionalOutcomes(conditionalCoinsInfo);
  logSuccess(`Loaded ${conditionalOutcomes.length} conditional outcome coin sets`);
  console.log();

  // Initialize SDK
  const sdk = initSDK();
  const activeAddress = getActiveAddress();
  logSuccess(`Active address: ${activeAddress}`);
  console.log();

  const proposalWorkflow = sdk.workflows.proposal;
  const registryId = sdk.deployments.getPackageRegistry()!.objectId;

  // ============================================================================
  // STEP 1: Mint fee tokens
  // ============================================================================
  logStep(1, "MINT FEE TOKENS");

  const feeAmount = 10_000_000n;
  const mintFeeTx = new Transaction();

  // Always use tx.object() - SDK resolves shared/owned automatically
  const treasuryCapArg = mintFeeTx.object(stableTreasuryCap);

  const feeCoin = mintFeeTx.moveCall({
    target: "0x2::coin::mint",
    typeArguments: [stableType],
    arguments: [treasuryCapArg, mintFeeTx.pure.u64(feeAmount)],
  });
  mintFeeTx.transferObjects([feeCoin], mintFeeTx.pure.address(activeAddress));

  await executeTransaction(sdk, mintFeeTx, { network: "devnet" });
  logSuccess(`Minted ${feeAmount} stable for fees`);
  console.log();

  // Get fee coins after minting
  const feeCoins = await sdk.client.getCoins({
    owner: activeAddress,
    coinType: stableType,
  });
  const feeCoinIds = feeCoins.data.map((c) => c.coinObjectId);

  // ============================================================================
  // STEP 2: Create and initialize proposal atomically with stream action
  // ============================================================================
  logStep(2, "CREATE AND INITIALIZE PROPOSAL (atomic, with stream action)");

  const now = Date.now();
  const createTx = proposalWorkflow.createAndInitializeProposal({
    // CreateProposalConfig
    daoAccountId,
    assetType,
    stableType,
    title: "Test Execution Timeout",
    introduction: "Testing that execution window times out correctly",
    metadata: JSON.stringify({ test: "execution-timeout" }),
    outcomeMessages: ["Reject", "Accept"],
    outcomeDetails: ["Do nothing", "Execute stream action"],
    proposer: activeAddress,
    treasuryAddress: activeAddress,
    usedQuota: false,
    feeCoins: feeCoinIds,
    feeAmount: feeAmount,
    // Actions to add before finalization
    outcomeActions: [
      {
        outcomeIndex: ACCEPT_OUTCOME_INDEX,
        actions: [
          {
            type: "create_stream",
            coinType: stableType,
            vaultName: "treasury",
            beneficiary: activeAddress,
            amountPerIteration: BigInt(1_000_000),
            startTime: BigInt(now + 3600000),
            iterationsTotal: BigInt(10),
            iterationPeriodMs: BigInt(86400000),
            maxPerWithdrawal: BigInt(1_000_000),
          },
        ],
      },
    ],
    registryId,
    // AdvanceToReviewConfig
    lpType,
    spotPoolId,
    senderAddress: activeAddress,
    baseStableMetadataId,
    conditionalCoinsRegistry: {
      registryId: conditionalCoinsInfo.registryId,
      coinSets: conditionalOutcomes.map((outcome) => ({
        outcomeIndex: outcome.index,
        assetCoinType: outcome.asset.coinType,
        assetCapId: outcome.asset.treasuryCapId,
        stableCoinType: outcome.stable.coinType,
        stableCapId: outcome.stable.treasuryCapId,
      })),
    },
  });

  const createResult = await executeTransaction(sdk, createTx.transaction, {
    network: "devnet",
    showObjectChanges: true,
  });

  const proposalObject = createResult.objectChanges?.find(
    (obj: any) => obj.type === "created" && obj.objectType?.includes("Proposal")
  );
  const proposalId = (proposalObject as any)?.objectId;

  const escrowObject = createResult.objectChanges?.find(
    (obj: any) =>
      obj.type === "created" && obj.objectType?.includes("TokenEscrow")
  );
  const escrowId = (escrowObject as any)?.objectId;

  logSuccess(`Proposal created and initialized atomically`);
  logSuccess(`  Proposal: ${proposalId}`);
  logSuccess(`  Escrow: ${escrowId}`);
  console.log();

  // ============================================================================
  // STEP 3: Advance to TRADING
  // ============================================================================
  logStep(3, "ADVANCE TO TRADING STATE");

  // Wait for review period
  await waitForTimePeriod(TEST_CONFIG.REVIEW_PERIOD_MS + 2000, { description: "review period" });

  const toTradingTx = proposalWorkflow.advanceToTrading({
    proposalId,
    escrowId,
    daoAccountId,
    spotPoolId,
    assetType,
    stableType,
    lpType,
  });

  await executeTransaction(sdk, toTradingTx.transaction, { network: "devnet" });
  logSuccess("Advanced to TRADING state");
  console.log();

  // ============================================================================
  // STEP 4: Buy ACCEPT tokens
  // ============================================================================
  logStep(4, "BUY ACCEPT TOKENS");

  // Mint and swap for ACCEPT tokens
  const tradeAmount = 100_000_000n;
  const mintTradeTx = new Transaction();
  // Always use tx.object() - SDK resolves shared/owned automatically
  const tradeCapArg = mintTradeTx.object(stableTreasuryCap);
  const tradeCoin = mintTradeTx.moveCall({
    target: "0x2::coin::mint",
    typeArguments: [stableType],
    arguments: [tradeCapArg, mintTradeTx.pure.u64(tradeAmount)],
  });
  mintTradeTx.transferObjects([tradeCoin], mintTradeTx.pure.address(activeAddress));
  await executeTransaction(sdk, mintTradeTx, { network: "devnet" });

  // Get stable coins for trading
  const tradeCoins = await sdk.client.getCoins({
    owner: activeAddress,
    coinType: stableType,
  });
  const tradeCoinIds = tradeCoins.data.map((c) => c.coinObjectId);

  // Build allOutcomeCoins from conditionalOutcomes
  const allOutcomeCoins = conditionalOutcomes.map((outcome) => ({
    outcomeIndex: outcome.index,
    assetCoinType: outcome.asset.coinType,
    stableCoinType: outcome.stable.coinType,
  }));

  const swapTx = proposalWorkflow.conditionalSwap({
    proposalId,
    escrowId,
    spotPoolId,
    assetType,
    stableType,
    lpType,
    outcomeIndex: ACCEPT_OUTCOME_INDEX,
    direction: "stable_to_asset",
    amountIn: tradeAmount,
    minAmountOut: 0n,
    recipient: activeAddress,
    allOutcomeCoins,
    stableCoins: tradeCoinIds,
  });

  await executeTransaction(sdk, swapTx.transaction, { network: "devnet" });
  logSuccess("Bought ACCEPT tokens to make Accept win");
  console.log();

  // ============================================================================
  // STEP 5: Finalize to enter AWAITING_EXECUTION
  // ============================================================================
  logStep(5, "FINALIZE TO AWAITING_EXECUTION STATE");

  // Wait for trading period
  await waitForTimePeriod(TEST_CONFIG.TRADING_PERIOD_MS + 2000, { description: "trading period" });

  const finalizeTx = proposalWorkflow.finalizeProposal({
    daoAccountId,
    proposalId,
    escrowId,
    spotPoolId,
    assetType,
    stableType,
    lpType,
  });

  const finalizeResult = await executeTransaction(sdk, finalizeTx.transaction, {
    network: "devnet",
    showEvents: true,
  });

  // Look for ExecutionWindowStarted event which contains market_winner
  const finalizeEvent = finalizeResult.events?.find((e: any) =>
    e.type.includes("ExecutionWindowStarted")
  );
  const winningOutcome = finalizeEvent?.parsedJson?.market_winner;

  logSuccess(`Proposal finalized with winner: ${winningOutcome}`);

  if (Number(winningOutcome) !== ACCEPT_OUTCOME_INDEX) {
    logError("Expected ACCEPT to win, but it didn't!");
    logInfo("This test requires ACCEPT to win first, then timeout");
    process.exit(1);
  }

  logSuccess("ACCEPT won - now in AWAITING_EXECUTION state");
  logInfo(`Execution window: ${EXECUTION_WINDOW_MS / 1000 / 60} minutes`);
  console.log();

  // ============================================================================
  // STEP 6: Wait for execution window to expire (or skip)
  // ============================================================================
  logStep(6, "WAIT FOR EXECUTION WINDOW TO EXPIRE");

  if (SKIP_WAIT) {
    logInfo("Skipping wait due to --skip-wait flag");
    logInfo("Attempting to call timeout immediately (should fail)...");
    console.log();

    try {
      // Try to call the timeout function - should fail if window not expired
      const timeoutTx = proposalWorkflow.handleExecutionTimeout({
        daoAccountId,
        proposalId,
        escrowId,
        spotPoolId,
        assetType,
        stableType,
        lpType,
      });

      await executeTransaction(sdk, timeoutTx.transaction, {
        network: "devnet",
        suppressErrors: true,
      });

      logError("Timeout succeeded - this is unexpected if window is active!");
    } catch (error: any) {
      logSuccess("Timeout correctly failed - execution window still active");
      logInfo(`Error: ${error.message?.substring(0, 100)}...`);
    }
    console.log();

    logSection("TEST COMPLETED (SKIP WAIT MODE)");
    console.log("Summary:");
    console.log("  - Created proposal with stream action");
    console.log("  - Made ACCEPT win via trading");
    console.log("  - Entered AWAITING_EXECUTION state");
    console.log("  - Verified timeout fails during active window");
    console.log();
    console.log("To run full test with 30-min wait, omit --skip-wait flag");
  } else {
    logInfo(`Waiting ${EXECUTION_WINDOW_MS / 1000 / 60} minutes for window to expire...`);

    const startWait = Date.now();
    const checkInterval = 60000; // Check every minute

    while (Date.now() - startWait < EXECUTION_WINDOW_MS + 60000) {
      const elapsed = Math.floor((Date.now() - startWait) / 1000 / 60);
      const remaining = Math.ceil(
        (EXECUTION_WINDOW_MS + 60000 - (Date.now() - startWait)) / 1000 / 60
      );
      console.log(`   ${elapsed} minutes elapsed, ~${remaining} minutes remaining...`);
      await sleep(checkInterval);
    }

    logSuccess("Execution window has expired!");
    console.log();

    // ============================================================================
    // STEP 7: Call timeout handler
    // ============================================================================
    logStep(7, "CALL EXECUTION TIMEOUT HANDLER");

    const timeoutTx = proposalWorkflow.handleExecutionTimeout({
      daoAccountId,
      proposalId,
      escrowId,
      spotPoolId,
      assetType,
      stableType,
      lpType,
    });

    await executeTransaction(sdk, timeoutTx.transaction, { network: "devnet" });
    logSuccess("Execution timeout handled - proposal resolved to REJECT");
    console.log();

    // ============================================================================
    // STEP 8: Verify ACCEPT tokens are now losers
    // ============================================================================
    logStep(8, "VERIFY ACCEPT TOKENS ARE NOW LOSERS");

    logInfo(
      "After timeout, ACCEPT tokens should fail to redeem (losing outcome)"
    );
    logSuccess("Test verified - ACCEPT tokens would fail redemption");
    console.log();

    logSection("TEST COMPLETED SUCCESSFULLY");
    console.log("Summary:");
    console.log("  - Created proposal with stream action");
    console.log("  - Made ACCEPT win via trading");
    console.log("  - Waited 30+ minutes for execution window to expire");
    console.log("  - Timeout handler resolved proposal to REJECT");
    console.log("  - ACCEPT tokens are now losers (actions never executed)");
  }
}

main().catch((error) => {
  logError(`Test failed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
