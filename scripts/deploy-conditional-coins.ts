/**
 * Deploy and Register Conditional Coins
 *
 * This script:
 * 1. Generates conditional coin Move modules (conditional_0, conditional_1, etc.)
 * 2. Deploys each as a separate package (required for unique module names)
 * 3. Registers all TreasuryCaps in the BlankCoinsRegistry
 * 4. Saves deployment info to JSON for use in tests
 *
 * Usage:
 *   npx tsx scripts/deploy-conditional-coins.ts [--registry 0x...existing] [--fee <mist>] [--decimals <decimals:count,...>]
 *
 * Examples:
 *   # Deploy 4 coins with 9 decimals and 4 coins with 6 decimals (default)
 *   npx tsx scripts/deploy-conditional-coins.ts
 *
 *   # Deploy 10 coins with 9 decimals and 10 coins with 6 decimals
 *   npx tsx scripts/deploy-conditional-coins.ts --decimals 9:10,6:10
 *
 *   # Deploy only 6-decimal coins (stables)
 *   npx tsx scripts/deploy-conditional-coins.ts --decimals 6:8
 *
 *   # Deploy coins with various decimals
 *   npx tsx scripts/deploy-conditional-coins.ts --decimals 9:5,6:5,8:2
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
  currencyId: string;     // Currency<T> object ID (shared, from coin_registry::finalize)
  coinType: string;
  packageId: string;
  decimals: number;       // Decimals of the coin (9 for asset, 6 for stable)
}

interface ConditionalCoinsDeployment {
  registryId: string;
  coins: Record<string, ConditionalCoinInfo>;
  timestamp: string;
  network: string;
}

/**
 * Represents a decimals:count pair for coin generation
 */
interface DecimalsSpec {
  decimals: number;
  count: number;
}

/**
 * Parse decimals specification string like "9:4,6:4" into array of specs
 */
function parseDecimalsSpec(spec: string): DecimalsSpec[] {
  return spec.split(",").map((part) => {
    const [decimalsStr, countStr] = part.trim().split(":");
    const decimals = parseInt(decimalsStr, 10);
    const count = parseInt(countStr, 10);
    if (isNaN(decimals) || isNaN(count) || decimals < 0 || decimals > 18 || count < 1) {
      throw new Error(`Invalid decimals spec: ${part}. Expected format: decimals:count (e.g., 9:4)`);
    }
    return { decimals, count };
  });
}

/**
 * Build a mapping from coin index to decimals based on specs
 * Returns array where index is coin index and value is decimals
 */
function buildDecimalsMap(specs: DecimalsSpec[]): number[] {
  const result: number[] = [];
  for (const spec of specs) {
    for (let i = 0; i < spec.count; i++) {
      result.push(spec.decimals);
    }
  }
  return result;
}

/**
 * Generate Move module source for a conditional coin
 * Module name will be "conditional_N" where N is the index
 * OTW struct will be "CONDITIONAL_N" (uppercased module name)
 *
 * Uses coin_registry::new_currency_with_otw() to:
 * 1. Create TreasuryCap<T> and CurrencyInitializer<T>
 * 2. Finalize to get MetadataCap<T> and auto-share Currency<T>
 */
function generateCoinModule(index: number, decimals: number): string {
  const moduleName = `conditional_${index}`;
  const otwName = `CONDITIONAL_${index}`;

  return `// Copyright (c) Govex DAO LLC
// SPDX-License-Identifier: BUSL-1.1

/// Conditional Coin ${index}
/// Module name is "conditional_${index}" for BlankCoinsRegistry acceptance
/// Decimals: ${decimals}
/// Uses coin_registry::new_currency_with_otw() for auto-registration with Sui's CoinRegistry
module conditional_coin::${moduleName};

use sui::coin_registry;

/// One-Time Witness for ${otwName}
public struct ${otwName} has drop {}

/// Initialize function called when module is published
/// Creates Currency<T> (auto-shared) and TreasuryCap<T>
fun init(witness: ${otwName}, ctx: &mut TxContext) {
    let (initializer, treasury_cap) = coin_registry::new_currency_with_otw(
        witness,
        ${decimals}, // decimals
        b"".to_string(), // Empty symbol for blank coins
        b"".to_string(), // Empty name for blank coins
        b"".to_string(), // Empty description for blank coins
        b"".to_string(), // Empty icon_url for blank coins
        ctx,
    );

    // Finalize - this shares Currency<T> automatically
    let metadata_cap = coin_registry::finalize(initializer, ctx);

    // Transfer TreasuryCap to sender for deposit into BlankCoinsRegistry
    transfer::public_transfer(treasury_cap, ctx.sender());
    // Transfer MetadataCap to sender - blank coins have empty metadata, cap is not used
    transfer::public_transfer(metadata_cap, ctx.sender());
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
  // Default: 4 coins with 9 decimals (asset) and 4 coins with 6 decimals (stable)
  let decimalsSpecStr = "9:4,6:4";

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
    } else if (arg === "--decimals") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("--decimals flag requires a spec like '9:4,6:4'");
      }
      decimalsSpecStr = value;
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  // Parse decimals spec and build the mapping
  const decimalsSpecs = parseDecimalsSpec(decimalsSpecStr);
  const decimalsMap = buildDecimalsMap(decimalsSpecs);
  const coinCount = decimalsMap.length;

  console.log("=".repeat(80));
  console.log("DEPLOY AND REGISTER CONDITIONAL COINS");
  console.log("=".repeat(80));
  console.log();

  // Initialize SDK
  const sdk = await initSDK();
  const activeAddress = getActiveAddress();
  console.log(`Active address: ${activeAddress}`);
  console.log(`Decimals spec: ${decimalsSpecStr}`);
  console.log(`Deploying ${coinCount} conditional coins:`);
  for (const spec of decimalsSpecs) {
    console.log(`  - ${spec.count} coins with ${spec.decimals} decimals`);
  }
  console.log();

  // Get one_shot_utils package
  const oneShotUtils = sdk.deployments.getPackage("futarchy_one_shot_utils");
  if (!oneShotUtils) {
    console.error("❌ futarchy_one_shot_utils not found in deployments!");
    process.exit(1);
  }

  // Create BlankCoinsRegistry if it doesn't exist
  let registryId = existingRegistryId;
  if (!registryId) {
    console.log("📝 Creating BlankCoinsRegistry...");
    const createRegistryTx = new Transaction();

    const registry = createRegistryTx.moveCall({
      target: `${oneShotUtils.packageId}::blank_coins::create_registry`,
      arguments: [],
    });

    createRegistryTx.moveCall({
      target: `${oneShotUtils.packageId}::blank_coins::share_registry`,
      arguments: [registry],
    });

    const registryResult = await executeTransaction(sdk, createRegistryTx, {
      network: "devnet",
      showObjectChanges: true,
    });

    // Find the shared BlankCoinsRegistry object
    const registryObject = registryResult.objectChanges?.find(
      (obj: any) =>
        obj.type === "created" &&
        obj.objectType &&
        obj.objectType.includes("::blank_coins::BlankCoinsRegistry")
    );

    if (!registryObject) {
      console.error("❌ Failed to find BlankCoinsRegistry in object changes!");
      console.error("Object changes:", JSON.stringify(registryResult.objectChanges, null, 2));
      process.exit(1);
    }

    registryId = (registryObject as any).objectId;
    console.log(`✅ BlankCoinsRegistry created: ${registryId}`);
    console.log();
  } else {
    console.log(`ℹ️  Using existing BlankCoinsRegistry: ${registryId}`);
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
    const decimals = decimalsMap[i];
    const moduleSource = generateCoinModule(i, decimals);
    const fileName = `conditional_${i}.move`;
    fs.writeFileSync(path.join(sourcesDir, fileName), moduleSource);
    console.log(`   Created ${fileName} (${decimals} decimals)`);
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

  // Extract TreasuryCaps, MetadataCaps, and Currency objects
  const objectChanges = publishResult.objectChanges || [];
  const coins: Record<string, ConditionalCoinInfo> = {};

  for (let i = 0; i < coinCount; i++) {
    const moduleName = `conditional_${i}`;
    const decimals = decimalsMap[i];

    const treasuryCap = objectChanges.find(
      (obj: any) =>
        obj.objectType?.includes(`::${moduleName}::`) && obj.objectType?.includes("TreasuryCap")
    );
    // Find the shared Currency<T> object (created by coin_registry::finalize)
    const currency = objectChanges.find(
      (obj: any) =>
        obj.objectType?.includes(`::${moduleName}::`) && obj.objectType?.includes("Currency<")
    );

    if (!treasuryCap) {
      console.error(`❌ Failed to find TreasuryCap for ${moduleName}`);
      process.exit(1);
    }

    if (!currency) {
      console.error(`❌ Failed to find Currency<T> for ${moduleName}`);
      process.exit(1);
    }

    coins[moduleName] = {
      treasuryCapId: treasuryCap.objectId,
      currencyId: currency.objectId,
      coinType: treasuryCap.objectType.match(/TreasuryCap<(.+)>/)?.[1] || "",
      packageId,
      decimals,
    };

    console.log(`✅ ${moduleName} (${decimals} decimals):`);
    console.log(`   TreasuryCap: ${coins[moduleName].treasuryCapId}`);
    console.log(`   Currency: ${coins[moduleName].currencyId}`);
    console.log(`   Type: ${coins[moduleName].coinType}`);
  }
  console.log();

  // Register all caps in BlankCoinsRegistry
  // BUCKETED BY DECIMALS: Each coin is deposited with its expected_decimals
  // which is validated against Currency<T>.decimals()
  console.log("📝 Registering conditional coins in BlankCoinsRegistry...");
  console.log();

  const registerTx = new Transaction();
  const fee = feeOverride ?? 0n; // Default zero fee for test coins

  for (const [coinName, info] of Object.entries(coins)) {
    console.log(`   Registering ${coinName} (${info.decimals} decimals)...`);

    registerTx.moveCall({
      target: `${oneShotUtils.packageId}::blank_coins::deposit_coin_set_entry`,
      typeArguments: [info.coinType],
      arguments: [
        registerTx.object(registryId),
        registerTx.object(info.currencyId), // Currency<T> for validation
        registerTx.object(info.treasuryCapId),
        registerTx.pure.u8(info.decimals), // expected_decimals (validated against Currency<T>)
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

  console.log("✅ All conditional coins registered in BlankCoinsRegistry!");
  console.log();

  // Save deployment info grouped by decimals
  // Format: { registryId, packageId, byDecimals: { 9: [...], 6: [...] }, coins: {...} }
  const deploymentInfo: Record<string, any> = {
    packageId,
    registryId,
    decimalsSpec: decimalsSpecStr,
    byDecimals: {} as Record<number, ConditionalCoinInfo[]>,
    coins, // All coins keyed by module name (conditional_0, conditional_1, etc.)
  };

  // Group coins by decimals for easy lookup
  for (const [coinName, info] of Object.entries(coins)) {
    if (!deploymentInfo.byDecimals[info.decimals]) {
      deploymentInfo.byDecimals[info.decimals] = [];
    }
    deploymentInfo.byDecimals[info.decimals].push(info);
  }

  deploymentInfo.timestamp = new Date().toISOString();
  deploymentInfo.network = "devnet";

  // Save to deployments directory
  const deploymentFile = path.join(DEPLOYMENTS_DIR, "conditional_coins.json");
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log(`✅ Saved deployment info: ${deploymentFile}`);

  // Save to SDK directory for easy access
  const sdkFile = path.join(SDK_DIR, "conditional-coins-info.json");
  fs.writeFileSync(sdkFile, JSON.stringify(deploymentInfo, null, 2));
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
  console.log("Summary:");
  for (const spec of decimalsSpecs) {
    console.log(`  - ${spec.count} coins with ${spec.decimals} decimals available in BlankCoinsRegistry`);
  }
  console.log();
  console.log("Next steps:");
  console.log("  1. Conditional coins are now in BlankCoinsRegistry");
  console.log("  2. Proposal creation can fetch them via take_coin_set(registry, decimals, capId, ...)");
  console.log("  3. Use 9 decimals for asset-conditional coins");
  console.log("  4. Use 6 decimals for stable-conditional coins");
  console.log();
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
