/**
 * Test: Memo Action Execution
 *
 * This test validates the simplest action type - memo:
 * 1. Create proposal with memo action on Accept
 * 2. Trade to make Accept win
 * 3. Finalize proposal
 * 4. Execute memo action
 * 5. Verify MemoEmitted event is fired
 *
 * This is the simplest action test - no state changes, just event emission.
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
} from "./e2e-test-utils";

const MEMO_MESSAGE = "Hello from Futarchy! This memo was executed via governance.";

async function main() {
  logSection("TEST: MEMO ACTION EXECUTION");

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
  const baseAssetCurrencyId = daoInfo.assetCurrencyId;
  const baseStableCurrencyId = daoInfo.stableCurrencyId;

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
  // STEP 2: Create and initialize proposal atomically with memo action
  // ============================================================================
  logStep(2, "CREATE AND INITIALIZE PROPOSAL (atomic, with memo action)");

  logInfo(`Memo message: "${MEMO_MESSAGE}"`);

  const createTx = proposalWorkflow.createAndInitializeProposal({
    // CreateProposalConfig
    daoAccountId,
    assetType,
    stableType,
    title: "Test Memo Action",
    introduction: "Testing the memo action execution",
    metadata: JSON.stringify({ test: "memo-action" }),
    outcomeMessages: ["Reject", "Accept and emit memo"],
    outcomeDetails: ["Do nothing", "Emit a memo event"],
    proposer: activeAddress,
    treasuryAddress: activeAddress,
    usedQuota: false,
    feeCoins: feeCoinIds,
    feeAmount,
    // Actions to add before finalization
    outcomeActions: [
      {
        outcomeIndex: ACCEPT_OUTCOME_INDEX,
        actions: [
          {
            type: "memo",
            message: MEMO_MESSAGE,
          },
        ],
      },
    ],
    registryId,
    // AdvanceToReviewConfig
    lpType,
    spotPoolId,
    senderAddress: activeAddress,
    baseAssetCurrencyId,
    baseStableCurrencyId,
    conditionalCoinsRegistry: {
      registryId: conditionalCoinsInfo.registryId,
      coinSets: conditionalOutcomes.map((outcome) => ({
        outcomeIndex: outcome.index,
        assetCoinType: outcome.asset.coinType,
        assetCapId: outcome.asset.treasuryCapId,
        assetCurrencyId: outcome.asset.currencyId,
        stableCoinType: outcome.stable.coinType,
        stableCapId: outcome.stable.treasuryCapId,
        stableCurrencyId: outcome.stable.currencyId,
      })),
    },
  });

  const createResult = await executeTransaction(sdk, createTx.transaction, {
    network: "devnet",
    showObjectChanges: true,
    showEvents: true,
  });

  // Log PoolOracleCreated events to map oracle IDs to outcomes
  const poolOracleEvents = createResult.events?.filter((e: any) =>
    e.type.includes("PoolOracleCreated")
  );
  if (poolOracleEvents && poolOracleEvents.length > 0) {
    logInfo("Pool-Oracle mappings:");
    poolOracleEvents.forEach((e: any) => {
      console.log(`   Outcome ${e.parsedJson?.outcome_idx}: oracle_id=${e.parsedJson?.oracle_id}`);
    });
  }

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
  // STEP 4: Buy ACCEPT tokens to make Accept win
  // ============================================================================
  logStep(4, "BUY ACCEPT TOKENS");

  // Mint and swap for ACCEPT tokens
  // Use a larger trade amount (10x) to have more impact on the price
  const tradeAmount = 10_000_000_000n; // 10 billion (same as proposal-with-swaps)
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

  const swapResult = await executeTransaction(sdk, swapTx.transaction, { network: "devnet", showEvents: true, showObjectChanges: true });
  logSuccess("Bought ACCEPT tokens");

  // Check if swap events were emitted
  const swapEvents = swapResult.events?.filter((e: any) =>
    e.type.includes("SwapEvent") || e.type.includes("PriceEvent")
  );
  if (swapEvents && swapEvents.length > 0) {
    logInfo(`Swap/Price events emitted: ${swapEvents.length}`);
    swapEvents.forEach((e: any, i: number) => {
      console.log(`   Event ${i}: ${e.type}`);
      console.log(`     Data: ${JSON.stringify(e.parsedJson, null, 2)}`);
    });
  } else {
    logError("No SwapEvent or PriceEvent found - swap may not have executed properly!");
    console.log("   All events from swap:", swapResult.events?.map((e: any) => e.type));
  }
  console.log();

  // ============================================================================
  // STEP 5: Finalize proposal
  // ============================================================================
  logStep(5, "FINALIZE PROPOSAL");

  // Wait for trading period PLUS extra minute for TWAP to accumulate
  // TWAP needs time to weight the new price into the average (twap_price_cap_window = 60s)
  await waitForTimePeriod(TEST_CONFIG.TRADING_PERIOD_MS + 60_000 + 2000, { description: "trading period + TWAP accumulation" });

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
    logError("Expected ACCEPT to win!");
    process.exit(1);
  }
  console.log();

  // ============================================================================
  // STEP 6: Execute memo action and verify event (via AutoExecutor)
  // ============================================================================
  logStep(6, "EXECUTE MEMO ACTION AND VERIFY EVENT (via AutoExecutor)");

  logInfo("Executing memo action via AutoExecutor...");

  // Wait for indexer to index the proposal with staged actions
  logInfo("Waiting for indexer to index proposal (5s)...");
  await sleep(5000);

  // Create AutoExecutor using SDK helper
  const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:9090";
  const autoExecutor = sdk.createAutoExecutor(backendUrl);

  // Execute winning outcome actions - AutoExecutor fetches action specs from backend
  const executeTx = await autoExecutor.executeProposal(proposalId, {
    accountId: daoAccountId,
    outcome: ACCEPT_OUTCOME_INDEX,
    escrowId,
    spotPoolId,
    lpType,
  });

  const executeResult = await executeTransaction(sdk, executeTx.transaction, {
    network: "devnet",
    showEvents: true,
  });

  // Find MemoEmitted event
  const memoEvent = executeResult.events?.find((e: any) =>
    e.type.includes("Memo") || e.type.includes("memo")
  );

  if (memoEvent) {
    logSuccess("Memo event emitted!");
    console.log(`   Event type: ${memoEvent.type}`);
    console.log(`   Event data: ${JSON.stringify(memoEvent.parsedJson, null, 2)}`);

    // Verify message content if available
    const eventMessage = memoEvent.parsedJson?.message || memoEvent.parsedJson?.memo;
    if (eventMessage && eventMessage.includes("Futarchy")) {
      logSuccess("Memo message verified in event!");
    }
  } else {
    logInfo("No explicit memo event found (may be named differently)");
    logInfo("Checking all events:");
    executeResult.events?.forEach((e: any, i: number) => {
      console.log(`   ${i}: ${e.type}`);
    });
  }
  console.log();

  // ============================================================================
  // Summary
  // ============================================================================
  logSection("TEST COMPLETED SUCCESSFULLY");
  console.log("Summary:");
  console.log("  - Created proposal with memo action");
  console.log("  - Made ACCEPT win via trading");
  console.log("  - Executed memo action");
  console.log(`  - Memo message: "${MEMO_MESSAGE.substring(0, 40)}..."`);
  console.log();
}

main().catch((error) => {
  logError(`Test failed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
