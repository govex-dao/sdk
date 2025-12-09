/**
 * Deploy and Register Conditional Coins
 *
 * This script:
 * 1. Deploys the conditional_coins package (4 coin types)
 * 2. Registers all TreasuryCaps in the CoinRegistry
 * 3. Saves deployment info to JSON for use in tests
 *
 * Usage:
 *   npx tsx scripts/deploy-conditional-coins.ts [--registry 0x...existing] [--fee <mist>]
 */

import { Transaction } from "@mysten/sui/transactions";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { initSDK, executeTransaction, getActiveAddress, getActiveEnv } from "./execute-tx";

const SDK_DIR = path.resolve(__dirname, "..");
const TEST_ASSET_COIN_PATH = path.join(SDK_DIR, "tmp", "test_asset_coin");
const TEST_STABLE_COIN_PATH = path.join(SDK_DIR, "tmp", "test_stable_coin");
const DEPLOYMENTS_DIR = path.join(SDK_DIR, "deployments");

interface ConditionalCoinInfo {
  treasuryCapId: string;  // Used as key to look up coin set in registry (object no longer exists after deposit)
  metadataId: string;
  coinType: string;
}

interface ConditionalCoinsDeployment {
  packageIds: string[];
  registryId: string;
  cond0_asset: ConditionalCoinInfo;
  cond0_stable: ConditionalCoinInfo;
  cond1_asset: ConditionalCoinInfo;
  cond1_stable: ConditionalCoinInfo;
  timestamp: string;
  network: string;
}

async function main() {
  const args = process.argv.slice(2);
  let existingRegistryId: string | null = null;
  let feeOverride: bigint | null = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--registry") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("--registry flag requires an object ID");
      }
      existingRegistryId = value;
      i += 1;
    } else if (arg === "--fee") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("--fee flag requires a number (mist)");
      }
      feeOverride = BigInt(value);
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  console.log("=".repeat(80));
  console.log("DEPLOY AND REGISTER CONDITIONAL COINS");
  console.log("=".repeat(80));
  console.log();

  // Initialize SDK with current network
  const currentNetwork = getActiveEnv();
  const sdk = initSDK(currentNetwork);
  const activeAddress = getActiveAddress();
  console.log(`Active address: ${activeAddress}`);
  console.log(`Network: ${currentNetwork}`);
  console.log();

  // Get one_shot_utils package
  const oneShotUtils = sdk.deployments.getPackage("futarchy_one_shot_utils");
  if (!oneShotUtils) {
    console.error("❌ futarchy_one_shot_utils not found in deployments!");
    process.exit(1);
  }

  // Create CoinRegistry if it doesn't exist
  let registryId = existingRegistryId;
  if (!registryId) {
    console.log("📝 Creating CoinRegistry...");
    const createRegistryTx = new Transaction();

    const registry = createRegistryTx.moveCall({
      target: `${oneShotUtils.packageId}::coin_registry::create_registry`,
      arguments: [],
    });

    createRegistryTx.moveCall({
      target: `${oneShotUtils.packageId}::coin_registry::share_registry`,
      arguments: [registry],
    });

    const registryResult = await executeTransaction(sdk, createRegistryTx, {
      network: currentNetwork,
      showObjectChanges: true,
    });

    // Find the shared CoinRegistry object
    const registryObject = registryResult.objectChanges?.find(
      (obj: any) =>
        obj.type === "created" &&
        obj.objectType &&
        obj.objectType.includes("::coin_registry::CoinRegistry")
    );

    if (!registryObject) {
      console.error("❌ Failed to find CoinRegistry in object changes!");
      console.error("Object changes:", JSON.stringify(registryResult.objectChanges, null, 2));
      process.exit(1);
    }

    registryId = (registryObject as any).objectId;
    console.log(`✅ CoinRegistry created: ${registryId}`);
    console.log();
  } else {
    console.log(`ℹ️  Using existing CoinRegistry: ${registryId}`);
    console.log();
  }

  if (!registryId) {
    throw new Error("CoinRegistry ID not available");
  }

  // Step 1: Deploy 4 conditional coins using test_asset_coin and test_stable_coin as templates
  // We deploy each one separately to get unique coin types
  const coinConfigs = [
    { name: "cond0_asset", template: TEST_ASSET_COIN_PATH },
    { name: "cond0_stable", template: TEST_STABLE_COIN_PATH },
    { name: "cond1_asset", template: TEST_ASSET_COIN_PATH },
    { name: "cond1_stable", template: TEST_STABLE_COIN_PATH },
  ];

  const caps: Record<string, ConditionalCoinInfo> = {};
  const packageIds: string[] = [];

  for (const coinConfig of coinConfigs) {
    console.log(`📦 Deploying ${coinConfig.name}...`);

    const buildCmd = `cd ${coinConfig.template} && sui move build --silence-warnings`;
    execSync(buildCmd, { stdio: "inherit" });

    const publishCmd = `cd ${coinConfig.template} && sui client publish --gas-budget 100000000 --json`;
    const publishOutput = execSync(publishCmd, { encoding: "utf-8" });
    const publishResult = JSON.parse(publishOutput);

    if (publishResult.effects?.status?.status !== "success") {
      console.error(`❌ Deployment failed for ${coinConfig.name}!`);
      console.error(publishResult);
      process.exit(1);
    }

    // Extract package ID
    const packageId = publishResult.objectChanges?.find(
      (obj: any) => obj.type === "published"
    )?.packageId;

    if (!packageId) {
      console.error(`❌ Failed to extract package ID for ${coinConfig.name}!`);
      process.exit(1);
    }

    packageIds.push(packageId);

    // Extract TreasuryCap and Metadata
    const objectChanges = publishResult.objectChanges || [];
    const treasuryCap = objectChanges.find(
      (obj: any) => obj.objectType?.includes("TreasuryCap")
    );
    const metadata = objectChanges.find(
      (obj: any) => obj.objectType?.includes("CoinMetadata")
    );

    if (!treasuryCap || !metadata) {
      console.error(`❌ Failed to find TreasuryCap or Metadata for ${coinConfig.name}`);
      process.exit(1);
    }

    caps[coinConfig.name] = {
      treasuryCapId: treasuryCap.objectId,
      metadataId: metadata.objectId,
      coinType: treasuryCap.objectType.match(/TreasuryCap<(.+)>/)?.[1] || "",
    };

    console.log(`✅ ${coinConfig.name}:`);
    console.log(`   Package: ${packageId}`);
    console.log(`   TreasuryCap: ${caps[coinConfig.name].treasuryCapId}`);
    console.log(`   Metadata: ${caps[coinConfig.name].metadataId}`);
    console.log();
  }

  // Step 2: Register all caps in CoinRegistry
  // Note: After this step, the treasury cap objects are consumed by the registry
  // The treasuryCapId is preserved as the lookup key in the registry
  console.log("📝 Registering conditional coins in CoinRegistry...");
  console.log();

  const registerTx = new Transaction();
  const fee = feeOverride ?? 0n; // Default zero fee for test coins

  for (const [coinName, info] of Object.entries(caps)) {
    console.log(`   Registering ${coinName}...`);

    registerTx.moveCall({
      target: `${oneShotUtils.packageId}::coin_registry::deposit_coin_set_entry`,
      typeArguments: [info.coinType],
      arguments: [
        registerTx.object(registryId),
        registerTx.object(info.treasuryCapId),
        registerTx.object(info.metadataId),
        registerTx.pure.u64(fee),
        registerTx.sharedObjectRef({
          objectId: "0x6",
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });
  }

  await executeTransaction(sdk, registerTx, {
    network: currentNetwork,
  });

  console.log("✅ All conditional coins registered in CoinRegistry!");
  console.log();

  // Step 3: Save deployment info
  const deployment: ConditionalCoinsDeployment = {
    packageIds,
    registryId,
    cond0_asset: caps.cond0_asset,
    cond0_stable: caps.cond0_stable,
    cond1_asset: caps.cond1_asset,
    cond1_stable: caps.cond1_stable,
    timestamp: new Date().toISOString(),
    network: currentNetwork,
  };

  // Save to SDK deployments directory
  const testDataDir = path.join(DEPLOYMENTS_DIR, "test-data");
  if (!fs.existsSync(testDataDir)) {
    fs.mkdirSync(testDataDir, { recursive: true });
  }
  const deploymentFile = path.join(testDataDir, "conditional-coins-info.json");
  fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
  console.log(`✅ Saved deployment info: ${deploymentFile}`);

  // Step 4: Deploy test_stable package (shared TreasuryCap) for launchpad e2e tests
  console.log();
  console.log("=".repeat(80));
  console.log("DEPLOYING TEST STABLE (shared TreasuryCap for launchpad)");
  console.log("=".repeat(80));
  console.log();

  const TEST_STABLE_PATH = path.join(SDK_DIR, "..", "packages", "test_stable");

  if (fs.existsSync(TEST_STABLE_PATH)) {
    try {
      // Clean build artifacts
      execSync("rm -rf build Move.lock", { cwd: TEST_STABLE_PATH, stdio: "inherit" });

      // Deploy test_stable package
      console.log("📝 Deploying test_stable package...");
      const deployResult = execSync(
        `sui client publish --gas-budget 500000000 --json`,
        { cwd: TEST_STABLE_PATH, encoding: "utf-8" }
      );

      const deployData = JSON.parse(deployResult);
      const testStablePackageId = deployData.objectChanges?.find(
        (obj: any) => obj.type === "published"
      )?.packageId;

      if (!testStablePackageId) {
        console.log("⚠ Could not extract test_stable package ID");
      } else {
        console.log(`✅ test_stable deployed: ${testStablePackageId}`);

        // Get TreasuryCap ID (it's shared, so we just need the type)
        const stableType = `${testStablePackageId}::my_stable::MY_STABLE`;
        console.log(`   Stable type: ${stableType}`);

        // Add to factory allowed stables
        console.log();
        console.log("📝 Adding test_stable to factory allowed stables...");

        const factoryDeployment = sdk.deployments.getPackage("futarchy_factory");
        const factoryOwnerCapId = factoryDeployment?.adminCaps?.find(
          (obj: any) => obj.name === "FactoryOwnerCap"
        )?.objectId;

        if (factoryOwnerCapId) {
          const addStableTx = sdk.admin.factory.addAllowedStableType(
            stableType,
            factoryOwnerCapId
          );

          await executeTransaction(sdk, addStableTx, {
            network: currentNetwork,
          });
          console.log("✅ test_stable added to factory allowed stables!");
        } else {
          console.log("⚠ FactoryOwnerCap not found - skipping allowed stable registration");
        }
      }
    } catch (error: any) {
      console.log(`⚠ Could not deploy test_stable: ${error.message}`);
      console.log("   Launchpad e2e tests may fail without a shared TreasuryCap stable");
    }
  } else {
    console.log(`⚠ test_stable package not found at ${TEST_STABLE_PATH}`);
  }

  console.log();
  console.log("=".repeat(80));
  console.log("✅ CONDITIONAL COINS DEPLOYED AND REGISTERED!");
  console.log("=".repeat(80));
  console.log();
  console.log("Next steps:");
  console.log("  1. Conditional coins are now in CoinRegistry");
  console.log("  2. test_stable added as allowed stable (if successful)");
  console.log("  3. Run: npm run test:launchpad-e2e");
  console.log("  4. Run: npm run test:proposal-with-swaps");
  console.log();
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
