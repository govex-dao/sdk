/**
 * Deploy and Register Conditional Coins
 *
 * This script:
 * 1. Generates conditional coin Move modules (conditional_0, conditional_1, etc.)
 * 2. Deploys each as a separate package (required for unique module names)
 * 3. Registers all TreasuryCaps in the CoinRegistry
 * 4. Saves deployment info to JSON for use in tests
 *
 * Usage:
 *   npx tsx scripts/deploy-conditional-coins.ts [--registry 0x...existing] [--fee <mist>] [--count N]
 */

import { Transaction } from "@mysten/sui/transactions";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { initSDK, executeTransaction, getActiveAddress } from "./execute-tx";

// ESM compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CONDITIONAL_COIN_BASE_PATH = path.join(REPO_ROOT, "packages", "conditional_coin");
const DEPLOYMENTS_DIR = path.join(REPO_ROOT, "packages", "deployments");
const SDK_DIR = path.join(REPO_ROOT, "sdk");

interface ConditionalCoinInfo {
  treasuryCapId: string;
  metadataId: string;
  coinType: string;
  packageId: string;
}

interface ConditionalCoinsDeployment {
  registryId: string;
  coins: Record<string, ConditionalCoinInfo>;
  timestamp: string;
  network: string;
}

/**
 * Generate Move module source for a conditional coin
 * Module name will be "conditional_N" where N is the index
 * OTW struct will be "CONDITIONAL_N" (uppercased module name)
 */
function generateCoinModule(index: number): string {
  const moduleName = `conditional_${index}`;
  const otwName = `CONDITIONAL_${index}`;

  return `// Copyright (c) Govex DAO LLC
// SPDX-License-Identifier: BUSL-1.1

/// Conditional Coin ${index}
/// Module name is "conditional_${index}" for CoinRegistry acceptance
module conditional_coin::${moduleName};

use sui::coin;

/// One-Time Witness for ${otwName}
public struct ${otwName} has drop {}

/// Initialize function called when module is published
fun init(witness: ${otwName}, ctx: &mut TxContext) {
    let (treasury_cap, metadata) = coin::create_currency(
        witness,
        6, // 6 decimals to match test coins
        b"", // Empty symbol for CoinRegistry
        b"", // Empty name for CoinRegistry
        b"", // Empty description for CoinRegistry
        option::none(), // No icon for CoinRegistry
        ctx,
    );

    // Transfer both to sender
    transfer::public_transfer(treasury_cap, ctx.sender());
    transfer::public_transfer(metadata, ctx.sender());
}
`;
}

/**
 * Generate Move.toml for a conditional coin package
 */
function generateMoveToml(packageName: string): string {
  return `[package]
name = "${packageName}"
edition = "2024.beta"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "mainnet-v1.39.3" }

[addresses]
conditional_coin = "0x0"
`;
}

async function main() {
  const args = process.argv.slice(2);
  let existingRegistryId: string | null = null;
  let feeOverride: bigint | null = null;
  let coinCount = 4; // Default: 4 coins (for 2-outcome proposals: 2 asset + 2 stable)

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
    } else if (arg === "--count") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("--count flag requires a number");
      }
      coinCount = parseInt(value, 10);
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  console.log("=".repeat(80));
  console.log("DEPLOY AND REGISTER CONDITIONAL COINS");
  console.log("=".repeat(80));
  console.log();

  // Initialize SDK
  const sdk = await initSDK();
  const activeAddress = getActiveAddress();
  console.log(`Active address: ${activeAddress}`);
  console.log(`Deploying ${coinCount} conditional coins...`);
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
      network: "devnet",
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

  // Clean up sources directory
  const sourcesDir = path.join(CONDITIONAL_COIN_BASE_PATH, "sources");
  if (fs.existsSync(sourcesDir)) {
    for (const file of fs.readdirSync(sourcesDir)) {
      fs.unlinkSync(path.join(sourcesDir, file));
    }
  } else {
    fs.mkdirSync(sourcesDir, { recursive: true });
  }

  // Generate all coin modules in one package
  console.log(`📝 Generating ${coinCount} conditional coin modules...`);
  for (let i = 0; i < coinCount; i++) {
    const moduleSource = generateCoinModule(i);
    const fileName = `conditional_${i}.move`;
    fs.writeFileSync(path.join(sourcesDir, fileName), moduleSource);
    console.log(`   Created ${fileName}`);
  }
  console.log();

  // Update Move.toml
  const moveToml = generateMoveToml("conditional_coin");
  fs.writeFileSync(path.join(CONDITIONAL_COIN_BASE_PATH, "Move.toml"), moveToml);

  // Build and deploy the package
  console.log("📦 Building and deploying conditional_coin package...");
  console.log();

  const buildCmd = `cd ${CONDITIONAL_COIN_BASE_PATH} && sui move build --silence-warnings`;
  execSync(buildCmd, { stdio: "inherit" });

  const publishCmd = `cd ${CONDITIONAL_COIN_BASE_PATH} && sui client publish --gas-budget 100000000 --json`;
  const publishOutput = execSync(publishCmd, { encoding: "utf-8" });
  const publishResult = JSON.parse(publishOutput);

  if (publishResult.effects?.status?.status !== "success") {
    console.error("❌ Deployment failed!");
    console.error(publishResult);
    process.exit(1);
  }

  // Extract package ID
  const packageId = publishResult.objectChanges?.find(
    (obj: any) => obj.type === "published"
  )?.packageId;

  if (!packageId) {
    console.error("❌ Failed to extract package ID!");
    process.exit(1);
  }

  console.log(`✅ Deployed: ${packageId}`);
  console.log();

  // Extract TreasuryCaps and Metadata
  const objectChanges = publishResult.objectChanges || [];
  const coins: Record<string, ConditionalCoinInfo> = {};

  // Find all conditional_N coins
  const coinPattern = /::conditional_(\d+)::/;

  for (let i = 0; i < coinCount; i++) {
    const moduleName = `conditional_${i}`;

    const treasuryCap = objectChanges.find(
      (obj: any) =>
        obj.objectType?.includes(`::${moduleName}::`) && obj.objectType?.includes("TreasuryCap")
    );
    const metadata = objectChanges.find(
      (obj: any) =>
        obj.objectType?.includes(`::${moduleName}::`) && obj.objectType?.includes("CoinMetadata")
    );

    if (!treasuryCap || !metadata) {
      console.error(`❌ Failed to find TreasuryCap or Metadata for ${moduleName}`);
      process.exit(1);
    }

    coins[moduleName] = {
      treasuryCapId: treasuryCap.objectId,
      metadataId: metadata.objectId,
      coinType: treasuryCap.objectType.match(/TreasuryCap<(.+)>/)?.[1] || "",
      packageId,
    };

    console.log(`✅ ${moduleName}:`);
    console.log(`   TreasuryCap: ${coins[moduleName].treasuryCapId}`);
    console.log(`   Metadata: ${coins[moduleName].metadataId}`);
    console.log(`   Type: ${coins[moduleName].coinType}`);
  }
  console.log();

  // Register all caps in CoinRegistry
  console.log("📝 Registering conditional coins in CoinRegistry...");
  console.log();

  const registerTx = new Transaction();
  const fee = feeOverride ?? 0n; // Default zero fee for test coins

  for (const [coinName, info] of Object.entries(coins)) {
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
    network: "devnet",
  });

  console.log("✅ All conditional coins registered in CoinRegistry!");
  console.log();

  // Save deployment info in LEGACY format expected by test utils
  // Test utils expect: cond0_asset, cond0_stable, cond1_asset, cond1_stable, etc.
  // Each pair of consecutive coins is (asset, stable) for one outcome
  const legacyFormat: Record<string, any> = {
    packageId: packageId, // All coins are in the same package
    registryId,
  };

  // Map conditional_N coins to condM_asset/condM_stable pairs
  // conditional_0 -> cond0_asset, conditional_1 -> cond0_stable
  // conditional_2 -> cond1_asset, conditional_3 -> cond1_stable, etc.
  const outcomeCount = Math.floor(coinCount / 2);
  for (let outcome = 0; outcome < outcomeCount; outcome++) {
    const assetCoinKey = `conditional_${outcome * 2}`;
    const stableCoinKey = `conditional_${outcome * 2 + 1}`;

    if (coins[assetCoinKey]) {
      legacyFormat[`cond${outcome}_asset`] = coins[assetCoinKey];
    }
    if (coins[stableCoinKey]) {
      legacyFormat[`cond${outcome}_stable`] = coins[stableCoinKey];
    }
  }

  legacyFormat.timestamp = new Date().toISOString();
  legacyFormat.network = "devnet";

  // Save to deployments directory
  const deploymentFile = path.join(DEPLOYMENTS_DIR, "conditional_coins.json");
  fs.writeFileSync(deploymentFile, JSON.stringify(legacyFormat, null, 2));
  console.log(`✅ Saved deployment info: ${deploymentFile}`);

  // Save to SDK directory for easy access
  const sdkFile = path.join(SDK_DIR, "conditional-coins-info.json");
  fs.writeFileSync(sdkFile, JSON.stringify(legacyFormat, null, 2));
  console.log(`✅ Saved to SDK: ${sdkFile}`);
  console.log();

  // Process deployments to update SDK
  console.log("🔄 Processing deployments to update SDK...");
  execSync(`cd ${SDK_DIR} && npx tsx scripts/process-deployments.ts`, { stdio: "inherit" });
  console.log();

  console.log("=".repeat(80));
  console.log("✅ CONDITIONAL COINS DEPLOYED AND REGISTERED!");
  console.log("=".repeat(80));
  console.log();
  console.log("Next steps:");
  console.log("  1. Conditional coins are now in CoinRegistry");
  console.log("  2. Proposal tests can fetch them via take_coin_set()");
  console.log("  3. Run: npm run test:proposal-with-swaps");
  console.log();
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
