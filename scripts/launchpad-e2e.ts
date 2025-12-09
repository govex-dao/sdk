/**
 * Launchpad E2E Test with Two-Outcome Init Actions
 *
 * Full end-to-end integration test of the launchpad two-outcome flow.
 * This test can simulate BOTH success and failure paths.
 *
 * USAGE:
 *   npx tsx scripts/launchpad-e2e.ts         # Interactive mode (prompts for details)
 *   npx tsx scripts/launchpad-e2e.ts --non-interactive # Use defaults without prompts
 */

import { Transaction } from "@mysten/sui/transactions";
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import { TransactionUtils, LaunchpadService, type NetworkType, type SDK, type ActionConfig, type LaunchpadActionType } from "@govex/futarchy-sdk";
import { initSDK, executeTransaction, getActiveAddress } from "./execute-tx";
import { createTestCoin, getTestCoinSource } from "./lib/createCoin";
import { getCurrentNetwork } from "./lib/network";
import { registerStableCoinForFees, registerStableCoinInFactory } from "./lib/registerCoin";
import { registerPackages } from "./lib/registerPackage";
import { execSync } from "child_process";

// ============================================================================
// TYPES
// ============================================================================

interface LaunchpadConfig {
  shouldRaiseFail: boolean;
  projectName: string;
  minRaiseAmount: number;
  maxRaiseAmount: number;
}

interface TestCoins {
  asset: {
    packageId: string;
    type: string;
    treasuryCap: string;
    metadata: string;
  };
  stable: {
    packageId: string;
    type: string;
    treasuryCap: string;
    metadata: string;
    isSharedTreasuryCap: boolean;
  };
  lp: {
    packageId: string;
    type: string;
    treasuryCap: string;
    metadata: string;
  };
}

interface RaiseInfo {
  raiseId: string;
  creatorCapId: string;
}

interface ExecutionResult {
  accountId: string;
  poolId?: string;
  raiseSucceeded: boolean;
}

// ============================================================================
// CONFIG & PROMPTS
// ============================================================================

function createPromptInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function promptForConfig(rl: readline.Interface): Promise<LaunchpadConfig> {
  console.log("\n📋 Launchpad E2E Configuration\n");

  const failInput = await prompt(rl, "Should the raise fail? (y/n) [default: n]: ");
  const shouldRaiseFail = failInput.toLowerCase() === "y" || failInput.toLowerCase() === "yes";

  const projectName = await prompt(rl, "Enter project name [default: TestProject]: ") || "TestProject";

  const minInput = await prompt(rl, "Enter minimum raise amount in tokens [default: 1]: ");
  const minRaiseAmount = parseFloat(minInput) || 1;

  const maxInput = await prompt(rl, "Enter maximum raise amount in tokens [default: 1500]: ");
  const maxRaiseAmount = parseFloat(maxInput) || 1500;

  if (maxRaiseAmount < minRaiseAmount) {
    console.log("\n⚠️  Warning: max raise amount is less than min. Setting max = min.");
  }

  const config: LaunchpadConfig = {
    shouldRaiseFail,
    projectName,
    minRaiseAmount,
    maxRaiseAmount: Math.max(maxRaiseAmount, minRaiseAmount),
  };

  console.log("\n📝 Configuration:");
  console.log(`   Fail: ${config.shouldRaiseFail} | Project: ${config.projectName}`);
  console.log(`   Min: ${config.minRaiseAmount} | Max: ${config.maxRaiseAmount}`);

  const confirm = await prompt(rl, "\nProceed? (y/n) [default: y]: ");
  if (confirm.toLowerCase() === "n" || confirm.toLowerCase() === "no") {
    console.log("\nAborted.");
    process.exit(0);
  }

  return config;
}

function getDefaultConfig(): LaunchpadConfig {
  return {
    shouldRaiseFail: false,
    projectName: "TestProject",
    minRaiseAmount: 1,
    maxRaiseAmount: 1500,
  };
}

// ============================================================================
// STEP FUNCTIONS
// ============================================================================

async function setupTestCoins(
  sdk: SDK,
  config: LaunchpadConfig,
  network: NetworkType
): Promise<TestCoins> {
  console.log("\n[STEP 0] Setting up test coins...");

  // Find existing allowed stable with shared TreasuryCap
  const allowedStables = await sdk.admin.factory.getAllowedStableTypes();
  const sharedStable = allowedStables.find(s => s.isSharedTreasuryCap && s.treasuryCapId);

  console.log("allowedStables", allowedStables);
  if (!sharedStable) {
    throw new Error("No allowed stable with shared TreasuryCap found");
  }

  const stableMetadata = await sdk.client.getCoinMetadata({
    coinType: `0x${sharedStable.type}`,
  });

  if (!stableMetadata) {
    throw new Error(`CoinMetadata not found for ${sharedStable.type}`);
  }

  const projectSymbol = config.projectName.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  const lpSymbol = `${projectSymbol}_LP`;

  const [assetCoin, lpCoin] = await Promise.all([
    createTestCoin(config.projectName, projectSymbol, network, false),
    createTestCoin(`${config.projectName}_LP`, lpSymbol, network, false),
  ]);

  console.log(`   Asset: ${assetCoin.type.slice(0, 20)}...`);
  console.log(`   Stable: ${sharedStable.type.slice(0, 20)}... (shared)`);
  console.log(`   LP: ${lpCoin.type.slice(0, 20)}...`);

  return {
    asset: assetCoin,
    stable: {
      packageId: sharedStable.packageId,
      type: `0x${sharedStable.type}`,
      treasuryCap: sharedStable.treasuryCapId!,
      metadata: stableMetadata.id!,
      isSharedTreasuryCap: true,
    },
    lp: lpCoin,
  };
}

async function createTestCoins(sdk: SDK, network: NetworkType){

  console.log("\n[STEP 0] Creating test coins for network: ", network);
  const testCoins = {
    // Asset coin MUST have private TreasuryCap - launchpad takes ownership of it
    asset: await createTestCoin("Test Asset", "TASSET", "mainnet"), // Force private treasury
    // Stable coin can have shared TreasuryCap on devnet/testnet for easy minting
    stable: await createTestCoin("Test Stable", "TSTABLE", network),
    // LP coin MUST have private TreasuryCap - pool takes ownership of it for minting
    lp: await createTestCoin("GOVEX_LP_TOKEN", "GOVEX_LP_TOKEN", "mainnet"), // Force private treasury
  };

  console.log("\n✅ Test coins created (asset, stable, lp)!");

  // Step 1: Register test stable coin for fee payments
  await registerStableCoinForFees(sdk, testCoins.stable.type, network);
  await registerStableCoinInFactory(sdk, testCoins.stable.type, network);
  console.log("\n" + "=".repeat(80));

  return testCoins;
}

async function createRaise(
  sdk: SDK,
  config: LaunchpadConfig,
  testCoins: TestCoins,
  network: NetworkType
): Promise<RaiseInfo> {
  console.log("\n[STEP 1] Creating raise...");

  const createRaiseTx = sdk.launchpad.createRaise({
    assetType: testCoins.asset.type,
    stableType: testCoins.stable.type,
    treasuryCap: testCoins.asset.treasuryCap,
    coinMetadata: testCoins.asset.metadata,
    tokensForSale: 1_000_000n,
    minRaiseAmount: TransactionUtils.suiToMist(config.minRaiseAmount),
    maxRaiseAmount: TransactionUtils.suiToMist(config.maxRaiseAmount),
    allowedCaps: [
      TransactionUtils.suiToMist(config.minRaiseAmount),
      TransactionUtils.suiToMist(config.minRaiseAmount * 50),
      LaunchpadService.UNLIMITED_CAP,
    ],
    startDelayMs: 5_000,
    allowEarlyCompletion: true,
    description: `${config.projectName} - E2E test raise`,
    affiliateId: "",
    metadataKeys: [],
    metadataValues: [],
    launchpadFee: 100n,
  });

  const result = await executeTransaction(sdk, createRaiseTx, {
    network,
    dryRun: false,
    showEffects: false,
    showObjectChanges: true,
    showEvents: true,
  });

  const raiseEvent = result.events?.find((e: any) => e.type.includes("RaiseCreated"));
  if (!raiseEvent) throw new Error("RaiseCreated event not found");

  const raiseId = raiseEvent.parsedJson.raise_id;
  const creatorCapObj = result.objectChanges?.find((c: any) => c.objectType?.includes("CreatorCap"));
  const creatorCapId = creatorCapObj?.objectId;

  console.log(`   Raise ID: ${raiseId}`);

  return { raiseId, creatorCapId: creatorCapId! };
}

async function stageActionsAndStart(
  sdk: SDK,
  raiseInfo: RaiseInfo,
  testCoins: TestCoins,
  sender: string,
  network: NetworkType
): Promise<void> {
  console.log("\n[STEP 2] Staging actions and starting raise...");

  const currentTime = Date.now();
  const streamStart = currentTime + 300_000;
  const streamAmount = TransactionUtils.suiToMist(0.5);
  const iterationsTotal = 12n;
  const iterationPeriodMs = 2_592_000_000n;
  const amountPerIteration = streamAmount / iterationsTotal;

  const successActions: ActionConfig[] = [
    {
      type: 'create_stream',
      vaultName: 'treasury',
      coinType: testCoins.asset.type,
      beneficiary: sender,
      amountPerIteration,
      startTime: streamStart,
      iterationsTotal,
      iterationPeriodMs,
      maxPerWithdrawal: amountPerIteration,
      isTransferable: true,
      isCancellable: true,
    },
    {
      type: 'create_pool_with_mint',
      vaultName: 'treasury',
      assetAmount: TransactionUtils.suiToMist(1000),
      stableAmount: TransactionUtils.suiToMist(1000),
      feeBps: 30,
      lpType: testCoins.lp.type,
      lpTreasuryCapId: testCoins.lp.treasuryCap,
      lpMetadataId: testCoins.lp.metadata,
    },
    {
      type: 'update_trading_params',
      reviewPeriodMs: 1000n,
      tradingPeriodMs: 60_000n,
    },
    {
      type: 'update_twap_config',
      startDelay: 0n,
      threshold: 0n,
    },
  ];

  const failureActions: ActionConfig[] = [
    { type: 'return_treasury_cap', recipient: sender },
    { type: 'return_metadata', recipient: sender },
  ];

  const startRaiseTx = sdk.launchpad.startRaise({
    raiseId: raiseInfo.raiseId,
    creatorCapId: raiseInfo.creatorCapId,
    assetType: testCoins.asset.type,
    stableType: testCoins.stable.type,
    successActions,
    failureActions,
  });

  await executeTransaction(sdk, startRaiseTx, {
    network,
    dryRun: false,
    showEffects: false,
  });

  console.log(`   Success actions: ${successActions.length}`);
  console.log(`   Failure actions: ${failureActions.length}`);
}

async function contribute(
  sdk: SDK,
  raiseInfo: RaiseInfo,
  testCoins: TestCoins,
  config: LaunchpadConfig,
  sender: string,
  network: NetworkType
): Promise<void> {
  const shouldSucceed = !config.shouldRaiseFail;
  const amount = shouldSucceed
    ? TransactionUtils.suiToMist(config.maxRaiseAmount)
    : TransactionUtils.suiToMist(config.minRaiseAmount * 0.5);

  console.log(`\n[STEP 3] Contributing ${TransactionUtils.mistToSui(amount)} tokens...`);

  // Mint stable tokens
  const mintTx = new Transaction();
  mintTx.moveCall({
    target: `${testCoins.stable.packageId}::coin::mint`,
    arguments: [
      mintTx.object(testCoins.stable.treasuryCap),
      mintTx.pure.u64(amount),
      mintTx.pure.address(sender),
    ],
  });

  await executeTransaction(sdk, mintTx, { network, dryRun: false, showEffects: false });

  // Get coins and contribute
  const stableCoins = await sdk.client.getCoins({
    owner: sender,
    coinType: testCoins.stable.type,
  });

  const contributeTx = sdk.launchpad.contribute({
    raiseId: raiseInfo.raiseId,
    assetType: testCoins.asset.type,
    stableType: testCoins.stable.type,
    stableCoins: stableCoins.data.map((c) => c.coinObjectId),
    amount,
    capTier: LaunchpadService.UNLIMITED_CAP,
    crankFee: TransactionUtils.suiToMist(0.1),
  });

  await executeTransaction(sdk, contributeTx, { network, dryRun: false, showEffects: false });

  console.log(`   Contributed: ${TransactionUtils.mistToSui(amount)}`);
}

async function completeRaise(
  sdk: SDK,
  raiseInfo: RaiseInfo,
  testCoins: TestCoins,
  network: NetworkType
): Promise<ExecutionResult> {
  console.log("\n[STEP 4] Completing raise...");

  const completeTx = sdk.launchpad.complete({
    raiseId: raiseInfo.raiseId,
    assetType: testCoins.asset.type,
    stableType: testCoins.stable.type,
  });

  const result = await executeTransaction(sdk, completeTx, {
    network,
    dryRun: false,
    showEffects: false,
    showObjectChanges: true,
    showEvents: true,
  });

  const successEvent = result.events?.find((e: any) => e.type.includes("RaiseSuccessful"));
  const failedEvent = result.events?.find((e: any) => e.type.includes("RaiseFailed"));

  let accountId: string | undefined;
  let raiseSucceeded = false;

  if (successEvent) {
    raiseSucceeded = true;
    accountId = successEvent.parsedJson?.account_id;
    console.log(`   Result: SUCCESS`);
  } else if (failedEvent) {
    raiseSucceeded = false;
    accountId = failedEvent.parsedJson?.account_id;
    console.log(`   Result: FAILED`);
  } else {
    throw new Error("Neither RaiseSuccessful nor RaiseFailed event found");
  }

  if (!accountId) {
    const accountObj = result.objectChanges?.find((c: any) => c.objectType?.includes("::account::Account"));
    accountId = accountObj?.objectId;
  }

  if (!accountId) throw new Error("Could not find Account ID");

  console.log(`   Account ID: ${accountId}`);

  return { accountId, raiseSucceeded };
}

async function executeIntent(
  sdk: SDK,
  raiseInfo: RaiseInfo,
  executionResult: ExecutionResult,
  testCoins: TestCoins,
  network: NetworkType
): Promise<string | undefined> {
  console.log("\n[STEP 5] Executing intent...");

  const actionTypes: LaunchpadActionType[] = executionResult.raiseSucceeded
    ? [
        { type: 'create_stream', coinType: testCoins.stable.type },
        {
          type: 'create_pool_with_mint',
          assetType: testCoins.asset.type,
          stableType: testCoins.stable.type,
          lpType: testCoins.lp.type,
          lpTreasuryCapId: testCoins.lp.treasuryCap,
          lpMetadataId: testCoins.lp.metadata,
        },
        { type: 'update_trading_params' },
        { type: 'update_twap_config' },
      ]
    : [
        { type: 'return_treasury_cap', coinType: testCoins.asset.type },
        { type: 'return_metadata', coinType: testCoins.asset.type },
      ];

  console.log(`   Actions to execute: ${actionTypes.length}`);
  actionTypes.forEach((a, i) => console.log(`     [${i + 1}] ${a.type}`));

  const executeTx = sdk.launchpad.executeActions({
    accountId: executionResult.accountId,
    raiseId: raiseInfo.raiseId,
    assetType: testCoins.asset.type,
    stableType: testCoins.stable.type,
    actionTypes,
  });

  const result = await executeTransaction(sdk, executeTx, {
    network,
    dryRun: false,
    showEffects: false,
    showObjectChanges: true,
    showEvents: false,
  });

  let poolId: string | undefined;

  if (executionResult.raiseSucceeded) {
    const poolObj = result.objectChanges?.find((c: any) =>
      c.objectType?.includes("::unified_spot_pool::UnifiedSpotPool")
    );
    poolId = poolObj?.objectId;
    const streamObj = result.objectChanges?.find((c: any) =>
      c.objectType?.includes("::vault::Stream")
    );

    console.log(`   Stream: ${streamObj?.objectId || 'not found'}`);
    console.log(`   Pool: ${poolId || 'not found'}`);
  } else {
    console.log(`   Caps returned to creator`);
  }

  return poolId;
}

async function claimTokens(
  sdk: SDK,
  raiseInfo: RaiseInfo,
  testCoins: TestCoins,
  network: NetworkType
): Promise<void> {
  console.log("\n[STEP 6] Claiming tokens...");

  const claimTx = sdk.launchpad.claim(
    raiseInfo.raiseId,
    testCoins.asset.type,
    testCoins.stable.type,
  );

  await executeTransaction(sdk, claimTx, {
    network,
    dryRun: false,
    showEffects: false,
    showObjectChanges: true,
  });

  console.log(`   Tokens claimed`);
}

function saveDaoInfo(
  accountId: string,
  raiseInfo: RaiseInfo,
  testCoins: TestCoins,
  poolId: string | undefined,
  config: LaunchpadConfig,
  network: NetworkType,
  sdk: SDK
): void {
  // The correct LP type is from unified_spot_pool, not a separate coin
  // const lpType = `${sdk.packages.futarchyMarketsCore}::unified_spot_pool::LP<${testCoins.asset.type}, ${testCoins.stable.type}>`;

  const daoInfo = {
    accountId,
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
    spotPoolId: poolId || null,
    raiseId: raiseInfo.raiseId,
    timestamp: Date.now(),
    network,
    success: !config.shouldRaiseFail,
  };
  const daoInfoPath = path.join(__dirname, "..", "deployments", "test-data", `test-dao-info.json`);

  fs.writeFileSync(daoInfoPath, JSON.stringify(daoInfo, null, 2), "utf-8");
  console.log(`\n💾 DAO info saved: ${daoInfoPath}`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const isNonInteractive = process.argv.includes("--non-interactive");

  let config: LaunchpadConfig;
  if (isNonInteractive) {
    config = getDefaultConfig();
    console.log("\n📋 Non-interactive mode");
  } else {
    const rl = createPromptInterface();
    config = await promptForConfig(rl);
    rl.close();
  }

  const shouldSucceed = !config.shouldRaiseFail;
  const network = getCurrentNetwork();

  console.log("\n" + "=".repeat(60));
  console.log(`LAUNCHPAD E2E: ${shouldSucceed ? "SUCCESS" : "FAILURE"} PATH`);
  console.log("=".repeat(60));

  const sdk = initSDK(network);
  const sender = getActiveAddress();

  console.log(`Network: ${network}`);
  console.log(`Sender: ${sender}`);

  // Run test steps
  // const testCoins = await setupTestCoins(sdk, config, network);
  const testCoins = await createTestCoins(sdk, network);

  // Register all packages in PackageRegistry (required for deps::check)
  await registerPackages();

  // Register the newly created stable coin in factory allowed stables
  await registerStableCoinInFactory(sdk, testCoins.stable.type, network);

  const raiseInfo = await createRaise(sdk, config, testCoins, network);

  await stageActionsAndStart(sdk, raiseInfo, testCoins, sender, network);

  // Wait for start delay
  console.log("\n⏳ Waiting for start delay (6s)...");
  await new Promise((resolve) => setTimeout(resolve, 6000));

  await contribute(sdk, raiseInfo, testCoins, config, sender, network);

  // Wait for deadline
  console.log("\n⏳ Waiting for deadline (30s)...");
  await new Promise((resolve) => setTimeout(resolve, 30000));

  const executionResult = await completeRaise(sdk, raiseInfo, testCoins, network);
  const poolId = await executeIntent(sdk, raiseInfo, executionResult, testCoins, network);

  if (executionResult.raiseSucceeded) {
    await claimTokens(sdk, raiseInfo, testCoins, network);
  }

  saveDaoInfo(executionResult.accountId, raiseInfo, testCoins, poolId, config, network, sdk);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("✅ TEST COMPLETE");
  console.log("=".repeat(60));
  console.log(`\n🔗 Raise: https://suiscan.xyz/${network}/object/${raiseInfo.raiseId}`);
  console.log(`🔗 DAO: https://suiscan.xyz/${network}/object/${executionResult.accountId}`);
}

main()
  .then(() => {
    console.log("\n✅ Script completed\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
