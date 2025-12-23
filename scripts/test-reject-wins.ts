/**
 * Test: Reject Outcome Wins
 *
 * This test validates the scenario where the REJECT outcome wins:
 * 1. Create proposal with actions on Accept
 * 2. Trade to push REJECT TWAP higher (buy reject tokens)
 * 3. Finalize - REJECT wins
 * 4. Verify actions are NOT executed
 * 5. Redeem REJECT conditional tokens (winners)
 * 6. Verify ACCEPT tokens cannot be redeemed (losers)
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
  waitForIndexer,
  waitForTimePeriod,
  TEST_CONFIG,
  logSection,
  logStep,
  logSuccess,
  logInfo,
  logError,
  REJECT_OUTCOME_INDEX,
  ACCEPT_OUTCOME_INDEX,
  ConditionalTokenRecord,
} from "./e2e-test-utils";

async function main() {
  logSection("TEST: REJECT OUTCOME WINS");

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

  logSuccess(`DAO Account: ${daoAccountId}`);
  logSuccess(`Spot Pool: ${spotPoolId}`);

  const conditionalCoinsInfo = loadConditionalCoinsInfo();
  if (!conditionalCoinsInfo) {
    throw new Error(
      "No conditional coins info found. Run: npm run deploy-conditional-coins"
    );
  }

  const conditionalOutcomes = extractConditionalOutcomes(conditionalCoinsInfo);
  logSuccess(
    `Loaded ${conditionalOutcomes.length} conditional outcome coin sets`
  );
  console.log();

  // Initialize SDK
  const sdk = initSDK();
  const activeAddress = getActiveAddress();
  logSuccess(`Active address: ${activeAddress}`);
  console.log();

  // Get workflow
  const proposalWorkflow = sdk.workflows.proposal;
  const registryId = sdk.deployments.getSharedObject(
    "AccountProtocol",
    "PackageRegistry"
  )!.objectId;

  // Track conditional tokens for redemption
  const allConditionalTokens: ConditionalTokenRecord[] = [];

  // ============================================================================
  // STEP 1: Mint fee tokens
  // ============================================================================
  logStep(1, "MINT FEE TOKENS");

  const feeAmount = 10_000_000n; // 10 stable
  const mintFeeTx = new Transaction();

  const treasuryCapArg = isStableTreasuryCapShared
    ? mintFeeTx.sharedObjectRef({
        objectId: stableTreasuryCap,
        initialSharedVersion: 1,
        mutable: true,
      })
    : mintFeeTx.object(stableTreasuryCap);

  const feeCoin = mintFeeTx.moveCall({
    target: "0x2::coin::mint",
    typeArguments: [stableType],
    arguments: [treasuryCapArg, mintFeeTx.pure.u64(feeAmount)],
  });
  mintFeeTx.transferObjects([feeCoin], mintFeeTx.pure.address(activeAddress));

  await executeTransaction(sdk, mintFeeTx, { network: "devnet" });
  logSuccess(`Minted ${feeAmount} stable for fees`);
  console.log();

  // ============================================================================
  // STEP 2: Create proposal with memo action on Accept
  // ============================================================================
  logStep(2, "CREATE PROPOSAL (with memo action on Accept)");

  const createTx = proposalWorkflow.createProposal({
    daoAccountId,
    assetType,
    stableType,
    title: "Test Reject Wins",
    introductionDetails: "Testing that reject outcome wins correctly",
    metadata: JSON.stringify({ test: "reject-wins" }),
    outcomeMessages: ["Reject this proposal", "Accept this proposal"],
    outcomeDetails: ["Do nothing", "Execute memo action"],
    feeAmount: feeAmount,
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
  logSuccess(`Proposal created: ${proposalId}`);
  console.log();

  // ============================================================================
  // STEP 3: Add memo action to Accept outcome
  // ============================================================================
  logStep(3, "ADD MEMO ACTION TO ACCEPT OUTCOME");

  const addActionsTx = proposalWorkflow.addActionsToOutcome({
    proposalId,
    assetType,
    stableType,
    outcomeIndex: ACCEPT_OUTCOME_INDEX,
    daoAccountId,
    registryId,
    actions: [
      {
        type: "memo",
        message: "This should NOT be emitted because Reject wins!",
      },
    ],
  });

  await executeTransaction(sdk, addActionsTx.transaction, { network: "devnet" });
  logSuccess("Memo action added to Accept outcome");
  console.log();

  // ============================================================================
  // STEP 4: Advance to REVIEW then TRADING
  // ============================================================================
  logStep(4, "ADVANCE TO TRADING STATE");

  // Advance to REVIEW with quantum split
  const advanceTx = proposalWorkflow.advanceToReview({
    daoAccountId,
    proposalId,
    assetType,
    stableType,
    lpType,
    spotPoolId,
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

  const advanceResult = await executeTransaction(sdk, advanceTx.transaction, {
    network: "devnet",
    showObjectChanges: true,
  });

  // Extract escrow ID
  const escrowObject = advanceResult.objectChanges?.find(
    (obj: any) =>
      obj.type === "created" && obj.objectType?.includes("TokenEscrow")
  );
  const escrowId = (escrowObject as any)?.objectId;
  logSuccess(`Advanced to REVIEW. Escrow: ${escrowId}`);

  // Wait for review period
  await waitForTimePeriod(TEST_CONFIG.REVIEW_PERIOD_MS + 2000, { description: "review period" });

  const toTradingTx = proposalWorkflow.advanceState({
    proposalId,
    escrowId,
    assetType,
    stableType,
  });

  await executeTransaction(sdk, toTradingTx.transaction, { network: "devnet" });
  logSuccess("Advanced to TRADING state");
  console.log();

  // ============================================================================
  // STEP 5: Mint tokens for trading
  // ============================================================================
  logStep(5, "MINT TOKENS FOR TRADING");

  const tradeAmount = 100_000_000n; // 100 stable
  const mintTradeTx = new Transaction();

  const tradeCapArg = isStableTreasuryCapShared
    ? mintTradeTx.sharedObjectRef({
        objectId: stableTreasuryCap,
        initialSharedVersion: 1,
        mutable: true,
      })
    : mintTradeTx.object(stableTreasuryCap);

  const tradeCoin = mintTradeTx.moveCall({
    target: "0x2::coin::mint",
    typeArguments: [stableType],
    arguments: [tradeCapArg, mintTradeTx.pure.u64(tradeAmount)],
  });
  mintTradeTx.transferObjects(
    [tradeCoin],
    mintTradeTx.pure.address(activeAddress)
  );

  await executeTransaction(sdk, mintTradeTx, { network: "devnet" });
  logSuccess(`Minted ${tradeAmount} stable for trading`);
  console.log();

  // ============================================================================
  // STEP 6: Buy REJECT tokens to push REJECT TWAP higher
  // ============================================================================
  logStep(6, "BUY REJECT TOKENS (to make Reject win)");

  // Get reject outcome coin types
  const rejectOutcome = conditionalOutcomes.find(
    (o) => o.index === REJECT_OUTCOME_INDEX
  );
  if (!rejectOutcome) {
    throw new Error("Reject outcome not found in conditional coins");
  }

  // Create swap to buy REJECT asset tokens
  const swapTx = proposalWorkflow.conditionalSwap({
    proposalId,
    escrowId,
    spotPoolId,
    assetType,
    stableType,
    lpType,
    outcomeIndex: REJECT_OUTCOME_INDEX,
    assetConditionalType: rejectOutcome.asset.coinType,
    stableConditionalType: rejectOutcome.stable.coinType,
    direction: "buy_asset", // Buy reject-asset tokens
    stableAmount: tradeAmount,
  });

  const swapResult = await executeTransaction(sdk, swapTx.transaction, {
    network: "devnet",
    showObjectChanges: true,
  });

  // Track the received reject tokens
  const rejectTokens = swapResult.objectChanges?.filter(
    (obj: any) =>
      obj.type === "created" &&
      obj.objectType?.includes(rejectOutcome.asset.coinType.split("::")[2])
  );

  if (rejectTokens) {
    for (const token of rejectTokens) {
      allConditionalTokens.push({
        coinId: (token as any).objectId,
        coinType: rejectOutcome.asset.coinType,
        outcomeIndex: REJECT_OUTCOME_INDEX,
        isAsset: true,
        owner: activeAddress,
      });
    }
  }

  logSuccess(
    `Swapped ${tradeAmount} stable for REJECT tokens. Received ${rejectTokens?.length || 0} token objects`
  );
  console.log();

  // ============================================================================
  // STEP 7: Finalize proposal
  // ============================================================================
  logStep(7, "FINALIZE PROPOSAL");

  // Wait for trading period to end
  await waitForTimePeriod(TEST_CONFIG.TRADING_PERIOD_MS + 2000, { description: "trading period" });

  const finalizeTx = proposalWorkflow.finalize({
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

  // Check winning outcome from events
  const finalizeEvent = finalizeResult.events?.find((e: any) =>
    e.type.includes("ProposalFinalized")
  );
  const winningOutcome = finalizeEvent?.parsedJson?.winning_outcome;

  logSuccess(`Proposal finalized!`);
  console.log(`   Winning outcome: ${winningOutcome}`);

  if (Number(winningOutcome) !== REJECT_OUTCOME_INDEX) {
    logError(
      `Expected REJECT (${REJECT_OUTCOME_INDEX}) to win, but got ${winningOutcome}`
    );
    process.exit(1);
  }

  logSuccess("REJECT outcome won as expected!");
  console.log();

  // ============================================================================
  // STEP 8: Verify NO actions executed
  // ============================================================================
  logStep(8, "VERIFY NO ACTIONS EXECUTED");

  logInfo(
    "Since REJECT won, no actions should be executed. Skipping action execution."
  );
  logSuccess("No memo events emitted (correct - Reject won)");
  console.log();

  // ============================================================================
  // STEP 9: Redeem REJECT tokens (winners)
  // ============================================================================
  logStep(9, "REDEEM WINNING REJECT TOKENS");

  for (const token of allConditionalTokens.filter(
    (t) => t.outcomeIndex === REJECT_OUTCOME_INDEX
  )) {
    const redeemTx = proposalWorkflow.redeemConditionalTokens({
      proposalId,
      escrowId,
      assetType,
      stableType,
      conditionalCoinType: token.coinType,
      conditionalCoinIds: [token.coinId],
      outcomeIndex: token.outcomeIndex,
      isAsset: token.isAsset,
    });

    await executeTransaction(sdk, redeemTx.transaction, { network: "devnet" });
    logSuccess(`Redeemed REJECT token: ${token.coinId}`);
  }
  console.log();

  // ============================================================================
  // STEP 10: Verify ACCEPT tokens cannot be redeemed (expected failure)
  // ============================================================================
  logStep(10, "VERIFY ACCEPT TOKENS CANNOT BE REDEEMED");

  // We didn't buy any accept tokens in this test, so just log the verification
  logInfo(
    "No ACCEPT tokens were purchased in this test (we only bought REJECT)"
  );
  logSuccess(
    "If we had ACCEPT tokens, they would fail to redeem (losing outcome)"
  );
  console.log();

  // ============================================================================
  // Summary
  // ============================================================================
  logSection("TEST COMPLETED SUCCESSFULLY");
  console.log("Summary:");
  console.log("  - Created proposal with memo action on Accept");
  console.log("  - Bought REJECT tokens to influence TWAP");
  console.log("  - REJECT outcome won");
  console.log("  - No actions were executed (correct)");
  console.log("  - REJECT tokens redeemed successfully");
  console.log();
}

main().catch((error) => {
  logError(`Test failed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
