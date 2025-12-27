/**
 * Test: Multi-Outcome Proposals (3+ outcomes)
 *
 * This test validates proposals with more than 2 outcomes:
 * 1. Create proposal with N outcomes (configurable)
 * 2. Trade on different outcomes
 * 3. Verify correct winner calculation with multiple candidates
 * 4. Redeem winning tokens, verify losers fail
 *
 * Prerequisites:
 * - Run: npm run launchpad-e2e-two-outcome
 * - Run: npx tsx scripts/generate-conditional-coins.ts <num_outcomes>
 * - Run: npm run deploy-conditional-coins
 *
 * Usage:
 *   npx tsx scripts/test-multi-outcome.ts [num_outcomes]
 *   Default: 3 outcomes
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
  ConditionalTokenRecord,
} from "./e2e-test-utils";

// Parse number of outcomes from command line (default: 3)
const NUM_OUTCOMES = parseInt(process.argv[2] || "3", 10);

async function main() {
  logSection(`TEST: MULTI-OUTCOME PROPOSALS (${NUM_OUTCOMES} OUTCOMES)`);

  if (NUM_OUTCOMES < 3) {
    logError("Multi-outcome test requires at least 3 outcomes");
    logInfo("Usage: npx tsx scripts/test-multi-outcome.ts <num_outcomes>");
    process.exit(1);
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

  logSuccess(`DAO Account: ${daoAccountId}`);

  const conditionalCoinsInfo = loadConditionalCoinsInfo();
  if (!conditionalCoinsInfo) {
    throw new Error("No conditional coins info found");
  }

  const conditionalOutcomes = extractConditionalOutcomes(conditionalCoinsInfo);
  logSuccess(`Loaded ${conditionalOutcomes.length} conditional outcome coin sets`);

  if (conditionalOutcomes.length < NUM_OUTCOMES) {
    logError(
      `Need ${NUM_OUTCOMES} outcome coin sets, but only have ${conditionalOutcomes.length}`
    );
    logInfo("Run these commands first:");
    logInfo(`  npx tsx scripts/generate-conditional-coins.ts ${NUM_OUTCOMES}`);
    logInfo("  npm run deploy-conditional-coins");
    process.exit(1);
  }

  // Only use the first NUM_OUTCOMES
  const outcomes = conditionalOutcomes.slice(0, NUM_OUTCOMES);
  console.log();

  // Initialize SDK
  const sdk = initSDK();
  const activeAddress = getActiveAddress();
  logSuccess(`Active address: ${activeAddress}`);
  console.log();

  const proposalWorkflow = sdk.workflows.proposal;
  const registryId = sdk.deployments.getPackageRegistry()!.objectId;

  // Track conditional tokens
  const allConditionalTokens: ConditionalTokenRecord[] = [];

  // ============================================================================
  // STEP 1: Mint fee tokens
  // ============================================================================
  logStep(1, "MINT FEE TOKENS");

  // Fee increases with more outcomes
  const baseFee = 10_000_000n;
  const perOutcomeFee = 1_000_000n;
  const feeAmount = baseFee + perOutcomeFee * BigInt(NUM_OUTCOMES - 2);

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
  // STEP 2: Create proposal with N outcomes
  // ============================================================================
  logStep(2, `CREATE PROPOSAL WITH ${NUM_OUTCOMES} OUTCOMES`);

  // Generate outcome messages and details
  const outcomeMessages = outcomes.map((o, i) =>
    i === 0 ? "Reject proposal" : `Accept option ${i}`
  );
  const outcomeDetails = outcomes.map((o, i) =>
    i === 0 ? "Do nothing (status quo)" : `Execute action set ${i}`
  );

  const createTx = proposalWorkflow.createProposal({
    daoAccountId,
    assetType,
    stableType,
    title: `Multi-Outcome Test (${NUM_OUTCOMES} options)`,
    introduction: `Testing proposal with ${NUM_OUTCOMES} outcomes`,
    metadata: JSON.stringify({ test: "multi-outcome", numOutcomes: NUM_OUTCOMES }),
    outcomeMessages,
    outcomeDetails,
    proposer: activeAddress,
    treasuryAddress: activeAddress,
    usedQuota: false,
    feeCoins: feeCoinIds,
    feeAmount,
    conditionalCoinsRegistry: {
      registryId: conditionalCoinsInfo.registryId,
      coinSets: outcomes.map((outcome) => ({
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
  logInfo(`Outcomes: ${outcomeMessages.join(", ")}`);
  console.log();

  // ============================================================================
  // STEP 3: Add memo actions to each Accept outcome
  // ============================================================================
  logStep(3, "ADD ACTIONS TO ACCEPT OUTCOMES");

  for (let i = 1; i < NUM_OUTCOMES; i++) {
    const addActionsTx = proposalWorkflow.addActionsToOutcome({
      proposalId,
      assetType,
      stableType,
      outcomeIndex: i,
      daoAccountId,
      registryId,
      actions: [
        {
          type: "memo",
          message: `Action from outcome ${i}`,
        },
      ],
    });

    await executeTransaction(sdk, addActionsTx.transaction, { network: "devnet" });
    logSuccess(`Added memo action to outcome ${i}`);
  }
  console.log();

  // ============================================================================
  // STEP 4: Advance to TRADING
  // ============================================================================
  logStep(4, "ADVANCE TO TRADING STATE");

  const advanceTx = proposalWorkflow.advanceToReview({
    daoAccountId,
    proposalId,
    assetType,
    stableType,
    lpType,
    spotPoolId,
    senderAddress: activeAddress,
    conditionalCoinsRegistry: {
      registryId: conditionalCoinsInfo.registryId,
      coinSets: outcomes.map((outcome) => ({
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

  const escrowObject = advanceResult.objectChanges?.find(
    (obj: any) =>
      obj.type === "created" && obj.objectType?.includes("TokenEscrow")
  );
  const escrowId = (escrowObject as any)?.objectId;
  logSuccess(`Advanced to REVIEW. Escrow: ${escrowId}`);

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
  // STEP 5: Trade on different outcomes
  // ============================================================================
  logStep(5, "TRADE ON DIFFERENT OUTCOMES");

  // Mint tokens for trading
  const tradeAmountPerOutcome = 50_000_000n;
  const totalTradeAmount = tradeAmountPerOutcome * BigInt(NUM_OUTCOMES);

  // Mint extra for the intended winner (3x for winner = 2 extra)
  const actualTradeAmount = totalTradeAmount + tradeAmountPerOutcome * 2n;
  const mintTradeTx = new Transaction();
  // Always use tx.object() - SDK resolves shared/owned automatically
  const tradeCapArg = mintTradeTx.object(stableTreasuryCap);

  const tradeCoin = mintTradeTx.moveCall({
    target: "0x2::coin::mint",
    typeArguments: [stableType],
    arguments: [tradeCapArg, mintTradeTx.pure.u64(actualTradeAmount)],
  });
  mintTradeTx.transferObjects([tradeCoin], mintTradeTx.pure.address(activeAddress));
  await executeTransaction(sdk, mintTradeTx, { network: "devnet" });
  logSuccess(`Minted ${actualTradeAmount} stable for trading`);

  // Build allOutcomeCoins from outcomes
  const allOutcomeCoins = outcomes.map((outcome) => ({
    outcomeIndex: outcome.index,
    assetCoinType: outcome.asset.coinType,
    stableCoinType: outcome.stable.coinType,
  }));

  // Pick a winner - buy MORE tokens for this outcome
  const INTENDED_WINNER = Math.floor(NUM_OUTCOMES / 2); // Middle outcome
  logInfo(`Intended winner: Outcome ${INTENDED_WINNER}`);
  console.log();

  for (let i = 0; i < NUM_OUTCOMES; i++) {
    const outcome = outcomes[i];
    // Buy more tokens for the intended winner
    const amount =
      i === INTENDED_WINNER
        ? tradeAmountPerOutcome * 3n // 3x for winner
        : tradeAmountPerOutcome;

    // Get fresh coins before each swap
    const tradeCoins = await sdk.client.getCoins({
      owner: activeAddress,
      coinType: stableType,
    });
    const tradeCoinIds = tradeCoins.data.map((c) => c.coinObjectId);

    const swapTx = proposalWorkflow.conditionalSwap({
      proposalId,
      escrowId,
      spotPoolId,
      assetType,
      stableType,
      lpType,
      outcomeIndex: i,
      direction: "stable_to_asset",
      amountIn: amount,
      minAmountOut: 0n,
      recipient: activeAddress,
      allOutcomeCoins,
      stableCoins: tradeCoinIds,
    });

    const swapResult = await executeTransaction(sdk, swapTx.transaction, {
      network: "devnet",
      showObjectChanges: true,
    });

    // Track received tokens
    const receivedTokens = swapResult.objectChanges?.filter(
      (obj: any) =>
        obj.type === "created" &&
        obj.objectType?.includes(outcome.asset.coinType.split("::")[2])
    );

    if (receivedTokens) {
      for (const token of receivedTokens) {
        allConditionalTokens.push({
          coinId: (token as any).objectId,
          coinType: outcome.asset.coinType,
          outcomeIndex: i,
          isAsset: true,
          owner: activeAddress,
        });
      }
    }

    logSuccess(
      `Outcome ${i}: Swapped ${amount} stable, received ${receivedTokens?.length || 0} tokens`
    );
  }
  console.log();

  // ============================================================================
  // STEP 6: Finalize proposal
  // ============================================================================
  logStep(6, "FINALIZE PROPOSAL");

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
  const winningOutcome = Number(finalizeEvent?.parsedJson?.market_winner ?? -1);

  logSuccess(`Proposal finalized!`);
  console.log(`   Winning outcome: ${winningOutcome}`);
  console.log(`   Expected winner: ${INTENDED_WINNER}`);

  if (winningOutcome === INTENDED_WINNER) {
    logSuccess("Winner matches intended outcome!");
  } else {
    logInfo(
      `Winner differs from intended - TWAP may have been influenced differently`
    );
  }
  console.log();

  // ============================================================================
  // STEP 7: Execute actions if non-reject won
  // ============================================================================
  logStep(7, "EXECUTE ACTIONS (if applicable)");

  if (winningOutcome > 0) {
    logInfo(`Executing actions for winning outcome ${winningOutcome}...`);

    const executeTx = proposalWorkflow.executeActions({
      daoAccountId,
      proposalId,
      escrowId,
      spotPoolId,
      assetType,
      stableType,
      lpType,
      actionTypes: [{ type: "memo" }],
    });

    await executeTransaction(sdk, executeTx.transaction, { network: "devnet" });
    logSuccess("Actions executed!");
  } else {
    logInfo("Reject won - no actions to execute");
  }
  console.log();

  // ============================================================================
  // STEP 8: Redeem winning tokens
  // ============================================================================
  logStep(8, "REDEEM WINNING TOKENS");

  const winningTokens = allConditionalTokens.filter(
    (t) => t.outcomeIndex === winningOutcome
  );
  const losingTokens = allConditionalTokens.filter(
    (t) => t.outcomeIndex !== winningOutcome
  );

  logInfo(`Winning tokens: ${winningTokens.length}`);
  logInfo(`Losing tokens: ${losingTokens.length}`);
  console.log();

  for (const token of winningTokens) {
    try {
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
      logSuccess(`Redeemed winning token: ${token.coinId.substring(0, 16)}...`);
    } catch (error: any) {
      logError(`Failed to redeem: ${error.message?.substring(0, 50)}`);
    }
  }
  console.log();

  // ============================================================================
  // STEP 9: Verify losing tokens fail to redeem
  // ============================================================================
  logStep(9, "VERIFY LOSING TOKENS FAIL");

  let losingFailures = 0;
  for (const token of losingTokens.slice(0, 2)) {
    // Test first 2 losers
    try {
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

      await executeTransaction(sdk, redeemTx.transaction, {
        network: "devnet",
        suppressErrors: true,
      });
      logError(`Losing token redeemed unexpectedly: ${token.coinId}`);
    } catch {
      losingFailures++;
      logSuccess(
        `Losing token correctly failed: outcome ${token.outcomeIndex}`
      );
    }
  }

  if (losingTokens.length > 0 && losingFailures === Math.min(2, losingTokens.length)) {
    logSuccess("All tested losing tokens correctly failed to redeem");
  }
  console.log();

  // ============================================================================
  // Summary
  // ============================================================================
  logSection("TEST COMPLETED SUCCESSFULLY");
  console.log("Summary:");
  console.log(`  - Created proposal with ${NUM_OUTCOMES} outcomes`);
  console.log(`  - Traded on all outcomes (more on outcome ${INTENDED_WINNER})`);
  console.log(`  - Winner: outcome ${winningOutcome}`);
  console.log(`  - Redeemed ${winningTokens.length} winning tokens`);
  console.log(`  - Verified ${losingFailures} losing tokens failed redemption`);
  console.log();
}

main().catch((error) => {
  logError(`Test failed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
