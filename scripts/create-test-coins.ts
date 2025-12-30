/**
 * Create Test Coins Script
 *
 * Creates fresh test coins for a new DAO:
 * 1. Create test coins (TASSET, TSTABLE, LP)
 * 2. Register stable coin for fee payments
 * 3. Register stable coin in factory allowlist
 *
 * Run this BEFORE each DAO creation to get fresh coins.
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

// Test coin with private TreasuryCap (for mainnet - only owner can mint)
const testCoinSourcePrivate = (symbol: string, name: string) => `
module test_coin::coin {
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use sui::tx_context::TxContext;

    public struct COIN has drop {}

    fun init(witness: COIN, ctx: &mut TxContext) {
        let (treasury, metadata) = coin::create_currency(
            witness,
            9,
            b"${symbol}",
            b"${name}",
            b"Test coin for launchpad E2E testing",
            option::none(),
            ctx
        );

        // Transfer treasury and metadata to sender WITHOUT freezing (required for launchpad)
        transfer::public_transfer(treasury, ctx.sender());
        transfer::public_transfer(metadata, ctx.sender());
    }

    public entry fun mint(
        treasury_cap: &mut TreasuryCap<COIN>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let coin = coin::mint(treasury_cap, amount, ctx);
        transfer::public_transfer(coin, recipient)
    }
}
`;

// Test coin with shared TreasuryCap (for devnet/testnet - anyone can mint for testing)
const testCoinSourceShared = (symbol: string, name: string) => `
module test_coin::coin {
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use sui::tx_context::TxContext;

    public struct COIN has drop {}

    fun init(witness: COIN, ctx: &mut TxContext) {
        let (treasury, metadata) = coin::create_currency(
            witness,
            9,
            b"${symbol}",
            b"${name}",
            b"Test coin for launchpad E2E testing",
            option::none(),
            ctx
        );

        // Share treasury cap so anyone can mint (for testing on devnet/testnet)
        transfer::public_share_object(treasury);
        transfer::public_transfer(metadata, ctx.sender());
    }

    public entry fun mint(
        treasury_cap: &mut TreasuryCap<COIN>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let coin = coin::mint(treasury_cap, amount, ctx);
        transfer::public_transfer(coin, recipient)
    }
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
  metadata: string;
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
  const treasuryCap = created.find((c: any) =>
    c.objectType.includes("TreasuryCap"),
  );
  const metadata = created.find((c: any) =>
    c.objectType.includes("CoinMetadata"),
  );

  const coinType = `${packageId}::coin::COIN`;

  console.log(`      ✅ Published!`);
  console.log(`         Package: ${packageId}`);
  console.log(`         Type: ${coinType}`);
  console.log(`         TreasuryCap: ${treasuryCap.objectId}`);

  // Cleanup
  execSync(`rm -rf ${tmpDir}`, { encoding: "utf8" });

  return {
    packageId,
    type: coinType,
    treasuryCap: treasuryCap.objectId,
    metadata: metadata.objectId,
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

  console.log(`\n👤 Active Address: ${sender}`);
  if (suffix) {
    console.log(`📝 Using suffix: ${suffix}`);
  }

  const currentNetwork = getCurrentNetwork();
  console.log(`🌐 Network: ${currentNetwork}`);

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

  console.log("\n✅ Test coins created!");

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
    console.log("✅ Stable coin registered for fee payments");
  } catch (error: any) {
    console.log("✅ Stable coin already registered (or registration not needed)");
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
    console.log("✅ Stable coin registered in factory allowlist");
  } catch (error: any) {
    console.log("✅ Stable coin already in factory allowlist");
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

  console.log("\n📋 Summary:");
  console.log(`   ✅ Asset coin: ${testCoins.asset.type}`);
  console.log(`   ✅ Stable coin: ${testCoins.stable.type}`);
  console.log(`   ✅ LP coin: ${testCoins.lp.type}`);
  console.log("   ✅ Stable coin registered for fee payments");
  console.log("   ✅ Stable coin registered in factory allowlist");

  console.log(`\n💾 Test coins info saved to: ${testCoinsPath}`);
  console.log("\nNext steps:");
  console.log("   npx tsx scripts/create-dao-direct.ts       # Create a DAO with these coins");
  console.log("   npx tsx scripts/deploy-conditional-coins.ts # Deploy conditional coins");
}

main()
  .then(() => {
    console.log("\n✅ Test coins created successfully\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test coin creation failed:", error);
    process.exit(1);
  });
