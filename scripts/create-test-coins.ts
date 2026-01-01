/**
 * Create Test Coins Script
 *
 * Creates fresh test coins for a new DAO using the Sui Currency standard:
 * 1. Create test coins (TASSET, TSTABLE, LP) using coin_registry::new_currency_with_otw()
 * 2. Register stable coin for fee payments
 * 3. Register stable coin in factory allowlist
 *
 * This script creates coins that auto-register with Sui's CoinRegistry:
 * - Creates TreasuryCap<T> + MetadataCap<T> (not CoinMetadata<T>)
 * - Auto-creates shared Currency<T> objects on finalize
 * - Currency<T> objects contain coin metadata and are accessible by anyone
 *
 * Run this BEFORE each DAO creation to get fresh coins.
 *
 * Output format (test-coins-info.json):
 * - packageId: Package ID of the coin module
 * - type: Full coin type (e.g., "0x123::coin::COIN")
 * - treasuryCap: TreasuryCap<T> object ID
 * - metadataCap: MetadataCap<T> object ID (for updating metadata)
 * - currencyId: Currency<T> object ID (shared, contains coin metadata)
 * - isSharedTreasuryCap: Whether the TreasuryCap is shared (for testing)
 *
 * Usage:
 *   npx tsx scripts/create-test-coins.ts
 *   npx tsx scripts/create-test-coins.ts --suffix 001  # Custom suffix for coin symbols
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { initSDK, executeTransaction, getActiveAddress } from "./execute-tx";

// ESM compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Test Coin Templates
// ============================================================================

// Test coin with private TreasuryCap using coin_registry for auto-registration
// This creates Currency<T> shared object automatically on finalize
const testCoinSourcePrivate = (symbol: string, name: string) => `
module test_coin::coin;

use sui::coin::{Self, TreasuryCap};
use sui::coin_registry;

public struct COIN has drop {}

fun init(witness: COIN, ctx: &mut TxContext) {
    let (initializer, treasury_cap) = coin_registry::new_currency_with_otw(
        witness,
        9, // decimals
        b"${symbol}".to_string(),
        b"${name}".to_string(),
        b"Test coin for launchpad E2E testing".to_string(),
        b"".to_string(), // icon_url
        ctx,
    );

    // Finalize - this shares Currency<T> automatically
    let metadata_cap = coin_registry::finalize(initializer, ctx);

    // Transfer caps to sender (private - only owner can mint)
    transfer::public_transfer(treasury_cap, ctx.sender());
    transfer::public_transfer(metadata_cap, ctx.sender());
}

public entry fun mint(
    treasury_cap: &mut TreasuryCap<COIN>,
    amount: u64,
    recipient: address,
    ctx: &mut TxContext
) {
    let minted = coin::mint(treasury_cap, amount, ctx);
    transfer::public_transfer(minted, recipient);
}
`;

// Test coin with shared TreasuryCap using coin_registry for auto-registration
// This creates Currency<T> shared object automatically on finalize
const testCoinSourceShared = (symbol: string, name: string) => `
module test_coin::coin;

use sui::coin::{Self, TreasuryCap};
use sui::coin_registry;

public struct COIN has drop {}

fun init(witness: COIN, ctx: &mut TxContext) {
    let (initializer, treasury_cap) = coin_registry::new_currency_with_otw(
        witness,
        9, // decimals
        b"${symbol}".to_string(),
        b"${name}".to_string(),
        b"Test coin for launchpad E2E testing".to_string(),
        b"".to_string(), // icon_url
        ctx,
    );

    // Finalize - this shares Currency<T> automatically
    let metadata_cap = coin_registry::finalize(initializer, ctx);

    // Share treasury cap so anyone can mint (for testing on devnet/testnet)
    transfer::public_share_object(treasury_cap);
    transfer::public_transfer(metadata_cap, ctx.sender());
}

public entry fun mint(
    treasury_cap: &mut TreasuryCap<COIN>,
    amount: u64,
    recipient: address,
    ctx: &mut TxContext
) {
    let minted = coin::mint(treasury_cap, amount, ctx);
    transfer::public_transfer(minted, recipient);
}
`;

// ============================================================================
// Types
// ============================================================================

type NetworkType = "devnet" | "testnet" | "mainnet" | "localnet";

export interface TestCoinInfo {
  packageId: string;
  type: string;
  treasuryCap: string;
  metadataCap: string;   // MetadataCap<T> - NEW: replaces CoinMetadata
  currencyId: string;    // Currency<T> object ID (shared) - NEW: auto-created by coin_registry
  isSharedTreasuryCap: boolean;
}

export interface TestCoinsInfo {
  asset: TestCoinInfo;
  stable: TestCoinInfo;
  lp: TestCoinInfo;
  timestamp: number;
  network: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

// Determine which coin source to use based on network
const getTestCoinSource = (symbol: string, name: string, network: NetworkType) => {
  // On mainnet, use private treasury cap (only owner can mint)
  // On devnet/testnet/localnet, use shared treasury cap (anyone can mint for testing)
  if (network === "mainnet") {
    return testCoinSourcePrivate(symbol, name);
  }
  return testCoinSourceShared(symbol, name);
};

// Get the current network from environment or default to localnet
const getCurrentNetwork = (): NetworkType => {
  const network = process.env.SUI_NETWORK?.toLowerCase();
  if (network === "mainnet") return "mainnet";
  if (network === "testnet") return "testnet";
  if (network === "devnet") return "devnet";
  return "localnet";
};

async function createTestCoin(
  name: string,
  symbol: string,
  network: NetworkType = getCurrentNetwork(),
): Promise<TestCoinInfo> {
  const isSharedTreasuryCap = network !== "mainnet";
  console.log(`\n   Publishing ${name} test coin (network: ${network}, shared treasury: ${isSharedTreasuryCap})...`);

  // Use timestamp to make tmp dir unique
  const timestamp = Date.now();
  const tmpDir = `/tmp/test_coin_${symbol.toLowerCase()}_${timestamp}`;
  execSync(`rm -rf ${tmpDir} && mkdir -p ${tmpDir}/sources`, {
    encoding: "utf8",
  });

  fs.writeFileSync(
    `${tmpDir}/Move.toml`,
    `
[package]
name = "test_coin"
edition = "2024.beta"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "framework/testnet" }

[addresses]
test_coin = "0x0"
`,
  );

  fs.writeFileSync(`${tmpDir}/sources/coin.move`, getTestCoinSource(symbol, name, network));

  console.log("      Building...");
  execSync(`cd ${tmpDir} && sui move build 2>&1 | grep -v "warning"`, {
    encoding: "utf8",
  });

  console.log("      Publishing...");
  const result = execSync(
    `cd ${tmpDir} && sui client publish --gas-budget 100000000 --json`,
    { encoding: "utf8" },
  );
  const parsed = JSON.parse(result);

  if (parsed.effects.status.status !== "success") {
    throw new Error(
      `Failed to publish ${name}: ${parsed.effects.status.error}`,
    );
  }

  const published = parsed.objectChanges.find(
    (c: any) => c.type === "published",
  );
  const packageId = published.packageId;

  const created = parsed.objectChanges.filter((c: any) => c.type === "created");

  // Find TreasuryCap<T>
  const treasuryCap = created.find((c: any) =>
    c.objectType.includes("TreasuryCap"),
  );
  if (!treasuryCap) {
    throw new Error(`TreasuryCap not found in transaction effects for ${name}`);
  }

  // Find MetadataCap<T> - NEW: coin_registry::finalize() returns MetadataCap instead of CoinMetadata
  const metadataCap = created.find((c: any) =>
    c.objectType.includes("MetadataCap"),
  );
  if (!metadataCap) {
    throw new Error(`MetadataCap not found in transaction effects for ${name}`);
  }

  // Find Currency<T> - NEW: shared object created by coin_registry::finalize()
  const currency = created.find((c: any) =>
    c.objectType.includes("Currency<"),
  );
  if (!currency) {
    throw new Error(`Currency object not found in transaction effects for ${name}`);
  }

  const coinType = `${packageId}::coin::COIN`;

  console.log(`      Published successfully!`);
  console.log(`         Package: ${packageId}`);
  console.log(`         Type: ${coinType}`);
  console.log(`         TreasuryCap: ${treasuryCap.objectId}`);
  console.log(`         MetadataCap: ${metadataCap.objectId}`);
  console.log(`         Currency: ${currency.objectId} (shared)`);

  // Cleanup
  execSync(`rm -rf ${tmpDir}`, { encoding: "utf8" });

  return {
    packageId,
    type: coinType,
    treasuryCap: treasuryCap.objectId,
    metadataCap: metadataCap.objectId,
    currencyId: currency.objectId,
    isSharedTreasuryCap,
  };
}

// ============================================================================
// Main Setup Function
// ============================================================================

async function main() {
  // Parse command line args
  const args = process.argv.slice(2);
  let suffix = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--suffix" && args[i + 1]) {
      suffix = args[i + 1];
      i++;
    }
  }

  console.log("=".repeat(80));
  console.log("CREATE TEST COINS (Per-DAO setup)");
  console.log("=".repeat(80));

  // Initialize SDK
  const sdk = await initSDK();
  const sender = getActiveAddress();

  console.log(`\nActive Address: ${sender}`);
  if (suffix) {
    console.log(`Using suffix: ${suffix}`);
  }

  const currentNetwork = getCurrentNetwork();
  console.log(`Network: ${currentNetwork}`);

  // ============================================================================
  // STEP 1: Create test coins
  // ============================================================================
  console.log("\n" + "=".repeat(80));
  console.log("STEP 1: CREATE TEST COINS");
  console.log("=".repeat(80));

  const assetSymbol = suffix ? `TASSET${suffix}` : "TASSET";
  const stableSymbol = suffix ? `TSTABLE${suffix}` : "TSTABLE";
  const lpSymbol = suffix ? `LP${suffix}` : "GOVEX_LP_TOKEN";

  const testCoins = {
    // Asset coin MUST have private TreasuryCap - launchpad takes ownership of it
    asset: await createTestCoin(`Test Asset ${suffix}`.trim(), assetSymbol, "mainnet"), // Force private treasury
    // Stable coin can have shared TreasuryCap on devnet/testnet for easy minting
    stable: await createTestCoin(`Test Stable ${suffix}`.trim(), stableSymbol, currentNetwork),
    // LP coin MUST have private TreasuryCap - pool takes ownership of it for minting
    lp: await createTestCoin(`GOVEX_LP_TOKEN ${suffix}`.trim(), lpSymbol, "mainnet"), // Force private treasury
  };

  console.log("\nTest coins created!");

  // ============================================================================
  // STEP 2: Register stable coin for fee payments
  // ============================================================================
  console.log("\n" + "=".repeat(80));
  console.log("STEP 2: REGISTER STABLE COIN FOR FEE PAYMENTS");
  console.log("=".repeat(80));

  const feeManagerDeployment = sdk.deployments.getPackage("futarchy_markets_core");
  const feeAdminCapId = feeManagerDeployment?.adminCaps?.find((obj: any) =>
    obj.name === "FeeAdminCap"
  )?.objectId;

  if (!feeAdminCapId) {
    throw new Error("FeeAdminCap not found in futarchy_markets_core deployment");
  }

  console.log(`Using FeeAdminCap: ${feeAdminCapId}`);

  try {
    const registerFeeTx = sdk.feeManager.addCoinFeeConfig(
      {
        coinType: testCoins.stable.type,
        decimals: 9,
        daoCreationFee: 100_000_000n,
        proposalFeePerOutcome: 10_000_000n,
      },
      feeAdminCapId,
    );

    await executeTransaction(sdk, registerFeeTx, {
      network: "devnet",
      dryRun: false,
      showEffects: false,
    });
    console.log("Stable coin registered for fee payments");
  } catch (error: any) {
    console.log("Stable coin already registered (or registration not needed)");
  }

  // ============================================================================
  // STEP 3: Register stable coin in factory allowlist
  // ============================================================================
  console.log("\n" + "=".repeat(80));
  console.log("STEP 3: REGISTER STABLE COIN IN FACTORY ALLOWLIST");
  console.log("=".repeat(80));

  const factoryDeployment = sdk.deployments.getPackage("futarchy_factory");
  const factoryOwnerCapId = factoryDeployment?.adminCaps?.find((obj: any) =>
    obj.name === "FactoryOwnerCap"
  )?.objectId;

  if (!factoryOwnerCapId) {
    throw new Error("FactoryOwnerCap not found in futarchy_factory deployment");
  }

  console.log(`Using FactoryOwnerCap: ${factoryOwnerCapId}`);

  try {
    const registerFactoryTx = sdk.factoryAdmin.addAllowedStableType(
      testCoins.stable.type,
      factoryOwnerCapId,
    );

    await executeTransaction(sdk, registerFactoryTx, {
      network: "devnet",
      dryRun: false,
      showEffects: false,
    });
    console.log("Stable coin registered in factory allowlist");
  } catch (error: any) {
    console.log("Stable coin already in factory allowlist");
  }

  // ============================================================================
  // Save test coins info
  // ============================================================================
  const testCoinsInfo: TestCoinsInfo = {
    asset: testCoins.asset,
    stable: testCoins.stable,
    lp: testCoins.lp,
    timestamp: Date.now(),
    network: currentNetwork,
  };

  const testCoinsPath = path.join(__dirname, "..", "test-coins-info.json");
  fs.writeFileSync(testCoinsPath, JSON.stringify(testCoinsInfo, null, 2), "utf-8");

  console.log("\n" + "=".repeat(80));
  console.log("TEST COINS CREATED");
  console.log("=".repeat(80));

  console.log("\nSummary:");
  console.log(`   - Asset coin: ${testCoins.asset.type}`);
  console.log(`     Currency<T>: ${testCoins.asset.currencyId} (shared)`);
  console.log(`   - Stable coin: ${testCoins.stable.type}`);
  console.log(`     Currency<T>: ${testCoins.stable.currencyId} (shared)`);
  console.log(`   - LP coin: ${testCoins.lp.type}`);
  console.log(`     Currency<T>: ${testCoins.lp.currencyId} (shared)`);
  console.log("   - Stable coin registered for fee payments");
  console.log("   - Stable coin registered in factory allowlist");

  console.log(`\nTest coins info saved to: ${testCoinsPath}`);
  console.log("\nNext steps:");
  console.log("   npx tsx scripts/create-dao-direct.ts       # Create a DAO with these coins");
  console.log("   npx tsx scripts/deploy-conditional-coins.ts # Deploy conditional coins");
}

main()
  .then(() => {
    console.log("\nTest coins created successfully\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nTest coin creation failed:", error);
    process.exit(1);
  });
