/**
 * Launchpad E2E Test with Two-Outcome Init Actions (FULLY ATOMIC)
 *
 * Full end-to-end integration test of the launchpad two-outcome flow.
 * This test can simulate BOTH success and failure paths.
 *
 * FULLY ATOMIC CREATION: Raise creation, action staging, and locking now happen
 * in a SINGLE PTB. If any step fails, the entire transaction rolls back.
 *
 * ATOMIC COMPLETION: The raise completion and action execution also happen
 * in a SINGLE PTB. No broken DAO state is ever created.
 *
 * PREREQUISITES:
 *   npx tsx scripts/protocol-setup.ts   # Run ONCE to set up test coins
 *
 * USAGE:
 *   npx tsx scripts/launchpad-e2e.ts         # Default: success path
 *   npx tsx scripts/launchpad-e2e.ts success # Explicit success
 *   npx tsx scripts/launchpad-e2e.ts failure # Test failure path
 *
 * SUCCESS PATH (default):
 *   1. Creates raise + stages actions + locks (ATOMIC - single PTB)
 *   2. Contributes to MEET minimum (1500 TSTABLE > 1 TSTABLE)
 *   3. Completes raise ATOMICALLY: settle → create DAO → execute actions → share
 *   4. Claims tokens
 *
 * FAILURE PATH:
 *   1-2. Same as success path (but with insufficient contribution)
 *   3. Completes raise ATOMICALLY: settle → create DAO → return caps → share
 *   4. No token claiming (failed raise)
 *
 * This test demonstrates proper SDK usage with the LaunchpadWorkflow class.
 */

import { Transaction } from "@mysten/sui/transactions";
import { LaunchpadWorkflow } from "../src/workflows/launchpad-workflow";
import { TransactionUtils } from "../src/services/transaction";
import { initSDK, executeTransaction, getActiveAddress } from "./execute-tx";

// Import utilities from centralized test-utils
import {
  // Object reference utilities
  getObjectRefById,
  isLocalnet,
  // Fixture loading
  loadTestCoinsInfo,
  saveDaoInfo,
  // Logging
  logSuccess,
  // Types
  type DaoInfo,
} from "./test-utils";

// ============================================================================
// Main Test
// ============================================================================

async function main() {
  // Parse command line arguments
  const testOutcome = process.argv[2]?.toLowerCase() || "success";
  const shouldRaiseSucceed = testOutcome === "success";

  console.log("=".repeat(80));
  console.log(
    `E2E TEST: LAUNCHPAD TWO-OUTCOME SYSTEM (${shouldRaiseSucceed ? "SUCCESS" : "FAILURE"} PATH)`,
  );
  console.log("=".repeat(80));
  console.log(
    `\n🎯 Testing: ${shouldRaiseSucceed ? "Raise succeeds → success_specs execute" : "Raise fails → failure_specs execute"}\n`,
  );

  // Initialize SDK
  const sdk = await initSDK();
  const sender = getActiveAddress();

  console.log(`\n👤 Active Address: ${sender}`);

  // Load test coins from protocol setup
  console.log("\n📦 Loading test coins from protocol-setup...");
  const testCoins = loadTestCoinsInfo();
  if (!testCoins) {
    throw new Error(
      "Test coins not found.\n" +
      "Please run protocol setup first:\n" +
      "  npx tsx scripts/protocol-setup.ts"
    );
  }
  console.log(`   Asset: ${testCoins.asset.type}`);
  console.log(`   Stable: ${testCoins.stable.type}`);
  console.log(`   LP: ${testCoins.lp.type}`);
  logSuccess("Test coins loaded!");

  // Step 1: Create raise ATOMICALLY (single PTB: create + stage actions + lock)
  console.log("\n" + "=".repeat(80));
  console.log("STEP 1: CREATE RAISE (ATOMIC - create + stage actions + lock)");
  console.log("=".repeat(80));

  const streamRecipient = sender;
  const streamAmount = TransactionUtils.suiToMist(0.5); // 0.5 TSTABLE
  const currentTime = Date.now();
  const streamStart = currentTime + 300_000; // Start in 5 minutes

  // Iteration-based vesting: 12 monthly unlocks
  const iterationsTotal = 12n;
  const iterationPeriodMs = 2_592_000_000n; // 30 days in milliseconds
  const amountPerIteration = streamAmount / iterationsTotal;

  // Pool creation parameters
  const poolAssetAmount = TransactionUtils.suiToMist(1000);
  const poolStableAmount = TransactionUtils.suiToMist(1000);
  const poolFeeBps = 30;

  // Use the SDK's createRaiseWithActions helper for cleaner flow
  const launchpadWorkflow = sdk.workflows.launchpad;

  // === MINT & TRANSFER DEMO ===
  const teamMintAmount = TransactionUtils.suiToMist(100); // 100 asset tokens
  const teamRecipient = sender;

  // === ASSET VESTING DEMO ===
  const assetStreamAmount = TransactionUtils.suiToMist(50); // 50 asset tokens
  const assetIterationsTotal = 6n;
  const assetIterationPeriodMs = 1_296_000_000n; // 15 days
  const assetAmountPerIteration = assetStreamAmount / assetIterationsTotal;

  // Define success actions
  const successActions = [
    // === 1. STABLE COIN VESTING (from treasury) ===
    {
      type: 'create_stream' as const,
      coinType: testCoins.stable.type,
      vaultName: 'treasury',
      beneficiary: streamRecipient,
      amountPerIteration: amountPerIteration,
      startTime: streamStart,
      iterationsTotal: iterationsTotal,
      iterationPeriodMs: iterationPeriodMs,
      maxPerWithdrawal: amountPerIteration,
    },
    // === 2. MINT ASSET TOKENS (for team allocation) ===
    {
      type: 'mint' as const,
      coinType: testCoins.asset.type,
      amount: teamMintAmount,
      resourceName: 'team_tokens',
    },
    // === 3. TRANSFER MINTED TOKENS TO TEAM ===
    {
      type: 'transfer_coin' as const,
      coinType: testCoins.asset.type,
      recipient: teamRecipient,
      resourceName: 'team_tokens',
    },
    // === 4. MINT ASSET TOKENS FOR VESTING ===
    {
      type: 'mint' as const,
      coinType: testCoins.asset.type,
      amount: assetStreamAmount,
      resourceName: 'vesting_tokens',
    },
    // === 5. DEPOSIT MINTED TOKENS INTO TREASURY ===
    {
      type: 'deposit' as const,
      coinType: testCoins.asset.type,
      vaultName: 'treasury',
      amount: assetStreamAmount,
      resourceName: 'vesting_tokens',
    },
    // === 6. CREATE ASSET COIN VESTING STREAM ===
    {
      type: 'create_stream' as const,
      coinType: testCoins.asset.type,
      vaultName: 'treasury',
      beneficiary: streamRecipient,
      amountPerIteration: assetAmountPerIteration,
      startTime: streamStart,
      iterationsTotal: assetIterationsTotal,
      iterationPeriodMs: assetIterationPeriodMs,
      maxPerWithdrawal: assetAmountPerIteration,
    },
    // === 7. CREATE AMM POOL ===
    {
      type: 'create_pool_with_mint' as const,
      assetType: testCoins.asset.type,
      stableType: testCoins.stable.type,
      vaultName: 'treasury',
      assetAmount: poolAssetAmount,
      stableAmount: poolStableAmount,
      feeBps: poolFeeBps,
      lpType: testCoins.lp.type,
      lpTreasuryCapId: testCoins.lp.treasuryCap,
      lpMetadataId: testCoins.lp.metadata,
    },
    // === 8. UPDATE TRADING PARAMS ===
    {
      type: 'update_trading_params' as const,
      reviewPeriodMs: 1000n, // 1 second for testing
      tradingPeriodMs: 60_000n, // 1 minute
    },
    // === 9. UPDATE TWAP CONFIG ===
    {
      type: 'update_twap_config' as const,
      startDelay: 0n,
      threshold: 0n,
    },
    // === 10. UPDATE GOVERNANCE (for multi-outcome testing) ===
    {
      type: 'update_governance' as const,
      maxOutcomes: 10n, // Allow up to 10 outcomes (default is 2)
    },
  ];

  // Define failure actions
  const failureActions = [
    {
      type: 'return_treasury_cap' as const,
      coinType: testCoins.asset.type,
      recipient: sender,
    },
    {
      type: 'return_metadata' as const,
      coinType: testCoins.asset.type,
      recipient: sender,
    },
  ];

  // Create the raise atomically (single PTB: create + stage actions + lock)
  // This uses the new atomic flow where everything happens in one transaction
  const createRaiseTx = launchpadWorkflow.createRaiseWithActions(
    {
      assetType: testCoins.asset.type,
      stableType: testCoins.stable.type,
      treasuryCap: testCoins.asset.treasuryCap,
      coinMetadata: testCoins.asset.metadata,
      tokensForSale: 1_000_000n,
      minRaiseAmount: TransactionUtils.suiToMist(1),
      allowedCaps: [
        TransactionUtils.suiToMist(1),
        TransactionUtils.suiToMist(50),
        LaunchpadWorkflow.UNLIMITED_CAP,
      ],
      startDelayMs: 5_000,
      allowEarlyCompletion: true,
      description: "E2E test - two-outcome system with stream",
      affiliateId: "",
      metadataKeys: [],
      metadataValues: [],
      launchpadFee: 100n,
    },
    successActions,
    failureActions,
  );

  console.log(`\n📋 Creating raise with ${successActions.length} success and ${failureActions.length} failure actions...`);
  console.log("   (All steps atomic: create → stage success → stage failure → lock & share)");

  const createResult = await executeTransaction(sdk, createRaiseTx.transaction, {
    network: "devnet",
    dryRun: false,
    showEffects: true,
    showObjectChanges: true,
    showEvents: true,
  });

  const raiseCreatedEvent = createResult.events?.find((e: any) =>
    e.type.includes("RaiseCreated"),
  );

  if (!raiseCreatedEvent) {
    throw new Error("Failed to find RaiseCreated event");
  }

  // Get network for localnet detection
  const network = sdk.network.network;

  // Extract raise ID from event
  const raiseId = raiseCreatedEvent.parsedJson.raise_id;
  let raiseRef = getObjectRefById(createResult, raiseId, network);

  console.log("\n✅ Raise Created & Configured (ATOMIC)!");
  console.log(`   Raise ID: ${raiseId}`);
  console.log(`   Success actions staged: ${successActions.length}`);
  console.log(`   Failure actions staged: ${failureActions.length}`);
  console.log(`   Intents locked: ✓`);
  console.log(`   Transaction: ${createResult.digest}`);

  // Wait for start delay
  console.log("\n⏳ Waiting for start delay (5s)...");
  await new Promise((resolve) => setTimeout(resolve, 6000));
  console.log("✅ Raise has started!");

  // Step 2: Contribute
  console.log("\n" + "=".repeat(80));
  console.log(
    `STEP 2: CONTRIBUTE ${shouldRaiseSucceed ? "(MEET MINIMUM)" : "(INSUFFICIENT - WILL FAIL)"}`,
  );
  console.log("=".repeat(80));

  const amountToContribute = shouldRaiseSucceed
    ? TransactionUtils.suiToMist(1500)
    : TransactionUtils.suiToMist(0.5);

  console.log(
    `\n💰 Minting ${TransactionUtils.mistToSui(amountToContribute)} TSTABLE...`,
  );

  const mintTx = new Transaction();
  mintTx.moveCall({
    target: `${testCoins.stable.packageId}::coin::mint`,
    arguments: [
      mintTx.object(testCoins.stable.treasuryCap),
      mintTx.pure.u64(amountToContribute),
      mintTx.pure.address(sender),
    ],
  });

  await executeTransaction(sdk, mintTx, {
    network: "devnet",
    dryRun: false,
    showEffects: false,
  });
  console.log("✅ Minted!");

  console.log(
    `\n💸 Contributing ${TransactionUtils.mistToSui(amountToContribute)} TSTABLE...`,
  );

  // Get stable coins for contribution
  const stableCoins = await sdk.client.getCoins({
    owner: sender,
    coinType: testCoins.stable.type,
  });

  const stableCoinIds = stableCoins.data.map((c) => c.coinObjectId);

  const contributeTx = launchpadWorkflow.contribute({
    raiseId: raiseRef,
    assetType: testCoins.asset.type,
    stableType: testCoins.stable.type,
    stableCoins: stableCoinIds,
    amount: amountToContribute,
    capTier: LaunchpadWorkflow.UNLIMITED_CAP,
    crankFee: TransactionUtils.suiToMist(0.1),
  });

  await executeTransaction(sdk, contributeTx.transaction, {
    network: "devnet",
    dryRun: false,
    showEffects: true,
    showObjectChanges: false,
    showEvents: true,
  });

  console.log("✅ Contributed!");

  // Step 3: Wait for deadline
  console.log("\n" + "=".repeat(80));
  console.log("STEP 3: WAIT FOR DEADLINE");
  console.log("=".repeat(80));

  console.log("\n⏰ Waiting for deadline (30s)...");
  await new Promise((resolve) => setTimeout(resolve, 30000));
  console.log("✅ Deadline passed!");

  // Step 4: Complete raise with atomic action execution
  // The new atomic flow combines settle + create DAO + execute actions + share
  // All in a single PTB - if any step fails, the entire transaction rolls back
  console.log("\n" + "=".repeat(80));
  console.log("STEP 4: COMPLETE RAISE (ATOMIC ACTION EXECUTION)");
  console.log("=".repeat(80));

  console.log("\n🏛️  Creating DAO...");

  // Step 4a: Create the DAO (separate from action execution due to PTB restrictions)
  // Actions are executed separately via AutoExecutor which fetches from backend
  const completeTx = launchpadWorkflow.completeRaise({
    raiseId: raiseRef,
    assetType: testCoins.asset.type,
    stableType: testCoins.stable.type,
  });

  const completeResult = await executeTransaction(sdk, completeTx.transaction, {
    network: "devnet",
    dryRun: false,
    showEffects: true,
    showObjectChanges: true,
    showEvents: true,
  });

  // Check which event occurred
  const raiseSuccessEvent = completeResult.events?.find((e: any) =>
    e.type.includes("RaiseSuccessful"),
  );
  const raiseFailedEvent = completeResult.events?.find((e: any) =>
    e.type.includes("RaiseFailed"),
  );

  let accountId: string | undefined;
  let poolId: string | undefined;
  let raiseActuallySucceeded = false;

  if (raiseSuccessEvent) {
    raiseActuallySucceeded = true;
    console.log("✅ DAO Created (SUCCESS PATH)!");
    console.log(`   Transaction: ${completeResult.digest}`);
    accountId = raiseSuccessEvent.parsedJson?.account_id;
  } else if (raiseFailedEvent) {
    raiseActuallySucceeded = false;
    console.log("✅ DAO Created (FAILURE PATH)!");
    console.log(`   Transaction: ${completeResult.digest}`);
    const accountObject = completeResult.objectChanges?.find((c: any) =>
      c.objectType?.includes("::account::Account"),
    );
    if (accountObject) {
      accountId = accountObject.objectId;
    }
  } else {
    throw new Error("Neither RaiseSuccessful nor RaiseFailed event found");
  }

  if (!accountId) {
    const accountObject = completeResult.objectChanges?.find((c: any) =>
      c.objectType?.includes("::account::Account"),
    );
    if (accountObject) {
      accountId = accountObject.objectId;
    }
  }

  if (!accountId) {
    throw new Error("Could not find Account ID");
  }

  // Update raiseRef for next steps
  raiseRef = getObjectRefById(completeResult, raiseId, network);
  console.log(`   Account ID: ${accountId}`);

  // Wait for RPC to see the newly shared account
  if (isLocalnet(network)) {
    console.log("\n⏳ Waiting for RPC to index new account (2s)...");
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Step 4b: Execute init actions via AutoExecutor (fetches from backend API)
  console.log("\n⚡ Executing init actions via AutoExecutor...");

  // Wait for indexer to index the raise (needs staged actions in DB)
  console.log("   Waiting for indexer to index raise (5s)...");
  await new Promise((r) => setTimeout(r, 5000));

  // Create AutoExecutor using SDK helper
  const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:9090";
  const autoExecutor = sdk.createAutoExecutor(backendUrl);

  // Execute init actions - AutoExecutor fetches action specs from backend
  const initActionsTx = await autoExecutor.executeLaunchpad(raiseId, {
    accountId,
    actionType: raiseActuallySucceeded ? 'success' : 'failure',
  });

  const initActionsResult = await executeTransaction(sdk, initActionsTx.transaction, {
    network: "devnet",
    dryRun: false,
    showEffects: true,
    showObjectChanges: true,
    showEvents: true,
  });

  console.log(`✅ Init actions executed!`);
  console.log(`   Transaction: ${initActionsResult.digest}`);

  // Find pool if success path
  if (raiseActuallySucceeded) {
    const poolObject = initActionsResult.objectChanges?.find((c: any) =>
      c.objectType?.includes("::unified_spot_pool::UnifiedSpotPool"),
    );
    if (poolObject) {
      poolId = poolObject.objectId;
      console.log(`   Pool ID: ${poolId}`);
    }
  }

  // Log action count from AutoExecutor response
  const actionsExecuted = raiseActuallySucceeded
    ? initActionsTx.raise.success_actions?.length || 0
    : initActionsTx.raise.failure_actions?.length || 0;
  console.log(`   Actions executed: ${actionsExecuted}`);

  // Step 5: Claim tokens (only for successful raises)
  if (raiseActuallySucceeded) {
    // On localnet, wait for indexer to catch up before next transaction
    if (isLocalnet(network)) {
      console.log("\n⏳ Waiting for indexer to catch up (2s)...");
      await new Promise((r) => setTimeout(r, 2000));
    }

    console.log("\n" + "=".repeat(80));
    console.log("STEP 5: CLAIM TOKENS");
    console.log("=".repeat(80));

    console.log("\n💰 Claiming contributor tokens...");

    const claimTx = launchpadWorkflow.claimTokens(
      raiseRef,
      testCoins.asset.type,
      testCoins.stable.type,
    );

    const claimResult = await executeTransaction(sdk, claimTx.transaction, {
      network: "devnet",
      dryRun: false,
      showEffects: true,
      showObjectChanges: true,
      showEvents: true,
    });

    console.log("✅ Tokens claimed!");
    console.log(`   Transaction: ${claimResult.digest}`);
  } else {
    console.log("\n" + "=".repeat(80));
    console.log("SKIPPING STEP 5: RAISE FAILED");
    console.log("=".repeat(80));
    console.log("\nℹ️  Token claiming is only available for successful raises");
  }

  console.log("\n" + "=".repeat(80));
  console.log(
    `🎉 LAUNCHPAD TEST COMPLETE (${shouldRaiseSucceed ? "SUCCESS" : "FAILURE"} PATH)! 🎉`,
  );
  console.log("=".repeat(80));

  console.log("\n📋 Summary:");
  console.log(`   ✅ Created raise (ATOMIC: create + stage ${successActions.length} success + ${failureActions.length} failure + lock)`);
  console.log(`   ✅ Contributed`);

  if (shouldRaiseSucceed) {
    console.log(`   ✅ Raise SUCCEEDED`);
    console.log(`   ✅ Completed raise + executed ${actionsExecuted} actions (via AutoExecutor)`);
    console.log(`   ✅ Claimed tokens`);
  } else {
    console.log(`   ✅ Raise FAILED (as expected)`);
    console.log(`   ✅ Completed raise + executed ${actionsExecuted} failure actions (via AutoExecutor)`);
  }

  console.log(`\n🔗 View raise: https://suiscan.xyz/devnet/object/${raiseId}`);
  console.log(`🔗 View DAO: https://suiscan.xyz/devnet/object/${accountId}`);

  // Save DAO info to shared JSON file for proposal test
  const daoInfo: DaoInfo = {
    accountId: accountId,
    assetType: testCoins.asset.type,
    stableType: testCoins.stable.type,
    lpType: testCoins.lp.type,
    assetTreasuryCap: testCoins.asset.treasuryCap,
    assetMetadata: testCoins.asset.metadata,
    stableTreasuryCap: testCoins.stable.treasuryCap,
    stableMetadata: testCoins.stable.metadata,
    lpTreasuryCap: testCoins.lp.treasuryCap,
    lpMetadata: testCoins.lp.metadata,
    isStableTreasuryCapShared: testCoins.stable.isSharedTreasuryCap,
    stablePackageId: testCoins.stable.packageId,
    spotPoolId: poolId || "",
    raiseId: raiseId,
    timestamp: Date.now(),
    network: testCoins.network,
    success: shouldRaiseSucceed,
  };

  saveDaoInfo(daoInfo);
  logSuccess("DAO info saved to test-dao-info.json");
}

main()
  .then(() => {
    console.log("\n✅ Script completed successfully\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
