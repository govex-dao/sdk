/**
 * Generate Conditional Coin Move Modules
 *
 * This script dynamically generates conditional coin Move modules for N outcomes.
 * Each outcome needs 2 coins: asset and stable.
 *
 * Usage:
 *   npx tsx scripts/generate-conditional-coins.ts <num_outcomes>
 *
 * Example:
 *   npx tsx scripts/generate-conditional-coins.ts 4
 *   # Generates cond0_asset, cond0_stable, cond1_asset, cond1_stable,
 *   #          cond2_asset, cond2_stable, cond3_asset, cond3_stable
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CONDITIONAL_COINS_PATH = path.join(REPO_ROOT, "packages", "conditional_coins");
const SOURCES_PATH = path.join(CONDITIONAL_COINS_PATH, "sources");

function generateCoinModule(outcomeIndex: number, isAsset: boolean): string {
  const coinName = `cond${outcomeIndex}_${isAsset ? "asset" : "stable"}`;
  const coinNameUpper = coinName.toUpperCase();
  const coinDescription = isAsset
    ? `Conditional Asset Coin for Outcome ${outcomeIndex}`
    : `Conditional Stable Coin for Outcome ${outcomeIndex}`;

  return `// Copyright (c) Govex DAO LLC
// SPDX-License-Identifier: BUSL-1.1

/// ${coinDescription}
module conditional_coins::${coinName};

use sui::coin;

/// One-Time Witness for ${coinNameUpper}
public struct ${coinNameUpper} has drop {}

/// Initialize function called when module is published
fun init(witness: ${coinNameUpper}, ctx: &mut TxContext) {
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

async function main() {
  const numOutcomes = parseInt(process.argv[2] || "2", 10);

  if (isNaN(numOutcomes) || numOutcomes < 2 || numOutcomes > 10) {
    console.error("Usage: npx tsx scripts/generate-conditional-coins.ts <num_outcomes>");
    console.error("       num_outcomes must be between 2 and 10");
    process.exit(1);
  }

  console.log("=".repeat(80));
  console.log(`GENERATING CONDITIONAL COINS FOR ${numOutcomes} OUTCOMES`);
  console.log("=".repeat(80));
  console.log();

  // Clean existing sources
  if (fs.existsSync(SOURCES_PATH)) {
    const existingFiles = fs.readdirSync(SOURCES_PATH);
    for (const file of existingFiles) {
      if (file.startsWith("cond") && file.endsWith(".move")) {
        fs.unlinkSync(path.join(SOURCES_PATH, file));
        console.log(`   Removed: ${file}`);
      }
    }
  } else {
    fs.mkdirSync(SOURCES_PATH, { recursive: true });
  }
  console.log();

  // Generate new modules
  console.log("Generating modules:");
  for (let i = 0; i < numOutcomes; i++) {
    // Asset coin
    const assetName = `cond${i}_asset.move`;
    const assetContent = generateCoinModule(i, true);
    fs.writeFileSync(path.join(SOURCES_PATH, assetName), assetContent);
    console.log(`   ✅ ${assetName}`);

    // Stable coin
    const stableName = `cond${i}_stable.move`;
    const stableContent = generateCoinModule(i, false);
    fs.writeFileSync(path.join(SOURCES_PATH, stableName), stableContent);
    console.log(`   ✅ ${stableName}`);
  }
  console.log();

  console.log("=".repeat(80));
  console.log(`✅ GENERATED ${numOutcomes * 2} CONDITIONAL COIN MODULES`);
  console.log("=".repeat(80));
  console.log();
  console.log("Next steps:");
  console.log("  1. Run: npm run deploy-conditional-coins");
  console.log("  2. Run your tests");
  console.log();
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
